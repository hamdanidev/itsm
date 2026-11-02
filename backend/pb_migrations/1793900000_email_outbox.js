/// <reference path="../pb_data/types.d.ts" />

// Antrean email transaksional. Hook server menulis baris `queued`, lalu cron
// `email_dispatch` mengirimnya lewat SMTP dan menandai `sent`/`failed`.
//
// Koleksi ini tidak punya API rule: hanya hook dan superuser (lewat Admin UI)
// yang bisa membacanya, karena isinya dapat memuat tautan tiket internal.
//
// `users.email_opt_out` adalah preferensi penerima: false/kosong berarti email
// notifikasi aktif. Undangan dan reset password tetap dikirim karena bagian
// dari onboarding akun.

migrate(
  (app) => {
    const tenants = app.findCollectionByNameOrId("tenants");
    const users = app.findCollectionByNameOrId("users");
    const tickets = app.findCollectionByNameOrId("tickets");

    if (!users.fields.getByName("email_opt_out")) {
      users.fields.addMarshaledJSON(
        JSON.stringify([{ name: "email_opt_out", type: "bool" }])
      );
      app.save(users);
    }

    const outbox = new Collection({
      type: "base",
      name: "email_outbox",
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "tenant",
          type: "relation",
          maxSelect: 1,
          collectionId: tenants.id,
        },
        {
          name: "user",
          type: "relation",
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
          name: "to",
          type: "email",
          required: true,
          exceptDomains: [],
          onlyDomains: [],
        },
        { name: "recipient_name", type: "text", max: 200 },
        { name: "subject", type: "text", required: true, max: 300 },
        { name: "html", type: "text", max: 200000 },
        { name: "text", type: "text", max: 200000 },
        {
          name: "template",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["invitation", "password_reset", "notification"],
        },
        { name: "event", type: "text", max: 50 },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["queued", "sent", "failed"],
        },
        { name: "attempts", type: "number", min: 0, max: 99 },
        { name: "next_attempt_at", type: "date" },
        { name: "sent_at", type: "date" },
        { name: "last_error", type: "text", max: 1000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX idx_email_outbox_queue ON email_outbox (status, next_attempt_at, created)",
        "CREATE INDEX idx_email_outbox_tenant ON email_outbox (tenant, created)",
        "CREATE INDEX idx_email_outbox_user ON email_outbox (user, created)",
      ],
    });

    app.save(outbox);
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("email_outbox"));
    } catch (err) {
      // collection may not exist
    }

    const users = app.findCollectionByNameOrId("users");

    if (users.fields.getByName("email_opt_out")) {
      users.fields.removeByName("email_opt_out");
      app.save(users);
    }
  }
);
