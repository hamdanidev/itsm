/// <reference path="../pb_data/types.d.ts" />

// Increment C: asset/CI register, tautan aset-tiket, service CI, dan CSAT.
//
// Semua penulisan lewat route /api/itsm/* agar nomor aset, validasi tenant,
// audit, dan aturan satu CSAT per tiket konsisten. Requester boleh membaca
// daftar aset untuk memilih aset terdampak saat membuat tiket, tetapi detail
// riwayat dan catatan aset tetap dibatasi untuk staf lewat route.

migrate(
  (app) => {
    const AUTH =
      '@request.auth.id != "" && @request.auth.is_active = true';
    const TENANT = "tenant = @request.auth.tenant";
    const PLATFORM = "@request.auth.is_platform_staff = true";
    const STAFF =
      '(@request.auth.role = "it_support" || @request.auth.role = "it_lead")';

    const timestamps = [
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ];

    const tenants = app.findCollectionByNameOrId("tenants");
    const users = app.findCollectionByNameOrId("users");
    const services = app.findCollectionByNameOrId("services");
    const units = app.findCollectionByNameOrId("units");
    const tickets = app.findCollectionByNameOrId("tickets");

    // -----------------------------------------------------------------------
    // assets
    // -----------------------------------------------------------------------
    const assets = new Collection({
      type: "base",
      name: "assets",
      // Requester perlu membaca katalog aset saat membuat tiket.
      listRule: AUTH + " && (" + PLATFORM + " || " + TENANT + ")",
      viewRule: AUTH + " && (" + PLATFORM + " || " + TENANT + ")",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "tenant",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: tenants.id,
        },
        { name: "asset_no", type: "text", required: true, max: 32 },
        { name: "name", type: "text", required: true, max: 160 },
        {
          name: "type",
          type: "select",
          required: true,
          maxSelect: 1,
          values: [
            "workstation",
            "printer",
            "server",
            "network",
            "medical_device",
            "license",
          ],
        },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["active", "maintenance", "retired"],
        },
        {
          name: "criticality",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["low", "medium", "high", "critical"],
        },
        { name: "location", type: "text", max: 120 },
        {
          name: "unit",
          type: "relation",
          maxSelect: 1,
          collectionId: units.id,
        },
        {
          name: "service",
          type: "relation",
          maxSelect: 1,
          collectionId: services.id,
        },
        {
          name: "owner",
          type: "relation",
          maxSelect: 1,
          collectionId: users.id,
        },
        { name: "warranty_end", type: "date" },
        { name: "notes", type: "text", max: 5000 },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_assets_tenant_no ON assets (tenant, asset_no)",
        "CREATE INDEX idx_assets_tenant_status ON assets (tenant, status)",
        "CREATE INDEX idx_assets_tenant_service ON assets (tenant, service)",
        "CREATE INDEX idx_assets_tenant_type ON assets (tenant, type)",
      ],
    });
    assets.fields.addMarshaledJSON(JSON.stringify(timestamps));
    app.save(assets);

    // -----------------------------------------------------------------------
    // asset_tickets
    // -----------------------------------------------------------------------
    const assetTickets = new Collection({
      type: "base",
      name: "asset_tickets",
      listRule:
        AUTH + " && (" + PLATFORM + " || (" + TENANT + " && " + STAFF + "))",
      viewRule:
        AUTH + " && (" + PLATFORM + " || (" + TENANT + " && " + STAFF + "))",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "tenant",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: tenants.id,
        },
        {
          name: "asset",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: assets.id,
        },
        {
          name: "ticket",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: tickets.id,
        },
        {
          name: "relation",
          type: "select",
          maxSelect: 1,
          values: ["affected", "caused", "related"],
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_asset_tickets_pair ON asset_tickets (asset, ticket)",
        "CREATE INDEX idx_asset_tickets_ticket ON asset_tickets (tenant, ticket)",
        "CREATE INDEX idx_asset_tickets_asset ON asset_tickets (tenant, asset)",
      ],
    });
    assetTickets.fields.addMarshaledJSON(JSON.stringify(timestamps));
    app.save(assetTickets);

    // -----------------------------------------------------------------------
    // service_cis
    // -----------------------------------------------------------------------
    const serviceCis = new Collection({
      type: "base",
      name: "service_cis",
      listRule:
        AUTH + " && (" + PLATFORM + " || (" + TENANT + " && " + STAFF + "))",
      viewRule:
        AUTH + " && (" + PLATFORM + " || (" + TENANT + " && " + STAFF + "))",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "tenant",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: tenants.id,
        },
        {
          name: "service",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: services.id,
        },
        {
          name: "asset",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: assets.id,
        },
        {
          name: "criticality",
          type: "select",
          maxSelect: 1,
          values: ["low", "medium", "high", "critical"],
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_service_cis_pair ON service_cis (service, asset)",
        "CREATE INDEX idx_service_cis_asset ON service_cis (tenant, asset)",
        "CREATE INDEX idx_service_cis_service ON service_cis (tenant, service)",
      ],
    });
    serviceCis.fields.addMarshaledJSON(JSON.stringify(timestamps));
    app.save(serviceCis);

    // -----------------------------------------------------------------------
    // ticket_csat
    // -----------------------------------------------------------------------
    const csat = new Collection({
      type: "base",
      name: "ticket_csat",
      // Dibaca/ditulis lewat route agar hanya pemilik tiket dan staf yang
      // melihat komentar CSAT. Query langsung ditutup.
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "tenant",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: tenants.id,
        },
        {
          name: "ticket",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: tickets.id,
        },
        {
          name: "score",
          type: "number",
          required: true,
          min: 1,
          max: 5,
          onlyInt: true,
        },
        { name: "comment", type: "text", max: 2000 },
        {
          name: "submitted_by",
          type: "relation",
          maxSelect: 1,
          collectionId: users.id,
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_ticket_csat_ticket ON ticket_csat (ticket)",
        "CREATE INDEX idx_ticket_csat_tenant_created ON ticket_csat (tenant, created)",
      ],
    });
    csat.fields.addMarshaledJSON(JSON.stringify(timestamps));
    app.save(csat);

    // -----------------------------------------------------------------------
    // audit: aksi aset dan CSAT
    // -----------------------------------------------------------------------
    const audit = app.findCollectionByNameOrId("audit_logs");
    const action = audit.fields.getByName("action");

    if (action) {
      const values = (action.values || []).slice();

      for (const name of [
        "asset_create",
        "asset_update",
        "asset_link",
        "asset_unlink",
        "csat",
      ]) {
        if (values.indexOf(name) < 0) values.push(name);
      }

      action.values = values;
      app.save(audit);
    }
  },
  (app) => {
    for (const name of [
      "ticket_csat",
      "service_cis",
      "asset_tickets",
      "assets",
    ]) {
      try {
        app.delete(app.findCollectionByNameOrId(name));
      } catch (err) {
        // collection may not exist
      }
    }

    try {
      const audit = app.findCollectionByNameOrId("audit_logs");
      const action = audit.fields.getByName("action");
      if (action) {
        action.values = (action.values || []).filter(
          (value) =>
            [
              "asset_create",
              "asset_update",
              "asset_link",
              "asset_unlink",
              "csat",
            ].indexOf(value) < 0
        );
        app.save(audit);
      }
    } catch (err) {
      // audit_logs tidak ada
    }
  }
);
