/// <reference path="../pb_data/types.d.ts" />

// Fase 1 konsol vendor: scope akun platform (vendor) yang mengelola banyak
// rumah sakit dari satu instalasi.
//
// `users.tenant` menjadi opsional karena akun platform tidak terikat satu RS.
// Invariant "akun rumah sakit wajib punya tenant" ditegakkan hook
// onRecordValidate di main.pb.js, bukan constraint database, supaya akun
// platform tetap bisa disimpan.
//
// `users.authRule` tidak lagi mewajibkan `tenant.is_active` untuk akun
// platform. Instalasi standalone tetap menutup login platform lewat hook auth
// yang membaca TENANCY_MODE.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    users.fields.addMarshaledJSON(
      JSON.stringify([{ name: "is_platform_staff", type: "bool" }])
    );

    const tenantField = users.fields.getByName("tenant");
    if (tenantField) tenantField.required = false;

    users.authRule =
      "is_active = true && (is_platform_staff = true || tenant.is_active = true)";

    const indexes = users.indexes || [];
    let hasPlatformIndex = false;

    for (let i = 0; i < indexes.length; i++) {
      if (String(indexes[i]).indexOf("idx_users_platform_staff") >= 0) {
        hasPlatformIndex = true;
      }
    }

    if (!hasPlatformIndex) {
      indexes.push(
        "CREATE INDEX idx_users_platform_staff ON users (is_platform_staff, role, is_active)"
      );
    }

    users.indexes = indexes;
    app.save(users);

    // Audit milik akun platform tidak punya tenant. Baris seperti itu tetap
    // tidak terlihat oleh tenant mana pun karena list/view rule mewajibkan
    // `tenant = @request.auth.tenant`.
    const auditLogs = app.findCollectionByNameOrId("audit_logs");
    const auditTenant = auditLogs.fields.getByName("tenant");

    if (auditTenant) {
      auditTenant.required = false;
      app.save(auditLogs);
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    users.fields.removeByName("is_platform_staff");

    const tenantField = users.fields.getByName("tenant");
    if (tenantField) tenantField.required = true;

    users.authRule = "is_active = true && tenant.is_active = true";

    users.indexes = (users.indexes || []).filter(
      (index) => String(index).indexOf("idx_users_platform_staff") < 0
    );

    app.save(users);

    const auditLogs = app.findCollectionByNameOrId("audit_logs");
    const auditTenant = auditLogs.fields.getByName("tenant");

    if (auditTenant) {
      auditTenant.required = true;
      app.save(auditLogs);
    }
  }
);
