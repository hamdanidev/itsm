/// <reference path="../pb_data/types.d.ts" />

// Aksi audit `import` menandai impor massal pengguna dari CSV, agar ringkasan
// berkas (jumlah baris, berhasil, gagal) dapat ditelusuri terpisah dari
// pembuatan akun satu per satu.
migrate(
  (app) => {
    const auditLogs = app.findCollectionByNameOrId("audit_logs");
    const action = auditLogs.fields.getByName("action");

    if (action) {
      const values = (action.values || []).slice();
      if (values.indexOf("import") < 0) values.push("import");
      action.values = values;
      app.save(auditLogs);
    }
  },
  (app) => {
    const auditLogs = app.findCollectionByNameOrId("audit_logs");
    const action = auditLogs.fields.getByName("action");

    if (action) {
      action.values = (action.values || []).filter(
        (value) => value !== "import"
      );
      app.save(auditLogs);
    }
  }
);
