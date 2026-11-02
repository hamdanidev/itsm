/// <reference path="../pb_data/types.d.ts" />

// Aksi audit untuk alur lupa password mandiri.

migrate(
  (app) => {
    const audit = app.findCollectionByNameOrId("audit_logs");
    const field = audit.fields.getByName("action");

    if (!field) return;

    const values = field.values || [];
    const next = values.slice();

    for (const action of ["password_reset_request", "password_reset"]) {
      if (next.indexOf(action) < 0) next.push(action);
    }

    if (next.length !== values.length) {
      field.values = next;
      app.save(audit);
    }
  },
  (app) => {
    const audit = app.findCollectionByNameOrId("audit_logs");
    const field = audit.fields.getByName("action");

    if (!field) return;

    field.values = (field.values || []).filter(
      (value) =>
        value !== "password_reset_request" && value !== "password_reset"
    );
    app.save(audit);
  }
);
