// Agregasi laporan SLA. Bagian murni (median, bucket, aggregate, CSV) bisa
// diuji tanpa PocketBase; build() membaca tiket dan unit dari app.
//
// Catatan Goja: hindari fitur di luar ES5+ yang belum tentu tersedia.
//
// Semua batas hari, bucket bulan/minggu, dan teks tanggal memakai zona waktu
// laporan (`options.timezone`). Default `Asia/Jakarta` dipertahankan supaya
// pemanggil lama dan test tetap valid, tetapi route laporan selalu mengirim
// zona tenant yang sedang dilihat.

var timezone = require(__hooks + "/lib/timezone.js");

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

function zoneOf(options) {
  return timezone.resolveZone(options && options.timezone);
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

function monthKey(ms, zone) {
  return timezone.dateKey(ms, timezone.resolveZone(zone)).slice(0, 7);
}

function monthLabel(key) {
  var parts = String(key).split("-");
  var month = Number(parts[1]) - 1;

  return (MONTH_NAMES[month] || parts[1]) + " " + parts[0];
}

function weekKey(ms, zone) {
  // ISO week, dihitung dari tanggal kalender lokal.
  var parts = timezone.localParts(ms, timezone.resolveZone(zone));
  var date = Date.UTC(parts.year, parts.month, parts.day);
  var weekday = parts.weekday - 1;
  var thursday = date + (3 - weekday) * DAY_MS;
  var year = new Date(thursday).getUTCFullYear();
  var yearStart = Date.UTC(year, 0, 1);
  var week = Math.floor((thursday - yearStart) / (7 * DAY_MS)) + 1;

  return year + "-W" + pad(week);
}

function weekLabel(key) {
  return "Minggu " + String(key).split("-W")[1];
}

function bucketKey(ms, bucket, zone) {
  return bucket === "week" ? weekKey(ms, zone) : monthKey(ms, zone);
}

function bucketLabel(key, bucket) {
  return bucket === "week" ? weekLabel(key) : monthLabel(key);
}

function monthKeys(fromMs, toMs, zone) {
  var from = timezone.localParts(fromMs, timezone.resolveZone(zone));
  var to = timezone.localParts(toMs, timezone.resolveZone(zone));
  var year = from.year;
  var month = from.month;
  var keys = [];

  while (year < to.year || (year === to.year && month <= to.month)) {
    keys.push(year + "-" + pad(month + 1));
    month += 1;

    if (month > 11) {
      month = 0;
      year += 1;
    }
  }

  return keys;
}

function weekKeys(fromMs, toMs, zone) {
  var keys = [];
  var cursor = fromMs;

  while (cursor <= toMs) {
    var key = weekKey(cursor, zone);
    if (keys.indexOf(key) < 0) keys.push(key);
    cursor += 7 * DAY_MS;
  }

  var last = weekKey(toMs, zone);
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

function trend(rows, fromMs, toMs, bucket, zone) {
  var keys =
    bucket === "week"
      ? weekKeys(fromMs, toMs, zone)
      : monthKeys(fromMs, toMs, zone);
  var byKey = {};

  for (var i = 0; i < keys.length; i++) {
    byKey[keys[i]] = [];
  }

  for (var j = 0; j < rows.length; j++) {
    var key = bucketKey(rows[j].createdMs, bucket, zone);
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
      tenant: row.tenant || "",
      status: row.status,
      breached_at: row.breachedMs ? new Date(row.breachedMs).toISOString() : "",
      escalation_level: row.escalationLevel,
    };
  });
}

function aggregate(rows, options) {
  var bucket = options.bucket === "week" ? "week" : "month";
  var zone = zoneOf(options);

  return {
    summary: summarize(rows),
    trend: trend(rows, options.fromMs, options.toMs, bucket, zone),
    units: groupRows(rows, function (row) {
      return row.unit;
    }).sort(function (a, b) {
      return b.summary.total - a.summary.total || a.name.localeCompare(b.name);
    }),
    services: groupRows(rows, function (row) {
      return row.service || "Tanpa layanan";
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

function formatLocal(ms, zone) {
  if (!ms) return "";

  var parts = timezone.localParts(ms, timezone.resolveZone(zone));

  return (
    parts.year +
    "-" +
    pad(parts.month + 1) +
    "-" +
    pad(parts.day) +
    " " +
    pad(parts.hour) +
    ":" +
    pad(parts.minute)
  );
}

function csvCell(value) {
  var text = value == null ? "" : String(value);

  if (/[",\n\r]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }

  return text;
}

function toCsv(rows, options) {
  var withTenant = Boolean(options && options.withTenant);
  var zone = zoneOf(options);
  // Nama kolom memakai `_local` karena isinya waktu lokal tenant, bukan WIB.
  // Isi CSV ikut zona laporan; jangan diubah tanpa versi format baru.
  var header = [
    "ticket_no",
    "type",
    "priority",
    "unit",
    "category",
    "status",
    "created_local",
    "first_response_local",
    "resolved_local",
    "response_minutes",
    "resolution_minutes",
    "breached",
    "escalation_level",
    "resolution_code",
    "reopen_count",
  ];

  if (withTenant) header.unshift("tenant");

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
      formatLocal(row.createdMs, zone),
      formatLocal(row.firstResponseMs, zone),
      formatLocal(row.resolvedMs, zone),
      row.firstResponseMs ? minutesBetween(row.createdMs, row.firstResponseMs) : "",
      row.resolvedMs ? minutesBetween(row.createdMs, row.resolvedMs) : "",
      row.breached ? "yes" : "no",
      row.escalationLevel || 0,
      row.resolutionCode || "",
      row.reopenCount || 0,
    ];

    if (withTenant) cells.unshift(row.tenant || "");

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

function dateText(ms, zone) {
  return timezone.dateKey(ms, timezone.resolveZone(zone));
}

// Tanggal `YYYY-MM-DD` pada query adalah tanggal kalender lokal laporan, bukan
// UTC. Tanpa zona, tanggal 1 bisa jatuh ke bulan sebelumnya.
function parseDateText(text, zone) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;

  var year = Number(text.slice(0, 4));
  var month = Number(text.slice(5, 7)) - 1;
  var day = Number(text.slice(8, 10));
  var probe = Date.UTC(year, month, day);

  // Tolak tanggal yang tidak ada (mis. 2026-02-31).
  var check = new Date(probe);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return timezone.fromLocal(year, month, day, 0, 0, timezone.resolveZone(zone));
}

// Rentang laporan: default 90 hari terakhir, maksimal 366 hari. Parameter
// `from`/`to` adalah tanggal kalender pada zona laporan.
function parseRange(query, nowMs, zoneName) {
  var zone = timezone.resolveZone(zoneName);
  var bucket = queryText(query, "bucket") === "week" ? "week" : "month";
  var fromText = queryText(query, "from");
  var toText = queryText(query, "to");
  var now = nowMs || Date.now();

  var toStart = toText ? parseDateText(toText, zone) : now;

  if (toText && toStart == null) {
    return { error: "Format tanggal akhir tidak valid (YYYY-MM-DD)" };
  }

  var fromStart = fromText ? parseDateText(fromText, zone) : null;

  if (fromText && fromStart == null) {
    return { error: "Format tanggal awal tidak valid (YYYY-MM-DD)" };
  }

  var toMs = timezone.endOfDay(toStart, zone);
  var fromMs = fromStart;

  if (fromMs == null) {
    var anchor = timezone.localParts(toStart, zone);
    fromMs = timezone.fromLocal(
      anchor.year,
      anchor.month,
      anchor.day - 89,
      0,
      0,
      zone
    );
  }

  if (fromMs > toMs) {
    return { error: "Tanggal awal harus sebelum tanggal akhir" };
  }

  var fromParts = timezone.localParts(fromMs, zone);
  var toParts = timezone.localParts(toMs, zone);
  var days =
    Math.round(
      (Date.UTC(toParts.year, toParts.month, toParts.day) -
        Date.UTC(fromParts.year, fromParts.month, fromParts.day)) /
        DAY_MS
    ) + 1;

  if (days > 366) {
    return { error: "Rentang laporan maksimal 366 hari" };
  }

  return {
    fromMs: fromMs,
    toMs: toMs,
    from: dateText(fromMs, zone),
    to: dateText(toMs, zone),
    days: days,
    bucket: bucket,
    timezone: zone,
  };
}

function rowFromRecord(record, units, categories, services) {
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
    id: record.id,
    ticketNo: String(record.get("ticket_no") || ""),
    kbArticle: String(record.get("kb_article") || ""),
    type: String(record.get("type") || ""),
    priority: String(record.get("priority") || ""),
    status: String(record.get("status") || ""),
    unit: units[String(record.get("unit") || "")] || "Tanpa unit",
    category: categories[String(record.get("category") || "")] || "",
    service:
      services[String(record.get("service") || "")] || "Tanpa layanan",
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

// Membaca tiket satu tenant pada rentang laporan menjadi baris siap agregasi.
// `tenantName` hanya dilampirkan agar laporan lintas rumah sakit bisa
// dikelompokkan dan diekspor dengan kolom tenant.
function collectRows(app, tenantId, tenantName, options) {
  var rows = [];
  var tickets = app.findRecordsByFilter(
    "tickets",
    "tenant = {:tenant} && created >= {:from} && created <= {:to}",
    "-created",
    0,
    0,
    { tenant: tenantId, from: pbDate(options.fromMs), to: pbDate(options.toMs) }
  );

  var units = collectNames(app, "units", tenantId);
  var categories = collectNames(app, "ticket_categories", tenantId);
  var services = collectNames(app, "services", tenantId);

  for (var i = 0; i < tickets.length; i++) {
    var row = rowFromRecord(tickets[i], units, categories, services);
    row.tenantId = tenantId;
    row.tenant = tenantName || "";
    rows.push(row);
  }

  return rows;
}

function build(app, tenantId, options) {
  var rows = collectRows(app, tenantId, "", options);

  return {
    report: aggregate(rows, options),
    rows: rows,
  };
}

// Laporan lintas rumah sakit (akun vendor). Mediana dihitung dari gabungan
// seluruh baris, bukan rata-rata median per tenant, supaya angkanya benar.
// Selain ringkasan gabungan, hasilnya memuat ringkasan per rumah sakit.
function buildMulti(app, tenants, options) {
  var rows = [];
  var perTenant = [];

  for (var i = 0; i < tenants.length; i++) {
    var tenant = tenants[i];
    var tenantRows = collectRows(
      app,
      String(tenant.id),
      String(tenant.get("name") || ""),
      options
    );

    perTenant.push({
      id: String(tenant.id),
      name: String(tenant.get("name") || ""),
      code: String(tenant.get("code") || ""),
      summary: summarize(tenantRows),
    });

    rows = rows.concat(tenantRows);
  }

  var report = aggregate(rows, options);

  report.tenants = perTenant.sort(function (a, b) {
    return b.summary.total - a.summary.total || a.name.localeCompare(b.name);
  });

  return { report: report, rows: rows };
}

// Laporan operasional bulanan: insiden per layanan, problem teratas, pemakaian
// KB, CSAT, dan ringkasan SLA. Memakai baris tiket yang sama dengan laporan SLA
// agar definisi compliance konsisten.
function buildOperations(app, tenants, options) {
  var rows = [];
  var csatRows = [];
  var problems = [];
  var articlesPublished = 0;
  var serviceNames = {};

  for (var i = 0; i < tenants.length; i++) {
    var tenantId = String(tenants[i].id);
    var tenantRows = collectRows(app, tenantId, String(tenants[i].get("name") || ""), options);
    rows = rows.concat(tenantRows);

    var names = collectNames(app, "services", tenantId);
    for (var key in names) {
      if (Object.prototype.hasOwnProperty.call(names, key)) {
        serviceNames[key] = names[key];
      }
    }

    var csat = app.findRecordsByFilter(
      "ticket_csat",
      "tenant = {:tenant} && created >= {:from} && created <= {:to}",
      "-created",
      0,
      0,
      { tenant: tenantId, from: pbDate(options.fromMs), to: pbDate(options.toMs) }
    );

    for (var c = 0; c < csat.length; c++) {
      var ticketService = "";
      try {
        var csatTicket = app.findRecordById("tickets", String(csat[c].get("ticket")));
        ticketService = String(csatTicket.get("service") || "");
      } catch (err) {
        ticketService = "";
      }

      csatRows.push({
        score: Number(csat[c].get("score")) || 0,
        service: serviceNames[ticketService] || "Tanpa layanan",
        serviceId: ticketService,
        hasComment: String(csat[c].get("comment") || "") ? true : false,
      });
    }

    var problemRecords = app.findRecordsByFilter(
      "problems",
      "tenant = {:tenant} && created >= {:from} && created <= {:to}",
      "-created",
      0,
      0,
      { tenant: tenantId, from: pbDate(options.fromMs), to: pbDate(options.toMs) }
    );

    for (var p = 0; p < problemRecords.length; p++) {
      var links = app.findRecordsByFilter(
        "problem_tickets",
        "problem = {:problem}",
        "",
        0,
        0,
        { problem: problemRecords[p].id }
      );

      problems.push({
        id: problemRecords[p].id,
        problem_no: String(problemRecords[p].get("problem_no") || ""),
        title: String(problemRecords[p].get("title") || ""),
        status: String(problemRecords[p].get("status") || ""),
        ticket_count: links.length,
      });
    }

    var articles = app.findRecordsByFilter(
      "knowledge_articles",
      'tenant = {:tenant} && status = "published"',
      "",
      0,
      0,
      { tenant: tenantId }
    );
    articlesPublished += articles.length;
  }

  var incidents = {};
  var incidentOrder = [];
  for (var r = 0; r < rows.length; r++) {
    if (rows[r].type !== "incident") continue;

    var service = rows[r].service || "Tanpa layanan";
    if (!incidents[service]) {
      incidents[service] = { name: service, total: 0, resolved: 0, breached: 0 };
      incidentOrder.push(service);
    }

    incidents[service].total += 1;
    if (rows[r].resolvedMs > 0) incidents[service].resolved += 1;
    if (rows[r].breached) incidents[service].breached += 1;
  }

  var incidentRows = incidentOrder
    .map(function (name) {
      var item = incidents[name];
      item.compliance = compliance(item.total, item.breached);
      return item;
    })
    .sort(function (a, b) {
      return b.total - a.total || a.name.localeCompare(b.name);
    });

  var csatSum = 0;
  for (var s = 0; s < csatRows.length; s++) csatSum += csatRows[s].score;

  var csatByService = {};
  for (var t = 0; t < csatRows.length; t++) {
    var row = csatRows[t];
    if (!csatByService[row.service]) {
      csatByService[row.service] = { name: row.service, count: 0, sum: 0 };
    }
    csatByService[row.service].count += 1;
    csatByService[row.service].sum += row.score;
  }

  var csatServiceRows = [];
  for (var nameKey in csatByService) {
    if (Object.prototype.hasOwnProperty.call(csatByService, nameKey)) {
      var item = csatByService[nameKey];
      csatServiceRows.push({
        name: item.name,
        count: item.count,
        average: round1(item.sum / item.count),
      });
    }
  }
  csatServiceRows.sort(function (a, b) {
    return b.count - a.count || a.name.localeCompare(b.name);
  });

  var ticketsWithKb = 0;
  for (var k = 0; k < rows.length; k++) {
    if (rows[k].kbArticle) ticketsWithKb += 1;
  }

  var topProblems = problems
    .slice()
    .sort(function (a, b) {
      return b.ticket_count - a.ticket_count || a.problem_no.localeCompare(b.problem_no);
    })
    .slice(0, 5);

  return {
    range: {
      from: dateText(options.fromMs, zoneOf(options)),
      to: dateText(options.toMs, zoneOf(options)),
      days: options.days,
      timezone: zoneOf(options),
    },
    sla: summarize(rows),
    incidents: {
      total: incidentRows.reduce(function (sum, item) {
        return sum + item.total;
      }, 0),
      by_service: incidentRows,
    },
    csat: {
      count: csatRows.length,
      average: csatRows.length ? round1(csatSum / csatRows.length) : null,
      by_service: csatServiceRows,
    },
    knowledge: {
      articles_published: articlesPublished,
      tickets_with_kb: ticketsWithKb,
      link_rate: rows.length
        ? round1((ticketsWithKb / rows.length) * 100)
        : null,
    },
    top_problems: topProblems,
  };
}

function operationsCsv(report) {
  var lines = [["bagian", "label", "nilai"]];

  function add(section, label, value) {
    lines.push([section, label, value == null ? "" : value]);
  }

  add("sla", "total_tiket", report.sla.total);
  add("sla", "selesai", report.sla.resolved);
  add("sla", "breach", report.sla.breached);
  add("sla", "compliance", report.sla.compliance);
  add("incident", "total_insiden", report.incidents.total);

  for (var i = 0; i < report.incidents.by_service.length; i++) {
    var service = report.incidents.by_service[i];
    add("insiden_per_layanan", service.name, service.total);
  }

  add("csat", "respons", report.csat.count);
  add("csat", "rata_rata", report.csat.average);

  for (var c = 0; c < report.csat.by_service.length; c++) {
    add(
      "csat_per_layanan",
      report.csat.by_service[c].name,
      report.csat.by_service[c].average
    );
  }

  add("knowledge", "artikel_published", report.knowledge.articles_published);
  add("knowledge", "tiket_dengan_kb", report.knowledge.tickets_with_kb);
  add("knowledge", "kb_link_rate", report.knowledge.link_rate);

  for (var p = 0; p < report.top_problems.length; p++) {
    add(
      "problem_teratas",
      report.top_problems[p].problem_no +
        " " +
        report.top_problems[p].title,
      report.top_problems[p].ticket_count
    );
  }

  var output = [];
  for (var l = 0; l < lines.length; l++) {
    output.push(
      lines[l]
        .map(function (value) {
          return csvCell(value);
        })
        .join(",")
    );
  }

  return output.join("\n");
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
  buildMulti: buildMulti,
  buildOperations: buildOperations,
  operationsCsv: operationsCsv,
  parseRange: parseRange,
  queryText: queryText,
};
