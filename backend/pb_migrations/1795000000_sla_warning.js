/// <reference path="../pb_data/types.d.ts" />

// Pengingat pra-SLA: penanda per fase agar notifikasi hanya dikirim sekali
// sebelum tenggat. Cron `sla_breach_scan` tetap menangani breach sesudahnya.
//
// Field `*_warned_at` juga direset ketika tenggat berubah (triage, reopen,
// tahap approval berikutnya), sehingga siklus SLA baru mendapat peringatan baru.

migrate(
  (app) => {
    const tickets = app.findCollectionByNameOrId("tickets");
    const fields = [];

    for (const name of [
      "response_warned_at",
      "approval_warned_at",
      "resolution_warned_at",
    ]) {
      if (!tickets.fields.getByName(name)) {
        fields.push({ name: name, type: "date" });
      }
    }

    if (fields.length) {
      tickets.fields.addMarshaledJSON(JSON.stringify(fields));
      app.save(tickets);
    }

    const audit = app.findCollectionByNameOrId("audit_logs");
    const action = audit.fields.getByName("action");

    if (action) {
      const values = (action.values || []).slice();

      if (values.indexOf("sla_warn") < 0) {
        values.push("sla_warn");
        action.values = values;
        app.save(audit);
      }
    }
  },
  (app) => {
    try {
      const tickets = app.findCollectionByNameOrId("tickets");

      for (const name of [
        "response_warned_at",
        "approval_warned_at",
        "resolution_warned_at",
      ]) {
        if (tickets.fields.getByName(name)) {
          tickets.fields.removeByName(name);
        }
      }

      app.save(tickets);
    } catch (err) {
      // tickets tidak ada
    }

    try {
      const audit = app.findCollectionByNameOrId("audit_logs");
      const action = audit.fields.getByName("action");

      if (action) {
        action.values = (action.values || []).filter(
          (value) => value !== "sla_warn"
        );
        app.save(audit);
      }
    } catch (err) {
      // audit_logs tidak ada
    }
  }
);
