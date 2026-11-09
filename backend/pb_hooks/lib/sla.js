// Perhitungan tenggat SLA.
//
// Kalender bisnis dihitung pada zona waktu tenant (atau policy bila diisi
// berbeda), bukan pada offset tetap. `timezone.js` yang menangani konversi
// sadar DST; modul ini hanya berurusan dengan aturan SLA.
//
// `sla_snapshot` menyimpan zona yang dipakai saat tenggat dihitung, sehingga
// perubahan zona tenant di kemudian hari tidak mengubah tenggat tiket lama:
// tanggal tenggat sudah berupa instan UTC yang tersimpan.

var timezone = require(__hooks + "/lib/timezone.js");

var IMPACT_TO_PRIORITY = {
  patient_safety: "critical",
  clinical_workflow: "high",
  operational: "normal",
  convenience: "low",
};

function value(record, key, fallback) {
  if (!record) return fallback;
  try {
    var result =
      typeof record.get === "function" ? record.get(key) : record[key];
    return result == null || result === "" ? fallback : result;
  } catch (err) {
    return fallback;
  }
}

function numberValue(record, key, fallback) {
  var result = Number(value(record, key, fallback));
  return isNaN(result) ? fallback : result;
}

function priorityFromImpact(impact) {
  return IMPACT_TO_PRIORITY[impact] || "normal";
}

function clockToMinutes(value) {
  var parts = String(value || "08:00").split(":");
  var hours = Number(parts[0]);
  var minutes = Number(parts[1]);
  if (isNaN(hours)) hours = 8;
  if (isNaN(minutes)) minutes = 0;
  return hours * 60 + minutes;
}

function daysFrom(value) {
  var result = [];
  if (value && value.length) {
    for (var i = 0; i < value.length; i++) {
      var n = Number(value[i]);
      if (n >= 1 && n <= 7) result.push(n);
    }
  }
  return result.length ? result : [1, 2, 3, 4, 5];
}

// Hari libur adalah tanggal kalender, bukan instan. PocketBase menyimpannya
// sebagai datetime tengah malam UTC, jadi bagian tanggalnya dipakai apa adanya.
// Membaca lewat konversi zona justru bisa menggeser satu hari untuk zona
// negatif (00:00Z = hari sebelumnya di America/New_York).
function holidaySet(records) {
  var result = {};

  for (var i = 0; i < (records || []).length; i++) {
    var raw = String(value(records[i], "date", "")).trim();
    var key = raw.slice(0, 10);

    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) result[key] = true;
  }

  return result;
}

function zoneFor(policy, tenantTimezone) {
  var policyZone = String(value(policy, "timezone", "") || "").trim();

  if (timezone.isValidZone(policyZone)) return policyZone;

  return timezone.resolveZone(tenantTimezone);
}

function addBusinessMinutes(startMs, minutes, policy, holidays, tenantTimezone) {
  var remaining = Math.floor(minutes);
  if (remaining <= 0) return startMs;

  var zone = zoneFor(policy, tenantTimezone);
  var days = daysFrom(value(policy, "business_days", [1, 2, 3, 4, 5]));
  var startMinutes = clockToMinutes(value(policy, "business_start", "08:00"));
  var endMinutes = clockToMinutes(value(policy, "business_end", "17:00"));
  if (endMinutes <= startMinutes) endMinutes = startMinutes + 60;

  var cursor = startMs;
  var guard = 0;

  while (remaining > 0 && guard < 4000) {
    guard++;

    var parts = timezone.localParts(cursor, zone);
    var workStart = timezone.fromLocal(
      parts.year,
      parts.month,
      parts.day,
      Math.floor(startMinutes / 60),
      startMinutes % 60,
      zone
    );
    var workEnd = timezone.fromLocal(
      parts.year,
      parts.month,
      parts.day,
      Math.floor(endMinutes / 60),
      endMinutes % 60,
      zone
    );
    var isWorkday =
      days.indexOf(parts.weekday) >= 0 &&
      !holidays[timezone.dateKey(cursor, zone)];

    if (isWorkday) {
      if (cursor < workStart) cursor = workStart;
      if (cursor < workEnd) {
        var available = Math.floor((workEnd - cursor) / 60000);
        var take = Math.min(remaining, available);
        cursor += take * 60000;
        remaining -= take;
        if (remaining === 0) return cursor;
      }
    }

    // Awal hari berikutnya dihitung dari kalender lokal, bukan +24 jam, agar
    // hari yang panjangnya 23/25 jam karena DST tetap benar.
    cursor = timezone.fromLocal(
      parts.year,
      parts.month,
      parts.day + 1,
      0,
      0,
      zone
    );
  }

  return cursor;
}

function addMinutes(startMs, minutes, policy, holidays, tenantTimezone) {
  if (!minutes || minutes <= 0) return null;
  if (String(value(policy, "calendar_mode", "business_hours")) === "24x7") {
    return startMs + minutes * 60000;
  }
  return addBusinessMinutes(startMs, minutes, policy, holidays, tenantTimezone);
}

function fallbackPolicy(type, priority, zone) {
  var response = { critical: 15, high: 30, normal: 120, low: 480 }[priority];
  var resolution = 0;

  if (type === "incident") {
    resolution = { critical: 240, high: 480, normal: 960, low: 2400 }[priority];
  } else if (type === "service_request") {
    resolution = { critical: 480, high: 960, normal: 1920, low: 2400 }[priority];
  }

  return {
    id: "",
    fallback: true,
    calendar_mode: priority === "critical" ? "24x7" : "business_hours",
    response_minutes: response || 120,
    approval_minutes:
      type === "incident"
        ? 0
        : { critical: 120, high: 240, normal: 480, low: 960 }[priority],
    resolution_minutes: resolution || 0,
    business_days: [1, 2, 3, 4, 5],
    business_start: "08:00",
    business_end: "17:00",
    timezone: timezone.resolveZone(zone),
    version: 0,
  };
}

function findPolicy(app, tenantId, type, priority) {
  var rows = app.findRecordsByFilter(
    "sla_policies",
    "tenant = {:tenant} && ticket_type = {:type} && priority = {:priority} && is_active = true",
    "",
    1,
    0,
    { tenant: tenantId, type: type, priority: priority }
  );
  return rows.length ? rows[0] : null;
}

function loadHolidays(app, tenantId) {
  return app.findRecordsByFilter(
    "holidays",
    "tenant = {:tenant} && is_active = true",
    "date",
    0,
    0,
    { tenant: tenantId }
  );
}

// Zona tenant dipakai sebagai fallback saat policy belum punya zona (mis. data
// lama). Dibaca sekali per operasi; biayanya satu lookup berindeks.
function tenantTimezone(app, tenantId) {
  if (!tenantId) return "";

  try {
    var tenant = app.findRecordById("tenants", String(tenantId));
    return String(tenant.get("timezone") || "");
  } catch (err) {
    return "";
  }
}

function computeDue(start, type, priority, policy, holidays, tenantTimezoneName) {
  var usePolicy = policy || fallbackPolicy(type, priority, tenantTimezoneName);
  var zone = zoneFor(usePolicy, tenantTimezoneName);
  var startMs = start instanceof Date ? start.getTime() : new Date(start).getTime();
  if (isNaN(startMs)) throw new Error("Invalid SLA start date");

  // `holidays` datang sebagai records; addBusinessMinutes butuh set tanggal.
  var holidayKeys = holidaySet(holidays);

  var responseMinutes = numberValue(usePolicy, "response_minutes", 0);
  var approvalMinutes = numberValue(usePolicy, "approval_minutes", 0);
  var resolutionMinutes = numberValue(usePolicy, "resolution_minutes", 0);

  var responseMs = addMinutes(
    startMs,
    responseMinutes,
    usePolicy,
    holidayKeys,
    zone
  );
  var approvalMs = addMinutes(
    startMs,
    approvalMinutes,
    usePolicy,
    holidayKeys,
    zone
  );
  var resolutionMs = addMinutes(
    startMs,
    resolutionMinutes,
    usePolicy,
    holidayKeys,
    zone
  );

  var days = daysFrom(value(usePolicy, "business_days", [1, 2, 3, 4, 5]));

  return {
    response: responseMs == null ? null : new Date(responseMs),
    approval: approvalMs == null ? null : new Date(approvalMs),
    resolution: resolutionMs == null ? null : new Date(resolutionMs),
    snapshot: {
      policy_id: usePolicy.id || "",
      version: numberValue(usePolicy, "version", 0),
      fallback: !!usePolicy.fallback,
      calendar_mode: String(
        value(usePolicy, "calendar_mode", "business_hours")
      ),
      response_minutes: responseMinutes,
      approval_minutes: approvalMinutes,
      resolution_minutes: resolutionMinutes,
      business_days: days,
      business_start: String(value(usePolicy, "business_start", "08:00")),
      business_end: String(value(usePolicy, "business_end", "17:00")),
      timezone: zone,
      computed_at: new Date().toISOString(),
    },
  };
}

module.exports = {
  priorityFromImpact: priorityFromImpact,
  findPolicy: findPolicy,
  loadHolidays: loadHolidays,
  tenantTimezone: tenantTimezone,
  computeDue: computeDue,
  addBusinessMinutes: addBusinessMinutes,
};
