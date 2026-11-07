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
