/// <reference path="../pb_data/types.d.ts" />

// Increment D: major incident + post-incident review (PIR).
//
// Satu insiden mayor menaungi banyak tiket dan punya timeline komunikasi.
// Penulisan lewat route /api/itsm/incidents agar nomor insiden, broadcast,
// transisi status, dan audit konsisten. Requester tidak membaca detail insiden;
// hanya staf IT dan akun platform.

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
    const tickets = app.findCollectionByNameOrId("tickets");

    // -----------------------------------------------------------------------
    // major_incidents
    // -----------------------------------------------------------------------
    const incidents = new Collection({
      type: "base",
      name: "major_incidents",
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
        { name: "incident_no", type: "text", required: true, max: 32 },
        { name: "title", type: "text", required: true, max: 160 },
        { name: "description", type: "text", max: 10000 },
        {
          name: "severity",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["sev1", "sev2", "sev3"],
        },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: [
            "declared",
            "investigating",
            "mitigating",
            "monitoring",
            "resolved",
            "closed",
          ],
        },
        {
          name: "commander",
          type: "relation",
          maxSelect: 1,
          collectionId: users.id,
        },
        {
          name: "declared_by",
          type: "relation",
          maxSelect: 1,
          collectionId: users.id,
        },
        { name: "impact_summary", type: "text", max: 5000 },
        {
          name: "affected_services",
          type: "relation",
          maxSelect: 20,
          collectionId: services.id,
        },
        {
          name: "source_ticket",
          type: "relation",
          maxSelect: 1,
          collectionId: tickets.id,
        },
        { name: "resolution_summary", type: "text", max: 10000 },
        { name: "root_cause", type: "text", max: 10000 },
        { name: "pir_actions", type: "text", max: 10000 },
        { name: "pir_completed_at", type: "date" },
        {
          name: "pir_by",
          type: "relation",
          maxSelect: 1,
          collectionId: users.id,
        },
        { name: "started_at", type: "date" },
        { name: "resolved_at", type: "date" },
        { name: "closed_at", type: "date" },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_major_incidents_tenant_no ON major_incidents (tenant, incident_no)",
        "CREATE INDEX idx_major_incidents_tenant_status ON major_incidents (tenant, status, started_at)",
        "CREATE INDEX idx_major_incidents_tenant_commander ON major_incidents (tenant, commander)",
      ],
    });
    incidents.fields.addMarshaledJSON(JSON.stringify(timestamps));
    app.save(incidents);

    // -----------------------------------------------------------------------
    // incident_updates
    // -----------------------------------------------------------------------
    const updates = new Collection({
      type: "base",
      name: "incident_updates",
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
          name: "incident",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: incidents.id,
        },
        {
          name: "kind",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["update", "decision", "communication"],
        },
        {
          name: "visibility",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["internal", "public"],
        },
        { name: "body", type: "text", required: true, max: 5000 },
        {
          name: "author",
          type: "relation",
          maxSelect: 1,
          collectionId: users.id,
        },
      ],
      indexes: [
        "CREATE INDEX idx_incident_updates_incident ON incident_updates (incident, created)",
        "CREATE INDEX idx_incident_updates_tenant ON incident_updates (tenant, created)",
      ],
    });
    updates.fields.addMarshaledJSON(JSON.stringify(timestamps));
    app.save(updates);

    // -----------------------------------------------------------------------
    // major_incident_tickets
    // -----------------------------------------------------------------------
    const links = new Collection({
      type: "base",
      name: "major_incident_tickets",
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
          name: "incident",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: incidents.id,
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
          required: true,
          maxSelect: 1,
          values: ["impacted", "caused", "related"],
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_major_incident_tickets_pair ON major_incident_tickets (incident, ticket)",
        "CREATE INDEX idx_major_incident_tickets_tenant ON major_incident_tickets (tenant, ticket)",
        "CREATE INDEX idx_major_incident_tickets_incident ON major_incident_tickets (incident)",
      ],
    });
    links.fields.addMarshaledJSON(JSON.stringify(timestamps));
    app.save(links);

    // -----------------------------------------------------------------------
    // tickets.major_incident
    // -----------------------------------------------------------------------
    tickets.fields.addMarshaledJSON(
      JSON.stringify([
        {
          name: "major_incident",
          type: "relation",
          maxSelect: 1,
          collectionId: incidents.id,
        },
      ])
    );

    const ticketIndexes = tickets.indexes || [];
    if (
      ticketIndexes.indexOf(
        "CREATE INDEX idx_tickets_major_incident ON tickets (tenant, major_incident)"
      ) < 0
    ) {
      ticketIndexes.push(
        "CREATE INDEX idx_tickets_major_incident ON tickets (tenant, major_incident)"
      );
    }
    tickets.indexes = ticketIndexes;
    app.save(tickets);

    // -----------------------------------------------------------------------
    // audit: aksi insiden mayor
    // -----------------------------------------------------------------------
    const auditActions = [
      "incident_declare",
      "incident_update",
      "incident_resolve",
      "incident_close",
      "incident_link",
      "incident_pir",
    ];

    const audit = app.findCollectionByNameOrId("audit_logs");
    const action = audit.fields.getByName("action");

    if (action) {
      const values = (action.values || []).slice();

      for (const name of auditActions) {
        if (values.indexOf(name) < 0) values.push(name);
      }

      action.values = values;
      app.save(audit);
    }

    // -----------------------------------------------------------------------
    // notifikasi: tipe incident
    // -----------------------------------------------------------------------
    const notifications = app.findCollectionByNameOrId("notifications");
    const type = notifications.fields.getByName("type");

    if (type) {
      const values = (type.values || []).slice();

      if (values.indexOf("incident") < 0) values.push("incident");
      type.values = values;
      app.save(notifications);
    }
  },
  (app) => {
    try {
      const tickets = app.findCollectionByNameOrId("tickets");
      if (tickets.fields.getByName("major_incident")) {
        tickets.fields.removeByName("major_incident");
      }
      tickets.indexes = (tickets.indexes || []).filter(
        (index) => String(index).indexOf("idx_tickets_major_incident") < 0
      );
      app.save(tickets);
    } catch (err) {
      // tickets tidak ada
    }

    for (const name of [
      "major_incident_tickets",
      "incident_updates",
      "major_incidents",
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
              "incident_declare",
              "incident_update",
              "incident_resolve",
              "incident_close",
              "incident_link",
              "incident_pir",
            ].indexOf(value) < 0
        );
        app.save(audit);
      }
    } catch (err) {
      // audit_logs tidak ada
    }

    try {
      const notifications = app.findCollectionByNameOrId("notifications");
      const type = notifications.fields.getByName("type");

      if (type) {
        type.values = (type.values || []).filter(
          (value) => value !== "incident"
        );
        app.save(notifications);
      }
    } catch (err) {
      // notifications tidak ada
    }
  }
);
