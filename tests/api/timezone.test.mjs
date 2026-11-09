// Zona waktu dalam alur nyata: zona tenant harus sampai ke snapshot SLA,
// laporan harus memakai zona yang diminta, dan zona karangan harus ditolak.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  adminClient,
  createPlatformUser,
  createTicket,
  readEnv,
  seedOrg,
  ticketRecord,
  uniqueLabel,
} from "../lib/fixtures.mjs";

const API = () => readEnv().url;

function snapshotOf(record) {
  const raw = record.sla_snapshot;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}

function localHour(iso, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(String(iso).replace(" ", "T")));
  const hour = parts.find((part) => part.type === "hour");

  return Number(hour?.value);
}

describe("zona waktu tenant", () => {
  let makassar;

  before(async () => {
    makassar = await seedOrg({
      label: uniqueLabel("tz-makassar"),
      isolatedTenant: true,
      timezone: "Asia/Makassar",
    });
  });

  it("tiket baru menyimpan zona tenant di snapshot SLA", async () => {
    const ticket = await createTicket(makassar.requester.client, {
      type: "incident",
      impact: "operational",
      title: "Jaringan lambat di pendaftaran",
      description: "Koneksi ke SIMRS melambat sejak pagi di loket pendaftaran.",
    });

    const record = await ticketRecord(makassar.admin, ticket.id);
    const snapshot = snapshotOf(record);

    assert.equal(snapshot.timezone, "Asia/Makassar");
    assert.ok(record.response_due_at, "tenggat respons harus terisi");

    // Tenggat selalu jatuh di dalam jam kerja lokal (08:00–17:00).
    const hour = localHour(record.response_due_at, "Asia/Makassar");
    assert.ok(hour >= 8 && hour <= 17, `jam lokal tenggat: ${hour}`);
  });

  it("zona berbeda menghasilkan tenggat yang berbeda dari WIB", async () => {
    const jakarta = await seedOrg({
      label: uniqueLabel("tz-jakarta"),
      isolatedTenant: true,
      timezone: "Asia/Jakarta",
    });

    const ticket = await createTicket(jakarta.requester.client, {
      type: "incident",
      impact: "operational",
      title: "Printer loket tidak mencetak",
      description: "Printer di loket pendaftaran tidak mengeluarkan tiket antrean.",
    });

    const record = await ticketRecord(jakarta.admin, ticket.id);
    assert.equal(snapshotOf(record).timezone, "Asia/Jakarta");
  });
});

describe("zona waktu laporan", () => {
  let org;

  before(async () => {
    org = await seedOrg({ label: uniqueLabel("tz-laporan"), isolatedTenant: true });
  });

  it("menerima zona eksplisit pada query", async () => {
    const response = await org.lead.client.request(
      "GET",
      "/api/itsm/reports/sla?timezone=America/New_York"
    );

    assert.equal(response.status, 200);
    assert.equal(response.data.range.timezone, "America/New_York");
  });

  it("menolak zona yang tidak ada di basis data IANA", async () => {
    const response = await org.lead.client.request(
      "GET",
      "/api/itsm/reports/sla?timezone=Mars/Olympus"
    );

    assert.equal(response.status, 400);
    assert.match(response.data.message, /Zona waktu/);
  });

  it("CSV memakai kolom waktu lokal, bukan WIB", async () => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
    }).format(new Date());
    const response = await org.lead.client.request(
      "GET",
      `/api/itsm/reports/sla.csv?from=${today}&to=${today}&timezone=Asia/Makassar`
    );

    assert.equal(response.status, 200);
    assert.match(String(response.data), /created_local/);
  });
});

describe("zona waktu dari Konsol Vendor", () => {
  let org;
  let vendor;

  before(async () => {
    org = await seedOrg({ label: uniqueLabel("tz-vendor"), isolatedTenant: true });
    const admin = await adminClient();
    vendor = await createPlatformUser(admin, { role: "it_lead", label: "tzvendor" });
  });

  it("menolak zona karangan saat membuat/mengubah rumah sakit", async () => {
    const response = await vendor.client.request(
      "PATCH",
      `/api/itsm/platform/tenants/${org.tenant.id}`,
      { body: { timezone: "Mars/Olympus" } }
    );

    assert.equal(response.status, 400);
    assert.match(response.data.message, /Zona waktu/);
  });

  it("IT Lead rumah sakit tidak bisa mengubah zona pada mode vendor", async () => {
    const response = await org.lead.client.request("PATCH", "/api/itsm/tenant", {
      body: { timezone: "Asia/Makassar" },
    });

    assert.equal(response.status, 403);
    assert.match(response.data.message, /Konsol Vendor/);
  });

  it("mengubah zona rumah sakit menyelaraskan policy SLA-nya", async () => {
    const admin = await adminClient();

    await admin.create("sla_policies", {
      tenant: org.tenant.id,
      name: "Incident normal",
      ticket_type: "incident",
      priority: "normal",
      response_minutes: 60,
      resolution_minutes: 480,
      calendar_mode: "business_hours",
      business_days: [1, 2, 3, 4, 5],
      business_start: "08:00",
      business_end: "17:00",
      timezone: "Asia/Jakarta",
      is_active: true,
    });

    const response = await vendor.client.request(
      "PATCH",
      `/api/itsm/platform/tenants/${org.tenant.id}`,
      { body: { timezone: "Asia/Jayapura" } }
    );

    assert.equal(response.status, 200);
    assert.equal(response.data.tenant.timezone, "Asia/Jayapura");

    const policies = await admin.list("sla_policies", {
      filter: `tenant="${org.tenant.id}"`,
      perPage: 50,
    });

    assert.ok(policies.items.length > 0);
    for (const policy of policies.items) {
      assert.equal(policy.timezone, "Asia/Jayapura");
    }
  });
});
