cronAdd("sla_breach_scan", "*/5 * * * *", () => {
  var audit = require(__hooks + "/lib/audit.js");
  var now = new DateTime().string();

  function scan(dueField, breachField, level, skipWaiting) {
    while (true) {
      var filter =
        "status != 'closed' && status != 'resolved' && " +
        (skipWaiting ? "status != 'waiting' && " : "") +
        dueField +
        " != '' && " +
        breachField +
        " = '' && " +
        dueField +
        " <= {:now}";

      var rows = $app.findRecordsByFilter(
        "tickets",
        filter,
        dueField,
        200,
        0,
        { now: now }
      );

      if (rows.length === 0) break;

      rows.forEach(function (row) {
        $app.runInTransaction(function (txApp) {
          var ticket = txApp.findRecordById("tickets", row.id);
          var existing = ticket.get(breachField);

          // A zero PocketBase date is an object and is truthy in Goja.
          if (existing && String(existing).length > 0) return;
          if (skipWaiting && String(ticket.get("status")) === "waiting") return;

          ticket.set(breachField, now);
          ticket.set(
            "escalation_level",
            Math.max(Number(ticket.get("escalation_level")) || 0, level)
          );

          var escalated = ticket.get("escalated_at");
          if (!escalated || String(escalated).length === 0) {
            ticket.set("escalated_at", now);
          }

          txApp.save(ticket);

          audit.write(txApp, {
            tenant: ticket.get("tenant"),
            ticket: ticket,
            action: "sla_breach",
            collection_name: "tickets",
            record_id: ticket.id,
            changes: { field: dueField, level: level },
          });

          var notify = require(__hooks + "/lib/notify.js");
          var notifyTenant = String(ticket.get("tenant"));
          var notifyLabel = notify.ticketLabel(ticket);
          var notifyTitle =
            level >= 2
              ? "SLA penyelesaian terlewati"
              : "SLA respons/approval terlewati";
          var notifyAssignee = String(ticket.get("assignee") || "");
          var notifiedUsers = {};

          if (notifyAssignee) {
            notify.create(txApp, {
              tenant: notifyTenant,
              user: notifyAssignee,
              ticket: ticket.id,
              type: "sla",
              title: notifyTitle,
              body: notifyLabel,
            });
            notifiedUsers[notifyAssignee] = true;
          }

          var breachLeads = notify.activeLeads(txApp, notifyTenant);
          for (var bi = 0; bi < breachLeads.length; bi++) {
            if (notifiedUsers[breachLeads[bi].id]) continue;
            notifiedUsers[breachLeads[bi].id] = true;

            notify.create(txApp, {
              tenant: notifyTenant,
              user: breachLeads[bi].id,
              ticket: ticket.id,
              type: "sla",
              title: notifyTitle,
              body: notifyLabel,
            });
          }
        });
      });
    }
  }

  // Tiket yang menunggu requester tidak dihitung breach; jam penyelesaiannya
  // dijeda dan digeser saat pekerjaan dilanjutkan.
  scan("response_due_at", "response_breach_at", 1, false);
  scan("approval_due_at", "approval_breach_at", 1, false);
  scan("resolution_due_at", "resolution_breach_at", 2, true);

  // Eskalasi berjenjang: breach penyelesaian yang belum ditangani selama 4 jam
  // naik ke Level 3 agar terlihat IT Lead (badge + timeline + audit).
  function escalateOverdue() {
    var threshold = new Date(Date.now() - 4 * 60 * 60 * 1000)
      .toISOString()
      .replace("T", " ");

    while (true) {
      var rows = $app.findRecordsByFilter(
        "tickets",
        "status != 'closed' && status != 'resolved' && status != 'waiting' && " +
          "resolution_breach_at != '' && resolution_breach_at <= {:threshold} && " +
          "escalation_level < 3",
        "resolution_breach_at",
        200,
        0,
        { threshold: threshold }
      );

      if (rows.length === 0) break;

      rows.forEach(function (row) {
        $app.runInTransaction(function (txApp) {
          var ticket = txApp.findRecordById("tickets", row.id);
          if (Number(ticket.get("escalation_level")) >= 3) return;

          ticket.set("escalation_level", 3);
          ticket.set("escalated_at", now);
          txApp.save(ticket);

          audit.write(txApp, {
            tenant: ticket.get("tenant"),
            ticket: ticket,
            action: "escalate",
            collection_name: "tickets",
            record_id: ticket.id,
            changes: {
              level: 3,
              reason: "resolution_breach_4h",
              resolution_breach_at: String(ticket.get("resolution_breach_at")),
            },
          });

          var escNotify = require(__hooks + "/lib/notify.js");
          var escTenant = String(ticket.get("tenant"));
          var escLeads = escNotify.activeLeads(txApp, escTenant);
          var escLabel = escNotify.ticketLabel(ticket);

          for (var ei = 0; ei < escLeads.length; ei++) {
            escNotify.create(txApp, {
              tenant: escTenant,
              user: escLeads[ei].id,
              ticket: ticket.id,
              type: "escalation",
              title: "Eskalasi Level 3",
              body: escLabel + " · breach penyelesaian > 4 jam",
            });
          }
        });
      });
    }
  }

  escalateOverdue();
});
