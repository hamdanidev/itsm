var WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
var DAY_MS = 24 * 60 * 60 * 1000;

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

function wibParts(ms) {
  var d = new Date(ms + WIB_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    date: d.getUTCDate(),
    weekday: d.getUTCDay() || 7,
  };
}

function keyFromMs(ms) {
  var p = wibParts(ms);
  return (
    p.year +
    "-" +
    ("0" + (p.month + 1)).slice(-2) +
    "-" +
    ("0" + p.date).slice(-2)
  );
}

function holidaySet(records) {
  var result = {};
  for (var i = 0; i < (records || []).length; i++) {
    var raw = String(value(records[i], "date", "")).replace(" ", "T");
    var date = new Date(raw);
    if (!isNaN(date.getTime())) {
      result[keyFromMs(date.getTime())] = true;
    }
  }
  return result;
}

function addBusinessMinutes(startMs, minutes, policy, holidays) {
  var remaining = Math.floor(minutes);
  if (remaining <= 0) return startMs;

  var days = daysFrom(value(policy, "business_days", [1, 2, 3, 4, 5]));
  var startMinutes = clockToMinutes(value(policy, "business_start", "08:00"));
  var endMinutes = clockToMinutes(value(policy, "business_end", "17:00"));
  if (endMinutes <= startMinutes) endMinutes = startMinutes + 60;

  var cursor = startMs;
  var guard = 0;

  while (remaining > 0 && guard < 4000) {
    guard++;
    var parts = wibParts(cursor);
    var dayStart = Date.UTC(parts.year, parts.month, parts.date) - WIB_OFFSET_MS;
    var workStart = dayStart + startMinutes * 60000;
    var workEnd = dayStart + endMinutes * 60000;
    var isWorkday =
      days.indexOf(parts.weekday) >= 0 && !holidays[keyFromMs(cursor)];

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

    cursor = dayStart + DAY_MS;
  }

  return cursor;
}

function addMinutes(startMs, minutes, policy, holidays) {
  if (!minutes || minutes <= 0) return null;
  if (String(value(policy, "calendar_mode", "business_hours")) === "24x7") {
    return startMs + minutes * 60000;
  }
  return addBusinessMinutes(startMs, minutes, policy, holidays);
}

function fallbackPolicy(type, priority) {
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
    timezone: "Asia/Jakarta",
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

function computeDue(start, type, priority, policy, holidays) {
  var usePolicy = policy || fallbackPolicy(type, priority);
  var startMs = start instanceof Date ? start.getTime() : new Date(start).getTime();
  if (isNaN(startMs)) throw new Error("Invalid SLA start date");

  var responseMinutes = numberValue(usePolicy, "response_minutes", 0);
  var approvalMinutes = numberValue(usePolicy, "approval_minutes", 0);
  var resolutionMinutes = numberValue(usePolicy, "resolution_minutes", 0);

  var responseMs = addMinutes(startMs, responseMinutes, usePolicy, holidays);
  var approvalMs = addMinutes(startMs, approvalMinutes, usePolicy, holidays);
  var resolutionMs = addMinutes(
    startMs,
    resolutionMinutes,
    usePolicy,
    holidays
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
      timezone: String(value(usePolicy, "timezone", "Asia/Jakarta")),
      computed_at: new Date().toISOString(),
    },
  };
}

module.exports = {
  priorityFromImpact: priorityFromImpact,
  findPolicy: findPolicy,
  loadHolidays: loadHolidays,
  computeDue: computeDue,
  addBusinessMinutes: addBusinessMinutes,
};
