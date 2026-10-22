cronAdd("sla_breach_scan", "*/5 * * * *", () => {
  var audit = require(__hooks + "/lib/audit.js");
  var now = new DateTime().string();

  function scan(dueField, breachField, level) {
    while (true) {
      var rows = $app.findRecordsByFilter(
        "tickets",
        "status != 'closed' && status != 'resolved' && " +
          dueField +
          " != '' && " +
          breachField +
          " = '' && " +
          dueField +
          " <= {:now}",
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
        });
      });
    }
  }

  scan("response_due_at", "response_breach_at", 1);
  scan("approval_due_at", "approval_breach_at", 1);
  scan("resolution_due_at", "resolution_breach_at", 2);
});
