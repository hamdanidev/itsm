/// <reference path="../pb_data/types.d.ts" />

// Aksi audit `setup` menandai pembuatan akun pertama sebuah instalasi.
// Tanpa nilai ini, audit setup harus memakai aksi `create` yang menyesatkan
// (tidak ada aktor yang membuat record lewat UI).
migrate(
  (app) => {
    const auditLogs = app.findCollectionByNameOrId("audit_logs");
    const action = auditLogs.fields.getByName("action");

    if (action) {
      const values = (action.values || []).slice();
      if (values.indexOf("setup") < 0) values.push("setup");
      action.values = values;
      app.save(auditLogs);
    }
  },
  (app) => {
    const auditLogs = app.findCollectionByNameOrId("audit_logs");
    const action = auditLogs.fields.getByName("action");

    if (action) {
      action.values = (action.values || []).filter((value) => value !== "setup");
      app.save(auditLogs);
    }
  }
);
