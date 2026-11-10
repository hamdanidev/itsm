// Impor massal anggota tim dari CSV: validasi per baris, ringkasan, duplikat,
// izin, dan jejak audit.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { readEnv, seedOrg, uniqueLabel } from "../lib/fixtures.mjs";
import { ApiClient } from "../lib/api-client.mjs";

let org;
let other;

const HEADER = "nama;email;role;unit;tim";

function stamp() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function csv(rows, header = HEADER) {
  return [header, ...rows].join("\r\n");
}

async function upload(client, text, filename = "anggota.csv") {
  const form = new FormData();
  form.append("file", new Blob([text], { type: "text/csv" }), filename);
  return client.request("POST", "/api/itsm/team/import", { form });
}

before(async () => {
  org = await seedOrg({ label: uniqueLabel("impor"), isolatedTenant: true });
  other = await seedOrg({ label: uniqueLabel("impor2"), isolatedTenant: true });
}, { timeout: 120_000 });

describe("impor anggota dari CSV", () => {
  it("membuat baris valid dan melaporkan setiap baris gagal", async () => {
    const suffix = stamp();
    const validEmail = `impor.valid.${suffix}@uji.local`;
    const secondEmail = `impor.kedua.${suffix}@uji.local`;
    const invalidEmail = `impor.rusak.${suffix}@uji.local`;
    const noRoleEmail = `impor.role.${suffix}@uji.local`;
    const unknownUnitEmail = `impor.unit.${suffix}@uji.local`;

    const body = csv([
      `"Budi, S.Kom";${validEmail};Staff IT;IT;Service Desk`,
      `Siti Aminah;${secondEmail};Teknisi;${org.unit.name};Jaringan`,
      `Rusak;bukan-email;Pemohon;IT;`,
      `Tanpa Role;${noRoleEmail};;IT;`,
      `Unit Asing;${unknownUnitEmail};Pemohon;Unit Tidak Ada;`,
      `Duplikat Lama;${org.support.email};Pemohon;IT;`,
      `Duplikat Berkas;${validEmail};Pemohon;IT;`,
    ]);

    const response = await upload(org.lead.client, body);
    assert.equal(response.status, 200, JSON.stringify(response.data));

    const result = response.data;
    assert.equal(result.file_name, "anggota.csv");
    assert.deepEqual(result.summary, { total: 7, imported: 2, failed: 5 });
    assert.equal(result.imported.length, 2);
    assert.equal(result.failed.length, 5);

    const first = result.imported.find((item) => item.email === validEmail);
    assert.equal(first.row, 2);
    assert.equal(first.name, "Budi, S.Kom");
    assert.equal(first.role, "it_support");
    assert.equal(first.team, "service_desk");
    assert.equal(first.unit, org.itUnit.id);
    assert.equal(first.unit_name, "IT");
    assert.ok(first.password.length >= 12);

    const second = result.imported.find((item) => item.email === secondEmail);
    assert.equal(second.role, "resolver");
    assert.equal(second.team, "network");
    assert.equal(second.unit, org.unit.id);
    assert.notEqual(first.password, second.password);

    const byRow = new Map(result.failed.map((item) => [item.row, item.errors.join(" ")]));

    assert.match(byRow.get(4), /Email tidak valid/);
    assert.match(byRow.get(5), /Role wajib diisi/);
    assert.match(byRow.get(6), /Unit tidak ditemukan/);
    assert.match(byRow.get(7), /Email sudah dipakai pengguna lain/);
    assert.match(byRow.get(8), /Email duplikat di dalam berkas \(baris 2\)/);

    const created = await org.admin.list("users", {
      filter: `email = "${validEmail}"`,
      perPage: 5,
    });

    assert.equal(created.totalItems, 1, "email valid hanya dibuat satu kali");
    assert.equal(created.items[0].role, "it_support");
    assert.equal(created.items[0].team, "service_desk");
    assert.equal(created.items[0].unit, org.itUnit.id);
    assert.equal(created.items[0].must_change_password, true);
    assert.equal(created.items[0].is_active, true);
    assert.equal(created.items[0].tenant, org.tenant.id);

    // Password awal hasil impor harus bisa dipakai sekali dan memaksa ganti
    // password sebelum aplikasi dapat digunakan.
    const { url } = readEnv();
    const member = new ApiClient(url);
    const record = await member.login(validEmail, first.password);
    assert.equal(record.must_change_password, true);

    const blocked = await member.request("GET", "/api/itsm/profile");
    assert.equal(blocked.status, 403);
    assert.match(blocked.data.message, /Ganti password/i);
  });

  it("menerima role dan tim berupa kunci internal maupun label", async () => {
    const suffix = stamp();
    const leadEmail = `impor.lead.${suffix}@uji.local`;
    const supportEmail = `impor.support.${suffix}@uji.local`;

    const response = await upload(
      org.lead.client,
      csv(
        [
          `Kepala Baru;${leadEmail};Kepala IT;IT;service_desk`,
          `Support Baru;${supportEmail};it_support;IT;Aplikasi / SIMRS`,
        ],
        "Nama;Email;Role;Unit;Tim"
      ),
      "kunci-internal.csv"
    );

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.summary.imported, 2, JSON.stringify(response.data.failed));

    const lead = response.data.imported.find((item) => item.email === leadEmail);
    const support = response.data.imported.find((item) => item.email === supportEmail);

    assert.equal(lead.role, "it_lead");
    assert.equal(lead.team, "service_desk");
    assert.equal(support.role, "it_support");
    assert.equal(support.team, "application");
  });

  it("menolak header yang tidak lengkap dan berkas tanpa baris data", async () => {
    const missing = await upload(
      org.lead.client,
      "nama,email\nBudi,budi@uji.local"
    );

    assert.equal(missing.status, 400);
    assert.match(missing.data.message, /Header CSV/);

    const headerOnly = await upload(org.lead.client, HEADER);
    assert.equal(headerOnly.status, 400);
    assert.match(headerOnly.data.message, /hanya berisi header/);

    const empty = await upload(org.lead.client, "   \r\n");
    assert.equal(empty.status, 400);
    assert.match(empty.data.message, /kosong/i);
  });

  it("tanpa berkas atau tanpa hak Kepala IT ditolak", async () => {
    const noFile = await org.lead.client.request("POST", "/api/itsm/team/import", {
      body: {},
    });
    assert.equal(noFile.status, 400);

    const support = await upload(
      org.support.client,
      csv([`Orang;${stamp()}@uji.local;Pemohon;IT;`])
    );
    assert.equal(support.status, 403);

    const requester = await upload(
      org.requester.client,
      csv([`Orang;${stamp()}@uji.local;Pemohon;IT;`])
    );
    assert.equal(requester.status, 403);

    // Tenant lain tidak boleh menyentuh unit rumah sakit ini.
    const crossTenant = await upload(
      other.lead.client,
      csv([`Silang;${stamp()}@uji.local;Pemohon;IT;`])
    );
    assert.equal(crossTenant.status, 200);
    assert.equal(crossTenant.data.summary.imported, 1);
    assert.equal(crossTenant.data.imported[0].unit_name, "IT");
    assert.notEqual(crossTenant.data.imported[0].unit, org.itUnit.id);
  });
});

describe("audit impor", () => {
  it("ringkasan impor tercatat tanpa password awal", async () => {
    const audit = await org.lead.client.list("audit_logs", {
      filter: 'action = "import"',
      sort: "-created",
      perPage: 10,
    });

    assert.ok(audit.totalItems >= 1, "audit impor harus tercatat");

    const entry = audit.items.find(
      (item) => item.changes && item.changes.file_name === "anggota.csv"
    );

    assert.ok(entry, "audit impor anggota.csv harus ada");
    assert.equal(entry.actor, org.lead.user.id);
    assert.equal(entry.tenant, org.tenant.id);
    assert.equal(entry.collection_name, "users");
    assert.equal(entry.changes.file_name, "anggota.csv");
    assert.equal(entry.changes.total_rows, 7);
    assert.equal(entry.changes.imported, 2);
    assert.equal(entry.changes.failed, 5);
    assert.equal(entry.changes.failed_rows.length, 5);
    assert.equal(
      Object.prototype.hasOwnProperty.call(entry.changes, "password"),
      false,
      "audit tidak boleh memuat password awal"
    );
  });
});
