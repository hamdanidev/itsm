/// <reference path="../pb_data/types.d.ts" />

// Laporan SLA terjadwal per rumah sakit.
//
// Satu jadwal per tenant: `off`, `weekly` (Senin 07:00 WIB), atau `monthly`
// (tanggal 1, 07:00 WIB). Cron `report_schedule_scan` mengirim ringkasan ke
// seluruh Kepala IT aktif lalu menghitung jadwal berikutnya.
//
// Laporan PDF tidak disimpan di server: halaman Laporan menyediakan Cetak/PDF
// lewat dialog cetak browser.

migrate(
  (app) => {
    const tenants = app.findCollectionByNameOrId("tenants");
    const fields = [];

    if (!tenants.fields.getByName("report_frequency")) {
      fields.push({
        name: "report_frequency",
        type: "select",
        maxSelect: 1,
        values: ["off", "weekly", "monthly"],
      });
    }
    if (!tenants.fields.getByName("report_next_at")) {
      fields.push({ name: "report_next_at", type: "date" });
    }
    if (!tenants.fields.getByName("report_last_sent_at")) {
      fields.push({ name: "report_last_sent_at", type: "date" });
    }

    if (fields.length) {
      tenants.fields.addMarshaledJSON(JSON.stringify(fields));
      app.save(tenants);
    }

    const outbox = app.findCollectionByNameOrId("email_outbox");
    const template = outbox.fields.getByName("template");

    if (template) {
      const values = (template.values || []).slice();

      if (values.indexOf("report") < 0) {
        values.push("report");
        template.values = values;
        app.save(outbox);
      }
    }

    const audit = app.findCollectionByNameOrId("audit_logs");
    const action = audit.fields.getByName("action");

    if (action) {
      const values = (action.values || []).slice();

      if (values.indexOf("report_schedule") < 0) {
        values.push("report_schedule");
        action.values = values;
        app.save(audit);
      }
    }
  },
  (app) => {
    try {
      const tenants = app.findCollectionByNameOrId("tenants");

      for (const name of [
        "report_last_sent_at",
        "report_next_at",
        "report_frequency",
      ]) {
        if (tenants.fields.getByName(name)) {
          tenants.fields.removeByName(name);
        }
      }

      app.save(tenants);
    } catch (err) {
      // tenants tidak ada
    }

    try {
      const outbox = app.findCollectionByNameOrId("email_outbox");
      const template = outbox.fields.getByName("template");

      if (template) {
        template.values = (template.values || []).filter(
          (value) => value !== "report"
        );
        app.save(outbox);
      }
    } catch (err) {
      // email_outbox tidak ada
    }

    try {
      const audit = app.findCollectionByNameOrId("audit_logs");
      const action = audit.fields.getByName("action");

      if (action) {
        action.values = (action.values || []).filter(
          (value) => value !== "report_schedule"
        );
        app.save(audit);
      }
    } catch (err) {
      // audit_logs tidak ada
    }
  }
);
