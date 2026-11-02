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

    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var tenantId = String(auth.get("tenant") || "");
    if (!tenantId) throw new BadRequestError("Akun tidak memiliki tenant");

    return e.json(200, {
      items: team.list(e.app, tenantId),
      roles: team.ROLES,
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
          unit: String(record.get("unit") || ""),
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });
    } catch (err) {
      console.log("Team audit failed: " + String(err));
    }

    return e.json(201, {
      user: team.serialize(record, unitName),
      password: created.password,
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

    return e.json(200, {
      user: team.serialize(record, unitName),
      password: reset.password,
    });
  },
  $apis.requireAuth()
);
