/// <reference path="../pb_data/types.d.ts" />

// `next_due_at` adalah satu-satunya tenggat SLA yang masih menjadi gerbang
// pekerjaan pada tiket: approval untuk SR/CR yang belum diputuskan, lalu
// resolution (incident/SR) atau jadwal implementasi (CR). Field ini
// didenormalisasi agar daftar tiket dapat diurutkan "SLA terdekat" di SQL;
// tanpa itu Change Request (tanpa resolution SLA) akan muncul di urutan
// teratas karena nilainya kosong.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("tickets");

    if (!collection.fields.getByName("next_due_at")) {
      collection.fields.addMarshaledJSON(
        JSON.stringify([{ name: "next_due_at", type: "date" }])
      );
      app.save(collection);
    }

    const tickets = app.findRecordsByFilter("tickets", "", "created", 0, 0);

    for (const ticket of tickets) {
      const pendingApproval =
        String(ticket.getString("approval_status")) === "pending";
      const nextDue = pendingApproval
        ? ticket.getString("approval_due_at")
        : ticket.getString("resolution_due_at") ||
          ticket.getString("planned_end") ||
          ticket.getString("response_due_at");

      if (nextDue) {
        ticket.set("next_due_at", nextDue);
        app.save(ticket);
      }
    }
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("tickets");

    if (collection.fields.getByName("next_due_at")) {
      collection.fields.removeByName("next_due_at");
      app.save(collection);
    }
  }
);
