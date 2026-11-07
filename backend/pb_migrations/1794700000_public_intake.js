/// <reference path="../pb_data/types.d.ts" />

// Kanal intake publik: titik QR per unit dan penanda kanal pada tiket.
//
// Tiket dari QR tidak punya `requester` (pengguna tamu), tetapi `unit` wajib,
// jadi unit diambil dari titik QR — bukan dari body request yang bisa dipalsukan.
// `uploader` pada lampiran dibuat opsional agar lampiran tamu bisa disimpan.
//
// Koleksi `intake_points` hanya ditulis lewat route server (rule null); IT Lead
// mengelolanya dari Pengaturan > Titik QR.

migrate(
  (app) => {
    const tenants = app.findCollectionByNameOrId("tenants");
    const users = app.findCollectionByNameOrId("users");
    const units = app.findCollectionByNameOrId("units");
    const tickets = app.findCollectionByNameOrId("tickets");

    const timestamps = [
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ];

    // -----------------------------------------------------------------------
    // intake_points
    // -----------------------------------------------------------------------
    const intakePoints = new Collection({
      type: "base",
      name: "intake_points",
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
        { name: "name", type: "text", required: true, max: 120 },
        {
          name: "unit",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: units.id,
        },
        { name: "location", type: "text", max: 120 },
        { name: "token", type: "text", required: true, max: 64 },
        { name: "is_active", type: "bool" },
        { name: "expires_at", type: "date" },
        { name: "max_per_hour", type: "number" },
        { name: "last_used_at", type: "date" },
        {
          name: "created_by",
          type: "relation",
          maxSelect: 1,
          collectionId: users.id,
        },
      ],
    });

    intakePoints.fields.addMarshaledJSON(JSON.stringify(timestamps));
    app.save(intakePoints);

    app
      .db()
      .newQuery(
        "CREATE UNIQUE INDEX idx_intake_points_token ON intake_points (token)"
      )
      .execute();
    app
      .db()
      .newQuery(
        "CREATE INDEX idx_intake_points_tenant_active ON intake_points (tenant, is_active)"
      )
      .execute();

    // -----------------------------------------------------------------------
    // tickets.intake_channel / intake_ref
    // -----------------------------------------------------------------------
    const ticketFields = [];

    if (!tickets.fields.getByName("intake_channel")) {
      ticketFields.push({
        name: "intake_channel",
        type: "select",
        maxSelect: 1,
        values: ["web", "qr", "email", "telegram", "whatsapp", "manual"],
      });
    }

    if (!tickets.fields.getByName("intake_ref")) {
      ticketFields.push({ name: "intake_ref", type: "text", max: 120 });
    }

    if (ticketFields.length) {
      tickets.fields.addMarshaledJSON(JSON.stringify(ticketFields));
      app.save(tickets);
    }

    app
      .db()
      .newQuery(
        "CREATE INDEX idx_tickets_intake_ref ON tickets (tenant, intake_ref)"
      )
      .execute();

    // -----------------------------------------------------------------------
    // Lampiran tamu tidak punya akun pengunggah.
    // -----------------------------------------------------------------------
    const attachments = app.findCollectionByNameOrId("ticket_attachments");
    const uploader = attachments.fields.getByName("uploader");

    if (uploader) {
      uploader.required = false;
      app.save(attachments);
    }
  },
  (app) => {
    try {
      const tickets = app.findCollectionByNameOrId("tickets");
      for (const name of ["intake_channel", "intake_ref"]) {
        if (tickets.fields.getByName(name)) {
          tickets.fields.removeByName(name);
        }
      }
      tickets.indexes = (tickets.indexes || []).filter(
        (index) => String(index).indexOf("idx_tickets_intake_ref") < 0
      );
      app.save(tickets);
    } catch (err) {
      // tickets tidak ada pada instalasi yang belum dimigrasi
    }

    try {
      app.delete(app.findCollectionByNameOrId("intake_points"));
    } catch (err) {
      // collection may not exist
    }

    try {
      const attachments = app.findCollectionByNameOrId("ticket_attachments");
      const uploader = attachments.fields.getByName("uploader");
      if (uploader) {
        uploader.required = true;
        app.save(attachments);
      }
    } catch (err) {
      // best effort
    }
  }
);
