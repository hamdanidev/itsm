// Pengelolaan titik QR oleh Kepala IT.
// Helper ada di lib/intake_public.js karena callback route berjalan di VM baru.

routerAdd(
  "GET",
  "/api/itsm/intake-points",
  (e) => {
    var intakeLib = require(__hooks + "/lib/intake_public.js");
    var guards = require(__hooks + "/lib/guards.js");
    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var tenantId = String(auth.get("tenant") || "");
    if (!tenantId) throw new BadRequestError("Akun tidak memiliki tenant");

    var rows = e.app.findRecordsByFilter(
      "intake_points",
      "tenant = {:tenant}",
      "name",
      0,
      0,
      { tenant: tenantId }
    );

    var items = [];
    for (var i = 0; i < rows.length; i++) {
      items.push(intakeLib.serializePoint(e.app, rows[i]));
    }

    return e.json(200, { items: items });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/itsm/intake-points",
  (e) => {
    var intakeLib = require(__hooks + "/lib/intake_public.js");
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var tenantId = String(auth.get("tenant") || "");
    if (!tenantId) throw new BadRequestError("Akun tidak memiliki tenant");

    var body = e.requestInfo().body || {};
    var name = intakeLib.cleanName(body.name, 120, "Nama titik");
    var unitId = String(body.unit || "");
    var unit = intakeLib.loadUnit(e.app, unitId, tenantId);
    var location = guards.cleanText(body.location, 120);
    var maxPerHour = Number(body.max_per_hour) || 20;

    if (maxPerHour < 1 || maxPerHour > 200) {
      throw new BadRequestError("Batas tiket per jam harus 1–200");
    }

    var point;
    var token = intakeLib.newToken();

    $app.runInTransaction((txApp) => {
      var collection = txApp.findCollectionByNameOrId("intake_points");
      point = new Record(collection);
      point.set("tenant", tenantId);
      point.set("name", name);
      point.set("unit", unit.id);
      point.set("location", location);
      point.set("token", token);
      point.set("is_active", true);
      point.set("max_per_hour", maxPerHour);
      point.set("created_by", auth.id);
      txApp.save(point);

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: tenantId,
        actor: auth,
        action: "create",
        collection_name: "intake_points",
        record_id: point.id,
        changes: {
          name: name,
          unit: unit.id,
          location: location,
          max_per_hour: maxPerHour,
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });
    });

    return e.json(201, { point: intakeLib.serializePoint(e.app, point) });
  },
  $apis.requireAuth()
);

routerAdd(
  "PATCH",
  "/api/itsm/intake-points/{id}",
  (e) => {
    var intakeLib = require(__hooks + "/lib/intake_public.js");
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var tenantId = String(auth.get("tenant") || "");
    var point = intakeLib.loadPoint(e.app, e.request.pathValue("id"), tenantId);
    var body = e.requestInfo().body || {};

    var changes = {};

    if (body.name != null) {
      point.set("name", intakeLib.cleanName(body.name, 120, "Nama titik"));
      changes.name = String(point.get("name"));
    }

    if (body.unit != null) {
      var unit = intakeLib.loadUnit(e.app, body.unit, tenantId);
      point.set("unit", unit.id);
      changes.unit = unit.id;
    }

    if (body.location != null) {
      point.set("location", guards.cleanText(body.location, 120));
      changes.location = String(point.get("location"));
    }

    if (body.max_per_hour != null) {
      var maxPerHour = Number(body.max_per_hour);
      if (!maxPerHour || maxPerHour < 1 || maxPerHour > 200) {
        throw new BadRequestError("Batas tiket per jam harus 1–200");
      }
      point.set("max_per_hour", maxPerHour);
      changes.max_per_hour = maxPerHour;
    }

    if (body.is_active != null) {
      point.set("is_active", Boolean(body.is_active));
      changes.is_active = Boolean(body.is_active);
    }

    if (body.expires_at != null) {
      var expires = guards.optionalDate(body.expires_at, "expires_at");
      point.set("expires_at", expires);
      changes.expires_at = expires;
    }

    e.app.save(point);

    var meta = audit.requestMeta(e);
    audit.write(e.app, {
      tenant: tenantId,
      actor: auth,
      action: "update",
      collection_name: "intake_points",
      record_id: point.id,
      changes: changes,
      ip: meta.ip,
      user_agent: meta.user_agent,
    });

    return e.json(200, { point: intakeLib.serializePoint(e.app, point) });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/itsm/intake-points/{id}/rotate",
  (e) => {
    var intakeLib = require(__hooks + "/lib/intake_public.js");
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var tenantId = String(auth.get("tenant") || "");
    var point = intakeLib.loadPoint(e.app, e.request.pathValue("id"), tenantId);

    point.set("token", intakeLib.newToken());
    e.app.save(point);

    var meta = audit.requestMeta(e);
    audit.write(e.app, {
      tenant: tenantId,
      actor: auth,
      action: "update",
      collection_name: "intake_points",
      record_id: point.id,
      changes: { field: "token", rotated: true },
      ip: meta.ip,
      user_agent: meta.user_agent,
    });

    return e.json(200, { point: intakeLib.serializePoint(e.app, point) });
  },
  $apis.requireAuth()
);
