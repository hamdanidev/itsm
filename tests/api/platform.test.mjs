import assert from "node:assert/strict";
import test from "node:test";

import { ApiClient } from "../lib/api-client.mjs";
import {
  adminClient,
  createPlatformUser,
  readEnv,
  seedOrg,
  uniqueLabel,
  PASSWORD,
} from "../lib/fixtures.mjs";

function tenantCode(prefix = "T") {
  return `${prefix}${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 5)}`
    .toUpperCase()
    .slice(0, 20);
}

function platformTenantBody(overrides = {}) {
  return {
    name: `RS Uji ${uniqueLabel("rs")}`,
    code: tenantCode("RS"),
    timezone: "Asia/Jakarta",
    ...overrides,
  };
}

test("app-meta melaporkan mode vendor", async () => {
  const { url } = readEnv();
  const client = new ApiClient(url);
  const meta = await client.json("GET", "/api/itsm/app-meta");

  assert.equal(meta.mode, "vendor");
  assert.equal(meta.vendor_console, true);
});

test("akun vendor dapat melihat seluruh tenant", async () => {
  const admin = await adminClient();
  const { client } = await createPlatformUser(admin, { role: "it_lead" });

  const payload = await client.json("GET", "/api/itsm/platform/tenants");

  assert.ok(payload.items.length >= 1);
  assert.ok(payload.items.some((tenant) => tenant.code === "RS01"));
  assert.equal(payload.summary.tenants, payload.items.length);

  const rs01 = payload.items.find((tenant) => tenant.code === "RS01");
  assert.ok(rs01.counts.policies >= 12);
});

test("pengguna rumah sakit tidak dapat membuka konsol vendor", async () => {
  const org = await seedOrg({ label: uniqueLabel("rbac") });

  const list = await org.lead.client.request("GET", "/api/itsm/platform/tenants");
  assert.equal(list.status, 403);

  const support = await org.support.client.request(
    "GET",
    "/api/itsm/platform/tenants"
  );
  assert.equal(support.status, 403);

  const requester = await org.requester.client.request(
    "GET",
    "/api/itsm/platform/tenants"
  );
  assert.equal(requester.status, 403);
});

test("vendor support boleh membaca tetapi tidak boleh mengubah tenant", async () => {
  const admin = await adminClient();
  const { client } = await createPlatformUser(admin, { role: "it_support" });

  const list = await client.request("GET", "/api/itsm/platform/tenants");
  assert.equal(list.status, 200);

  const create = await client.request("POST", "/api/itsm/platform/tenants", {
    body: platformTenantBody(),
  });
  assert.equal(create.status, 403);
});

test("membuat rumah sakit baru beserta data master dan akun IT pertama", async () => {
  const { url } = readEnv();
  const admin = await adminClient();
  const { client } = await createPlatformUser(admin, { role: "it_lead" });
  const email = `lead.${uniqueLabel("rs")}@uji.local`;
  const body = platformTenantBody({
    seed_master: true,
    admin: { name: "Lead RS Baru", email, password: PASSWORD },
  });

  const created = await client.json("POST", "/api/itsm/platform/tenants", {
    body,
  });

  assert.equal(created.tenant.code, body.code);
  assert.equal(created.tenant.is_active, true);
  assert.deepEqual(created.seed, {
    units: 10,
    categories: 9,
    policies: 12,
    holidays: 3,
  });
  assert.equal(created.admin.email, email);

  const detail = await client.json(
    "GET",
    `/api/itsm/platform/tenants/${created.tenant.id}`
  );

  assert.equal(detail.counts.policies, 12);
  assert.equal(detail.counts.users, 1);
  assert.ok(detail.units.length >= 10);
  assert.equal(detail.users[0].email, email);

  // Seed bersifat idempoten: pemanggilan kedua tidak menambah apa pun.
  const reseed = await client.json(
    "POST",
    `/api/itsm/platform/tenants/${created.tenant.id}/seed`
  );

  assert.deepEqual(reseed.created, {
    units: 0,
    categories: 0,
    policies: 0,
    holidays: 0,
  });

  // Akun IT pertama langsung dapat login dan melihat master data tenant-nya.
  const lead = new ApiClient(url);
  const record = await lead.login(email, PASSWORD);

  assert.equal(record.tenant, created.tenant.id);
  assert.equal(record.role, "it_lead");
  assert.equal(record.is_platform_staff, false);

  const units = await lead.list("units");
  assert.ok(units.items.length >= 10);
});

test("kode rumah sakit unik", async () => {
  const admin = await adminClient();
  const { client } = await createPlatformUser(admin, { role: "it_lead" });
  const body = platformTenantBody();

  await client.json("POST", "/api/itsm/platform/tenants", { body });

  const duplicate = await client.request("POST", "/api/itsm/platform/tenants", {
    body: { ...body, name: "RS Duplikat" },
  });

  assert.equal(duplicate.status, 400);
  assert.match(duplicate.data.message, /sudah dipakai/);
});

test("menonaktifkan rumah sakit memblokir login penggunanya", async () => {
  const { url } = readEnv();
  const admin = await adminClient();
  const { client } = await createPlatformUser(admin, { role: "it_lead" });
  const email = `lead.${uniqueLabel("off")}@uji.local`;

  const created = await client.json("POST", "/api/itsm/platform/tenants", {
    body: platformTenantBody({
      seed_master: false,
      admin: { name: "Lead Nonaktif", email, password: PASSWORD },
    }),
  });

  const lead = new ApiClient(url);
  await lead.login(email, PASSWORD);

  const patched = await client.json(
    "PATCH",
    `/api/itsm/platform/tenants/${created.tenant.id}`,
    { body: { is_active: false, timezone: "Asia/Makassar" } }
  );

  assert.equal(patched.tenant.is_active, false);
  assert.equal(patched.tenant.timezone, "Asia/Makassar");

  const retry = await new ApiClient(url).request(
    "POST",
    "/api/collections/users/auth-with-password",
    { body: { identity: email, password: PASSWORD } }
  );

  assert.equal(retry.status, 403);
});

test("menambah pengguna tenant dan menolak email duplikat", async () => {
  const admin = await adminClient();
  const { client } = await createPlatformUser(admin, { role: "it_lead" });
  const email = `support.${uniqueLabel("rs")}@uji.local`;

  const created = await client.json("POST", "/api/itsm/platform/tenants", {
    body: platformTenantBody({ seed_master: false }),
  });

  const path = `/api/itsm/platform/tenants/${created.tenant.id}/users`;

  const added = await client.json("POST", path, {
    body: { name: "Support RS", email, role: "it_support", password: PASSWORD },
  });

  assert.equal(added.user.role, "it_support");
  assert.equal(added.user.is_active, true);

  const duplicate = await client.request("POST", path, {
    body: { name: "Support Lain", email, role: "it_support", password: PASSWORD },
  });

  assert.equal(duplicate.status, 400);

  const deactivated = await client.json(
    "PATCH",
    `${path}/${added.user.id}`,
    { body: { is_active: false } }
  );

  assert.equal(deactivated.user.is_active, false);
});

// Fase 2 membuka akses baca tiket lintas tenant untuk vendor; detailnya diuji
// di platform-tickets.test.mjs. Di sini cukup memastikan konsol masih utuh.
test("akun vendor tetap tidak punya tenant sendiri", async () => {
  const admin = await adminClient();
  const { client } = await createPlatformUser(admin, { role: "it_lead" });

  const profile = await client.json("GET", "/api/itsm/profile");
  assert.equal(profile.tenant, "");
});

test("akun vendor wajib ber-role staf", async () => {
  const admin = await adminClient();
  const res = await admin.request("POST", "/api/collections/users/records", {
    body: {
      email: `vendor.requester.${Date.now()}@uji.local`,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      emailVisibility: true,
      verified: true,
      name: "Vendor Requester",
      role: "requester",
      is_active: true,
      is_platform_staff: true,
    },
  });

  assert.equal(res.status, 400);
  assert.match(res.data.message, /it_support atau it_lead/);
});

test("mode standalone menolak login akun vendor", async () => {
  const { startPocketBase } = await import("../lib/pocketbase-server.mjs");
  const previous = process.env.TENANCY_MODE;
  let server;

  process.env.TENANCY_MODE = "standalone";

  try {
    server = await startPocketBase();
    process.env.TENANCY_MODE = previous;

    const admin = new ApiClient(server.url);
    await admin.loginSuperuser(server.superuser.email, server.superuser.password);

    const email = `vendor.standalone.${Date.now()}@uji.local`;
    await admin.create("users", {
      email,
      password: PASSWORD,
      passwordConfirm: PASSWORD,
      emailVisibility: true,
      verified: true,
      name: "Vendor Standalone",
      role: "it_lead",
      is_active: true,
      is_platform_staff: true,
    });

    const meta = await new ApiClient(server.url).json("GET", "/api/itsm/app-meta");
    assert.equal(meta.mode, "standalone");
    assert.equal(meta.vendor_console, false);

    const login = await new ApiClient(server.url).request(
      "POST",
      "/api/collections/users/auth-with-password",
      { body: { identity: email, password: PASSWORD } }
    );

    assert.equal(login.status, 403);
    assert.match(login.data.message, /standalone/);
  } finally {
    process.env.TENANCY_MODE = previous;
    if (server) await server.stop();
  }
});
