// Lupa password mandiri.
//
// Alur: pengguna meminta tautan lewat email, PocketBase membuat token reset
// bertanda tangan (tanpa menyimpan token di database), email dikirim lewat
// lib/mail.js, lalu pengguna menyelesaikan reset di `/reset-password`. Route
// konfirmasi bawaan PocketBase yang memvalidasi token; hook di bawah menurunkan
// `must_change_password`, memutar tokenKey (semua sesi lama keluar), dan menulis
// audit.

routerAdd(
  "POST",
  "/api/itsm/auth/forgot-password",
  (e) => {
    var audit = require(__hooks + "/lib/audit.js");
    var mail = require(__hooks + "/lib/mail.js");

    var body = e.requestInfo().body || {};
    var email = String(body.email || "").trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestError("Email tidak valid");
    }

    // Respons selalu sama, baik email terdaftar maupun tidak, agar endpoint
    // tidak bisa dipakai untuk menebak akun.
    var ok = { ok: true };

    var rows = e.app.findRecordsByFilter(
      "users",
      "email = {:email} && is_active = true",
      "",
      1,
      0,
      { email: email }
    );

    if (!rows.length) return e.json(200, ok);

    var user = rows[0];
    var tenantId = String(user.get("tenant") || "");

    if (tenantId) {
      try {
        var tenant = e.app.findRecordById("tenants", tenantId);
        if (!tenant.get("is_active")) return e.json(200, ok);
      } catch (err) {
        return e.json(200, ok);
      }

      // Maksimal satu email reset per menit per pengguna. Audit dipakai
      // sebagai penanda agar tidak perlu tabel/field tambahan.
      var cutoff = new Date(Date.now() - 60 * 1000)
        .toISOString()
        .replace("T", " ");
      var recent = e.app.findRecordsByFilter(
        "audit_logs",
        'action = "password_reset_request" && actor = {:user} && created >= {:cutoff}',
        "-created",
        1,
        0,
        { user: user.id, cutoff: cutoff }
      );

      if (recent.length) return e.json(200, ok);
    }

    var token = "";

    try {
      token = user.newPasswordResetToken();
    } catch (err) {
      console.log("Gagal membuat token reset password: " + String(err));
      return e.json(200, ok);
    }

    var delivery = mail.sendPasswordResetLink(e.app, {
      tenantId: tenantId,
      userId: user.id,
      email: String(user.get("email") || email),
      name: String(user.get("name") || ""),
      token: token,
    });

    if (tenantId) {
      try {
        audit.write(e.app, {
          tenant: tenantId,
          actor: user,
          action: "password_reset_request",
          collection_name: "users",
          record_id: user.id,
          changes: {
            channel: "email",
            delivered: Boolean(delivery.sent),
          },
        });
      } catch (err) {
        console.log("Audit reset password gagal: " + String(err));
      }
    }

    return e.json(200, ok);
  },
  $apis.requireGuestOnly()
);

onRecordConfirmPasswordResetRequest(
  (e) => {
    e.next();

    var record = e.record;
    if (!record) return;

    try {
      record.set("must_change_password", false);
      // Token reset ditandatangani dengan tokenKey; memutar tokenKey membuat
      // tautan yang sama tidak bisa dipakai dua kali dan sesi lama berakhir.
      record.refreshTokenKey();
      e.app.save(record);
    } catch (err) {
      console.log("Gagal menyelesaikan reset password: " + String(err));
      return;
    }

    var tenantId = String(record.get("tenant") || "");
    if (!tenantId) return;

    try {
      var audit = require(__hooks + "/lib/audit.js");
      audit.write(e.app, {
        tenant: tenantId,
        actor: record,
        action: "password_reset",
        collection_name: "users",
        record_id: record.id,
        changes: { sessions_revoked: true },
      });
    } catch (err) {
      console.log("Audit reset password gagal: " + String(err));
    }
  },
  "users"
);
