// Profil pengguna: baca/ubah data sendiri, unggah/hapus avatar, ganti password.
// Semua route hanya menyentuh record milik pengguna yang sedang login.
routerAdd(
  "GET",
  "/api/itsm/profile",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var profile = require(__hooks + "/lib/profile.js");

    var auth = guards.requireAuth(e);
    var record = e.app.findRecordById("users", auth.id);

    return e.json(200, profile.details(e.app, record));
  },
  $apis.requireAuth()
);

routerAdd(
  "PATCH",
  "/api/itsm/profile",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var profile = require(__hooks + "/lib/profile.js");

    var auth = guards.requireAuth(e);
    var body = e.requestInfo().body || {};

    var name = guards.cleanText(body.name, 120);
    var phone = guards.cleanText(body.phone, 40);
    var employeeNo = guards.cleanText(body.employee_no, 40);

    if (name.length < 2) {
      throw new BadRequestError("Nama minimal 2 karakter");
    }
    if (phone && !/^[0-9+\-() ]+$/.test(phone)) {
      throw new BadRequestError(
        "Nomor telepon hanya boleh berisi angka dan tanda + - ( )"
      );
    }
    if (employeeNo && !/^[A-Za-z0-9._\/-]+$/.test(employeeNo)) {
      throw new BadRequestError(
        "Nomor pegawai hanya boleh berisi huruf, angka, titik, garis miring, atau strip"
      );
    }

    var record = e.app.findRecordById("users", auth.id);
    record.set("name", name);
    record.set("phone", phone);
    record.set("employee_no", employeeNo);
    $app.save(record);

    var meta = audit.requestMeta(e);
    audit.write($app, {
      tenant: String(record.get("tenant") || ""),
      actor: record,
      action: "update",
      collection_name: "users",
      record_id: record.id,
      changes: {
        fields: ["name", "phone", "employee_no"],
        name: name,
      },
      ip: meta.ip,
      user_agent: meta.user_agent,
    });

    return e.json(200, profile.details(e.app, record));
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/itsm/profile/avatar",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var profile = require(__hooks + "/lib/profile.js");

    var auth = guards.requireAuth(e);
    var files = e.findUploadedFiles("avatar");

    if (!files || files.length !== 1) {
      throw new BadRequestError("Pilih satu file foto");
    }

    var record = e.app.findRecordById("users", auth.id);
    record.set("avatar", files[0]);

    try {
      $app.save(record);
    } catch (err) {
      throw new BadRequestError(
        "Foto tidak valid. Gunakan PNG, JPG, atau WEBP maksimal 2 MB."
      );
    }

    var meta = audit.requestMeta(e);
    audit.write($app, {
      tenant: String(record.get("tenant") || ""),
      actor: record,
      action: "update",
      collection_name: "users",
      record_id: record.id,
      changes: { field: "avatar" },
      ip: meta.ip,
      user_agent: meta.user_agent,
    });

    return e.json(200, profile.details(e.app, record));
  },
  $apis.requireAuth()
);

routerAdd(
  "DELETE",
  "/api/itsm/profile/avatar",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var profile = require(__hooks + "/lib/profile.js");

    var auth = guards.requireAuth(e);
    var record = e.app.findRecordById("users", auth.id);

    record.set("avatar", "");
    $app.save(record);

    var meta = audit.requestMeta(e);
    audit.write($app, {
      tenant: String(record.get("tenant") || ""),
      actor: record,
      action: "update",
      collection_name: "users",
      record_id: record.id,
      changes: { field: "avatar", removed: true },
      ip: meta.ip,
      user_agent: meta.user_agent,
    });

    return e.json(200, profile.details(e.app, record));
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/itsm/profile/password",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");

    var auth = guards.requireAuth(e, { allowPendingPassword: true });
    var body = e.requestInfo().body || {};

    var current = String(body.current_password || "");
    var next = String(body.new_password || "");
    var confirm = String(body.new_password_confirm || "");

    if (!current) {
      throw new BadRequestError("Password saat ini wajib diisi");
    }
    if (next.length < 8) {
      throw new BadRequestError("Password baru minimal 8 karakter");
    }
    if (next !== confirm) {
      throw new BadRequestError("Konfirmasi password tidak sama");
    }
    if (next === current) {
      throw new BadRequestError(
        "Password baru harus berbeda dari password saat ini"
      );
    }

    var record = e.app.findRecordById("users", auth.id);

    if (!record.validatePassword(current)) {
      throw new BadRequestError("Password saat ini salah");
    }

    record.setPassword(next);
    record.set("must_change_password", false);
    record.refreshTokenKey();
    $app.save(record);

    var meta = audit.requestMeta(e);
    audit.write($app, {
      tenant: String(record.get("tenant") || ""),
      actor: record,
      action: "update",
      collection_name: "users",
      record_id: record.id,
      changes: { field: "password" },
      ip: meta.ip,
      user_agent: meta.user_agent,
    });

    return e.json(200, { ok: true });
  },
  $apis.requireAuth()
);
