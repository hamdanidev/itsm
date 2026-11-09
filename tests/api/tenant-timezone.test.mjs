// Zona waktu rumah sakit dari Pengaturan (mode standalone): IT Lead boleh
// mengubah, perubahan menyelaraskan policy SLA dan jadwal laporan, dan setiap
// perubahan tercatat di audit.
//
// File ini memakai instance PocketBase sendiri karena route ini sengaja ditolak
// pada mode vendor (suite API utama berjalan sebagai vendor).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import { adminClient, seedOrg, uniqueLabel } from "../lib/fixtures.mjs";
import { startPocketBase } from "../lib/pocketbase-server.mjs";

let server;
let org;

function localLabel(iso, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(String(iso).replace(" ", "T")));

  const map = {};
  for (const part of parts) map[part.type] = part.value;

  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}`;
}

describe("zona waktu rumah sakit (standalone)", () => {
  before(async () => {
    process.env.TENANCY_MODE = "standalone";
    server = await startPocketBase();
    process.env.PB_URL = server.url;
    process.env.PB_ADMIN_EMAIL = server.superuser.email;
    process.env.PB_ADMIN_PASSWORD = server.superuser.password;

    org = await seedOrg({ label: uniqueLabel("tz-setting") });
  });

  after(async () => {
    await server?.stop();
  });

  it("IT Lead bisa mengubah zona dan policy SLA ikut diselaraskan", async () => {
    const response = await org.lead.client.request("PATCH", "/api/itsm/tenant", {
      body: { timezone: "Asia/Makassar" },
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.tenant.timezone, "Asia/Makassar");

    const admin = await adminClient();
    const tenant = await admin.json(
      "GET",
      `/api/collections/tenants/records/${org.tenant.id}`
    );
    assert.equal(tenant.timezone, "Asia/Makassar");

    const policies = await admin.list("sla_policies", {
      filter: `tenant="${org.tenant.id}"`,
      perPage: 50,
    });

    assert.ok(policies.items.length > 0, "tenant seed harus punya policy SLA");
    for (const policy of policies.items) {
      assert.equal(policy.timezone, "Asia/Makassar");
    }
  });

  it("audit mencatat perubahan zona beserta nilai lama dan baru", async () => {
    const admin = await adminClient();
    const logs = await admin.list("audit_logs", {
      filter: `tenant="${org.tenant.id}" && action="update" && collection_name="tenants"`,
      sort: "-created",
      perPage: 5,
    });

    const entry = logs.items.find((item) => {
      const changes = item.changes || {};
      return changes.timezone && changes.timezone.to === "Asia/Makassar";
    });

    assert.ok(entry, "audit perubahan zona harus ada");
    assert.equal(entry.changes.timezone.from, "Asia/Jakarta");
    assert.equal(entry.actor_role, "it_lead");
  });

  it("menolak zona yang tidak ada di basis data IANA", async () => {
    const response = await org.lead.client.request("PATCH", "/api/itsm/tenant", {
      body: { timezone: "Mars/Olympus" },
    });

    assert.equal(response.status, 400);
    assert.match(response.data.message, /Zona waktu/);
  });

  it("hanya IT Lead yang boleh mengubah zona", async () => {
    const response = await org.requester.client.request("PATCH", "/api/itsm/tenant", {
      body: { timezone: "Asia/Jayapura" },
    });

    assert.equal(response.status, 403);

    const support = await org.support.client.request("PATCH", "/api/itsm/tenant", {
      body: { timezone: "Asia/Jayapura" },
    });

    assert.equal(support.status, 403);
  });

  it("mengubah zona menghitung ulang jadwal laporan ke 07.00 lokal", async () => {
    const schedule = await org.lead.client.request(
      "PATCH",
      "/api/itsm/reports/schedule",
      { body: { frequency: "weekly" } }
    );

    assert.equal(schedule.status, 200);
    assert.match(localLabel(schedule.data.next_at, "Asia/Makassar"), / 07:00$/);

    const zone = await org.lead.client.request("PATCH", "/api/itsm/tenant", {
      body: { timezone: "Asia/Jayapura" },
    });

    assert.equal(zone.status, 200);

    const shifted = zone.data.tenant.report_next_at;
    assert.match(localLabel(shifted, "Asia/Jayapura"), / 07:00$/);

    const deltaMs =
      new Date(String(shifted).replace(" ", "T")).getTime() -
      new Date(String(schedule.data.next_at).replace(" ", "T")).getTime();

    // Jayapura (UTC+9) satu jam lebih awal dari Makassar (UTC+8) pada jam
    // dinding yang sama, jadi jadwal bergeser -1 jam.
    assert.equal(deltaMs, -60 * 60 * 1000);
  });

  it("zona yang sama tidak menulis audit baru", async () => {
    const admin = await adminClient();
    const before = await admin.list("audit_logs", {
      filter: `tenant="${org.tenant.id}" && action="update" && collection_name="tenants"`,
      perPage: 1,
    });

    const response = await org.lead.client.request("PATCH", "/api/itsm/tenant", {
      body: { timezone: "Asia/Jayapura" },
    });

    assert.equal(response.status, 200);

    const after = await admin.list("audit_logs", {
      filter: `tenant="${org.tenant.id}" && action="update" && collection_name="tenants"`,
      perPage: 1,
    });

    assert.equal(after.totalItems, before.totalItems);
  });
});
