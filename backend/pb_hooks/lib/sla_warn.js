// Pengingat sebelum SLA breach.
//
// Cron `sla_breach_scan` hanya menandai tiket setelah tenggat lewat. Modul ini
// memindai tiket yang tenggatnya tinggal <= 30 menit dan mengirim satu
// peringatan per fase (respons, approval, penyelesaian). Penanda
// `*_warned_at` mencegah notifikasi berulang setiap 5 menit.
//
// Peringatan dikirim ke assignee; bila belum ada assignee, ke Kepala IT.
// Untuk fase approval, penerima mengikuti approver tahap yang sedang aktif.

var WARN_MINUTES = 30;

function pbDate(ms) {
  return new Date(ms).toISOString().replace("T", " ");
}

function parseMs(value) {
  if (value == null || String(value) === "") return 0;

  var ms = new Date(String(value)).getTime();
  return isNaN(ms) ? 0 : ms;
}

function minutesUntil(due, nowMs) {
  var ms = parseMs(due);
  if (!ms) return 0;

  var diff = ms - nowMs;
  if (diff <= 0) return 0;

  return Math.max(1, Math.round(diff / 60000));
}

function pushUnique(list, seen, id) {
  var value = String(id || "");
  if (!value || seen[value]) return;

  seen[value] = true;
  list.push(value);
}

function recipientsFor(app, ticket, phase) {
  var notify = require(__hooks + "/lib/notify.js");
  var tenant = String(ticket.get("tenant") || "");
  var list = [];
  var seen = {};

  if (phase.key === "approval") {
    var approvals = require(__hooks + "/lib/approvals.js");
    var step = approvals.firstPending(approvals.listSteps(app, ticket.id));

    if (step) {
      var kind = String(step.get("kind") || "");

      if (kind === "unit_manager") {
        pushUnique(list, seen, step.get("approver"));
      } else {
        var alerts = notify.approvalAlerts(app, tenant);
        for (var ai = 0; ai < alerts.length; ai++) {
          pushUnique(list, seen, alerts[ai].id);
        }
      }
    }

    if (!list.length) {
      var approvalLeads = notify.activeLeads(app, tenant);
      for (var al = 0; al < approvalLeads.length; al++) {
        pushUnique(list, seen, approvalLeads[al].id);
      }
    }

    return list;
  }

  var assignee = String(ticket.get("assignee") || "");

  if (assignee) {
    pushUnique(list, seen, assignee);
    return list;
  }

  var leads = notify.activeLeads(app, tenant);
  for (var i = 0; i < leads.length; i++) {
    pushUnique(list, seen, leads[i].id);
  }

  return list;
}

function scan(app, options) {
  var nowMs = Number(options && options.now_ms) || Date.now();
  var windowMinutes =
    Number(options && options.window_minutes) || WARN_MINUTES;
  var now = pbDate(nowMs);
  var cutoff = pbDate(nowMs + windowMinutes * 60 * 1000);

  var phases = [
    {
      key: "response",
      field: "response_due_at",
      warned: "response_warned_at",
      breach: "response_breach_at",
      title: "SLA respons hampir lewat",
      extra: 'first_response_at = ""',
      skipWaiting: false,
    },
    {
      key: "approval",
      field: "approval_due_at",
      warned: "approval_warned_at",
      breach: "approval_breach_at",
      title: "Batas approval hampir lewat",
      extra: 'approval_status = "pending"',
      skipWaiting: false,
    },
    {
      key: "resolution",
      field: "resolution_due_at",
      warned: "resolution_warned_at",
      breach: "resolution_breach_at",
      title: "SLA penyelesaian hampir lewat",
      extra: 'approval_status != "pending"',
      skipWaiting: true,
    },
  ];

  var audit = require(__hooks + "/lib/audit.js");
  var notify = require(__hooks + "/lib/notify.js");
  var summary = { warned: 0, by_phase: {} };

  for (var p = 0; p < phases.length; p++) {
    var phase = phases[p];
    var filter =
      "status != 'closed' && status != 'resolved' && " +
      (phase.skipWaiting ? "status != 'waiting' && " : "") +
      (phase.extra ? phase.extra + " && " : "") +
      phase.field +
      " != '' && " +
      phase.warned +
      " = '' && " +
      phase.breach +
      " = '' && " +
      phase.field +
      " > {:now} && " +
      phase.field +
      " <= {:cutoff}";

    var rows = app.findRecordsByFilter(
      "tickets",
      filter,
      phase.field,
      200,
      0,
      { now: now, cutoff: cutoff }
    );

    var count = 0;

    for (var i = 0; i < rows.length; i++) {
      var rowId = rows[i].id;
      var currentPhase = phase;

      app.runInTransaction(function (txApp) {
        var ticket = txApp.findRecordById("tickets", rowId);
        var status = String(ticket.get("status") || "");

        if (status === "closed" || status === "resolved") return;
        if (currentPhase.skipWaiting && status === "waiting") return;
        if (String(ticket.get(currentPhase.warned) || "")) return;
        if (String(ticket.get(currentPhase.breach) || "")) return;

        if (
          currentPhase.key === "response" &&
          String(ticket.get("first_response_at") || "")
        ) {
          return;
        }
        if (
          currentPhase.key === "approval" &&
          String(ticket.get("approval_status") || "") !== "pending"
        ) {
          return;
        }
        if (
          currentPhase.key === "resolution" &&
          String(ticket.get("approval_status") || "") === "pending"
        ) {
          return;
        }

        var due = ticket.get(currentPhase.field);
        var minutes = minutesUntil(due, nowMs);
        if (!minutes) return;

        ticket.set(currentPhase.warned, now);
        txApp.save(ticket);

        audit.write(txApp, {
          tenant: ticket.get("tenant"),
          ticket: ticket,
          action: "sla_warn",
          collection_name: "tickets",
          record_id: ticket.id,
          changes: {
            field: currentPhase.field,
            minutes: minutes,
            due_at: String(due || ""),
          },
        });

        var recipients = recipientsFor(txApp, ticket, currentPhase);
        var label = notify.ticketLabel(ticket);

        for (var r = 0; r < recipients.length; r++) {
          notify.create(txApp, {
            tenant: String(ticket.get("tenant")),
            user: recipients[r],
            ticket: ticket.id,
            type: "sla",
            title: currentPhase.title,
            body: label + " · tersisa " + minutes + " menit",
          });
        }

        count += 1;
      });
    }

    summary.by_phase[phase.key] = count;
    summary.warned += count;
  }

  return summary;
}

module.exports = {
  WARN_MINUTES: WARN_MINUTES,
  scan: scan,
};
