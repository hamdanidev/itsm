/// <reference path="../pb_data/types.d.ts" />

// Tindak lanjut QR: tautan status tiket bertoken dan CSAT untuk pelapor tamu.
//
// Tiket tamu tidak punya `requester`, sehingga tidak bisa membuka portal atau
// mengisi CSAT lewat route login. `tickets.public_token` adalah rahasia seperti
// tautan undangan: 128-bit acak, hanya dibagikan ke pelapor lewat layar sukses
// atau email konfirmasi. Backfill memakai `randomblob` agar tiket tamu yang
// sudah ada tetap mendapat tautan.
//
// `ticket_csat` diberi asal respons (`portal`/`guest`) dan nama pengirim tamu
// supaya laporan dan detail tiket bisa membedakan keduanya tanpa akun.

migrate(
  (app) => {
    const tickets = app.findCollectionByNameOrId("tickets");

    if (!tickets.fields.getByName("public_token")) {
      tickets.fields.addMarshaledJSON(
        JSON.stringify([{ name: "public_token", type: "text", max: 64 }])
      );
      app.save(tickets);
    }

    // 32 karakter hex = 128 bit acak. Tiket yang sudah ada (mis. hasil seed)
    // tetap bisa dilacak tanpa harus membuat ulang titik QR.
    app
      .db()
      .newQuery(
        "UPDATE tickets SET public_token = lower(hex(randomblob(16))) " +
          "WHERE (requester IS NULL OR requester = '') " +
          "AND (public_token IS NULL OR public_token = '')"
      )
      .execute();

    app
      .db()
      .newQuery(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_public_token " +
          "ON tickets (public_token) WHERE public_token IS NOT NULL AND public_token <> ''"
      )
      .execute();

    const csat = app.findCollectionByNameOrId("ticket_csat");

    if (!csat.fields.getByName("source")) {
      csat.fields.addMarshaledJSON(
        JSON.stringify([
          {
            name: "source",
            type: "select",
            maxSelect: 1,
            values: ["portal", "guest"],
          },
        ])
      );
    }

    if (!csat.fields.getByName("submitted_by_name")) {
      csat.fields.addMarshaledJSON(
        JSON.stringify([
          { name: "submitted_by_name", type: "text", max: 120 },
        ])
      );
    }

    app.save(csat);

    // Email konfirmasi tiket tamu memakai antrean yang sudah ada.
    const outbox = app.findCollectionByNameOrId("email_outbox");
    const template = outbox.fields.getByName("template");

    if (template) {
      const values = (template.values || []).slice();

      if (values.indexOf("guest_receipt") < 0) {
        values.push("guest_receipt");
        template.values = values;
        app.save(outbox);
      }
    }
  },
  (app) => {
    try {
      app
        .db()
        .newQuery("DROP INDEX IF EXISTS idx_tickets_public_token")
        .execute();
    } catch (err) {
      // index may not exist
    }

    try {
      const tickets = app.findCollectionByNameOrId("tickets");

      if (tickets.fields.getByName("public_token")) {
        tickets.fields.removeByName("public_token");
        app.save(tickets);
      }
    } catch (err) {
      // tickets tidak ada
    }

    try {
      const csat = app.findCollectionByNameOrId("ticket_csat");

      for (const name of ["source", "submitted_by_name"]) {
        if (csat.fields.getByName(name)) csat.fields.removeByName(name);
      }

      app.save(csat);
    } catch (err) {
      // ticket_csat tidak ada
    }

    try {
      const outbox = app.findCollectionByNameOrId("email_outbox");
      const template = outbox.fields.getByName("template");

      if (template) {
        template.values = (template.values || []).filter(
          (value) => value !== "guest_receipt"
        );
        app.save(outbox);
      }
    } catch (err) {
      // email_outbox tidak ada
    }
  }
);
