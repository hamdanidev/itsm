// Alat bantu seed data manual (development/testing).
//
// Berbeda dengan helper bisnis lain, modul ini boleh memakai akses tingkat
// database (`app.db()`) karena tugasnya memang memundurkan/menyebar waktu
// record yang sudah dibuat lewat alur aplikasi biasa. Route pemanggilnya
// dibatasi superuser (`$apis.requireSuperuserAuth()`), sehingga tidak menambah
// permukaan akses baru: superuser memang sudah dapat mengubah seluruh data.
//
// Dua operasi:
//   age(app, items)   memundurkan `created` beserta waktu turunannya agar data
//                     terlihat seperti dipakai berbulan-bulan.
//   reset(app, opts)  menghapus seluruh data transaksional satu tenant.
//
// Catatan Goja: file ini sengaja ES5 (var/function) karena dievaluasi oleh
// PocketBase JSVM.

var TICKET_DATE_FIELDS = [
  "assigned_at",
  "first_response_at",
  "resolved_at",
  "closed_at",
  "reopened_at",
  "actual_start",
  "actual_end",
  "escalated_at",
  "sla_paused_at",
  "response_due_at",
  "approval_due_at",
  "resolution_due_at",
  "next_due_at",
  "planned_start",
  "planned_end",
  "last_activity_at",
];

var PROBLEM_DATE_FIELDS = ["resolved_at"];
var INCIDENT_DATE_FIELDS = [
  "started_at",
  "resolved_at",
  "closed_at",
  "pir_completed_at",
];
var ARTICLE_DATE_FIELDS = ["published_at"];

var NUMBER_PATTERN = /^([A-Z]+)-(\d{8})-(.+)$/;

function text(value) {
  return String(value == null ? "" : value).trim();
}

function has(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function parseDate(value) {
  var raw = text(value);
  if (!raw || raw.indexOf("0001-") === 0) return null;

  var date = new Date(raw.replace(" ", "T"));
  if (isNaN(date.getTime())) return null;

  return date;
}

function pbDate(date) {
  return date.toISOString().replace("T", " ");
}

function shiftDate(value, deltaMs) {
  var date = parseDate(value);
  if (!date) return "";
  return pbDate(new Date(date.getTime() + deltaMs));
}

function addMs(ms, delta) {
  return ms + delta;
}

function dateValue(value) {
  if (value == null || text(value) === "") return "";
  var date = parseDate(value);
  if (!date) return "";
  return pbDate(date);
}

function maxMs(list) {
  var result = 0;
  for (var i = 0; i < list.length; i++) {
    if (isFinite(list[i]) && list[i] > result) result = list[i];
  }
  return result || 0;
}

function distribute(index, total, startMs, endMs) {
  if (endMs <= startMs) return startMs;
  if (total <= 1) return startMs + Math.round((endMs - startMs) * 0.5);
  return startMs + Math.round(((endMs - startMs) * (index + 1)) / (total + 1));
}

function spread(index, total, startMs, endMs) {
  if (endMs <= startMs) return startMs;
  if (total <= 1) return startMs;
  if (index <= 0) return startMs;
  if (index >= total - 1) return endMs;
  return startMs + Math.round(((endMs - startMs) * index) / (total - 1));
}

function setUpdated(app, collection, id, value) {
  app
    .db()
    .newQuery("UPDATE " + collection + " SET updated = {:updated} WHERE id = {:id}")
    .bind({ updated: value || pbDate(new Date()), id: id })
    .execute();
}

function setRawDate(app, record, field, ms) {
  record.setRaw(field, pbDate(new Date(ms)));
}

function rewriteNumberDate(value, dateMs) {
  var raw = text(value);
  var match = raw.match(NUMBER_PATTERN);
  if (!match) return raw;

  var stamp = new Date(dateMs + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  return match[1] + "-" + stamp + "-" + match[3];
}

function findRecord(app, collection, id) {
  try {
    return app.findRecordById(collection, text(id));
  } catch (err) {
    throw new NotFoundError("Record " + collection + " tidak ditemukan");
  }
}

function records(app, collection, filter, sort, params) {
  try {
    return app.findRecordsByFilter(collection, filter, sort || "", 0, 0, params || {});
  } catch (err) {
    return [];
  }
}

function count(app, collection, filter, params) {
  try {
    return app.findRecordsByFilter(collection, filter, "", 0, 0, params || {}).length;
  } catch (err) {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Retiming waktu turunan tiket
// ---------------------------------------------------------------------------

function retimeComments(app, ticketId, startMs, endMs) {
  var rows = records(app, "ticket_comments", "ticket = {:ticket}", "created", {
    ticket: ticketId,
  });

  for (var i = 0; i < rows.length; i++) {
    if (rows[i].get("created")) {
      setRawDate(app, rows[i], "created", distribute(i, rows.length, startMs, endMs));
      app.save(rows[i]);
    }
  }

  return rows.length;
}

function retimeAttachments(app, ticketId, startMs, endMs) {
  var rows = records(app, "ticket_attachments", "ticket = {:ticket}", "created", {
    ticket: ticketId,
  });

  for (var i = 0; i < rows.length; i++) {
    setRawDate(app, rows[i], "created", distribute(i, rows.length, startMs, endMs));
    app.save(rows[i]);
  }

  return rows.length;
}

function retimeApprovals(app, ticketId, delta, startMs, endMs) {
  var rows = records(app, "ticket_approvals", "ticket = {:ticket}", "step", {
    ticket: ticketId,
  });
  var acted = [];

  for (var i = 0; i < rows.length; i++) {
    var due = text(rows[i].get("due_at"));
    if (due) rows[i].set("due_at", shiftDate(due, delta));

    var created = text(rows[i].get("created"));
    if (created) setRawDate(app, rows[i], "created", parseDate(created).getTime() + delta);

    if (text(rows[i].get("acted_at")) && text(rows[i].get("status")) !== "pending") {
      acted.push(rows[i]);
    }

    app.save(rows[i]);
  }

  // Aksi approval terjadi sebelum pekerjaan dimulai; sebar di paruh awal umur
  // tiket agar stepper menampilkan tenggat yang masuk akal.
  var approvalEnd = startMs + Math.round((endMs - startMs) * 0.45);

  for (var j = 0; j < acted.length; j++) {
    acted[j].set(
      "acted_at",
      pbDate(new Date(distribute(j, acted.length, startMs, approvalEnd)))
    );
    app.save(acted[j]);
  }

  return rows.length;
}

function retimeAudit(app, ticketId, startMs, endMs) {
  var rows = records(app, "audit_logs", "ticket = {:ticket}", "created", {
    ticket: ticketId,
  });

  for (var i = 0; i < rows.length; i++) {
    var target = spread(i, rows.length, startMs, endMs);
    setRawDate(app, rows[i], "created", target);
    app.save(rows[i]);
  }

  return rows.length;
}

function retimeNotifications(app, ticketId, delta) {
  var rows = records(app, "notifications", "ticket = {:ticket}", "created", {
    ticket: ticketId,
  });

  for (var i = 0; i < rows.length; i++) {
    var created = parseDate(rows[i].get("created"));
    if (created) setRawDate(app, rows[i], "created", created.getTime() + delta);
    app.save(rows[i]);
  }

  return rows.length;
}

function retimeMail(app, ticketId, delta) {
  var rows = records(app, "email_outbox", "ticket = {:ticket}", "created", {
    ticket: ticketId,
  });

  for (var i = 0; i < rows.length; i++) {
    var created = parseDate(rows[i].get("created"));
    if (created) setRawDate(app, rows[i], "created", created.getTime() + delta);
    app.save(rows[i]);
  }

  return rows.length;
}

function retimeCsat(app, ticketId, afterMs) {
  var rows = records(app, "ticket_csat", "ticket = {:ticket}", "created", {
    ticket: ticketId,
  });
  var now = Date.now();

  for (var i = 0; i < rows.length; i++) {
    var target = Math.min(now, afterMs + 45 * 60 * 1000);
    setRawDate(app, rows[i], "created", target);
    app.save(rows[i]);
  }

  return rows.length;
}

// ---------------------------------------------------------------------------
// Simulasi breach SLA + eskalasi (agar dashboard/laporan punya variasi)
// ---------------------------------------------------------------------------

function applyBreach(app, ticket, spec, nowMs) {
  var breaches = spec || {};
  var events = [];
  var maxLevel = Number(ticket.get("escalation_level")) || 0;

  // Breach tidak boleh terjadi setelah tiket selesai/ditutup.
  var capMs = nowMs;
  var resolved = parseDate(ticket.get("resolved_at"));
  var closed = parseDate(ticket.get("closed_at"));
  if (resolved) capMs = Math.min(capMs, resolved.getTime() - 5 * 60 * 1000);
  if (closed) capMs = Math.min(capMs, closed.getTime() - 5 * 60 * 1000);

  function addEvent(field, dueField, level) {
    var due = parseDate(ticket.get(dueField));
    var time = due ? due.getTime() + 10 * 60 * 1000 : capMs;

    if (time > capMs) time = capMs;
    if (!parseDate(ticket.get(field))) ticket.set(field, pbDate(new Date(time)));

    if (level > maxLevel) maxLevel = level;
    events.push({ field: dueField, level: level, at: time });

    return time;
  }

  var responseAt = 0;
  var approvalAt = 0;
  var resolutionAt = 0;

  if (breaches.response) responseAt = addEvent("response_breach_at", "response_due_at", 1);
  if (breaches.approval) approvalAt = addEvent("approval_breach_at", "approval_due_at", 1);
  if (breaches.resolution) {
    resolutionAt = addEvent("resolution_breach_at", "resolution_due_at", 2);
  }

  var requestedLevel = Number(breaches.escalation_level) || 0;
  if (requestedLevel > maxLevel) maxLevel = requestedLevel;

  if (maxLevel > 0) ticket.set("escalation_level", maxLevel);

  var escalated = maxMs([responseAt, approvalAt, resolutionAt]);
  if (escalated) {
    if (!parseDate(ticket.get("escalated_at"))) {
      ticket.set("escalated_at", pbDate(new Date(escalated)));
    }
  }

  var lastActivity = parseDate(ticket.get("last_activity_at"));
  var lastActivityMs = lastActivity ? lastActivity.getTime() : 0;
  if (escalated > lastActivityMs) {
    ticket.set("last_activity_at", pbDate(new Date(escalated)));
    lastActivityMs = escalated;
  }

  return {
    events: events,
    level: maxLevel,
    escalatedAt: escalated,
    lastActivityMs: lastActivityMs,
  };
}

function writeBreachAudit(app, ticket, events, nowMs) {
  var audit = require(__hooks + "/lib/audit.js");
  var written = 0;

  for (var i = 0; i < events.length; i++) {
    try {
      var record = audit.write(app, {
        tenant: ticket.get("tenant"),
        ticket: ticket,
        actor_role: "system",
        action: "sla_breach",
        collection_name: "tickets",
        record_id: ticket.id,
        changes: { field: events[i].field, level: events[i].level },
      });
      setRawDate(app, record, "created", events[i].at);
      app.save(record);
      written += 1;
    } catch (err) {
      // Audit tidak boleh menggagalkan operasi seed.
    }
  }

  // Level 3 baru muncul > 4 jam setelah breach penyelesaian.
  var resolution = null;
  for (var r = 0; r < events.length; r++) {
    if (events[r].field === "resolution_due_at") resolution = events[r];
  }

  if (resolution && Number(ticket.get("escalation_level")) >= 3) {
    try {
      var escalateAt = Math.min(nowMs, resolution.at + 4 * 60 * 60 * 1000);
      var escalation = audit.write(app, {
        tenant: ticket.get("tenant"),
        ticket: ticket,
        actor_role: "system",
        action: "escalate",
        collection_name: "tickets",
        record_id: ticket.id,
        changes: {
          level: 3,
          reason: "resolution_breach_4h",
          resolution_breach_at: String(ticket.get("resolution_breach_at") || ""),
        },
      });
      setRawDate(app, escalate, "created", escalateAt);
      app.save(escalate);
      written += 1;

      var last = parseDate(ticket.get("last_activity_at"));
      if (last && escalateAt > last.getTime()) {
        ticket.set("last_activity_at", pbDate(new Date(escalateAt)));
      }
    } catch (err) {
      // abaikan
    }
  }

  return written;
}

// ---------------------------------------------------------------------------
// Age: memundurkan record + seluruh waktu turunannya
// ---------------------------------------------------------------------------

function ageTicket(app, spec, nowMs) {
  var ticket = findRecord(app, "tickets", spec.id);
  var oldCreated = parseDate(ticket.get("created"));
  var newCreated = parseDate(spec.created);

  if (!newCreated) throw new BadRequestError("created tiket tidak valid");

  var startMs = newCreated.getTime();
  var delta = startMs - (oldCreated ? oldCreated.getTime() : startMs);
  var fields = spec.fields || {};
  var result = { id: ticket.id, ticket_no: "", comments: 0, audit: 0, approvals: 0 };

  for (var i = 0; i < TICKET_DATE_FIELDS.length; i++) {
    var field = TICKET_DATE_FIELDS[i];
    var current = text(ticket.get(field));

    if (has(fields, field)) {
      ticket.set(field, dateValue(fields[field]));
    } else if (current) {
      ticket.set(field, shiftDate(current, delta));
    }
  }

  if (has(fields, "sla_paused_minutes")) {
    ticket.set("sla_paused_minutes", Number(fields.sla_paused_minutes) || 0);
  }
  if (has(fields, "escalation_level")) {
    ticket.set("escalation_level", Number(fields.escalation_level) || 0);
  }

  if (!has(fields, "last_activity_at")) {
    var inferred = maxMs([
      parseDate(ticket.get("closed_at")) ? parseDate(ticket.get("closed_at")).getTime() : 0,
      parseDate(ticket.get("resolved_at")) ? parseDate(ticket.get("resolved_at")).getTime() : 0,
      parseDate(ticket.get("reopened_at")) ? parseDate(ticket.get("reopened_at")).getTime() : 0,
      startMs,
    ]);
    ticket.set("last_activity_at", pbDate(new Date(inferred)));
  }

  ticket.set("ticket_no", rewriteNumberDate(ticket.get("ticket_no"), startMs));

  var breach = applyBreach(app, ticket, spec.breaches, nowMs);
  var endMs = parseDate(ticket.get("last_activity_at"))
    ? parseDate(ticket.get("last_activity_at")).getTime()
    : startMs;

  if (endMs < startMs) endMs = startMs;

  ticket.setRaw("created", pbDate(newCreated));
  app.save(ticket);

  result.ticket_no = String(ticket.get("ticket_no") || "");
  result.comments = retimeComments(app, ticket.id, startMs, endMs);

  // Selaraskan `first_response_at` dengan komentar publik pertama dari staf.
  // Bila komentar itu tersebar terlalu jauh, tarik ke tenggat respons yang
  // direncanakan agar laporan respons tidak menampilkan angka palsu.
  var commentRows = records(
    app,
    "ticket_comments",
    "ticket = {:ticket}",
    "created",
    { ticket: ticket.id }
  );
  var requesterId = String(ticket.get("requester") || "");
  var plannedFirst = parseDate(ticket.get("first_response_at"));
  var firstStaff = null;

  for (var c = 0; c < commentRows.length; c++) {
    var isPublic = String(commentRows[c].get("visibility") || "") === "public";
    var author = String(commentRows[c].get("author") || "");

    if (!isPublic || !author || author === requesterId) continue;
    firstStaff = commentRows[c];
    break;
  }

  if (firstStaff) {
    var commentMs = parseDate(firstStaff.get("created"));
    var commentTime = commentMs ? commentMs.getTime() : 0;

    if (plannedFirst && commentTime && plannedFirst.getTime() < commentTime) {
      setRawDate(app, firstStaff, "created", plannedFirst.getTime());
      app.save(firstStaff);
    }

    ticket.set("first_response_at", String(firstStaff.get("created") || ""));
    ticket.set("first_response_by", String(firstStaff.get("author") || ""));
    app.save(ticket);
  }

  result.attachments = retimeAttachments(app, ticket.id, startMs, endMs);
  result.approvals = retimeApprovals(app, ticket.id, delta, startMs, endMs);
  result.audit = retimeAudit(app, ticket.id, startMs, endMs);
  retimeNotifications(app, ticket.id, delta);
  retimeMail(app, ticket.id, delta);

  var csatAfter = maxMs([
    parseDate(ticket.get("closed_at")) ? parseDate(ticket.get("closed_at")).getTime() : 0,
    parseDate(ticket.get("resolved_at")) ? parseDate(ticket.get("resolved_at")).getTime() : 0,
    endMs,
  ]);
  retimeCsat(app, ticket.id, csatAfter);

  // Samakan waktu baris audit CSAT dengan record CSAT agar timeline konsisten.
  var csatRows = records(app, "ticket_csat", "ticket = {:ticket}", "created", {
    ticket: ticket.id,
  });
  if (csatRows.length) {
    var csatAt = parseDate(csatRows[0].get("created"));
    var csatAudit = records(
      app,
      "audit_logs",
      'ticket = {:ticket} && action = "csat"',
      "created",
      { ticket: ticket.id }
    );

    for (var ca = 0; ca < csatAudit.length; ca++) {
      if (csatAt) setRawDate(app, csatAudit[ca], "created", csatAt.getTime());
      app.save(csatAudit[ca]);
    }
  }

  if (breach.events.length) {
    result.breach_audit = writeBreachAudit(app, ticket, breach.events, nowMs);
    app.save(ticket);
  }

  setUpdated(app, "tickets", ticket.id, String(ticket.get("last_activity_at") || ""));

  return result;
}

function ageSimple(app, collection, spec, dateFields, numberField) {
  var record = findRecord(app, collection, spec.id);
  var oldCreated = parseDate(record.get("created"));
  var newCreated = parseDate(spec.created);

  if (!newCreated) throw new BadRequestError("created " + collection + " tidak valid");

  var startMs = newCreated.getTime();
  var delta = startMs - (oldCreated ? oldCreated.getTime() : startMs);
  var fields = spec.fields || {};

  for (var i = 0; i < dateFields.length; i++) {
    var field = dateFields[i];
    var current = text(record.get(field));

    if (has(fields, field)) record.set(field, dateValue(fields[field]));
    else if (current) record.set(field, shiftDate(current, delta));
  }

  if (numberField) {
    record.set(numberField, rewriteNumberDate(record.get(numberField), startMs));
  }

  var endMs = startMs;
  var resolved = parseDate(record.get("resolved_at"));
  var closed = parseDate(record.get("closed_at"));
  if (resolved && resolved.getTime() > endMs) endMs = resolved.getTime();
  if (closed && closed.getTime() > endMs) endMs = closed.getTime();
  if (spec.updated) {
    var updated = parseDate(spec.updated);
    if (updated && updated.getTime() > endMs) endMs = updated.getTime();
  }

  record.setRaw("created", pbDate(newCreated));
  app.save(record);

  return { record: record, startMs: startMs, endMs: endMs, delta: delta };
}

function retimeAuditByRecord(app, collection, recordId, startMs, endMs) {
  var rows = records(
    app,
    "audit_logs",
    'collection_name = {:collection} && record_id = {:record} && ticket = ""',
    "created",
    { collection: collection, record: recordId }
  );

  for (var i = 0; i < rows.length; i++) {
    setRawDate(app, rows[i], "created", spread(i, rows.length, startMs, endMs));
    app.save(rows[i]);
  }

  return rows.length;
}

function ageProblem(app, spec, nowMs) {
  var aged = ageSimple(app, "problems", spec, PROBLEM_DATE_FIELDS, "problem_no");
  var endMs = aged.endMs || aged.startMs;

  retimeAuditByRecord(app, "problems", aged.record.id, aged.startMs, endMs);

  var links = records(app, "problem_tickets", "problem = {:problem}", "created", {
    problem: aged.record.id,
  });
  for (var i = 0; i < links.length; i++) {
    var created = parseDate(links[i].get("created"));
    if (created) setRawDate(app, links[i], "created", created.getTime() + aged.delta);
    app.save(links[i]);
  }

  setUpdated(app, "problems", aged.record.id, pbDate(new Date(endMs)));

  return { id: aged.record.id, number: String(aged.record.get("problem_no") || "") };
}

function ageIncident(app, spec, nowMs) {
  var aged = ageSimple(app, "major_incidents", spec, INCIDENT_DATE_FIELDS, "incident_no");
  var incident = aged.record;
  var startMs = aged.startMs;
  var endMs = aged.endMs || startMs;
  var resolved = parseDate(incident.get("resolved_at"));
  var closed = parseDate(incident.get("closed_at"));
  var resolvedMs = closed ? closed.getTime() : resolved ? resolved.getTime() : 0;
  var windowEnd = resolvedMs || Math.min(nowMs, startMs + 3 * 24 * 60 * 60 * 1000);
  var now = nowMs;

  var updates = records(app, "incident_updates", "incident = {:incident}", "created", {
    incident: incident.id,
  });
  for (var i = 0; i < updates.length; i++) {
    var target = distribute(i, updates.length, startMs, Math.min(now, windowEnd || now));
    setRawDate(app, updates[i], "created", target);
    app.save(updates[i]);
  }

  var links = records(
    app,
    "major_incident_tickets",
    "incident = {:incident}",
    "created",
    { incident: incident.id }
  );
  for (var j = 0; j < links.length; j++) {
    var linkCreated = parseDate(links[j].get("created"));
    if (linkCreated) setRawDate(app, links[j], "created", linkCreated.getTime() + aged.delta);
    app.save(links[j]);
  }

  retimeAuditByRecord(app, "major_incidents", incident.id, startMs, windowEnd || endMs);
  setUpdated(app, "major_incidents", incident.id, pbDate(new Date(windowEnd || endMs)));

  return { id: incident.id, number: String(incident.get("incident_no") || "") };
}

function ageArticle(app, spec, nowMs) {
  var aged = ageSimple(app, "knowledge_articles", spec, ARTICLE_DATE_FIELDS, "");
  var endMs = aged.endMs || aged.startMs;

  retimeAuditByRecord(app, "knowledge_articles", aged.record.id, aged.startMs, endMs);
  setUpdated(app, "knowledge_articles", aged.record.id, pbDate(new Date(endMs)));

  return { id: aged.record.id, title: String(aged.record.get("title") || "") };
}

function age(app, items) {
  var now = Date.now();
  var results = { tickets: [], problems: [], incidents: [], articles: [] };
  var list = items || [];

  for (var i = 0; i < list.length; i++) {
    var item = list[i] || {};
    var collection = text(item.collection) || "tickets";

    if (collection === "tickets") {
      results.tickets.push(ageTicket(app, item, now));
    } else if (collection === "problems") {
      results.problems.push(ageProblem(app, item, now));
    } else if (collection === "major_incidents") {
      results.incidents.push(ageIncident(app, item, now));
    } else if (collection === "knowledge_articles") {
      results.articles.push(ageArticle(app, item, now));
    } else {
      throw new BadRequestError("Collection tidak didukung: " + collection);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Reset data transaksional satu tenant
// ---------------------------------------------------------------------------

var RESET_TABLES = [
  "ticket_csat",
  "ticket_approvals",
  "notifications",
  "email_outbox",
  "asset_tickets",
  "problem_tickets",
  "major_incident_tickets",
  "incident_updates",
  "major_incidents",
  "knowledge_articles",
  "problems",
  "service_cis",
  "assets",
  "tickets",
  "intake_points",
  "audit_logs",
];

function reset(app, opts) {
  var tenantId = text(opts && opts.tenant);
  if (!tenantId) throw new BadRequestError("Tenant wajib dipilih");

  var tenant;
  try {
    tenant = app.findRecordById("tenants", tenantId);
  } catch (err) {
    throw new NotFoundError("Rumah sakit tidak ditemukan");
  }

  var ticketRows = records(app, "tickets", "tenant = {:tenant}", "", {
    tenant: tenantId,
  });
  var counts = {
    tenant: { id: tenant.id, name: String(tenant.get("name") || "") },
    tickets: ticketRows.length,
    comments: 0,
    attachments: 0,
  };

  // Lampiran dihapus lewat record API agar berkas di storage ikut bersih.
  // Filter relasi `ticket.tenant` tidak bisa diandalkan pada semua versi
  // PocketBase, jadi lampiran diambil per tiket.
  for (var t = 0; t < ticketRows.length; t++) {
    var ticketComments = records(
      app,
      "ticket_comments",
      "ticket = {:ticket}",
      "",
      { ticket: ticketRows[t].id }
    );
    counts.comments += ticketComments.length;

    var ticketAttachments = records(
      app,
      "ticket_attachments",
      "ticket = {:ticket}",
      "",
      { ticket: ticketRows[t].id }
    );
    counts.attachments += ticketAttachments.length;

    for (var a = 0; a < ticketAttachments.length; a++) {
      try {
        app.delete(ticketAttachments[a]);
      } catch (err) {
        // lanjut; record yatim tetap dibersihkan lewat SQL di bawah
      }
    }
  }

  counts.problems = count(app, "problems", "tenant = {:tenant}", { tenant: tenantId });
  counts.articles = count(app, "knowledge_articles", "tenant = {:tenant}", {
    tenant: tenantId,
  });
  counts.incidents = count(app, "major_incidents", "tenant = {:tenant}", {
    tenant: tenantId,
  });
  counts.assets = count(app, "assets", "tenant = {:tenant}", { tenant: tenantId });
  counts.intake_points = count(app, "intake_points", "tenant = {:tenant}", {
    tenant: tenantId,
  });

  function del(sql, params) {
    try {
      app.db().newQuery(sql).bind(params || {}).execute();
    } catch (err) {
      console.log("Seed reset gagal: " + sql + " -> " + String(err));
    }
  }

  del(
    "DELETE FROM ticket_comments WHERE ticket IN (SELECT id FROM tickets WHERE tenant = {:tenant})",
    { tenant: tenantId }
  );
  del(
    "DELETE FROM ticket_attachments WHERE ticket IN (SELECT id FROM tickets WHERE tenant = {:tenant})",
    { tenant: tenantId }
  );

  for (var i = 0; i < RESET_TABLES.length; i++) {
    del("DELETE FROM " + RESET_TABLES[i] + " WHERE tenant = {:tenant}", {
      tenant: tenantId,
    });
  }

  return { removed: counts };
}

module.exports = {
  age: age,
  reset: reset,
  RESET_TABLES: RESET_TABLES,
};
