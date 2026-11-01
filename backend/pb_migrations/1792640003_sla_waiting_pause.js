/// <reference path="../pb_data/types.d.ts" />

// Status `waiting` menjeda jam penyelesaian saat tiket menunggu informasi dari
// requester. `sla_paused_at` menyimpan kapan jeda dimulai dan
// `sla_paused_minutes` mengakumulasi total jeda untuk audit/reporting.
migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("tickets");
    const status = collection.fields.getByName("status");

    if (status && status.values.indexOf("waiting") < 0) {
      status.values = [
        "open",
        "assigned",
        "in_progress",
        "waiting",
        "resolved",
        "closed",
        "reopened",
      ];
    }

    if (!collection.fields.getByName("sla_paused_at")) {
      collection.fields.addMarshaledJSON(
        JSON.stringify([
          { name: "sla_paused_at", type: "date" },
          { name: "sla_paused_minutes", type: "number" },
        ])
      );
    }

    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("tickets");
    const status = collection.fields.getByName("status");

    if (status) {
      status.values = [
        "open",
        "assigned",
        "in_progress",
        "resolved",
        "closed",
        "reopened",
      ];
    }

    collection.fields.removeByName("sla_paused_at");
    collection.fields.removeByName("sla_paused_minutes");
    app.save(collection);
  }
);
