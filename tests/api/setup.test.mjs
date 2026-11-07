// Setup awal instalasi: status, kode setup, pembuatan akun pertama (standalone
// dan vendor), serta penutupan route setelah akun pertama ada.
//
// Test ini memakai instance PocketBase sendiri karena status setup bergantung
// pada "belum ada akun sama sekali" — suite API lain sudah membuat banyak akun.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { after, before, describe, it } from "node:test";

import { ApiClient } from "../lib/api-client.mjs";
import { uniqueLabel } from "../lib/fixtures.mjs";
import { startPocketBase } from "../lib/pocketbase-server.mjs";

const PASSWORD = "RahasiaSetup123!";

async function publicRequest(base, method, route, body) {
  const response = await fetch(base + route, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { status: response.status, data };
}

function account(overrides = {}) {
  return {
    name: "Rina Pratiwi",
    email: `kepala-it.${uniqueLabel("setup")}@rsuji.local`,
    password: PASSWORD,
    ...overrides,
  };
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

describe("setup standalone", () => {
  let server;
  let previousMode;
  let token;

  before(async () => {
    previousMode = process.env.TENANCY_MODE;
    process.env.TENANCY_MODE = "standalone";
    delete process.env.SETUP_TOKEN;
    server = await startPocketBase();
    process.env.TENANCY_MODE = previousMode;
  });

  after(async () => {
    if (previousMode === undefined) delete process.env.TENANCY_MODE;
    else process.env.TENANCY_MODE = previousMode;
    await server?.stop();
  });

  it("status awal menyatakan setup wajib dan menyiapkan kode setup", async () => {
    const before = await publicRequest(server.url, "GET", "/api/itsm/setup/status");

    assert.equal(before.status, 200);
    assert.equal(before.data.required, true);
    assert.equal(before.data.mode, "standalone");
    assert.equal(before.data.token_required, true);
    assert.equal(before.data.min_password, 8);
    assert.equal(before.data.hospital.code, "RS01");
    assert.equal(before.data.hospital.placeholder, true);

    const file = path.join(server.dataDir, "setup_token");
    assert.equal(await exists(file), true, "kode setup harus tersimpan di data dir");

    token = (await readFile(file, "utf8")).trim();
    assert.match(token, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);

    const meta = await publicRequest(server.url, "GET", "/api/itsm/app-meta");
    assert.equal(meta.status, 200);
    assert.equal(meta.data.setup_required, true);
  });

  it("menolak kode setup yang salah dan body yang tidak valid", async () => {
    const wrongToken = await publicRequest(server.url, "POST", "/api/itsm/setup", {
      token: "AAAA-BBBB-CCCC-DDDD",
      hospital: { name: "RSUD Uji", code: "RSUD-UJI" },
      account: account(),
    });

    assert.equal(wrongToken.status, 403);
    assert.match(String(wrongToken.data.message), /kode setup/i);

    const noToken = await publicRequest(server.url, "POST", "/api/itsm/setup", {
      hospital: { name: "RSUD Uji", code: "RSUD-UJI" },
      account: account(),
    });

    assert.equal(noToken.status, 403);

    const shortName = await publicRequest(server.url, "POST", "/api/itsm/setup", {
      token,
      hospital: { name: "A", code: "RSUD-UJI" },
      account: account(),
    });

    assert.equal(shortName.status, 400);
    assert.match(String(shortName.data.message), /minimal 2 karakter/i);

    const badCode = await publicRequest(server.url, "POST", "/api/itsm/setup", {
      token,
      hospital: { name: "RSUD Uji", code: "A" },
      account: account(),
    });

    assert.equal(badCode.status, 400);

    const weakPassword = await publicRequest(server.url, "POST", "/api/itsm/setup", {
      token,
      hospital: { name: "RSUD Uji", code: "RSUD-UJI" },
      account: account({ password: "pendek" }),
    });

    assert.equal(weakPassword.status, 400);
    assert.match(String(weakPassword.data.message), /password minimal/i);

    const badEmail = await publicRequest(server.url, "POST", "/api/itsm/setup", {
      token,
      hospital: { name: "RSUD Uji", code: "RSUD-UJI" },
      account: account({ email: "bukan-email" }),
    });

    assert.equal(badEmail.status, 400);
    assert.match(String(badEmail.data.message), /email/i);

    // Percobaan gagal tidak boleh menutup setup.
    const status = await publicRequest(server.url, "GET", "/api/itsm/setup/status");
    assert.equal(status.data.required, true);
  });

  it("membuat rumah sakit dan akun Kepala IT pertama", async () => {
    const admin = account();
    const created = await publicRequest(server.url, "POST", "/api/itsm/setup", {
      token,
      hospital: {
        name: "RSUD Kota Bandung",
        code: "rsud-kota-bdg",
        timezone: "Asia/Jakarta",
      },
      account: admin,
    });

    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.mode, "standalone");
    assert.equal(created.data.tenant.name, "RSUD Kota Bandung");
    assert.equal(created.data.tenant.code, "RSUD-KOTA-BDG");
    assert.equal(created.data.user.email, admin.email);
    assert.equal(created.data.user.role, "it_lead");
    assert.ok(
      created.data.seed && typeof created.data.seed.units === "number",
      "respons setup harus melaporkan hasil seed data master"
    );

    // Kode setup dipakai sekali: akun pertama menutup route.
    const status = await publicRequest(server.url, "GET", "/api/itsm/setup/status");
    assert.equal(status.data.required, false);
    assert.equal(status.data.token_required, false);

    assert.equal(
      await exists(path.join(server.dataDir, "setup_token")),
      false,
      "kode setup harus dihapus setelah setup selesai"
    );

    const meta = await publicRequest(server.url, "GET", "/api/itsm/app-meta");
    assert.equal(meta.data.setup_required, false);
    assert.equal(meta.data.tenant.name, "RSUD Kota Bandung");

    // Akun bisa login dan berperan sebagai Kepala IT.
    const client = new ApiClient(server.url);
    const record = await client.login(admin.email, PASSWORD);

    assert.equal(record.role, "it_lead");
    assert.equal(record.is_active, true);
    assert.equal(record.must_change_password, false);

    const me = await client.json("GET", `/api/collections/tenants/records/${record.tenant}`);
    assert.equal(me.name, "RSUD Kota Bandung");
    assert.equal(me.timezone, "Asia/Jakarta");

    // Master data tetap utuh dan katalog layanan tersedia untuk intake.
    const units = await client.list("units");
    const itUnit = units.items.find((unit) => unit.code === "IT");
    assert.ok(itUnit, "unit IT harus tersedia");
    assert.equal(record.unit, itUnit.id, "Kepala IT pertama ditempatkan di unit IT");

    const services = await client.list("services");
    assert.ok(services.items.length > 0, "katalog layanan default harus ada");
  });

  it("menolak setup kedua dan audit mencatat aksi setup", async () => {
    const again = await publicRequest(server.url, "POST", "/api/itsm/setup", {
      token,
      hospital: { name: "RSUD Lain", code: "LAIN" },
      account: account(),
    });

    assert.equal(again.status, 409);
    assert.match(String(again.data.message), /sudah disiapkan/i);

    const superuser = new ApiClient(server.url);
    await superuser.loginSuperuser(server.superuser.email, server.superuser.password);

    const audits = await superuser.list("audit_logs", {
      filter: 'action = "setup"',
      perPage: 10,
    });

    assert.equal(audits.items.length, 1);
    assert.equal(audits.items[0].actor_role, "it_lead");
    assert.equal(audits.items[0].changes.code, "RSUD-KOTA-BDG");
  });
});

describe("setup vendor", () => {
  let server;
  let previousMode;
  const envToken = "ENV-SETUP-TOKEN-1234";

  before(async () => {
    previousMode = process.env.TENANCY_MODE;
    process.env.TENANCY_MODE = "vendor";
    process.env.SETUP_TOKEN = envToken;
    server = await startPocketBase();
    process.env.TENANCY_MODE = previousMode;
  });

  after(async () => {
    delete process.env.SETUP_TOKEN;
    if (previousMode === undefined) delete process.env.TENANCY_MODE;
    else process.env.TENANCY_MODE = previousMode;
    await server?.stop();
  });

  it("status mode vendor tidak meminta identitas rumah sakit", async () => {
    const status = await publicRequest(server.url, "GET", "/api/itsm/setup/status");

    assert.equal(status.data.required, true);
    assert.equal(status.data.mode, "vendor");
    assert.equal(status.data.hospital, null);
  });

  it("memakai SETUP_TOKEN dari environment, bukan berkas", async () => {
    assert.equal(
      await exists(path.join(server.dataDir, "setup_token")),
      false,
      "kode dari environment tidak ditulis ke data dir"
    );

    const wrong = await publicRequest(server.url, "POST", "/api/itsm/setup", {
      token: "SALAH",
      account: account(),
    });
    assert.equal(wrong.status, 403);
  });

  it("membuat akun platform pertama yang bisa mengelola rumah sakit", async () => {
    const vendor = account({
      name: "Admin Vendor",
      email: `vendor.${uniqueLabel("setup")}@uji.local`,
    });
    const created = await publicRequest(server.url, "POST", "/api/itsm/setup", {
      token: envToken,
      account: vendor,
    });

    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.mode, "vendor");
    assert.equal(created.data.tenant, undefined);

    const client = new ApiClient(server.url);
    const record = await client.login(vendor.email, PASSWORD);

    assert.equal(record.is_platform_staff, true);
    assert.equal(record.role, "it_lead");
    assert.equal(String(record.tenant || ""), "");

    // Akun vendor langsung bisa membuka Konsol Vendor.
    const tenants = await client.json("GET", "/api/itsm/platform/tenants");
    assert.equal(tenants.mode, "vendor");
    assert.ok(tenants.items.length > 0, "tenant seed tetap terlihat di konsol");

    const status = await publicRequest(server.url, "GET", "/api/itsm/setup/status");
    assert.equal(status.data.required, false);

    const again = await publicRequest(server.url, "POST", "/api/itsm/setup", {
      token: envToken,
      account: account(),
    });
    assert.equal(again.status, 409);
  });
});
