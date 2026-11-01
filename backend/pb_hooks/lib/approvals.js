// Helper alur approval: manajer unit -> IT Lead -> CAB (khusus Change Request
// berisiko tinggi). Semua fungsi dipanggil di dalam callback hook (VM context
// baru).
//
// Setiap tahap punya tenggat sendiri (`due_at`) yang baru dihitung saat tahap
// itu aktif, sehingga SLA approval tidak "habis" di tahap pertama.

function activeManager(app, unitId) {
  if (!unitId) return "";

  try {
    var unit = app.findRecordById("units", unitId);
    var managerId = String(unit.get("manager") || "");
    if (!managerId) return "";

    var manager = app.findRecordById("users", managerId);
    if (!manager.get("is_active")) return "";

    return managerId;
  } catch (err) {
    return "";
  }
}

function activeLeads(app, tenantId) {
  var notify = require(__hooks + "/lib/notify.js");
  return notify.activeLeads(app, tenantId);
}

function requiresCab(ticket) {
  return (
    String(ticket.get("type")) === "change_request" &&
    String(ticket.get("change_risk")) === "high"
  );
}

function plan(app, ticket) {
  var steps = [];

  if (String(ticket.get("type")) === "incident") return steps;

  var managerId = activeManager(app, String(ticket.get("unit") || ""));

  if (managerId) {
    steps.push({ step: steps.length + 1, kind: "unit_manager", approver: managerId });
  }

  steps.push({ step: steps.length + 1, kind: "it_lead", approver: "" });

  // CAB hanya masuk bila tenant punya minimal dua IT Lead aktif; dengan satu
  // lead, tahap ini mustahil diselesaikan dan justru memblokir perubahan.
  if (requiresCab(ticket)) {
    var leads = activeLeads(app, String(ticket.get("tenant") || ""));
    if (leads.length >= 2) {
      steps.push({ step: steps.length + 1, kind: "cab", approver: "" });
    }
  }

  return steps;
}

function createFlow(app, ticket, firstDueAt) {
  var steps = plan(app, ticket);
  if (!steps.length) return [];

  var collection = app.findCollectionByNameOrId("ticket_approvals");
  var created = [];

  for (var i = 0; i < steps.length; i++) {
    var record = new Record(collection);
    record.set("tenant", String(ticket.get("tenant")));
    record.set("ticket", ticket.id);
    record.set("step", steps[i].step);
    record.set("kind", steps[i].kind);
    record.set("status", "pending");
    if (steps[i].approver) record.set("approver", steps[i].approver);
    if (i === 0 && firstDueAt) record.set("due_at", firstDueAt);

    app.save(record);
    created.push(record);
  }

  return created;
}

function listSteps(app, ticketId) {
  return app.findRecordsByFilter(
    "ticket_approvals",
    "ticket = {:ticket}",
    "step",
    50,
    0,
    { ticket: ticketId }
  );
}

function firstPending(steps) {
  for (var i = 0; i < steps.length; i++) {
    if (String(steps[i].get("status")) === "pending") return steps[i];
  }
  return null;
}

function stepOfKind(steps, kind) {
  for (var i = 0; i < steps.length; i++) {
    if (String(steps[i].get("kind")) === kind) return steps[i];
  }
  return null;
}

function totalSteps(app, ticketId) {
  return listSteps(app, ticketId).length;
}

// `sla_snapshot` disimpan sebagai field JSON. Di Goja nilainya bisa berupa
// object JS, string JSON, atau byte array; ambil bentuk yang bisa diparse.
function parseSnapshot(value) {
  if (value == null) return null;

  var text = "";
  try {
    text = String(value);
  } catch (err) {
    text = "";
  }

  if (text && text.charAt(0) === "{") {
    try {
      return JSON.parse(text);
    } catch (err) {
      // lanjut ke bentuk object
    }
  }

  try {
    var json = JSON.stringify(value);
    if (json && json.charAt(0) === "{") return JSON.parse(json);
  } catch (err) {
    return null;
  }

  return null;
}

// Menghitung ulang tenggat approval untuk tahap yang baru aktif dan
// memindahkan gate SLA tiket ke tenggat tersebut.
function activateNext(app, ticket, steps) {
  var next = firstPending(steps);
  if (!next) return null;

  var snapshot = parseSnapshot(ticket.get("sla_snapshot"));
  if (!snapshot || !Number(snapshot.approval_minutes)) return next;

  var sla = require(__hooks + "/lib/sla.js");
  var tenantId = String(ticket.get("tenant") || "");
  var due = sla.computeDue(
    new Date(),
    String(ticket.get("type")),
    String(ticket.get("priority")),
    snapshot,
    sla.loadHolidays(app, tenantId)
  );

  if (!due.approval) return next;

  next.set("due_at", due.approval.toISOString());
  app.save(next);

  ticket.set("approval_due_at", due.approval.toISOString());

  if (["resolved", "closed", "in_progress"].indexOf(String(ticket.get("status"))) < 0) {
    ticket.set("next_due_at", due.approval.toISOString());
  }

  return next;
}

function notifyStep(app, ticket, step, excludeUserId) {
  var notify = require(__hooks + "/lib/notify.js");
  var tenant = String(ticket.get("tenant"));
  var label = notify.ticketLabel(ticket);

  if (!step) return;

  var kind = String(step.get("kind"));
  var exclude = String(excludeUserId || "");
  var recipients = [];

  if (kind === "it_lead" || kind === "cab") {
    recipients = activeLeads(app, tenant);
  } else {
    var approverId = String(step.get("approver") || "");
    if (approverId) recipients = [{ id: approverId }];
  }

  for (var i = 0; i < recipients.length; i++) {
    var userId = String(recipients[i].id || "");
    if (!userId || userId === exclude) continue;

    notify.create(app, {
      tenant: tenant,
      user: userId,
      ticket: ticket.id,
      type: "approval",
      title: "Permintaan menunggu persetujuan Anda",
      body: label,
    });
  }
}

module.exports = {
  activeManager: activeManager,
  activeLeads: activeLeads,
  requiresCab: requiresCab,
  plan: plan,
  createFlow: createFlow,
  listSteps: listSteps,
  firstPending: firstPending,
  stepOfKind: stepOfKind,
  totalSteps: totalSteps,
  activateNext: activateNext,
  notifyStep: notifyStep,
};
