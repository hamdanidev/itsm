// 2FA TOTP, kode pemulihan, pembatasan percobaan login, dan reset oleh IT Lead.
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";

import {
  addMember,
  readEnv,
  seedOrg,
  uniqueLabel,
  PASSWORD,
} from "../lib/fixtures.mjs";
import { ApiClient } from "../lib/api-client.mjs";
import { loadHookModule } from "../lib/load-hook.mjs";

const totp = loadHookModule("lib/totp.js");

let org;
let url;

function currentCode(secret, offset = 0) {
  return totp.hotp(
    secret,
    totp.stepFor(Math.floor(Date.now() / 1000)) + offset
  );
}

function loginAttempt(identity, password, code) {
  const body = { identity, password };
  if (code !== undefined) body.totp = code;

  return new ApiClient(url).request(
    "POST",
    "/api/collections/users/auth-with-password",
    { body }
  );
}

async function enroll(member) {
  const start = await member.client.json("POST", "/api/itsm/profile/2fa/start", {
    body: { current_password: PASSWORD },
  });
  const code = currentCode(start.secret);
  const confirm = await member.client.json(
    "POST",
    "/api/itsm/profile/2fa/confirm",
    { body: { code } }
  );

  return { start, code, confirm };
}

before(async () => {
  org = await seedOrg({ label: uniqueLabel("dua-faktor"), isolatedTenant: true });
  url = readEnv().url;
}, { timeout: 120_000 });

describe("pendaftaran dan login 2FA", () => {
  it("mengaktifkan TOTP, menampilkan kode pemulihan sekali, dan menolak login tanpa kode", async () => {
    const member = await addMember(org.admin, {
      tenantId: org.tenant.id,
      unitId: org.itUnit.id,
      role: "it_support",
      label: "totp",
      name: "Pengguna TOTP",
    });

    const wrongPassword = await member.client.request(
      "POST",
      "/api/itsm/profile/2fa/start",
      { body: { current_password: "SalahSekali123!" } }
    );
    assert.equal(wrongPassword.status, 400);

    const start = await member.client.json("POST", "/api/itsm/profile/2fa/start", {
      body: { current_password: PASSWORD },
    });

    assert.equal(start.secret.length, 32);
    assert.match(start.otpauth_uri, /^otpauth:\/\/totp\//);
    assert.equal(start.issuer, org.tenant.name);

    const invalid = await member.client.request(
      "POST",
      "/api/itsm/profile/2fa/confirm",
      { body: { code: "000000" } }
    );
    assert.equal(invalid.status, 400);

    const code = currentCode(start.secret);
    const confirm = await member.client.json(
      "POST",
      "/api/itsm/profile/2fa/confirm",
      { body: { code } }
    );

    assert.equal(confirm.enabled, true);
    assert.equal(confirm.recovery_codes.length, 10);
    assert.ok(
      confirm.recovery_codes.every((item) =>
        /^[A-Z0-9]{4}(-[A-Z0-9]{4}){2}$/.test(item)
      )
    );

    const profile = await member.client.json("GET", "/api/itsm/profile");
    assert.equal(profile.totp_enabled, true);
    assert.equal(
      JSON.stringify(profile).includes(start.secret),
      false,
      "secret tidak boleh bocor lewat profil"
    );
    assert.equal(
      JSON.stringify(profile).includes(confirm.recovery_codes[0]),
      false,
      "kode pemulihan tidak boleh bocor lewat profil"
    );

    // Tanpa kode -> 403, bukan token.
    const noCode = await loginAttempt(member.email, PASSWORD);
    assert.equal(noCode.status, 403);
    assert.match(noCode.data.message, /dua faktor/i);

    // Kode salah -> 401 dan tercatat sebagai login gagal.
    const wrongCode = await loginAttempt(member.email, PASSWORD, "000000");
    assert.equal(wrongCode.status, 401);
    assert.match(wrongCode.data.message, /dua faktor salah/i);

    const failed = await org.lead.client.list("audit_logs", {
      filter: `action = "login_failed" && actor = "${member.user.id}"`,
      sort: "-created",
      perPage: 10,
    });
    assert.ok(failed.totalItems >= 1);
    assert.equal(failed.items[0].changes.reason, "totp");
    assert.equal(failed.items[0].tenant, org.tenant.id);
    assert.equal(
      JSON.stringify(failed.items[0].changes).includes("000000"),
      false,
      "kode yang dicoba tidak boleh disimpan di audit"
    );

    // Kode yang dipakai saat mendaftar masih berlaku sekali untuk login.
    const withCode = await loginAttempt(member.email, PASSWORD, code);
    assert.equal(withCode.status, 200, JSON.stringify(withCode.data));
    assert.ok(withCode.data.token);
    assert.equal(withCode.data.record.totp_enabled, true);

    // Kode yang sama tidak dapat dipakai dua kali.
    const replay = await loginAttempt(member.email, PASSWORD, code);
    assert.equal(replay.status, 401);
  });

  it("kode pemulihan sekali pakai dapat menggantikan TOTP", async () => {
    const member = await addMember(org.admin, {
      tenantId: org.tenant.id,
      unitId: org.itUnit.id,
      role: "requester",
      label: "pemulihan",
      name: "Pengguna Pemulihan",
    });

    const { confirm } = await enroll(member);
    const recoveryCode = confirm.recovery_codes[0];

    const first = await loginAttempt(member.email, PASSWORD, recoveryCode);
    assert.equal(first.status, 200, JSON.stringify(first.data));

    const second = await loginAttempt(member.email, PASSWORD, recoveryCode);
    assert.equal(second.status, 401);
  });

  it("menonaktifkan 2FA menuntut password dan kode yang valid", async () => {
    const member = await addMember(org.admin, {
      tenantId: org.tenant.id,
      unitId: org.itUnit.id,
      role: "requester",
      label: "nonaktif",
      name: "Pengguna Nonaktif 2FA",
    });

    const { start, code } = await enroll(member);

    const wrongPassword = await member.client.request(
      "POST",
      "/api/itsm/profile/2fa/disable",
      { body: { password: "SalahSekali123!", code } }
    );
    assert.equal(wrongPassword.status, 400);

    const wrongCode = await member.client.request(
      "POST",
      "/api/itsm/profile/2fa/disable",
      { body: { password: PASSWORD, code: "000000" } }
    );
    assert.equal(wrongCode.status, 400);

    const disabled = await member.client.json(
      "POST",
      "/api/itsm/profile/2fa/disable",
      { body: { password: PASSWORD, code: currentCode(start.secret) } }
    );
    assert.equal(disabled.enabled, false);

    const profile = await member.client.json("GET", "/api/itsm/profile");
    assert.equal(profile.totp_enabled, false);

    const login = await loginAttempt(member.email, PASSWORD);
    assert.equal(login.status, 200, JSON.stringify(login.data));
  });
});

describe("pembatasan percobaan login", () => {
  it("mengunci akun setelah lima percobaan dan mencatat setiap kegagalan", async () => {
    const member = await addMember(org.admin, {
      tenantId: org.tenant.id,
      unitId: org.itUnit.id,
      role: "requester",
      label: "kunci",
      name: "Pengguna Terkunci",
    });

    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await loginAttempt(member.email, "SalahTerus123!");
      assert.equal(response.status, 400, `percobaan ${attempt}`);
    }

    // Percobaan keenam dengan password benar tetap ditolak selama masa kunci.
    const locked = await loginAttempt(member.email, PASSWORD);
    assert.equal(locked.status, 429);
    assert.match(locked.data.message, /Terlalu banyak percobaan/);

    const audits = await org.lead.client.list("audit_logs", {
      filter: `action = "login_failed" && actor = "${member.user.id}"`,
      sort: "-created",
      perPage: 20,
    });

    assert.equal(audits.totalItems, 6);
    assert.equal(audits.items[0].changes.reason, "locked");

    const passwordFailures = audits.items.filter(
      (item) => item.changes.reason === "password"
    );
    assert.equal(passwordFailures.length, 5);
    assert.equal(passwordFailures[0].changes.attempts, 5);
    assert.ok(passwordFailures[0].changes.locked_until);
    assert.equal(
      JSON.stringify(passwordFailures[0].changes).includes("SalahTerus123!"),
      false,
      "password yang dicoba tidak boleh disimpan"
    );

    // IT Lead dapat membuka kunci tanpa menunggu masa kunci.
    const supportUnlock = await org.support.client.request(
      "POST",
      `/api/itsm/team/${member.user.id}/unlock`
    );
    assert.equal(supportUnlock.status, 403);

    const unlock = await org.lead.client.json(
      "POST",
      `/api/itsm/team/${member.user.id}/unlock`
    );
    assert.equal(unlock.user.login_failed_count, 0);
    assert.equal(unlock.user.login_locked_until, "");

    const afterUnlock = await loginAttempt(member.email, PASSWORD);
    assert.equal(afterUnlock.status, 200, JSON.stringify(afterUnlock.data));
  });
});

describe("reset 2FA oleh IT Lead", () => {
  it("menghapus 2FA, mengakhiri sesi lama, dan mencatat audit", async () => {
    const member = await addMember(org.admin, {
      tenantId: org.tenant.id,
      unitId: org.itUnit.id,
      role: "requester",
      label: "reset2fa",
      name: "Pengguna Reset 2FA",
    });

    await enroll(member);

    const supportReset = await org.support.client.request(
      "POST",
      `/api/itsm/team/${member.user.id}/2fa-reset`
    );
    assert.equal(supportReset.status, 403);

    const reset = await org.lead.client.json(
      "POST",
      `/api/itsm/team/${member.user.id}/2fa-reset`
    );

    assert.equal(reset.user.totp_enabled, false);

    // Token lama tidak berlaku karena sesi diputus.
    const stale = await member.client.request("GET", "/api/itsm/profile");
    assert.equal(stale.status, 401);

    const fresh = new ApiClient(url);
    const record = await fresh.login(member.email, PASSWORD);
    assert.equal(record.totp_enabled, false);

    const login = await loginAttempt(member.email, PASSWORD);
    assert.equal(login.status, 200, JSON.stringify(login.data));

    const audits = await org.lead.client.list("audit_logs", {
      filter: `action = "mfa_reset" && record_id = "${member.user.id}"`,
      sort: "-created",
      perPage: 5,
    });

    assert.equal(audits.totalItems, 1);
    assert.equal(audits.items[0].actor, org.lead.user.id);
    assert.equal(audits.items[0].changes.method, "totp");
  });

  it("IT Lead tidak dapat mereset 2FA akunnya sendiri lewat konsol tim", async () => {
    const response = await org.lead.client.request(
      "POST",
      `/api/itsm/team/${org.lead.user.id}/2fa-reset`
    );

    assert.equal(response.status, 400);
    assert.match(response.data.message, /akun sendiri/i);
  });
});
