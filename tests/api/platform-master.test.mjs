// Konsol v2: kelola data master per rumah sakit dari sisi vendor.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  createPlatformUser,
  seedOrg,
  uniqueLabel,
} from "../lib/fixtures.mjs";

let org;
let vendorLead;
let vendorSupport;
let bareTenant; // tanpa seed, untuk menguji pembuatan kebijakan SLA

function tenantCode(prefix = "MD") {
  return `${prefix}${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 4)}`
    .toUpperCase()
    .slice(0, 12);
}

function masterPath(tenantId, suffix = "") {
  return `/api/itsm/platform/tenants/${tenantId}/master${suffix}`;
}

before(async () => {
  org = await seedOrg({ label: uniqueLabel("md"), isolatedTenant: true });

  vendorLead = await createPlatformUser(org.admin, {
    role: "it_lead",
    label: "mdlead",
  });
  vendorSupport = await createPlatformUser(org.admin, {
    role: "it_support",
    label: "mdsup",
  });

  const created = await vendorLead.client.json(
    "POST",
    "/api/itsm/platform/tenants",
    {
      body: {
        name: `RS Master ${uniqueLabel("md")}`,
        code: tenantCode(),
        seed_master: false,
      },
    }
  );

  bareTenant = created.tenant;
}, { timeout: 120_000 });

describe("membaca data master", () => {
  it("vendor melihat seluruh data master rumah sakit", async () => {
    const data = await vendorLead.client.json("GET", masterPath(org.tenant.id));

    assert.equal(data.tenant.id, org.tenant.id);
    assert.ok(data.units.length >= 1);
    assert.ok(data.users.length >= 1);
    assert.ok(data.options.unit_kinds.includes("clinical"));
    assert.ok(data.options.priorities.includes("critical"));
    assert.ok(data.options.calendar_modes.includes("24x7"));
  });

  it("vendor support boleh membaca tetapi tidak menulis", async () => {
    const read = await vendorSupport.client.request(
      "GET",
      masterPath(org.tenant.id)
    );
    assert.equal(read.status, 200);

    const write = await vendorSupport.client.request(
      "POST",
      masterPath(org.tenant.id, "/units"),
      { body: { name: "Unit Support", code: "SUPX", kind: "support" } }
    );
    assert.equal(write.status, 403);
  });

  it("pengguna rumah sakit tidak boleh membuka data master vendor", async () => {
    const res = await org.lead.client.request(
      "GET",
      masterPath(org.tenant.id)
    );

    assert.equal(res.status, 403);
  });
});

describe("unit dan kategori", () => {
  it("membuat unit baru dan menolak kode duplikat", async () => {
    const created = await vendorLead.client.json(
      "POST",
      masterPath(org.tenant.id, "/units"),
      {
        body: { name: "Unit Farmasi Baru", code: "farm-baru", kind: "clinical" },
      }
    );

    assert.equal(created.item.code, "FARM-BARU");
    assert.equal(created.item.is_active, true);

    const duplicate = await vendorLead.client.request(
      "POST",
      masterPath(org.tenant.id, "/units"),
      { body: { name: "Unit Lain", code: "FARM-BARU", kind: "clinical" } }
    );
    assert.equal(duplicate.status, 400);
  });

  it("mengubah unit dan menonaktifkannya", async () => {
    const data = await vendorLead.client.json("GET", masterPath(org.tenant.id));
    const unit = data.units.find((item) => item.code === "FARM-BARU");

    const updated = await vendorLead.client.json(
      "PATCH",
      masterPath(org.tenant.id, `/units/${unit.id}`),
      { body: { name: "Unit Farmasi Gabungan", is_active: false } }
    );

    assert.equal(updated.item.name, "Unit Farmasi Gabungan");
    assert.equal(updated.item.is_active, false);
  });

  it("manajer unit harus pengguna aktif rumah sakit yang sama", async () => {
    const data = await vendorLead.client.json("GET", masterPath(org.tenant.id));
    const unit = data.units.find((item) => item.code === "FARM-BARU");
    const other = await seedOrg({
      label: uniqueLabel("mdother"),
      isolatedTenant: true,
    });

    const res = await vendorLead.client.request(
      "PATCH",
      masterPath(org.tenant.id, `/units/${unit.id}`),
      { body: { manager: other.lead.user.id } }
    );

    assert.equal(res.status, 400);
  });

  it("kategori baru memakai kode huruf besar dan jenis valid", async () => {
    const created = await vendorLead.client.json(
      "POST",
      masterPath(org.tenant.id, "/categories"),
      { body: { name: "Kategori Baru", code: "kat-baru", kind: "incident" } }
    );

    assert.equal(created.item.code, "KAT-BARU");

    const badKind = await vendorLead.client.request(
      "POST",
      masterPath(org.tenant.id, "/categories"),
      { body: { name: "Kategori Salah", code: "kat-salah", kind: "aneh" } }
    );
    assert.equal(badKind.status, 400);
  });

  it("jenis data master yang tidak dikenal ditolak", async () => {
    const res = await vendorLead.client.request(
      "POST",
      masterPath(org.tenant.id, "/tidakada"),
      { body: { name: "X" } }
    );

    assert.equal(res.status, 400);
  });
});

describe("kebijakan SLA", () => {
  it("membuat kebijakan untuk kombinasi yang belum ada", async () => {
    const created = await vendorLead.client.json(
      "POST",
      masterPath(bareTenant.id, "/policies"),
      {
        body: {
          name: "Incident normal - jam kerja",
          ticket_type: "incident",
          priority: "normal",
          response_minutes: 60,
          approval_minutes: 0,
          resolution_minutes: 480,
          calendar_mode: "business_hours",
          business_days: [1, 2, 3, 4, 5],
          business_start: "08:00",
          business_end: "17:00",
        },
      }
    );

    assert.equal(created.item.ticket_type, "incident");
    assert.equal(created.item.response_minutes, 60);
    assert.equal(created.item.version, 1);
  });

  it("menolak kombinasi tipe dan prioritas yang sudah ada", async () => {
    const res = await vendorLead.client.request(
      "POST",
      masterPath(bareTenant.id, "/policies"),
      {
        body: {
          name: "Duplikat",
          ticket_type: "incident",
          priority: "normal",
          response_minutes: 30,
        },
      }
    );

    assert.equal(res.status, 400);
  });

  it("jam kerja divalidasi", async () => {
    const res = await vendorLead.client.request(
      "POST",
      masterPath(bareTenant.id, "/policies"),
      {
        body: {
          name: "Jam terbalik",
          ticket_type: "incident",
          priority: "high",
          response_minutes: 30,
          business_start: "17:00",
          business_end: "08:00",
        },
      }
    );

    assert.equal(res.status, 400);
  });

  it("respons minimal satu menit", async () => {
    const res = await vendorLead.client.request(
      "POST",
      masterPath(bareTenant.id, "/policies"),
      {
        body: {
          name: "Respons nol",
          ticket_type: "incident",
          priority: "low",
          response_minutes: 0,
        },
      }
    );

    assert.equal(res.status, 400);
  });
});

describe("hari libur", () => {
  it("menambah dan menolak tanggal ganda", async () => {
    const created = await vendorLead.client.json(
      "POST",
      masterPath(org.tenant.id, "/holidays"),
      { body: { date: "2027-05-01", name: "Hari Buruh" } }
    );

    assert.equal(created.item.date, "2027-05-01");

    const duplicate = await vendorLead.client.request(
      "POST",
      masterPath(org.tenant.id, "/holidays"),
      { body: { date: "2027-05-01", name: "Duplikat" } }
    );
    assert.equal(duplicate.status, 400);
  });

  it("format tanggal tidak valid ditolak", async () => {
    const res = await vendorLead.client.request(
      "POST",
      masterPath(org.tenant.id, "/holidays"),
      { body: { date: "01-05-2027", name: "Salah Format" } }
    );

    assert.equal(res.status, 400);
  });
});

describe("batas dan jejak audit", () => {
  it("tidak bisa mengubah data master rumah sakit lain lewat id", async () => {
    const data = await vendorLead.client.json("GET", masterPath(org.tenant.id));
    const unit = data.units[0];

    // Unit milik `org`, tetapi tenant pada URL adalah tenant lain yang valid.
    const res = await vendorLead.client.request(
      "PATCH",
      masterPath(bareTenant.id, `/units/${unit.id}`),
      { body: { name: "Pindah Silang" } }
    );

    assert.equal(res.status, 404);
  });

  it("perubahan data master tercatat di audit", async () => {
    const data = await vendorLead.client.json(
      "GET",
      `/api/itsm/platform/audit?tenant=${org.tenant.id}&collection=units`
    );

    assert.ok(data.totalItems >= 1);

    const created = data.items.find((item) => item.action === "create");
    assert.ok(created, "aksi create unit harus tercatat");
    assert.equal(created.actor_scope, "platform");
  });
});
