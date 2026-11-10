/// <reference path="../pb_data/types.d.ts" />

// 2FA TOTP + pembatasan percobaan login.
//
// Field rahasia (secret, hash kode pemulihan, langkah terakhir) disembunyikan
// dari semua respons API; route 2FA membacanya langsung dari record di server.
// `totp_enabled` tetap terlihat agar UI tim dapat menampilkan status.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    if (!users.fields.getByName("totp_secret")) {
      users.fields.addMarshaledJSON(
        JSON.stringify([
          { name: "totp_secret", type: "text", max: 64, hidden: true },
          { name: "totp_enabled", type: "bool" },
          { name: "totp_confirmed_at", type: "date", hidden: true },
          { name: "totp_last_step", type: "number", onlyInt: true, hidden: true },
          {
            name: "totp_recovery_hashes",
            type: "json",
            maxSize: 20000,
            hidden: true,
          },
          {
            name: "login_failed_count",
            type: "number",
            onlyInt: true,
            hidden: true,
          },
          { name: "login_locked_until", type: "date", hidden: true },
        ])
      );
      app.save(users);
    }

    const auditLogs = app.findCollectionByNameOrId("audit_logs");
    const action = auditLogs.fields.getByName("action");

    if (action) {
      const values = (action.values || []).slice();

      for (const value of ["login_failed", "mfa_enroll", "mfa_disable", "mfa_reset"]) {
        if (values.indexOf(value) < 0) values.push(value);
      }

      action.values = values;
      app.save(auditLogs);
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    for (const name of [
      "totp_secret",
      "totp_enabled",
      "totp_confirmed_at",
      "totp_last_step",
      "totp_recovery_hashes",
      "login_failed_count",
      "login_locked_until",
    ]) {
      if (users.fields.getByName(name)) users.fields.removeByName(name);
    }

    app.save(users);

    const auditLogs = app.findCollectionByNameOrId("audit_logs");
    const action = auditLogs.fields.getByName("action");

    if (action) {
      const remove = ["login_failed", "mfa_enroll", "mfa_disable", "mfa_reset"];
      action.values = (action.values || []).filter(
        (value) => remove.indexOf(value) < 0
      );
      app.save(auditLogs);
    }
  }
);
