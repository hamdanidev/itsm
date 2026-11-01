/// <reference path="../pb_data/types.d.ts" />

// Notifikasi in-app per pengguna. Dibuat oleh hook server (bukan API client),
// dibaca dan ditandai dibaca oleh pemiliknya.
migrate(
  (app) => {
    const tenants = app.findCollectionByNameOrId("tenants");
    const users = app.findCollectionByNameOrId("users");
    const tickets = app.findCollectionByNameOrId("tickets");

    const AUTH =
      '@request.auth.id != "" && @request.auth.is_active = true';
    const READ =
      AUTH +
      " && user = @request.auth.id && tenant = @request.auth.tenant";

    const notifications = new Collection({
      type: "base",
      name: "notifications",
      listRule: READ,
      viewRule: READ,
      createRule: null,
      updateRule: READ,
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
          name: "user",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
        },
        {
          name: "ticket",
          type: "relation",
          maxSelect: 1,
          collectionId: tickets.id,
        },
        {
          name: "type",
          type: "select",
          required: true,
          maxSelect: 1,
          values: [
            "assigned",
            "comment",
            "status",
            "approval",
            "sla",
            "escalation",
          ],
        },
        { name: "title", type: "text", required: true, max: 200 },
        { name: "body", type: "text", max: 500 },
        { name: "is_read", type: "bool" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX idx_notifications_user_read ON notifications (user, is_read, created)",
        "CREATE INDEX idx_notifications_ticket ON notifications (ticket)",
      ],
    });

    app.save(notifications);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("notifications"));
    } catch (err) {
      // collection may not exist
    }
  }
);
