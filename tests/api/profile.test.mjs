// Profil pengguna: data diri, avatar, dan ganti password.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  createUser,
  readEnv,
  seedOrg,
  uniqueLabel,
} from "../lib/fixtures.mjs";
import { ApiClient, expectStatus } from "../lib/api-client.mjs";

const PASSWORD = "RahasiaUji123!";
const NEW_PASSWORD = "PasswordBaru123!";

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "base64"
);

let org;
let collectionId;

function avatarForm(content, type = "image/png", name = "avatar.png") {
  const form = new FormData();
  form.set("avatar", new Blob([content], { type }), name);
  return form;
}

before(async () => {
  org = await seedOrg({ label: uniqueLabel("profil") });
  const collection = await org.admin.json("GET", "/api/collections/users");
  collectionId = collection.id;
});

describe("data profil", () => {
  it("mengembalikan profil sendiri lengkap dengan unit dan tenant", async () => {
    const profile = await org.requester.client.json("GET", "/api/itsm/profile");

    assert.equal(profile.email, org.requester.email);
    assert.equal(profile.name, org.requester.user.name);
    assert.equal(profile.role, "requester");
    assert.equal(profile.unit_name, org.unit.name);
    assert.equal(profile.tenant_name, org.tenant.name);
    assert.equal(profile.avatar, "");
  });

  it("memperbarui nama, telepon, dan nomor pegawai", async () => {
    const updated = await org.requester.client.json("PATCH", "/api/itsm/profile", {
      body: {
        name: "Rina Kartika Putri",
        phone: "+62 812-3456-7890",
        employee_no: "EMP-001",
      },
    });

    assert.equal(updated.name, "Rina Kartika Putri");
    assert.equal(updated.phone, "+62 812-3456-7890");
    assert.equal(updated.employee_no, "EMP-001");

    const fresh = await org.requester.client.json("GET", "/api/itsm/profile");
    assert.equal(fresh.name, "Rina Kartika Putri");
  });

  it("field sensitif tidak bisa diubah lewat payload profil", async () => {
    const result = await org.requester.client.json("PATCH", "/api/itsm/profile", {
      body: {
        name: "Rina Kartika",
        role: "it_lead",
        tenant: "tenant-palsu",
        unit: "unit-palsu",
        is_active: false,
      },
    });

    assert.equal(result.role, "requester");
    assert.equal(result.tenant, org.tenant.id);
    assert.equal(result.unit, org.unit.id);
    assert.equal(result.is_active, true);
  });

  it("validasi nama, telepon, dan nomor pegawai", async () => {
    await expectStatus(
      org.requester.client.request("PATCH", "/api/itsm/profile", {
        body: { name: "A" },
      }),
      400,
      "nama terlalu pendek"
    );

    await expectStatus(
      org.requester.client.request("PATCH", "/api/itsm/profile", {
        body: { name: "Nama Valid", phone: "telepon salah" },
      }),
      400,
      "telepon tidak valid"
    );

    await expectStatus(
      org.requester.client.request("PATCH", "/api/itsm/profile", {
        body: { name: "Nama Valid", employee_no: "nomor pegawai!" },
      }),
      400,
      "nomor pegawai tidak valid"
    );
  });
});

describe("avatar", () => {
  it("mengunggah PNG dan file bisa diakses tanpa token", async () => {
    const profile = await org.requester.client.json(
      "POST",
      "/api/itsm/profile/avatar",
      { form: avatarForm(PNG_1PX) }
    );

    assert.ok(profile.avatar, "nama file avatar harus terisi");

    const url = `${readEnv().url}/api/files/${collectionId}/${profile.id}/${profile.avatar}`;
    const response = await fetch(url);

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /image\/png/);
  });

  it("tipe file selain gambar ditolak", async () => {
    const { status } = await org.requester.client.request(
      "POST",
      "/api/itsm/profile/avatar",
      { form: avatarForm(Buffer.from("bukan gambar"), "text/plain", "catatan.txt") }
    );

    assert.equal(status, 400);
  });

  it("file lebih dari 2 MB ditolak", async () => {
    const big = Buffer.alloc(2 * 1024 * 1024 + 10, 1);
    const { status } = await org.requester.client.request(
      "POST",
      "/api/itsm/profile/avatar",
      { form: avatarForm(big) }
    );

    assert.equal(status, 400);
  });

  it("avatar bisa dihapus", async () => {
    const profile = await org.requester.client.json(
      "DELETE",
      "/api/itsm/profile/avatar"
    );

    assert.equal(profile.avatar, "");
  });
});

describe("ganti password", () => {
  it("password saat ini wajib benar", async () => {
    const { status } = await org.requester.client.request(
      "POST",
      "/api/itsm/profile/password",
      {
        body: {
          current_password: "PasswordSalah123!",
          new_password: NEW_PASSWORD,
          new_password_confirm: NEW_PASSWORD,
        },
      }
    );

    assert.equal(status, 400);
  });

  it("password baru divalidasi", async () => {
    const short = await org.requester.client.request(
      "POST",
      "/api/itsm/profile/password",
      {
        body: {
          current_password: PASSWORD,
          new_password: "pendek",
          new_password_confirm: "pendek",
        },
      }
    );
    assert.equal(short.status, 400);

    const mismatch = await org.requester.client.request(
      "POST",
      "/api/itsm/profile/password",
      {
        body: {
          current_password: PASSWORD,
          new_password: NEW_PASSWORD,
          new_password_confirm: "PasswordLain123!",
        },
      }
    );
    assert.equal(mismatch.status, 400);

    const same = await org.requester.client.request(
      "POST",
      "/api/itsm/profile/password",
      {
        body: {
          current_password: PASSWORD,
          new_password: PASSWORD,
          new_password_confirm: PASSWORD,
        },
      }
    );
    assert.equal(same.status, 400);
  });

  it("password berhasil diubah dan sesi lama tidak berlaku", async () => {
    const result = await org.requester.client.json(
      "POST",
      "/api/itsm/profile/password",
      {
        body: {
          current_password: PASSWORD,
          new_password: NEW_PASSWORD,
          new_password_confirm: NEW_PASSWORD,
        },
      }
    );
    assert.equal(result.ok, true);

    const oldToken = await org.requester.client.request("GET", "/api/itsm/profile");
    assert.equal(oldToken.status, 401, "token lama harus tidak berlaku");

    const oldLogin = await new ApiClient(readEnv().url).request(
      "POST",
      "/api/collections/users/auth-with-password",
      { body: { identity: org.requester.email, password: PASSWORD } }
    );
    assert.equal(oldLogin.status, 400, "password lama harus ditolak");

    const fresh = new ApiClient(readEnv().url);
    const record = await fresh.login(org.requester.email, NEW_PASSWORD);
    assert.equal(record.id, org.requester.user.id);
  });
});

describe("audit profil", () => {
  it("perubahan profil dan password tercatat untuk IT Lead", async () => {
    const logs = await org.lead.client.list("audit_logs", {
      filter: 'collection_name="users"',
      perPage: 100,
    });

    const actions = logs.items.map((item) => item.action);
    assert.ok(actions.includes("update"), "audit update profil harus ada");

    const passwordLog = logs.items.find(
      (item) => item.changes && item.changes.field === "password"
    );
    assert.ok(passwordLog, "audit perubahan password harus ada");
    assert.equal(passwordLog.actor, org.requester.user.id);
  });
});
