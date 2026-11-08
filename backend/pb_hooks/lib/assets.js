// Helper asset/CI dan CSAT. Wajib di-require di dalam callback route.

var ASSET_TYPES = [
  "workstation",
  "printer",
  "server",
  "network",
  "medical_device",
  "license",
];

var ASSET_STATUSES = ["active", "maintenance", "retired"];
var CRITICALITIES = ["low", "medium", "high", "critical"];
var ASSET_RELATIONS = ["affected", "caused", "related"];

function clean(value, max) {
  var text = String(value == null ? "" : value).trim();
  if (max && text.length > max) {
    throw new BadRequestError("Teks melebihi batas " + max + " karakter");
  }
  return text;
}

function dateValue(value, field) {
  if (value == null || String(value).trim() === "") return "";
  var date = new Date(value);
  if (isNaN(date.getTime())) {
    throw new BadRequestError("Tanggal " + field + " tidak valid");
  }
  return date.toISOString();
}

function findLookup(app, collection, id, tenantId, label, requireActive) {
  if (!id) return null;

  var record = null;
  try {
    record = app.findRecordById(collection, id);
  } catch (err) {
    throw new BadRequestError(label + " tidak ditemukan");
  }

  if (String(record.get("tenant") || "") !== tenantId) {
    throw new BadRequestError(label + " harus milik rumah sakit yang sama");
  }

  if (requireActive && !record.get("is_active")) {
    throw new BadRequestError(label + " tidak aktif");
  }

  return record;
}

function payload(body, tenantId, partial) {
  var result = {};
  var has = function (key) {
    return Object.prototype.hasOwnProperty.call(body, key);
  };

  if (!partial || has("name")) {
    result.name = clean(body.name, 160);
    if (result.name.length < 2) {
      throw new BadRequestError("Nama aset minimal 2 karakter");
    }
  }

  if (has("asset_no")) {
    result.asset_no = String(body.asset_no || "")
      .trim()
      .toUpperCase()
      .slice(0, 32);
  }

  if (!partial || has("type")) {
    result.type = String(body.type || "workstation");
    if (ASSET_TYPES.indexOf(result.type) < 0) {
      throw new BadRequestError("Tipe aset tidak valid");
    }
  }

  if (!partial || has("status")) {
    result.status = String(body.status || "active");
    if (ASSET_STATUSES.indexOf(result.status) < 0) {
      throw new BadRequestError("Status aset tidak valid");
    }
  }

  if (!partial || has("criticality")) {
    result.criticality = String(body.criticality || "medium");
    if (CRITICALITIES.indexOf(result.criticality) < 0) {
      throw new BadRequestError("Criticality aset tidak valid");
    }
  }

  if (!partial || has("location")) result.location = clean(body.location, 120);
  if (!partial || has("notes")) result.notes = clean(body.notes, 5000);
  if (!partial || has("warranty_end")) {
    result.warranty_end = dateValue(body.warranty_end, "warranty_end");
  }

  if (!partial || has("unit")) result.unit = String(body.unit || "");
  if (!partial || has("service")) result.service = String(body.service || "");
  if (!partial || has("owner")) result.owner = String(body.owner || "");

  result.tenant = tenantId;
  return result;
}

function saveLookups(app, tenantId, values) {
  if (values.unit) {
    findLookup(app, "units", values.unit, tenantId, "Unit", true);
  }
  if (values.service) {
    findLookup(app, "services", values.service, tenantId, "Layanan", true);
  }
  if (values.owner) {
    findLookup(app, "users", values.owner, tenantId, "Owner", true);
  }
}

function generateAssetNo(app, tenantId) {
  var stamp = new Date(Date.now() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  for (var i = 0; i < 5; i++) {
    var candidate =
      "AST-" +
      stamp +
      "-" +
      $security.randomStringWithAlphabet(6, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");
    var exists = null;

    try {
      exists = app.findFirstRecordByFilter(
        "assets",
        "tenant = {:tenant} && asset_no = {:no}",
        { tenant: tenantId, no: candidate }
      );
    } catch (err) {
      exists = null;
    }

    if (!exists) return candidate;
  }

  throw new BadRequestError("Gagal membuat nomor aset, coba lagi");
}

function response(asset) {
  return {
    id: asset.id,
    asset_no: String(asset.get("asset_no") || ""),
    name: String(asset.get("name") || ""),
    type: String(asset.get("type") || ""),
    status: String(asset.get("status") || ""),
    criticality: String(asset.get("criticality") || ""),
    location: String(asset.get("location") || ""),
    unit: String(asset.get("unit") || ""),
    service: String(asset.get("service") || ""),
    owner: String(asset.get("owner") || ""),
    warranty_end: String(asset.get("warranty_end") || ""),
    notes: String(asset.get("notes") || ""),
  };
}

function compact(asset) {
  return {
    id: asset.id,
    asset_no: String(asset.get("asset_no") || ""),
    name: String(asset.get("name") || ""),
    type: String(asset.get("type") || ""),
    status: String(asset.get("status") || ""),
    criticality: String(asset.get("criticality") || ""),
    location: String(asset.get("location") || ""),
  };
}

// Satu aset punya satu layanan utama pada form. service_cis menyimpan
// criticality per layanan agar laporan/CI bisa berkembang tanpa mengubah aset.
function syncServiceCi(app, asset) {
  var existing = app.findRecordsByFilter(
    "service_cis",
    "asset = {:asset}",
    "",
    0,
    0,
    { asset: asset.id }
  );

  for (var i = 0; i < existing.length; i++) {
    app.delete(existing[i]);
  }

  var serviceId = String(asset.get("service") || "");
  if (!serviceId) return;

  var collection = app.findCollectionByNameOrId("service_cis");
  var ci = new Record(collection);
  ci.set("tenant", String(asset.get("tenant")));
  ci.set("service", serviceId);
  ci.set("asset", asset.id);
  ci.set("criticality", String(asset.get("criticality") || "medium"));
  app.save(ci);
}

function linkTicket(app, asset, ticket, relation) {
  var existing = null;

  try {
    existing = app.findFirstRecordByFilter(
      "asset_tickets",
      "asset = {:asset} && ticket = {:ticket}",
      { asset: asset.id, ticket: ticket.id }
    );
  } catch (err) {
    existing = null;
  }

  if (!existing) {
    var collection = app.findCollectionByNameOrId("asset_tickets");
    existing = new Record(collection);
    existing.set("tenant", String(asset.get("tenant")));
    existing.set("asset", asset.id);
    existing.set("ticket", ticket.id);
    existing.set("relation", relation || "affected");
    app.save(existing);
  } else if (relation && String(existing.get("relation")) !== relation) {
    existing.set("relation", relation);
    app.save(existing);
  }

  ticket.set("last_activity_at", new Date().toISOString());
  app.save(ticket);

  return existing;
}

function csatResponse(record) {
  if (!record) return null;

  return {
    id: record.id,
    score: Number(record.get("score")) || 0,
    comment: String(record.get("comment") || ""),
    submitted_by: String(record.get("submitted_by") || ""),
    submitted_by_name: String(record.get("submitted_by_name") || ""),
    source: String(record.get("source") || "portal"),
    created: String(record.get("created") || ""),
  };
}

module.exports = {
  ASSET_TYPES: ASSET_TYPES,
  ASSET_STATUSES: ASSET_STATUSES,
  CRITICALITIES: CRITICALITIES,
  ASSET_RELATIONS: ASSET_RELATIONS,
  payload: payload,
  saveLookups: saveLookups,
  findLookup: findLookup,
  generateAssetNo: generateAssetNo,
  response: response,
  compact: compact,
  syncServiceCi: syncServiceCi,
  linkTicket: linkTicket,
  csatResponse: csatResponse,
};
