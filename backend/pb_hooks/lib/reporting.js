// Agregasi laporan SLA. Bagian murni (median, bucket, aggregate, CSV) bisa
// diuji tanpa PocketBase; build() membaca tiket dan unit dari app.
//
// Catatan Goja: hindari fitur di luar ES5+ yang belum tentu tersedia.

var WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
var DAY_MS = 24 * 60 * 60 * 1000;
var MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

var PRIORITY_ORDER = ["critical", "high", "normal", "low"];
var TYPE_ORDER = ["incident", "service_request", "change_request"];

function pad(value) {
  return ("0" + value).slice(-2);
}

function toMs(value) {
  if (!value) return 0;

  var date = value instanceof Date ? value : new Date(String(value).replace(" ", "T"));
  return isNaN(date.getTime()) ? 0 : date.getTime();
}

function minutesBetween(startMs, endMs) {
  if (!startMs || !endMs || endMs <= startMs) return 0;
  return Math.round((endMs - startMs) / 60000);
}

function median(values) {
  if (!values || !values.length) return null;

  var sorted = values.slice().sort(function (a, b) {
    return a - b;
  });
  var middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) return sorted[middle];

  return Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 10) / 10;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function monthKey(ms) {
  var date = new Date(ms + WIB_OFFSET_MS);
  return date.getUTCFullYear() + "-" + pad(date.getUTCMonth() + 1);
}

function monthLabel(key) {
  var parts = String(key).split("-");
  var month = Number(parts[1]) - 1;

  return (MONTH_NAMES[month] || parts[1]) + " " + parts[0];
}

function weekKey(ms) {
  // ISO week, dihitung dari tanggal WIB.
  var wib = new Date(ms + WIB_OFFSET_MS);
  var date = Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth(), wib.getUTCDate());
  var weekday = (new Date(date).getUTCDay() + 6) % 7;
  var thursday = date + (3 - weekday) * DAY_MS;
  var year = new Date(thursday).getUTCFullYear();
  var yearStart = Date.UTC(year, 0, 1);
  var week = Math.floor((thursday - yearStart) / (7 * DAY_MS)) + 1;

  return year + "-W" + pad(week);
}

function weekLabel(key) {
  return "Minggu " + String(key).split("-W")[1];
}

function bucketKey(ms, bucket) {
  return bucket === "week" ? weekKey(ms) : monthKey(ms);
}

function bucketLabel(key, bucket) {
  return bucket === "week" ? weekLabel(key) : monthLabel(key);
}

function monthKeys(fromMs, toMs) {
  var from = new Date(fromMs + WIB_OFFSET_MS);
  var to = new Date(toMs + WIB_OFFSET_MS);
  var year = from.getUTCFullYear();
  var month = from.getUTCMonth();
  var keys = [];

  while (
    year < to.getUTCFullYear() ||
    (year === to.getUTCFullYear() && month <= to.getUTCMonth())
  ) {
    keys.push(year + "-" + pad(month + 1));
    month += 1;

    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  return keys;
}

function weekKeys(fromMs, toMs) {
  var keys = [];
  var cursor = fromMs;

  while (cursor <= toMs) {
    var key = weekKey(cursor);
    if (keys.indexOf(key) < 0) keys.push(key);
    cursor += 7 * DAY_MS;
  }

  var last = weekKey(toMs);
  if (keys.indexOf(last) < 0) keys.push(last);

  return keys;
}

function compliance(total, breached) {
  if (!total) return null;
  return round1(((total - breached) / total) * 100);
}

function summarize(rows) {
  var resolved = 0;
  var breached = 0;
  var reopens = 0;
  var responses = [];
  var resolutions = [];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];

    if (row.resolvedMs) {
      resolved += 1;
      resolutions.push(minutesBetween(row.createdMs, row.resolvedMs));
    }

    if (row.breached) breached += 1;

    if (row.firstResponseMs) {
      responses.push(minutesBetween(row.createdMs, row.firstResponseMs));
    }

    reopens += Number(row.reopenCount) || 0;
  }

  return {
    total: rows.length,
    resolved: resolved,
    breached: breached,
    compliance: compliance(rows.length, breached),
    median_response_minutes: median(responses),
    median_resolution_minutes: median(resolutions),
    reopens: reopens,
  };
}

function groupRows(rows, keyOf) {
  var groups = {};
  var order = [];

  for (var i = 0; i < rows.length; i++) {
    var name = keyOf(rows[i]) || "Tidak diketahui";

    if (!groups[name]) {
      groups[name] = [];
      order.push(name);
    }

    groups[name].push(rows[i]);
  }

  var result = [];

  for (var j = 0; j < order.length; j++) {
    var summary = summarize(groups[order[j]]);
    result.push({ name: order[j], summary: summary });
  }

  return result;
}

function orderByPriority(list) {
  return list.slice().sort(function (a, b) {
    var left = PRIORITY_ORDER.indexOf(a.name);
    var right = PRIORITY_ORDER.indexOf(b.name);
    if (left < 0) left = 99;
    if (right < 0) right = 99;
    return left - right;
  });
}

function orderByType(list) {
  return list.slice().sort(function (a, b) {
    var left = TYPE_ORDER.indexOf(a.name);
    var right = TYPE_ORDER.indexOf(b.name);
    if (left < 0) left = 99;
    if (right < 0) right = 99;
    return left - right;
  });
}

function trend(rows, fromMs, toMs, bucket) {
  var keys = bucket === "week" ? weekKeys(fromMs, toMs) : monthKeys(fromMs, toMs);
  var byKey = {};

  for (var i = 0; i < keys.length; i++) {
    byKey[keys[i]] = [];
  }

  for (var j = 0; j < rows.length; j++) {
    var key = bucketKey(rows[j].createdMs, bucket);
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(rows[j]);
  }

  var items = [];

  for (var k = 0; k < keys.length; k++) {
    var summary = summarize(byKey[keys[k]] || []);
    items.push({
      key: keys[k],
      label: bucketLabel(keys[k], bucket),
      created: summary.total,
      resolved: summary.resolved,
      breached: summary.breached,
      compliance: summary.compliance,
    });
  }

  return items;
}

function recentBreaches(rows, limit) {
  var breached = [];

  for (var i = 0; i < rows.length; i++) {
    if (!rows[i].breached) continue;
    breached.push(rows[i]);
  }

  breached.sort(function (a, b) {
    return (b.breachedMs || 0) - (a.breachedMs || 0);
  });

  return breached.slice(0, limit || 20).map(function (row) {
    return {
      ticket_no: row.ticketNo,
      priority: row.priority,
      type: row.type,
      unit: row.unit,
      status: row.status,
      breached_at: row.breachedMs ? new Date(row.breachedMs).toISOString() : "",
      escalation_level: row.escalationLevel,
    };
  });
}

function aggregate(rows, options) {
  var bucket = options.bucket === "week" ? "week" : "month";

  return {
    summary: summarize(rows),
    trend: trend(rows, options.fromMs, options.toMs, bucket),
    units: groupRows(rows, function (row) {
      return row.unit;
    }).sort(function (a, b) {
      return b.summary.total - a.summary.total || a.name.localeCompare(b.name);
    }),
    priorities: orderByPriority(
      groupRows(rows, function (row) {
        return row.priority;
      })
    ),
    types: orderByType(
      groupRows(rows, function (row) {
        return row.type;
      })
    ),
    breaches: recentBreaches(rows, 20),
  };
}

function formatWib(ms) {
  if (!ms) return "";

  var date = new Date(ms + WIB_OFFSET_MS);

  return (
    date.getUTCFullYear() +
    "-" +
    pad(date.getUTCMonth() + 1) +
    "-" +
    pad(date.getUTCDate()) +
    " " +
    pad(date.getUTCHours()) +
    ":" +
    pad(date.getUTCMinutes())
  );
}

function csvCell(value) {
  var text = value == null ? "" : String(value);

  if (/[",\n\r]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }

  return text;
}

function toCsv(rows) {
  var header = [
    "ticket_no",
    "type",
    "priority",
    "unit",
    "category",
    "status",
    "created_wib",
    "first_response_wib",
    "resolved_wib",
    "response_minutes",
    "resolution_minutes",
    "breached",
    "escalation_level",
    "resolution_code",
    "reopen_count",
  ];

  var lines = [header.join(",")];

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var cells = [
      row.ticketNo,
      row.type,
      row.priority,
      row.unit,
      row.category,
      row.status,
      formatWib(row.createdMs),
      formatWib(row.firstResponseMs),
      formatWib(row.resolvedMs),
      row.firstResponseMs ? minutesBetween(row.createdMs, row.firstResponseMs) : "",
      row.resolvedMs ? minutesBetween(row.createdMs, row.resolvedMs) : "",
      row.breached ? "yes" : "no",
      row.escalationLevel || 0,
      row.resolutionCode || "",
      row.reopenCount || 0,
    ];

    lines.push(cells.map(csvCell).join(","));
  }

  return lines.join("\r\n");
}

function pbDate(ms) {
  return new Date(ms).toISOString().replace("T", " ");
}

function queryText(query, key) {
  if (!query) return "";

  var value = query[key];
  if (value == null) return "";
  if (typeof value === "object" && value.length) return String(value[0]);

  return String(value);
}

function startOfDayWib(ms) {
  var wib = new Date(ms + WIB_OFFSET_MS);
  var midnight = Date.UTC(
    wib.getUTCFullYear(),
    wib.getUTCMonth(),
    wib.getUTCDate()
  );

  return midnight - WIB_OFFSET_MS;
}

function endOfDayWib(ms) {
  return startOfDayWib(ms) + DAY_MS - 1;
}

function dateText(ms) {
  var wib = new Date(ms + WIB_OFFSET_MS);
  return (
    wib.getUTCFullYear() +
    "-" +
    pad(wib.getUTCMonth() + 1) +
    "-" +
    pad(wib.getUTCDate())
  );
}

function parseDateText(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;

  var date = new Date(text + "T00:00:00+07:00");
  return isNaN(date.getTime()) ? null : date.getTime();
}

// Rentang laporan: default 90 hari terakhir, maksimal 366 hari.
function parseRange(query, nowMs) {
  var bucket = queryText(query, "bucket") === "week" ? "week" : "month";
  var fromText = queryText(query, "from");
  var toText = queryText(query, "to");
  var now = nowMs || Date.now();

  var toStart = toText ? parseDateText(toText) : now;

  if (toText && toStart == null) {
    return { error: "Format tanggal akhir tidak valid (YYYY-MM-DD)" };
  }

  var fromStart = fromText ? parseDateText(fromText) : null;

  if (fromText && fromStart == null) {
    return { error: "Format tanggal awal tidak valid (YYYY-MM-DD)" };
  }

  var toMs = endOfDayWib(toStart);
  var fromMs = fromStart
    ? startOfDayWib(fromStart)
    : startOfDayWib(toStart) - 89 * DAY_MS;

  if (fromMs > toMs) {
    return { error: "Tanggal awal harus sebelum tanggal akhir" };
  }

  var days =
    Math.round((startOfDayWib(toMs) - startOfDayWib(fromMs)) / DAY_MS) + 1;

  if (days > 366) {
    return { error: "Rentang laporan maksimal 366 hari" };
  }

  return {
    fromMs: fromMs,
    toMs: toMs,
    from: dateText(fromMs),
    to: dateText(toMs),
    days: days,
    bucket: bucket,
  };
}

function rowFromRecord(record, units, categories) {
  var createdMs = toMs(record.get("created"));
  var firstResponseMs = toMs(record.get("first_response_at"));
  var resolvedMs = toMs(record.get("resolved_at"));

  var breachTimes = [
    toMs(record.get("response_breach_at")),
    toMs(record.get("approval_breach_at")),
    toMs(record.get("resolution_breach_at")),
  ].filter(function (value) {
    return value > 0;
  });

  return {
    ticketNo: String(record.get("ticket_no") || ""),
    type: String(record.get("type") || ""),
    priority: String(record.get("priority") || ""),
    status: String(record.get("status") || ""),
    unit: units[String(record.get("unit") || "")] || "Tanpa unit",
    category: categories[String(record.get("category") || "")] || "",
    createdMs: createdMs,
    firstResponseMs: firstResponseMs,
    resolvedMs: resolvedMs,
    breached: breachTimes.length > 0,
    breachedMs: breachTimes.length ? Math.max.apply(null, breachTimes) : 0,
    escalationLevel: Number(record.get("escalation_level")) || 0,
    resolutionCode: String(record.get("resolution_code") || ""),
    reopenCount: Number(record.get("reopen_count")) || 0,
  };
}

function collectNames(app, collection, tenantId) {
  var map = {};
  var records = app.findRecordsByFilter(
    collection,
    "tenant = {:tenant}",
    "",
    0,
    0,
    { tenant: tenantId }
  );

  for (var i = 0; i < records.length; i++) {
    map[records[i].id] = String(records[i].get("name") || "");
  }

  return map;
}

function build(app, tenantId, options) {
  var fromMs = options.fromMs;
  var toMs = options.toMs;
  var bucket = options.bucket === "week" ? "week" : "month";

  var tickets = app.findRecordsByFilter(
    "tickets",
    "tenant = {:tenant} && created >= {:from} && created <= {:to}",
    "-created",
    0,
    0,
    { tenant: tenantId, from: pbDate(fromMs), to: pbDate(toMs) }
  );

  var units = collectNames(app, "units", tenantId);
  var categories = collectNames(app, "ticket_categories", tenantId);
  var rows = [];

  for (var i = 0; i < tickets.length; i++) {
    rows.push(rowFromRecord(tickets[i], units, categories));
  }

  return {
    report: aggregate(rows, { fromMs: fromMs, toMs: toMs, bucket: bucket }),
    rows: rows,
  };
}

module.exports = {
  median: median,
  compliance: compliance,
  monthKey: monthKey,
  weekKey: weekKey,
  bucketKey: bucketKey,
  aggregate: aggregate,
  summarize: summarize,
  toCsv: toCsv,
  build: build,
  parseRange: parseRange,
};
