/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const AUTH =
    '@request.auth.id != "" && @request.auth.is_active = true';
  const STAFF =
    '(@request.auth.role = "it_support" || @request.auth.role = "it_lead")';
  const LEAD = '@request.auth.role = "it_lead"';

  const timestamps = [
    { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
  ];

  function withTimestamps(fields) {
    return fields.concat(timestamps);
  }

  // -------------------------------------------------------------------------
  // tenants
  // -------------------------------------------------------------------------
  const tenants = new Collection({
    type: "base",
    name: "tenants",
    listRule: AUTH + " && id = @request.auth.tenant",
    viewRule: AUTH + " && id = @request.auth.tenant",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "name", type: "text", required: true, max: 120 },
      { name: "code", type: "text", required: true, max: 20 },
      { name: "timezone", type: "text", max: 64 },
      { name: "is_active", type: "bool" },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_tenants_code ON tenants (code)"],
  });
  tenants.fields.addMarshaledJSON(JSON.stringify(timestamps));
  app.save(tenants);

  // -------------------------------------------------------------------------
  // units
  // -------------------------------------------------------------------------
  const units = new Collection({
    type: "base",
    name: "units",
    listRule: AUTH + " && tenant = @request.auth.tenant",
    viewRule: AUTH + " && tenant = @request.auth.tenant",
    createRule: LEAD + ' && @request.body.tenant = @request.auth.tenant',
    updateRule: LEAD + " && tenant = @request.auth.tenant",
    deleteRule: null,
    fields: [
      {
        name: "tenant",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: tenants.id,
      },
      { name: "name", type: "text", required: true, max: 120 },
      { name: "code", type: "text", required: true, max: 20 },
      {
        name: "kind",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["clinical", "support", "management"],
      },
      { name: "is_active", type: "bool" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_units_tenant_code ON units (tenant, code)",
    ],
  });
  units.fields.addMarshaledJSON(JSON.stringify(timestamps));
  app.save(units);

  // -------------------------------------------------------------------------
  // users (auth) - PocketBase creates a default "users" auth collection, so
  // we extend it in place instead of trying to create a duplicate collection.
  // -------------------------------------------------------------------------
  const users = app.findCollectionByNameOrId("users");
  users.listRule = AUTH + " && tenant = @request.auth.tenant";
  users.viewRule = AUTH + " && tenant = @request.auth.tenant";
  users.createRule = null;
  users.updateRule = null;
  users.deleteRule = null;
  users.manageRule = null;
  users.authRule = "is_active = true && tenant.is_active = true";
  users.passwordAuth.enabled = true;

  users.fields.removeByName("avatar");
  const nameField = users.fields.getByName("name");
  if (nameField) {
    nameField.required = true;
    nameField.max = 120;
  }

  users.fields.addMarshaledJSON(
    JSON.stringify([
      {
        name: "tenant",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: tenants.id,
      },
      {
        name: "unit",
        type: "relation",
        maxSelect: 1,
        collectionId: units.id,
      },
      {
        name: "role",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["requester", "it_support", "it_lead"],
      },
      { name: "phone", type: "text", max: 30 },
      { name: "employee_no", type: "text", max: 50 },
      { name: "is_active", type: "bool" },
      { name: "external_id", type: "text", max: 255 },
      { name: "external_issuer", type: "text", max: 255 },
      { name: "external_groups", type: "json", maxSize: 20000 },
    ])
  );

  users.indexes = [
    "CREATE INDEX idx_users_tenant_role ON users (tenant, role, is_active)",
    "CREATE INDEX idx_users_tenant_employee ON users (tenant, employee_no)",
    "CREATE INDEX idx_users_external ON users (external_issuer, external_id)",
  ];

  app.save(users);

  // -------------------------------------------------------------------------
  // ticket_categories
  // -------------------------------------------------------------------------
  const categories = new Collection({
    type: "base",
    name: "ticket_categories",
    listRule: AUTH + " && tenant = @request.auth.tenant",
    viewRule: AUTH + " && tenant = @request.auth.tenant",
    createRule: LEAD + ' && @request.body.tenant = @request.auth.tenant',
    updateRule: LEAD + " && tenant = @request.auth.tenant",
    deleteRule: null,
    fields: [
      {
        name: "tenant",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: tenants.id,
      },
      { name: "name", type: "text", required: true, max: 120 },
      { name: "code", type: "text", required: true, max: 40 },
      {
        name: "kind",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["all", "incident", "service_request", "change_request"],
      },
      { name: "is_active", type: "bool" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_categories_tenant_code ON ticket_categories (tenant, code)",
    ],
  });
  categories.fields.addMarshaledJSON(JSON.stringify(timestamps));
  app.save(categories);

  // -------------------------------------------------------------------------
  // sla_policies
  // -------------------------------------------------------------------------
  const slaPolicies = new Collection({
    type: "base",
    name: "sla_policies",
    listRule: AUTH + " && tenant = @request.auth.tenant",
    viewRule: AUTH + " && tenant = @request.auth.tenant",
    createRule: LEAD + ' && @request.body.tenant = @request.auth.tenant',
    updateRule: LEAD + " && tenant = @request.auth.tenant",
    deleteRule: null,
    fields: [
      {
        name: "tenant",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: tenants.id,
      },
      { name: "name", type: "text", required: true, max: 120 },
      {
        name: "ticket_type",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["incident", "service_request", "change_request"],
      },
      {
        name: "priority",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["critical", "high", "normal", "low"],
      },
      { name: "response_minutes", type: "number", required: true },
      { name: "approval_minutes", type: "number" },
      { name: "resolution_minutes", type: "number" },
      {
        name: "calendar_mode",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["24x7", "business_hours"],
      },
      { name: "business_days", type: "json", maxSize: 2000 },
      { name: "business_start", type: "text", max: 5 },
      { name: "business_end", type: "text", max: 5 },
      { name: "timezone", type: "text", max: 64 },
      { name: "version", type: "number" },
      { name: "is_active", type: "bool" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_sla_tenant_type_priority ON sla_policies (tenant, ticket_type, priority)",
    ],
  });
  slaPolicies.fields.addMarshaledJSON(JSON.stringify(timestamps));
  app.save(slaPolicies);

  // -------------------------------------------------------------------------
  // holidays
  // -------------------------------------------------------------------------
  const holidays = new Collection({
    type: "base",
    name: "holidays",
    listRule: AUTH + " && tenant = @request.auth.tenant",
    viewRule: AUTH + " && tenant = @request.auth.tenant",
    createRule: LEAD + ' && @request.body.tenant = @request.auth.tenant',
    updateRule: LEAD + " && tenant = @request.auth.tenant",
    deleteRule: null,
    fields: [
      {
        name: "tenant",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: tenants.id,
      },
      { name: "date", type: "date", required: true },
      { name: "name", type: "text", required: true, max: 120 },
      { name: "is_active", type: "bool" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_holidays_tenant_date ON holidays (tenant, date)",
    ],
  });
  holidays.fields.addMarshaledJSON(JSON.stringify(timestamps));
  app.save(holidays);

  // -------------------------------------------------------------------------
  // tickets
  // -------------------------------------------------------------------------
  const ticketRead =
    AUTH +
    " && tenant = @request.auth.tenant && " +
    "(requester = @request.auth.id || assignee = @request.auth.id || " +
    STAFF +
    ")";

  const tickets = new Collection({
    type: "base",
    name: "tickets",
    listRule: ticketRead,
    viewRule: ticketRead,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "ticket_no", type: "text", required: true, max: 32 },
      {
        name: "tenant",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: tenants.id,
      },
      {
        name: "type",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["incident", "service_request", "change_request"],
      },
      { name: "title", type: "text", required: true, max: 160 },
      { name: "description", type: "text", required: true, max: 10000 },
      {
        name: "status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: [
          "open",
          "assigned",
          "in_progress",
          "resolved",
          "closed",
          "reopened",
        ],
      },
      {
        name: "source",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["web", "whatsapp", "email", "phone"],
      },
      {
        name: "impact",
        type: "select",
        required: true,
        maxSelect: 1,
        values: [
          "patient_safety",
          "clinical_workflow",
          "operational",
          "convenience",
        ],
      },
      {
        name: "priority",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["critical", "high", "normal", "low"],
      },
      { name: "priority_reason", type: "text", max: 1000 },
      {
        name: "requester",
        type: "relation",
        maxSelect: 1,
        collectionId: users.id,
      },
      {
        name: "created_by",
        type: "relation",
        maxSelect: 1,
        collectionId: users.id,
      },
      {
        name: "unit",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: units.id,
      },
      {
        name: "category",
        type: "relation",
        maxSelect: 1,
        collectionId: categories.id,
      },
      { name: "reporter_name", type: "text", max: 120 },
      { name: "reporter_contact", type: "text", max: 120 },
      { name: "patient_data_confirmed", type: "bool" },
      {
        name: "assignee",
        type: "relation",
        maxSelect: 1,
        collectionId: users.id,
      },
      { name: "assigned_at", type: "date" },
      {
        name: "assigned_by",
        type: "relation",
        maxSelect: 1,
        collectionId: users.id,
      },
      { name: "first_response_at", type: "date" },
      {
        name: "first_response_by",
        type: "relation",
        maxSelect: 1,
        collectionId: users.id,
      },
      { name: "resolved_at", type: "date" },
      {
        name: "resolved_by",
        type: "relation",
        maxSelect: 1,
        collectionId: users.id,
      },
      { name: "resolution_summary", type: "text", max: 5000 },
      {
        name: "resolution_code",
        type: "select",
        maxSelect: 1,
        values: [
          "fixed",
          "workaround",
          "duplicate",
          "not_reproducible",
          "rejected",
          "other",
        ],
      },
      { name: "closed_at", type: "date" },
      {
        name: "closed_by",
        type: "relation",
        maxSelect: 1,
        collectionId: users.id,
      },
      { name: "reopened_at", type: "date" },
      { name: "reopen_count", type: "number" },
      {
        name: "sla_policy",
        type: "relation",
        maxSelect: 1,
        collectionId: slaPolicies.id,
      },
      { name: "sla_snapshot", type: "json", maxSize: 20000 },
      { name: "response_due_at", type: "date" },
      { name: "approval_due_at", type: "date" },
      { name: "resolution_due_at", type: "date" },
      { name: "response_breach_at", type: "date" },
      { name: "approval_breach_at", type: "date" },
      { name: "resolution_breach_at", type: "date" },
      { name: "escalation_level", type: "number" },
      { name: "escalated_at", type: "date" },
      {
        name: "approval_status",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["not_required", "pending", "approved", "rejected"],
      },
      {
        name: "approved_by",
        type: "relation",
        maxSelect: 1,
        collectionId: users.id,
      },
      { name: "approved_at", type: "date" },
      { name: "approval_note", type: "text", max: 2000 },
      {
        name: "change_risk",
        type: "select",
        maxSelect: 1,
        values: ["low", "medium", "high"],
      },
      { name: "implementation_plan", type: "text", max: 10000 },
      { name: "rollback_plan", type: "text", max: 10000 },
      { name: "planned_start", type: "date" },
      { name: "planned_end", type: "date" },
      { name: "actual_start", type: "date" },
      { name: "actual_end", type: "date" },
      {
        name: "change_outcome",
        type: "select",
        maxSelect: 1,
        values: ["successful", "failed", "rolled_back", "partial"],
      },
      { name: "last_activity_at", type: "date" },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_tickets_tenant_no ON tickets (tenant, ticket_no)",
      "CREATE INDEX idx_tickets_queue ON tickets (tenant, status, priority)",
      "CREATE INDEX idx_tickets_assignee ON tickets (tenant, assignee, status)",
      "CREATE INDEX idx_tickets_requester ON tickets (tenant, requester, created)",
      "CREATE INDEX idx_tickets_unit ON tickets (tenant, unit, status)",
      "CREATE INDEX idx_tickets_response_due ON tickets (status, response_due_at)",
      "CREATE INDEX idx_tickets_resolution_due ON tickets (status, resolution_due_at)",
    ],
  });
  tickets.fields.addMarshaledJSON(JSON.stringify(timestamps));
  app.save(tickets);

  // -------------------------------------------------------------------------
  // ticket_comments
  // -------------------------------------------------------------------------
  const commentRead =
    AUTH +
    " && ticket.tenant = @request.auth.tenant && " +
    "(ticket.requester = @request.auth.id || ticket.assignee = @request.auth.id || " +
    STAFF +
    ') && (visibility = "public" || ' +
    STAFF +
    ")";

  const comments = new Collection({
    type: "base",
    name: "ticket_comments",
    listRule: commentRead,
    viewRule: commentRead,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      {
        name: "ticket",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: tickets.id,
      },
      {
        name: "author",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: users.id,
      },
      { name: "body", type: "text", required: true, max: 5000 },
      {
        name: "visibility",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["public", "internal"],
      },
    ],
    indexes: [
      "CREATE INDEX idx_comments_ticket_created ON ticket_comments (ticket, created)",
    ],
  });
  comments.fields.addMarshaledJSON(JSON.stringify(timestamps));
  app.save(comments);

  // -------------------------------------------------------------------------
  // ticket_attachments
  // -------------------------------------------------------------------------
  const attachmentRead =
    AUTH +
    " && ticket.tenant = @request.auth.tenant && " +
    "(ticket.requester = @request.auth.id || ticket.assignee = @request.auth.id || " +
    STAFF +
    ') && (visibility = "public" || ' +
    STAFF +
    ")";

  const attachments = new Collection({
    type: "base",
    name: "ticket_attachments",
    listRule: attachmentRead,
    viewRule: attachmentRead,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      {
        name: "ticket",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: tickets.id,
      },
      {
        name: "comment",
        type: "relation",
        maxSelect: 1,
        collectionId: comments.id,
      },
      {
        name: "uploader",
        type: "relation",
        required: true,
        maxSelect: 1,
        collectionId: users.id,
      },
      {
        name: "file",
        type: "file",
        required: true,
        maxSelect: 1,
        maxSize: 10485760,
        protected: true,
        mimeTypes: [
          "application/pdf",
          "image/png",
          "image/jpeg",
          "image/webp",
          "text/plain",
        ],
      },
      { name: "original_name", type: "text", max: 255 },
      { name: "mime", type: "text", max: 120 },
      { name: "size", type: "number" },
      {
        name: "visibility",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["public", "internal"],
      },
    ],
    indexes: [
      "CREATE INDEX idx_attachments_ticket ON ticket_attachments (ticket, created)",
    ],
  });
  attachments.fields.addMarshaledJSON(JSON.stringify(timestamps));
  app.save(attachments);

  // -------------------------------------------------------------------------
  // audit_logs (append-only)
  // -------------------------------------------------------------------------
  const auditRead =
    AUTH +
    ' && @request.auth.role = "it_lead" && tenant = @request.auth.tenant';

  const auditLogs = new Collection({
    type: "base",
    name: "audit_logs",
    listRule: auditRead,
    viewRule: auditRead,
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
        maxSelect: 1,
        collectionId: tickets.id,
      },
      {
        name: "actor",
        type: "relation",
        maxSelect: 1,
        collectionId: users.id,
      },
      { name: "actor_role", type: "text", max: 30 },
      {
        name: "action",
        type: "select",
        required: true,
        maxSelect: 1,
        values: [
          "create",
          "update",
          "transition",
          "assign",
          "approve",
          "reject",
          "comment",
          "attachment",
          "login",
          "sla_breach",
          "escalate",
        ],
      },
      { name: "collection_name", type: "text", max: 80 },
      { name: "record_id", type: "text", max: 40 },
      { name: "changes", type: "json", maxSize: 200000 },
      { name: "ip", type: "text", max: 64 },
      { name: "user_agent", type: "text", max: 500 },
    ],
    indexes: [
      "CREATE INDEX idx_audit_tenant_created ON audit_logs (tenant, created)",
      "CREATE INDEX idx_audit_ticket_created ON audit_logs (ticket, created)",
    ],
  });
  auditLogs.fields.addMarshaledJSON(JSON.stringify(timestamps));
  app.save(auditLogs);
}, (app) => {
  const names = [
    "audit_logs",
    "ticket_attachments",
    "ticket_comments",
    "tickets",
    "holidays",
    "sla_policies",
    "ticket_categories",
    "units",
    "tenants",
  ];

  for (const name of names) {
    try {
      app.delete(app.findCollectionByNameOrId(name));
    } catch (err) {
      // collection may not exist
    }
  }
});
