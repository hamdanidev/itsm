// Lupa password mandiri: tautan email, token sekali pakai, pembersihan
// must_change_password, audit, dan pembatasan permintaan.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import { readEnv, seedOrg, uniqueLabel } from "../lib/fixtures.mjs";
import { ApiClient } from "../lib/api-client.mjs";

let org;
let member;
let memberEmail;
let initialPassword;
let token;

function guest(url) {
  return new ApiClient(url);
}

function extractToken(html) {
  const match = String(html || "").match(
    /reset-password\?token=([A-Za-z0-9._-]+)/
  );
  return match ? decodeURIComponent(match[1]) : "";
}

async function resetRows(admin, email) {
  return admin.list("email_outbox", {
    filter: `event = "link" && to = "${email}"`,
    sort: "-created",
    perPage: 20,
  });
}

before(async () => {
  org = await seedOrg({ label: uniqueLabel("reset"), isolatedTenant: true });
  memberEmail = `reset.${Date.now().toString(36)}@uji.local`;

  const created = await org.lead.client.json("POST", "/api/itsm/team", {
    body: { name: "Anggota Reset", email: memberEmail, role: "it_support" },
  });

  member = created.user;
  initialPassword = created.password;
});

describe("permintaan tautan reset", () => {
  it("mengirim tautan ke email akun dan mencatat audit", async () => {
    const res = await guest(readEnv().url).request(
      "POST",
      "/api/itsm/auth/forgot-password",
      { body: { email: memberEmail } }
    );

    assert.equal(res.status, 200);
    assert.equal(res.data.ok, true);

    const rows = await resetRows(org.admin, memberEmail);
    assert.equal(rows.totalItems, 1);

    token = extractToken(rows.items[0].html);
    assert.ok(token, "token reset harus ada di email");
    assert.equal(rows.items[0].status, "sent");

    const audit = await org.admin.list("audit_logs", {
      filter: `action = "password_reset_request" && record_id = "${member.id}"`,
      perPage: 5,
    });

    assert.ok(audit.totalItems >= 1);
  });

  it("permintaan kedua dalam satu menit tidak mengirim email lagi", async () => {
    const res = await guest(readEnv().url).request(
      "POST",
      "/api/itsm/auth/forgot-password",
      { body: { email: memberEmail } }
    );

    assert.equal(res.status, 200);

    const rows = await resetRows(org.admin, memberEmail);
    assert.equal(rows.totalItems, 1);
  });
});

describe("konfirmasi reset", () => {
  it("password baru berlaku, sesi lama keluar, dan flag wajib ganti turun", async () => {
    const newPassword = "PasswordReset123!";
    const res = await guest(readEnv().url).request(
      "POST",
      "/api/collections/users/confirm-password-reset",
      {
        body: {
          token,
          password: newPassword,
          passwordConfirm: newPassword,
        },
      }
    );

    assert.ok(res.status === 200 || res.status === 204, `status ${res.status}`);

    const fresh = new ApiClient(readEnv().url);
    const record = await fresh.login(memberEmail, newPassword);

    assert.equal(record.must_change_password, false);

    const oldLogin = await guest(readEnv().url).request(
      "POST",
      "/api/collections/users/auth-with-password",
      { body: { identity: memberEmail, password: initialPassword } }
    );
    assert.equal(oldLogin.status, 400);

    const audit = await org.admin.list("audit_logs", {
      filter: `action = "password_reset" && record_id = "${member.id}"`,
      perPage: 5,
    });
    assert.ok(audit.totalItems >= 1);
  });

  it("token yang sama tidak bisa dipakai dua kali", async () => {
    const res = await guest(readEnv().url).request(
      "POST",
      "/api/collections/users/confirm-password-reset",
      {
        body: {
          token,
          password: "PasswordReset456!",
          passwordConfirm: "PasswordReset456!",
        },
      }
    );

    assert.equal(res.status, 400);
  });
});

describe("anti-enumerasi dan pembatasan", () => {
  it("email tidak dikenal tetap menghasilkan respons generik", async () => {
    const email = `tidak.ada.${Date.now().toString(36)}@uji.local`;
    const res = await guest(readEnv().url).request(
      "POST",
      "/api/itsm/auth/forgot-password",
      { body: { email } }
    );

    assert.equal(res.status, 200);
    assert.equal(res.data.ok, true);

    const rows = await resetRows(org.admin, email);
    assert.equal(rows.totalItems, 0);
  });

  it("akun nonaktif tidak menerima tautan", async () => {
    const email = `nonaktif.${Date.now().toString(36)}@uji.local`;
    const created = await org.lead.client.json("POST", "/api/itsm/team", {
      body: { name: "Nonaktif Reset", email, role: "requester" },
    });

    await org.lead.client.json(
      "PATCH",
      `/api/itsm/team/${created.user.id}`,
      { body: { is_active: false } }
    );

    const res = await guest(readEnv().url).request(
      "POST",
      "/api/itsm/auth/forgot-password",
      { body: { email } }
    );

    assert.equal(res.status, 200);

    const rows = await resetRows(org.admin, email);
    assert.equal(rows.totalItems, 0);
  });

  it("pengguna yang sudah login tidak boleh memakai endpoint guest", async () => {
    const res = await org.lead.client.request(
      "POST",
      "/api/itsm/auth/forgot-password",
      { body: { email: memberEmail } }
    );

    assert.ok(
      res.status === 400 || res.status === 403,
      `endpoint guest menolak pengguna login (status ${res.status})`
    );
  });
});
