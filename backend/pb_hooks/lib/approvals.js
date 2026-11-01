// Helper alur approval dua tahap: manajer unit -> IT Lead.
// Semua fungsi dipanggil di dalam callback hook (VM context baru).

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

function plan(app, ticket) {
  var steps = [];

  if (String(ticket.get("type")) === "incident") return steps;

  var managerId = activeManager(app, String(ticket.get("unit") || ""));

  if (managerId) {
    steps.push({ step: steps.length + 1, kind: "unit_manager", approver: managerId });
  }

  steps.push({ step: steps.length + 1, kind: "it_lead", approver: "" });
  return steps;
}

function createFlow(app, ticket) {
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

function totalSteps(app, ticketId) {
  return listSteps(app, ticketId).length;
}

function notifyStep(app, ticket, step) {
  var notify = require(__hooks + "/lib/notify.js");
  var tenant = String(ticket.get("tenant"));
  var label = notify.ticketLabel(ticket);

  if (!step) return;

  if (String(step.get("kind")) === "it_lead") {
    var leads = notify.activeLeads(app, tenant);
    for (var i = 0; i < leads.length; i++) {
      notify.create(app, {
        tenant: tenant,
        user: leads[i].id,
        ticket: ticket.id,
        type: "approval",
        title: "Permintaan menunggu persetujuan Anda",
        body: label,
      });
    }
    return;
  }

  notify.create(app, {
    tenant: tenant,
    user: String(step.get("approver") || ""),
    ticket: ticket.id,
    type: "approval",
    title: "Permintaan menunggu persetujuan Anda",
    body: label,
  });
}

module.exports = {
  activeManager: activeManager,
  plan: plan,
  createFlow: createFlow,
  listSteps: listSteps,
  firstPending: firstPending,
  totalSteps: totalSteps,
  notifyStep: notifyStep,
};
