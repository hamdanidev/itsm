// Tim rumah sakit: IT Lead mengelola staf di tenant-nya sendiri.
//
// Penulisan lewat route ini ($app.save), bukan collection API, sehingga
// `users.createRule` tetap `null`. Tenant selalu diambil dari `e.auth`.
routerAdd(
  "GET",
  "/api/itsm/team",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var team = require(__hooks + "/lib/team.js");
    var paging = require(__hooks + "/lib/paging.js");

    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var tenantId = String(auth.get("tenant") || "");
    if (!tenantId) throw new BadRequestError("Akun tidak memiliki tenant");

    var query = e.requestInfo().query || {};
    var size = paging.numbers(query);
    var page = team.list(e.app, tenantId, {
      page: size.page,
      perPage: size.perPage,
      q: paging.search(query),
    });

    return e.json(200, {
      items: page.items,
      roles: team.ROLES,
      page: page.page,
      perPage: page.perPage,
      totalItems: page.totalItems,
      totalPages: page.totalPages,
      // Dipakai UI untuk menjaga tombol nonaktifkan IT Lead terakhir.
      active_lead_count: team.activeLeads(e.app, tenantId).length,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/itsm/team",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var team = require(__hooks + "/lib/team.js");
    var audit = require(__hooks + "/lib/audit.js");
    var mail = require(__hooks + "/lib/mail.js");

    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var tenantId = String(auth.get("tenant") || "");
    if (!tenantId) throw new BadRequestError("Akun tidak memiliki tenant");

    var body = e.requestInfo().body || {};
    var created = team.create(e.app, tenantId, body);
    var record = created.record;
    var unitName = "";

    try {
      unitName = String(
        e.app.findRecordById("units", String(record.get("unit") || "")).get("name") || ""
      );
    } catch (err) {
      unitName = "";
    }

    try {
      var meta = audit.requestMeta(e);
      audit.write(e.app, {
        tenant: tenantId,
        actor: auth,
        action: "create",
        collection_name: "users",
        record_id: record.id,
        changes: {
          email: String(record.get("email") || ""),
          role: String(record.get("role") || ""),
          job_title: String(record.get("job_title") || ""),
          team: String(record.get("team") || ""),
          unit: String(record.get("unit") || ""),
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });
    } catch (err) {
      console.log("Team audit failed: " + String(err));
    }

    // Undangan dikirim langsung (bukan antrean) agar password sementara tidak
    // tersimpan di database. Kegagalan email tidak membatalkan pembuatan akun;
    // password tetap dikembalikan untuk diserahkan manual.
    var email = { sent: false, configured: false };

    try {
      email = mail.sendCredential(e.app, {
        kind: "invitation",
        tenantId: tenantId,
        userId: record.id,
        email: String(record.get("email") || ""),
        name: String(record.get("name") || ""),
        role: String(record.get("role") || ""),
        password: created.password,
        inviterName: String(auth.get("name") || ""),
      });
    } catch (err) {
      email = {
        sent: false,
        configured: mail.isConfigured(e.app),
        error: String(err),
      };
    }

    return e.json(201, {
      user: team.serialize(record, unitName),
      password: created.password,
      email: email,
    });
  },
  $apis.requireAuth()
);

// Impor massal anggota dari berkas CSV. Berkas dibaca di server, divalidasi per
// baris, dan baris yang lolos langsung dibuatkan akun. Password awal setiap
// akun dikembalikan sekali agar dapat diunduh IT Lead; email undangan tidak
// dikirim massal supaya ratusan pesan tidak membanjiri SMTP.
routerAdd(
  "POST",
  "/api/itsm/team/import",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var team = require(__hooks + "/lib/team.js");
    var audit = require(__hooks + "/lib/audit.js");

    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var tenantId = String(auth.get("tenant") || "");
    if (!tenantId) throw new BadRequestError("Akun tidak memiliki tenant");

    var maxBytes = 2 * 1024 * 1024;
    var files;

    try {
      files = e.findUploadedFiles("file") || [];
    } catch (err) {
      files = [];
    }

    if (files.length !== 1) {
      throw new BadRequestError("Pilih satu berkas CSV untuk diimpor");
    }

    var uploaded = files[0];
    var size = Number((uploaded && uploaded.size) || 0);
    var fileName = String(
      (uploaded && (uploaded.originalName || uploaded.name)) || "anggota.csv"
    );

    if (size > maxBytes) {
      throw new BadRequestError("Berkas CSV maksimal 2 MB");
    }

    var text = "";
    var reader = null;

    try {
      // filesystem.File membungkus reader; buka dulu sebelum dibaca sebagai teks.
      reader = uploaded.reader.open();
      text = readerToString(reader, maxBytes + 1);
    } catch (err) {
      console.log("Team import read failed: " + String(err));
      throw new BadRequestError("Berkas CSV tidak dapat dibaca");
    } finally {
      try {
        if (reader) reader.close();
      } catch (err) {
        // Reader sudah tertutup; tidak perlu menggagalkan impor.
      }
    }

    if (!String(text || "").trim()) {
      throw new BadRequestError("Berkas CSV kosong");
    }

    var result = team.importCsv(e.app, tenantId, text);

    try {
      var meta = audit.requestMeta(e);
      var failedSample = result.failed.slice(0, 50);

      audit.write(e.app, {
        tenant: tenantId,
        actor: auth,
        action: "import",
        collection_name: "users",
        changes: {
          file_name: fileName,
          total_rows: result.summary.total,
          imported: result.summary.imported,
          failed: result.summary.failed,
          failed_rows: failedSample,
          // Jangan pernah menyimpan password awal di audit.
          credentials_returned: result.imported.length,
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });
    } catch (err) {
      console.log("Team import audit failed: " + String(err));
    }

    return e.json(200, {
      summary: result.summary,
      file_name: fileName,
      imported: result.imported,
      failed: result.failed,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "PATCH",
  "/api/itsm/team/{userId}",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var team = require(__hooks + "/lib/team.js");
    var audit = require(__hooks + "/lib/audit.js");

    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var tenantId = String(auth.get("tenant") || "");
    if (!tenantId) throw new BadRequestError("Akun tidak memiliki tenant");

    var body = e.requestInfo().body || {};
    var updated = team.update(e.app, tenantId, e.request.pathValue("userId"), body, auth.id);
    var record = updated.record;
    var unitName = "";

    try {
      unitName = String(
        e.app.findRecordById("units", String(record.get("unit") || "")).get("name") || ""
      );
    } catch (err) {
      unitName = "";
    }

    try {
      var meta = audit.requestMeta(e);
      audit.write(e.app, {
        tenant: tenantId,
        actor: auth,
        action: "update",
        collection_name: "users",
        record_id: record.id,
        changes: updated.changes,
        ip: meta.ip,
        user_agent: meta.user_agent,
      });
    } catch (err) {
      console.log("Team audit failed: " + String(err));
    }

    return e.json(200, { user: team.serialize(record, unitName) });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/itsm/team/{userId}/password",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var team = require(__hooks + "/lib/team.js");
    var audit = require(__hooks + "/lib/audit.js");
    var mail = require(__hooks + "/lib/mail.js");

    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var tenantId = String(auth.get("tenant") || "");
    if (!tenantId) throw new BadRequestError("Akun tidak memiliki tenant");

    var reset = team.resetPassword(e.app, tenantId, e.request.pathValue("userId"));
    var record = reset.record;
    var unitName = "";

    try {
      unitName = String(
        e.app.findRecordById("units", String(record.get("unit") || "")).get("name") || ""
      );
    } catch (err) {
      unitName = "";
    }

    try {
      var meta = audit.requestMeta(e);
      audit.write(e.app, {
        tenant: tenantId,
        actor: auth,
        action: "update",
        collection_name: "users",
        record_id: record.id,
        changes: { field: "password" },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });
    } catch (err) {
      console.log("Team audit failed: " + String(err));
    }

    var email = { sent: false, configured: false };

    try {
      email = mail.sendCredential(e.app, {
        kind: "password_reset",
        tenantId: tenantId,
        userId: record.id,
        email: String(record.get("email") || ""),
        name: String(record.get("name") || ""),
        role: String(record.get("role") || ""),
        password: reset.password,
        inviterName: String(auth.get("name") || ""),
      });
    } catch (err) {
      email = {
        sent: false,
        configured: mail.isConfigured(e.app),
        error: String(err),
      };
    }

    return e.json(200, {
      user: team.serialize(record, unitName),
      password: reset.password,
      email: email,
    });
  },
  $apis.requireAuth()
);
