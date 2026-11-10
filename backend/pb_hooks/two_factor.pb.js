// Pengaturan autentikasi dua faktor (TOTP) untuk akun sendiri.
//
// Alur: start (password) -> confirm (kode 6 digit) -> kode pemulihan sekali
// tampil. Menonaktifkan 2FA menuntut password dan kode yang valid, sehingga
// sesi yang dibajak tidak bisa mematikan faktor kedua tanpa kode.

routerAdd(
  "POST",
  "/api/itsm/profile/2fa/start",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var totp = require(__hooks + "/lib/totp.js");

    var auth = guards.requireAuth(e);
    var body = e.requestInfo().body || {};
    var record = e.app.findRecordById("users", auth.id);

    if (record.get("totp_enabled")) {
      throw new BadRequestError("Autentikasi dua faktor sudah aktif");
    }
    if (!record.validatePassword(String(body.current_password || ""))) {
      throw new BadRequestError("Password saat ini salah");
    }

    var issuer = "Healthcare ITSM";

    try {
      var tenant = e.app.findRecordById("tenants", String(record.get("tenant") || ""));
      issuer = String(tenant.get("name") || "") || issuer;
    } catch (err) {
      issuer = "Healthcare ITSM";
    }

    var secret = totp.randomSecret();

    record.set("totp_secret", secret);
    record.set("totp_enabled", false);
    record.set("totp_confirmed_at", "");
    record.set("totp_last_step", 0);
    record.set("totp_recovery_hashes", []);
    e.app.save(record);

    return e.json(200, {
      secret: secret,
      otpauth_uri: totp.provisioningUri({
        issuer: issuer,
        account: String(record.get("email") || ""),
        secret: secret,
      }),
      issuer: issuer,
      account: String(record.get("email") || ""),
      digits: totp.DIGITS,
      period: totp.PERIOD_SECONDS,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/itsm/profile/2fa/confirm",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var totp = require(__hooks + "/lib/totp.js");

    var auth = guards.requireAuth(e);
    var body = e.requestInfo().body || {};
    var record = e.app.findRecordById("users", auth.id);

    if (record.get("totp_enabled")) {
      throw new BadRequestError("Autentikasi dua faktor sudah aktif");
    }

    var secret = String(record.get("totp_secret") || "");
    if (!secret) {
      throw new BadRequestError("Mulai pengaturan 2FA terlebih dahulu");
    }

    var check = totp.verifyStep(secret, body.code, { window: 1 });
    if (!check.valid) {
      throw new BadRequestError(
        "Kode verifikasi salah. Pastikan jam perangkat sesuai lalu coba lagi."
      );
    }

    var codes = totp.generateRecoveryCodes(10);
    var hashes = [];

    for (var i = 0; i < codes.length; i++) {
      hashes.push({ hash: totp.hashRecoveryCode(codes[i]), used_at: "" });
    }

    record.set("totp_enabled", true);
    record.set("totp_confirmed_at", new Date().toISOString());
    record.set("totp_last_step", 0);
    record.set("totp_recovery_hashes", hashes);
    e.app.save(record);

    try {
      var meta = audit.requestMeta(e);
      audit.write(e.app, {
        tenant: String(record.get("tenant") || ""),
        actor: record,
        action: "mfa_enroll",
        collection_name: "users",
        record_id: record.id,
        changes: { method: "totp", recovery_codes: codes.length },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });
    } catch (err) {
      console.log("2FA enroll audit failed: " + String(err));
    }

    return e.json(200, {
      enabled: true,
      recovery_codes: codes,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/itsm/profile/2fa/disable",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var authLib = require(__hooks + "/lib/auth.js");

    var auth = guards.requireAuth(e);
    var body = e.requestInfo().body || {};
    var record = e.app.findRecordById("users", auth.id);

    if (!record.get("totp_enabled")) {
      throw new BadRequestError("Autentikasi dua faktor belum aktif");
    }
    if (!record.validatePassword(String(body.password || ""))) {
      throw new BadRequestError("Password salah");
    }

    var check = authLib.verifySecondFactor(record, body.code, {
      ignoreReplay: true,
    });

    if (!check.valid) {
      throw new BadRequestError(
        "Kode 2FA salah. Gunakan kode dari aplikasi authenticator atau kode pemulihan."
      );
    }

    authLib.resetSecondFactor(record);
    e.app.save(record);

    try {
      var meta = audit.requestMeta(e);
      audit.write(e.app, {
        tenant: String(record.get("tenant") || ""),
        actor: record,
        action: "mfa_disable",
        collection_name: "users",
        record_id: record.id,
        changes: { method: "totp" },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });
    } catch (err) {
      console.log("2FA disable audit failed: " + String(err));
    }

    return e.json(200, { enabled: false });
  },
  $apis.requireAuth()
);
