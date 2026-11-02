// Pembacaan audit log untuk Konsol Vendor.
//
// Akun platform tidak punya tenant, sedangkan rule baca `audit_logs` mewajibkan
// tenant yang sama. Karena itu vendor membaca audit lewat route server ini:
// filter tenant eksplisit, aktor & tenant di-resolve di server, dan hasilnya
// dipaginasi. Rule koleksi tidak diubah, sehingga tampilan audit IT Lead rumah
// sakit tetap persis seperti sebelumnya.

var ACTIONS = [
  "create",
  "update",
  "transition",
  "assign",
  "approve",
  "reject",
  "comment",
  "attachment",
  "login",
  "sla_breach",
  "escalate",
  "delegate",
];

var COLLECTIONS = [
  "tickets",
  "ticket_comments",
  "ticket_attachments",
  "ticket_approvals",
  "users",
  "units",
  "ticket_categories",
  "sla_policies",
  "holidays",
  "tenants",
];

function formatPbDate(ms) {
  return new Date(ms).toISOString().replace("T", " ");
}

function cleanText(value, max) {
  var text = String(value == null ? "" : value).trim();
  if (max && text.length > max) text = text.slice(0, max);
  return text;
}

function isPlatformRole(role) {
  return String(role || "").indexOf("platform_") === 0;
}

function roleLabel(role) {
  return String(role || "").replace(/^platform_/, "");
}

// `options` sudah dinormalisasi route: tenantId, action, collection, actorId,
// scope ("platform"|"tenant"|""), q, page, perPage, fromMs, toMs.
function buildQuery(app, options) {
  var parts = [];
  var params = {};

  if (options.tenantId) {
    parts.push("tenant = {:tenant}");
    params.tenant = options.tenantId;
  }

  if (options.action) {
    parts.push("action = {:action}");
    params.action = options.action;
  }

  if (options.collection) {
    parts.push("collection_name = {:collection}");
    params.collection = options.collection;
  }

  if (options.actorId) {
    parts.push("actor = {:actor}");
    params.actor = options.actorId;
  }

  if (options.scope === "platform") {
    parts.push('actor_role ~ "platform_"');
  } else if (options.scope === "superuser") {
    parts.push('actor_role = "superuser"');
  } else if (options.scope === "tenant") {
    // "tenant" berarti staf rumah sakit, bukan superuser.
    parts.push('actor_role !~ "platform_" && actor_role != "superuser"');
  }

  if (options.fromMs) {
    parts.push("created >= {:from}");
    params.from = formatPbDate(options.fromMs);
  }

  if (options.toMs) {
    parts.push("created <= {:to}");
    params.to = formatPbDate(options.toMs);
  }

  return {
    filter: parts.length ? parts.join(" && ") : 'id != ""',
    params: params,
  };
}

// Pencarian teks diarahkan ke nomor tiket: audit menyimpan relasi `ticket`,
// bukan nomor tiketnya. Bila tidak ada tiket yang cocok, hasilnya kosong.
function ticketFilter(app, term) {
  var tickets = app.findRecordsByFilter(
    "tickets",
    "ticket_no ~ {:q}",
    "",
    50,
    0,
    { q: term }
  );

  if (!tickets.length) return "";

  var parts = [];

  for (var i = 0; i < tickets.length; i++) {
    parts.push('ticket = "' + String(tickets[i].id) + '"');
  }

  return "(" + parts.join(" || ") + ")";
}

// Hitung baris audit. `countRecords` bisa berbeda tanda tangan antar versi
// PocketBase, jadi ada fallback ke pembacaan penuh (dibatasi halaman).
function countRows(app, filter, params) {
  try {
    return Number(app.countRecords("audit_logs", filter, params)) || 0;
  } catch (err) {
    // lanjut ke fallback
  }

  try {
    return app.findRecordsByFilter("audit_logs", filter, "", 0, 0, params).length;
  } catch (err) {
    return 0;
  }
}

function list(app, options) {
  var page = Math.max(1, Number(options.page) || 1);
  var perPage = Math.min(100, Math.max(1, Number(options.perPage) || 25));

  var query = buildQuery(app, options);
  var filter = query.filter;

  if (options.q) {
    var byTicket = ticketFilter(app, options.q);

    if (!byTicket) {
      return {
        items: [],
        totalItems: 0,
        totalPages: 0,
        page: page,
        perPage: perPage,
      };
    }

    filter = filter + " && " + byTicket;
  }

  var total = countRows(app, filter, query.params);
  var records = app.findRecordsByFilter(
    "audit_logs",
    filter,
    "-created",
    perPage,
    (page - 1) * perPage,
    query.params
  );

  var tenantCache = {};
  var userCache = {};
  var ticketCache = {};
  var items = [];

  for (var i = 0; i < records.length; i++) {
    var record = records[i];
    var tenantId = String(record.get("tenant") || "");
    var actorId = String(record.get("actor") || "");
    var ticketId = String(record.get("ticket") || "");
    var actorRole = String(record.get("actor_role") || "");

    if (tenantId && !tenantCache[tenantId]) {
      try {
        var tenantRecord = app.findRecordById("tenants", tenantId);
        tenantCache[tenantId] = {
          name: String(tenantRecord.get("name") || ""),
          code: String(tenantRecord.get("code") || ""),
        };
      } catch (err) {
        tenantCache[tenantId] = { name: "", code: "" };
      }
    }

    if (actorId && !userCache[actorId]) {
      try {
        var userRecord = app.findRecordById("users", actorId);
        userCache[actorId] = String(userRecord.get("name") || "");
      } catch (err) {
        userCache[actorId] = "";
      }
    }

    if (ticketId && !ticketCache[ticketId]) {
      try {
        var ticketRecord = app.findRecordById("tickets", ticketId);
        ticketCache[ticketId] = String(ticketRecord.get("ticket_no") || "");
      } catch (err) {
        ticketCache[ticketId] = "";
      }
    }

    var tenantInfo = tenantCache[tenantId] || { name: "", code: "" };

    items.push({
      id: record.id,
      created: String(record.get("created") || ""),
      action: String(record.get("action") || ""),
      collection_name: String(record.get("collection_name") || ""),
      record_id: String(record.get("record_id") || ""),
      tenant: tenantId,
      tenant_name: tenantInfo.name,
      tenant_code: tenantInfo.code,
      actor: actorId,
      actor_name: userCache[actorId] || "",
      actor_role: roleLabel(actorRole),
      actor_scope: isPlatformRole(actorRole)
        ? "platform"
        : actorRole === "superuser"
          ? "superuser"
          : "tenant",
      ticket: ticketId,
      ticket_no: ticketCache[ticketId] || "",
      changes: record.get("changes") || {},
      ip: String(record.get("ip") || ""),
      user_agent: String(record.get("user_agent") || ""),
    });
  }

  return {
    items: items,
    totalItems: Number(total) || 0,
    totalPages: Math.ceil((Number(total) || 0) / perPage),
    page: page,
    perPage: perPage,
  };
}

// Daftar aktor untuk dropdown filter: staf vendor + staf rumah sakit terpilih.
function actors(app, tenantId) {
  var filter = 'is_active = true && (is_platform_staff = true || tenant = {:tenant})';
  var records = app.findRecordsByFilter(
    "users",
    filter,
    "name",
    200,
    0,
    { tenant: tenantId || "" }
  );
  var items = [];

  for (var i = 0; i < records.length; i++) {
    items.push({
      id: records[i].id,
      name: String(records[i].get("name") || ""),
      role: String(records[i].get("role") || ""),
      platform: Boolean(records[i].get("is_platform_staff")),
    });
  }

  return items;
}

module.exports = {
  ACTIONS: ACTIONS,
  COLLECTIONS: COLLECTIONS,
  cleanText: cleanText,
  list: list,
  actors: actors,
};
