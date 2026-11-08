/// <reference path="../pb_data/types.d.ts" />

// Merge tiket duplikat: tiket sumber menunjuk ke tiket tujuan, lalu ditutup
// sebagai duplikat. Riwayat (komentar, lampiran, tautan) dipindahkan ke tiket
// tujuan agar diskusi tidak terpecah.
//
// Hanya route server yang menulis field ini. `merged_into` juga mencegah tiket
// yang sudah digabung menjadi tujuan penggabungan lain (tidak ada rantai).

migrate(
  (app) => {
    const tickets = app.findCollectionByNameOrId("tickets");
    const users = app.findCollectionByNameOrId("users");
    const fields = [];

    if (!tickets.fields.getByName("merged_into")) {
      fields.push({
        name: "merged_into",
        type: "relation",
        maxSelect: 1,
        collectionId: tickets.id,
      });
    }
    if (!tickets.fields.getByName("merged_at")) {
      fields.push({ name: "merged_at", type: "date" });
    }
    if (!tickets.fields.getByName("merged_by")) {
      fields.push({
        name: "merged_by",
        type: "relation",
        maxSelect: 1,
        collectionId: users.id,
      });
    }
    if (!tickets.fields.getByName("merge_reason")) {
      fields.push({ name: "merge_reason", type: "text", max: 500 });
    }

    if (fields.length) {
      tickets.fields.addMarshaledJSON(JSON.stringify(fields));
      app.save(tickets);
    }

    app
      .db()
      .newQuery(
        "CREATE INDEX IF NOT EXISTS idx_tickets_merged_into ON tickets (tenant, merged_into)"
      )
      .execute();

    const audit = app.findCollectionByNameOrId("audit_logs");
    const action = audit.fields.getByName("action");

    if (action) {
      const values = (action.values || []).slice();

      if (values.indexOf("merge") < 0) {
        values.push("merge");
        action.values = values;
        app.save(audit);
      }
    }
  },
  (app) => {
    try {
      app
        .db()
        .newQuery("DROP INDEX IF EXISTS idx_tickets_merged_into")
        .execute();
    } catch (err) {
      // index may not exist
    }

    try {
      const tickets = app.findCollectionByNameOrId("tickets");

      for (const name of [
        "merge_reason",
        "merged_by",
        "merged_at",
        "merged_into",
      ]) {
        if (tickets.fields.getByName(name)) {
          tickets.fields.removeByName(name);
        }
      }

      app.save(tickets);
    } catch (err) {
      // tickets tidak ada
    }

    try {
      const audit = app.findCollectionByNameOrId("audit_logs");
      const action = audit.fields.getByName("action");

      if (action) {
        action.values = (action.values || []).filter(
          (value) => value !== "merge"
        );
        app.save(audit);
      }
    } catch (err) {
      // audit_logs tidak ada
    }
  }
);
