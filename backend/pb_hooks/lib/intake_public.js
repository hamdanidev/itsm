// Helper intake publik dan titik QR.
//
// Fungsi di file ini dipanggil dari route di `public_intake.pb.js` dan
// `intake_points.pb.js`. PocketBase menjalankan callback route pada VM baru,
// jadi helper harus di-require di dalam callback — bukan fungsi top-level di
// file route.

function publicNotFound() {
  return new NotFoundError("Titik intake tidak ditemukan atau tidak aktif");
}

function textOf(value, max) {
  var text = String(value == null ? "" : value).trim();
  if (max && text.length > max) {
    throw new BadRequestError("Teks melebihi batas " + max + " karakter");
  }
  return text;
}

function isTrue(value) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function pdate(ms) {
  return new Date(ms).toISOString().replace("T", " ");
}

function findPoint(app, token) {
  var cleaned = String(token || "").trim();

  if (cleaned.length < 10 || cleaned.length > 64) throw publicNotFound();

  var rows = app.findRecordsByFilter(
    "intake_points",
    "token = {:token}",
    "",
    1,
    0,
    { token: cleaned }
  );

  if (!rows.length) throw publicNotFound();

  var point = rows[0];

  if (!Boolean(point.get("is_active"))) throw publicNotFound();

  var expires = String(point.get("expires_at") || "");

  if (expires) {
    var expiresAt = new Date(expires).getTime();
    if (!isNaN(expiresAt) && expiresAt < Date.now()) throw publicNotFound();
  }

  var tenant;

  try {
    tenant = app.findRecordById("tenants", String(point.get("tenant") || ""));
  } catch (err) {
    throw publicNotFound();
  }

  if (!Boolean(tenant.get("is_active"))) throw publicNotFound();

  return { point: point, tenant: tenant };
}

function ticketNumber(type) {
  var prefix =
    {
      incident: "INC",
      service_request: "SR",
    }[type] || "INC";

  var stamp = new Date(Date.now() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  return (
    prefix +
    "-" +
    stamp +
    "-" +
    $security.randomStringWithAlphabet(
      6,
      "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    )
  );
}

function contactIsValid(value) {
  if (!value) return false;

  if (value.indexOf("@") >= 0) {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
  }

  return /^[+0-9()\-\s]{6,30}$/.test(value);
}

function parsePayload(e) {
  var info = e.requestInfo();
  var body = info.body || {};

  if (body && typeof body.payload === "string" && body.payload) {
    try {
      return JSON.parse(body.payload);
    } catch (err) {
      throw new BadRequestError("Payload form tidak valid");
    }
  }

  if (body && body.payload && typeof body.payload === "object") {
    return body.payload;
  }

  return body || {};
}

function recentTicketCount(app, pointId, tenantId, since) {
  return app.findRecordsByFilter(
    "tickets",
    "tenant = {:tenant} && intake_ref = {:ref} && created >= {:since}",
    "-created",
    100,
    0,
    { tenant: tenantId, ref: pointId, since: since }
  ).length;
}

function assertNotThrottled(e, point, tenantId) {
  var maxPerHour = Number(point.get("max_per_hour")) || 20;
  var since = pdate(Date.now() - 60 * 60 * 1000);

  // Batas per titik adalah kontrol utama. Batas per IP sengaja tidak dipakai:
  // di produksi semua request melewati reverse proxy yang sama, sehingga IP
  // pengguna bisa tampak identik dan justru memblokir satu rumah sakit.
  if (recentTicketCount(e.app, point.id, tenantId, since) >= maxPerHour) {
    throw new BadRequestError(
      "Terlalu banyak tiket dari titik ini. Coba lagi nanti."
    );
  }
}

// ---------------------------------------------------------------------------
// Pengelolaan titik oleh Kepala IT
// ---------------------------------------------------------------------------

function pointNotFound() {
  return new NotFoundError("Titik QR tidak ditemukan");
}

function cleanName(value, max, label) {
  var text = String(value == null ? "" : value).trim();
  if (text.length < 2) throw new BadRequestError(label + " minimal 2 karakter");
  if (text.length > max) {
    throw new BadRequestError(label + " maksimal " + max + " karakter");
  }
  return text;
}

function loadUnit(app, unitId, tenantId) {
  var unit;

  try {
    unit = app.findRecordById("units", String(unitId || ""));
  } catch (err) {
    throw new BadRequestError("Unit tidak ditemukan");
  }

  if (String(unit.get("tenant")) !== tenantId) {
    throw new BadRequestError("Unit harus milik rumah sakit yang sama");
  }

  if (!Boolean(unit.get("is_active"))) {
    throw new BadRequestError("Unit tidak aktif");
  }

  return unit;
}

function loadPoint(app, id, tenantId) {
  var point;

  try {
    point = app.findRecordById("intake_points", String(id || ""));
  } catch (err) {
    throw pointNotFound();
  }

  if (String(point.get("tenant")) !== tenantId) throw pointNotFound();

  return point;
}

function newToken() {
  return $security.randomStringWithAlphabet(
    32,
    "abcdefghijkmnopqrstuvwxyz23456789"
  );
}

function serializePoint(app, point) {
  var unitName = "";

  try {
    unitName = String(
      app.findRecordById("units", String(point.get("unit") || "")).get("name") ||
        ""
    );
  } catch (err) {
    unitName = "";
  }

  return {
    id: point.id,
    name: String(point.get("name") || ""),
    unit: String(point.get("unit") || ""),
    unit_name: unitName,
    location: String(point.get("location") || ""),
    token: String(point.get("token") || ""),
    is_active: Boolean(point.get("is_active")),
    expires_at: String(point.get("expires_at") || ""),
    max_per_hour: Number(point.get("max_per_hour")) || 20,
    last_used_at: String(point.get("last_used_at") || ""),
    created: String(point.get("created") || ""),
  };
}

module.exports = {
  publicNotFound: publicNotFound,
  textOf: textOf,
  isTrue: isTrue,
  pdate: pdate,
  findPoint: findPoint,
  ticketNumber: ticketNumber,
  contactIsValid: contactIsValid,
  parsePayload: parsePayload,
  recentTicketCount: recentTicketCount,
  assertNotThrottled: assertNotThrottled,
  pointNotFound: pointNotFound,
  cleanName: cleanName,
  loadUnit: loadUnit,
  loadPoint: loadPoint,
  newToken: newToken,
  serializePoint: serializePoint,
};
