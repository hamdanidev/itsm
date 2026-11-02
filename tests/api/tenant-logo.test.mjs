// Logo rumah sakit: unggah/hapus oleh IT Lead, akses file, dan pembatasan role.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { readEnv, seedOrg, uniqueLabel } from "../lib/fixtures.mjs";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

let org;

function logoForm() {
  const form = new FormData();
  form.append("logo", new Blob([PNG], { type: "image/png" }), "logo.png");
  return form;
}

before(async () => {
  org = await seedOrg({ label: uniqueLabel("logo"), isolatedTenant: true });
});

describe("logo rumah sakit", () => {
  it("IT Lead mengunggah logo dan file bisa dibaca pengguna login", async () => {
    const uploaded = await org.lead.client.json(
      "POST",
      "/api/itsm/tenant/logo",
      { form: logoForm() }
    );

    assert.ok(uploaded.tenant.logo, "nama file logo harus dikembalikan");
    assert.equal(uploaded.tenant.id, org.tenant.id);

    const tenant = await org.admin.json(
      "GET",
      `/api/collections/tenants/records/${org.tenant.id}`
    );

    assert.equal(tenant.logo, uploaded.tenant.logo);

    const file = await org.lead.client.request(
      "GET",
      `/api/files/tenants/${org.tenant.id}/${uploaded.tenant.logo}`
    );

    assert.equal(file.status, 200);
    assert.match(file.headers.get("content-type") || "", /image\/png/);
  });

  it("support dan requester tidak boleh mengunggah atau menghapus logo", async () => {
    const support = await org.support.client.request(
      "POST",
      "/api/itsm/tenant/logo",
      { form: logoForm() }
    );
    assert.equal(support.status, 403);

    const requester = await org.requester.client.request(
      "DELETE",
      "/api/itsm/tenant/logo"
    );
    assert.equal(requester.status, 403);
  });

  it("logo bisa dihapus oleh IT Lead", async () => {
    const removed = await org.lead.client.json(
      "DELETE",
      "/api/itsm/tenant/logo"
    );

    assert.equal(removed.tenant.logo, "");

    const tenant = await org.admin.json(
      "GET",
      `/api/collections/tenants/records/${org.tenant.id}`
    );

    assert.equal(tenant.logo, "");
  });

  it("route logo publik tertutup pada mode vendor", async () => {
    const res = await fetch(`${readEnv().url}/api/itsm/branding/logo`);

    assert.equal(res.status, 404);
  });
});
