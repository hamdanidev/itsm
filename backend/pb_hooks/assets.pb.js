// Asset/CI register dan tautan aset ke tiket.
//
// Aset ditulis lewat route agar nomor aset, validasi tenant, service_cis, dan
// audit konsisten. Requester boleh membaca katalog aset lewat collection rule,
// tetapi riwayat tiket aset hanya lewat route staf.

routerAdd(
  "POST",
  "/api/itsm/assets",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var assetLib = require(__hooks + "/lib/assets.js");

    var auth = guards.requireAuth(e);
    guards.assertStaff(auth);

    var tenantId = String(auth.get("tenant") || "");
    if (!tenantId) {
      throw new BadRequestError("Akun platform tidak dapat membuat aset");
    }

    var body = e.requestInfo().body || {};
    var asset;
    var named = assetLib.payload(body, tenantId, false);

    $app.runInTransaction((txApp) => {
      assetLib.saveLookups(txApp, tenantId, named);

      var collection = txApp.findCollectionByNameOrId("assets");
      asset = new Record(collection);

      var assetNo = named.asset_no || assetLib.generateAssetNo(txApp, tenantId);
      var duplicate = null;
      try {
        duplicate = txApp.findFirstRecordByFilter(
          "assets",
          "tenant = {:tenant} && asset_no = {:no}",
          { tenant: tenantId, no: assetNo }
        );
      } catch (err) {
        duplicate = null;
      }
      if (duplicate) {
        throw new BadRequestError("Nomor aset sudah dipakai");
      }

      asset.set("tenant", tenantId);
      asset.set("asset_no", assetNo);
      asset.set("name", named.name);
      asset.set("type", named.type);
      asset.set("status", named.status);
      asset.set("criticality", named.criticality);
      asset.set("location", named.location);
      asset.set("notes", named.notes);
      asset.set("unit", named.unit);
      asset.set("service", named.service);
      asset.set("owner", named.owner);
      asset.set("warranty_end", named.warranty_end);
      txApp.save(asset);

      assetLib.syncServiceCi(txApp, asset);

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: tenantId,
        actor: auth,
        action: "asset_create",
        collection_name: "assets",
        record_id: asset.id,
        changes: {
          asset_no: assetNo,
          name: named.name,
          type: named.type,
          service: named.service,
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });
    });

    return e.json(201, assetLib.response(asset));
  },
  $apis.requireAuth()
);

routerAdd(
  "PATCH",
  "/api/itsm/assets/{id}",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var assetLib = require(__hooks + "/lib/assets.js");

    var auth = guards.requireAuth(e);
    guards.assertStaff(auth);

    var tenantId = String(auth.get("tenant") || "");
    var assetId = e.request.pathValue("id");
    var body = e.requestInfo().body || {};
    var result;

    $app.runInTransaction((txApp) => {
      var asset = null;
      try {
        asset = txApp.findRecordById("assets", assetId);
      } catch (err) {
        throw new NotFoundError("Aset tidak ditemukan");
      }

      if (String(asset.get("tenant")) !== tenantId) {
        throw new NotFoundError("Aset tidak ditemukan");
      }

      var payload = assetLib.payload(body, tenantId, true);
      assetLib.saveLookups(txApp, tenantId, payload);

      if (
        payload.asset_no &&
        payload.asset_no !== String(asset.get("asset_no") || "")
      ) {
        var duplicateNo = null;
        try {
          duplicateNo = txApp.findFirstRecordByFilter(
            "assets",
            "tenant = {:tenant} && asset_no = {:no}",
            { tenant: tenantId, no: payload.asset_no }
          );
        } catch (err) {
          duplicateNo = null;
        }
        if (duplicateNo) {
          throw new BadRequestError("Nomor aset sudah dipakai");
        }
      }

      var previous = {
        name: String(asset.get("name") || ""),
        status: String(asset.get("status") || ""),
        service: String(asset.get("service") || ""),
        criticality: String(asset.get("criticality") || ""),
      };

      for (var key in payload) {
        if (key === "tenant") continue;
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
          if (key === "asset_no" && !payload[key]) continue;
          asset.set(key, payload[key]);
        }
      }

      txApp.save(asset);
      assetLib.syncServiceCi(txApp, asset);

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: tenantId,
        actor: auth,
        action: "asset_update",
        collection_name: "assets",
        record_id: asset.id,
        changes: {
          name: { from: previous.name, to: String(asset.get("name") || "") },
          status: {
            from: previous.status,
            to: String(asset.get("status") || ""),
          },
          service: {
            from: previous.service,
            to: String(asset.get("service") || ""),
          },
          criticality: {
            from: previous.criticality,
            to: String(asset.get("criticality") || ""),
          },
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });

      result = asset;
    });

    return e.json(200, assetLib.response(result));
  },
  $apis.requireAuth()
);

routerAdd(
  "GET",
  "/api/itsm/assets/options",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var assetLib = require(__hooks + "/lib/assets.js");

    var auth = guards.requireAuth(e);
    var query = e.requestInfo().query || {};
    var tenantId = String(auth.get("tenant") || "");

    if (guards.isPlatformStaff(auth) && query.tenant) {
      tenantId = String(query.tenant);
    }

    if (!tenantId) {
      throw new BadRequestError("Pilih rumah sakit terlebih dahulu");
    }

    var records = $app.findRecordsByFilter(
      "assets",
      'tenant = {:tenant} && status != "retired"',
      "name",
      0,
      0,
      { tenant: tenantId }
    );
    var items = [];

    for (var i = 0; i < records.length; i++) {
      var item = assetLib.compact(records[i]);
      item.service = String(records[i].get("service") || "");
      items.push(item);
    }

    return e.json(200, { assets: items });
  },
  $apis.requireAuth()
);
routerAdd(
  "GET",
  "/api/itsm/assets/{id}",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var assetLib = require(__hooks + "/lib/assets.js");

    var auth = guards.requireAuth(e);
    guards.assertStaff(auth);
    var tenantId = String(auth.get("tenant") || "");

    var asset = null;
    try {
      asset = $app.findRecordById("assets", e.request.pathValue("id"));
    } catch (err) {
      throw new NotFoundError("Aset tidak ditemukan");
    }

    if (String(asset.get("tenant")) !== tenantId) {
      throw new NotFoundError("Aset tidak ditemukan");
    }

    var services = [];
    var cis = $app.findRecordsByFilter(
      "service_cis",
      "asset = {:asset}",
      "",
      0,
      0,
      { asset: asset.id }
    );

    for (var i = 0; i < cis.length; i++) {
      var serviceName = "";
      try {
        var service = $app.findRecordById(
          "services",
          String(cis[i].get("service"))
        );
        serviceName = String(service.get("name") || "");
      } catch (err) {
        serviceName = "";
      }

      services.push({
        id: cis[i].id,
        service: String(cis[i].get("service") || ""),
        service_name: serviceName,
        criticality: String(cis[i].get("criticality") || ""),
      });
    }

    var links = $app.findRecordsByFilter(
      "asset_tickets",
      "asset = {:asset}",
      "-created",
      0,
      0,
      { asset: asset.id }
    );
    var tickets = [];
    var openTickets = 0;

    for (var j = 0; j < links.length; j++) {
      var ticket = null;
      try {
        ticket = $app.findRecordById(
          "tickets",
          String(links[j].get("ticket"))
        );
      } catch (err) {
        ticket = null;
      }
      if (!ticket) continue;

      var status = String(ticket.get("status") || "");
      if (status !== "resolved" && status !== "closed") openTickets += 1;

      tickets.push({
        id: ticket.id,
        ticket_no: String(ticket.get("ticket_no") || ""),
        title: String(ticket.get("title") || ""),
        type: String(ticket.get("type") || ""),
        status: status,
        priority: String(ticket.get("priority") || ""),
        created: String(ticket.get("created") || ""),
        resolved_at: String(ticket.get("resolved_at") || ""),
        relation: String(links[j].get("relation") || "affected"),
      });
    }

    var payload = assetLib.response(asset);

    function nameOf(collection, id) {
      if (!id) return "";
      try {
        return String($app.findRecordById(collection, id).get("name") || "");
      } catch (err) {
        return "";
      }
    }

    payload.unit_name = nameOf("units", payload.unit);
    payload.service_name = nameOf("services", payload.service);
    payload.owner_name = nameOf("users", payload.owner);

    return e.json(200, {
      asset: payload,
      services: services,
      tickets: tickets,
      counts: { tickets: tickets.length, open_tickets: openTickets },
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "GET",
  "/api/itsm/tickets/{id}/assets",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var assetLib = require(__hooks + "/lib/assets.js");

    var auth = guards.requireAuth(e);
    var ticket = guards.findTicket(e, e.request.pathValue("id"));
    guards.assertTicketAccess(e, ticket);

    var links = $app.findRecordsByFilter(
      "asset_tickets",
      "ticket = {:ticket}",
      "-created",
      0,
      0,
      { ticket: ticket.id }
    );
    var assets = [];

    for (var i = 0; i < links.length; i++) {
      var asset = null;
      try {
        asset = $app.findRecordById("assets", String(links[i].get("asset")));
      } catch (err) {
        asset = null;
      }
      if (!asset) continue;

      var item = assetLib.compact(asset);
      item.relation = String(links[i].get("relation") || "affected");
      assets.push(item);
    }

    return e.json(200, { assets: assets });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/itsm/tickets/{id}/assets",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var assetLib = require(__hooks + "/lib/assets.js");

    var auth = guards.requireAuth(e);
    guards.assertStaff(auth);

    var ticket = guards.findTicket(e, e.request.pathValue("id"));
    guards.assertTicketAccess(e, ticket);
    var tenantId =
      String(auth.get("tenant") || "") || String(ticket.get("tenant") || "");

    if (String(ticket.get("tenant")) !== tenantId) {
      throw new NotFoundError("Tiket tidak ditemukan");
    }

    var body = e.requestInfo().body || {};
    var assetId = String(body.asset_id || body.asset || "");
    var relation = String(body.relation || "affected");
    if (assetLib.ASSET_RELATIONS.indexOf(relation) < 0) {
      throw new BadRequestError("Relasi aset tidak valid");
    }

    var result;
    $app.runInTransaction((txApp) => {
      var asset = null;
      try {
        asset = txApp.findRecordById("assets", assetId);
      } catch (err) {
        throw new BadRequestError("Aset tidak ditemukan");
      }
      if (String(asset.get("tenant")) !== tenantId) {
        throw new BadRequestError("Aset harus milik rumah sakit yang sama");
      }

      var currentTicket = txApp.findRecordById("tickets", ticket.id);
      var link = assetLib.linkTicket(txApp, asset, currentTicket, relation);
      result = { asset: assetLib.compact(asset), relation: relation, id: link.id };

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: tenantId,
        actor: auth,
        ticket: currentTicket,
        action: "asset_link",
        collection_name: "assets",
        record_id: asset.id,
        changes: {
          asset_no: String(asset.get("asset_no") || ""),
          asset_name: String(asset.get("name") || ""),
          relation: relation,
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });
    });

    return e.json(201, result);
  },
  $apis.requireAuth()
);

routerAdd(
  "DELETE",
  "/api/itsm/tickets/{id}/assets/{assetId}",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var assetLib = require(__hooks + "/lib/assets.js");

    var auth = guards.requireAuth(e);
    guards.assertStaff(auth);

    var ticket = guards.findTicket(e, e.request.pathValue("id"));
    guards.assertTicketAccess(e, ticket);
    var tenantId =
      String(auth.get("tenant") || "") || String(ticket.get("tenant") || "");
    var assetId = e.request.pathValue("assetId");

    $app.runInTransaction((txApp) => {
      var link = null;
      try {
        link = txApp.findFirstRecordByFilter(
          "asset_tickets",
          "ticket = {:ticket} && asset = {:asset}",
          { ticket: ticket.id, asset: assetId }
        );
      } catch (err) {
        throw new NotFoundError("Tautan aset tidak ditemukan");
      }

      var asset = null;
      try {
        asset = txApp.findRecordById("assets", assetId);
      } catch (err) {
        asset = null;
      }

      txApp.delete(link);

      var currentTicket = txApp.findRecordById("tickets", ticket.id);
      currentTicket.set("last_activity_at", new Date().toISOString());
      txApp.save(currentTicket);

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: tenantId,
        actor: auth,
        ticket: currentTicket,
        action: "asset_unlink",
        collection_name: "assets",
        record_id: assetId,
        changes: {
          asset_no: asset ? String(asset.get("asset_no") || "") : "",
          asset_name: asset ? String(asset.get("name") || "") : "",
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });
    });

    return e.json(200, { ok: true });
  },
  $apis.requireAuth()
);
