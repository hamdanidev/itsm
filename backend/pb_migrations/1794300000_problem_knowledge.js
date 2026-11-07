/// <reference path="../pb_data/types.d.ts" />

// Increment B: problem management, known error/workaround, dan knowledge base.
//
// Problem dan knowledge article ditulis lewat route /api/itsm/* (bukan collection
// API langsung) agar nomor problem, slug, audit, dan aturan publish konsisten.
// Requester hanya dapat membaca artikel yang sudah `published` dan `public`.

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
    // problems
    // -----------------------------------------------------------------------
    const problems = new Collection({
      type: "base",
      name: "problems",
      listRule: AUTH + " && (" + PLATFORM + " || (" + TENANT + " && " + STAFF + "))",
      viewRule: AUTH + " && (" + PLATFORM + " || (" + TENANT + " && " + STAFF + "))",
      // Hanya route /api/itsm/problems yang menulis; collection API ditutup.
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
        { name: "problem_no", type: "text", required: true, max: 32 },
        { name: "title", type: "text", required: true, max: 160 },
        { name: "description", type: "text", max: 10000 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["identified", "investigating", "known_error", "resolved", "closed"],
        },
        { name: "root_cause", type: "text", max: 10000 },
        { name: "workaround", type: "text", max: 10000 },
        { name: "permanent_fix", type: "text", max: 10000 },
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
        { name: "resolved_at", type: "date" },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_problems_tenant_no ON problems (tenant, problem_no)",
        "CREATE INDEX idx_problems_tenant_status ON problems (tenant, status)",
        "CREATE INDEX idx_problems_service ON problems (tenant, service)",
      ],
    });
    problems.fields.addMarshaledJSON(JSON.stringify(timestamps));
    app.save(problems);

    // -----------------------------------------------------------------------
    // problem_tickets
    // -----------------------------------------------------------------------
    const problemTickets = new Collection({
      type: "base",
      name: "problem_tickets",
      listRule: AUTH + " && (" + PLATFORM + " || (" + TENANT + " && " + STAFF + "))",
      viewRule: AUTH + " && (" + PLATFORM + " || (" + TENANT + " && " + STAFF + "))",
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
          name: "problem",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: problems.id,
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
          values: ["caused_by", "duplicate", "related"],
        },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_problem_tickets_pair ON problem_tickets (problem, ticket)",
        "CREATE INDEX idx_problem_tickets_ticket ON problem_tickets (tenant, ticket)",
      ],
    });
    problemTickets.fields.addMarshaledJSON(JSON.stringify(timestamps));
    app.save(problemTickets);

    // -----------------------------------------------------------------------
    // knowledge_articles
    // -----------------------------------------------------------------------
    const knowledge = new Collection({
      type: "base",
      name: "knowledge_articles",
      listRule:
        AUTH +
        " && (" +
        PLATFORM +
        " || (" +
        TENANT +
        ' && ((status = "published" && visibility = "public") || ' +
        STAFF +
        ")))",
      viewRule:
        AUTH +
        " && (" +
        PLATFORM +
        " || (" +
        TENANT +
        ' && ((status = "published" && visibility = "public") || ' +
        STAFF +
        ")))",
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
        { name: "title", type: "text", required: true, max: 160 },
        { name: "slug", type: "text", required: true, max: 180 },
        { name: "body", type: "text", required: true, max: 30000 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["draft", "review", "published", "retired"],
        },
        {
          name: "visibility",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["internal", "public"],
        },
        {
          name: "service",
          type: "relation",
          maxSelect: 1,
          collectionId: services.id,
        },
        {
          name: "problem",
          type: "relation",
          maxSelect: 1,
          collectionId: problems.id,
        },
        { name: "tags", type: "text", max: 500 },
        {
          name: "author",
          type: "relation",
          maxSelect: 1,
          collectionId: users.id,
        },
        {
          name: "reviewer",
          type: "relation",
          maxSelect: 1,
          collectionId: users.id,
        },
        { name: "published_at", type: "date" },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_knowledge_tenant_slug ON knowledge_articles (tenant, slug)",
        "CREATE INDEX idx_knowledge_tenant_status ON knowledge_articles (tenant, status)",
        "CREATE INDEX idx_knowledge_service ON knowledge_articles (tenant, service)",
      ],
    });
    knowledge.fields.addMarshaledJSON(JSON.stringify(timestamps));
    app.save(knowledge);

    // -----------------------------------------------------------------------
    // tickets: kaitan ke problem dan artikel pengetahuan
    // -----------------------------------------------------------------------
    tickets.fields.addMarshaledJSON(
      JSON.stringify([
        {
          name: "problem",
          type: "relation",
          maxSelect: 1,
          collectionId: problems.id,
        },
        {
          name: "kb_article",
          type: "relation",
          maxSelect: 1,
          collectionId: knowledge.id,
        },
      ])
    );

    const ticketIndexes = tickets.indexes || [];
    if (
      ticketIndexes.indexOf(
        "CREATE INDEX idx_tickets_problem ON tickets (tenant, problem)"
      ) < 0
    ) {
      ticketIndexes.push(
        "CREATE INDEX idx_tickets_problem ON tickets (tenant, problem)"
      );
    }
    tickets.indexes = ticketIndexes;
    app.save(tickets);

    // -----------------------------------------------------------------------
    // audit: aksi tautan problem/knowledge
    // -----------------------------------------------------------------------
    const audit = app.findCollectionByNameOrId("audit_logs");
    const action = audit.fields.getByName("action");

    if (action) {
      const values = (action.values || []).slice();

      for (const name of ["problem_link", "knowledge_link"]) {
        if (values.indexOf(name) < 0) values.push(name);
      }

      action.values = values;
      app.save(audit);
    }
  },
  (app) => {
    try {
      const tickets = app.findCollectionByNameOrId("tickets");
      for (const name of ["problem", "kb_article"]) {
        if (tickets.fields.getByName(name)) {
          tickets.fields.removeByName(name);
        }
      }
      tickets.indexes = (tickets.indexes || []).filter(
        (index) => String(index).indexOf("idx_tickets_problem") < 0
      );
      app.save(tickets);
    } catch (err) {
      // tickets tidak ada pada instalasi yang belum dimigrasi
    }

    for (const name of ["problem_tickets", "knowledge_articles", "problems"]) {
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
          (value) => value !== "problem_link" && value !== "knowledge_link"
        );
        app.save(audit);
      }
    } catch (err) {
      // audit_logs tidak ada
    }
  }
);
