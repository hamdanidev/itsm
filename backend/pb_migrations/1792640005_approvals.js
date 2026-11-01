/// <reference path="../pb_data/types.d.ts" />

// Approval dua tahap: manajer unit pemohon -> IT Lead.
// Langkah disimpan di ticket_approvals agar riwayat tiap tahap auditable.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const tenants = app.findCollectionByNameOrId("tenants");
    const tickets = app.findCollectionByNameOrId("tickets");
    const comments = app.findCollectionByNameOrId("ticket_comments");
    const attachments = app.findCollectionByNameOrId("ticket_attachments");
    const units = app.findCollectionByNameOrId("units");

    const AUTH =
      '@request.auth.id != "" && @request.auth.is_active = true';
    const STAFF =
      '(@request.auth.role = "it_support" || @request.auth.role = "it_lead")';

    // 1. Manajer unit (approver tahap pertama).
    if (!units.fields.getByName("manager")) {
      units.fields.addMarshaledJSON(
        JSON.stringify([
          {
            name: "manager",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
          },
        ])
      );
      app.save(units);
    }

    // 2. Manajer unit boleh melihat tiket unit yang dia kelola.
    tickets.listRule =
      AUTH +
      " && tenant = @request.auth.tenant && " +
      "(requester = @request.auth.id || assignee = @request.auth.id || " +
      "unit.manager = @request.auth.id || " +
      STAFF +
      ")";
    tickets.viewRule = tickets.listRule;
    app.save(tickets);

    comments.listRule =
      AUTH +
      " && ticket.tenant = @request.auth.tenant && " +
      "(ticket.requester = @request.auth.id || ticket.assignee = @request.auth.id || " +
      "ticket.unit.manager = @request.auth.id || " +
      STAFF +
      ') && (visibility = "public" || ' +
      STAFF +
      ")";
    comments.viewRule = comments.listRule;
    app.save(comments);

    attachments.listRule =
      AUTH +
      " && ticket.tenant = @request.auth.tenant && " +
      "(ticket.requester = @request.auth.id || ticket.assignee = @request.auth.id || " +
      "ticket.unit.manager = @request.auth.id || " +
      STAFF +
      ') && (visibility = "public" || ' +
      STAFF +
      ")";
    attachments.viewRule = attachments.listRule;
    app.save(attachments);

    // 3. Tabel langkah approval.
    const approvals = new Collection({
      type: "base",
      name: "ticket_approvals",
      listRule:
        AUTH +
        " && tenant = @request.auth.tenant && " +
        "(ticket.requester = @request.auth.id || ticket.assignee = @request.auth.id || " +
        "ticket.unit.manager = @request.auth.id || " +
        STAFF +
        ")",
      viewRule:
        AUTH +
        " && tenant = @request.auth.tenant && " +
        "(ticket.requester = @request.auth.id || ticket.assignee = @request.auth.id || " +
        "ticket.unit.manager = @request.auth.id || " +
        STAFF +
        ")",
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
          required: true,
          maxSelect: 1,
          collectionId: tickets.id,
        },
        { name: "step", type: "number", required: true },
        {
          name: "kind",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["unit_manager", "it_lead"],
        },
        {
          name: "approver",
          type: "relation",
          maxSelect: 1,
          collectionId: users.id,
        },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["pending", "approved", "rejected"],
        },
        { name: "note", type: "text", max: 2000 },
        {
          name: "acted_by",
          type: "relation",
          maxSelect: 1,
          collectionId: users.id,
        },
        { name: "acted_at", type: "date" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX idx_ticket_approvals_ticket_step ON ticket_approvals (ticket, step)",
      ],
    });

    app.save(approvals);

    // 4. Backfill tiket lama agar tetap bisa di-approve lewat UI baru.
    const existing = app.findRecordsByFilter(
      "tickets",
      'type != "incident"',
      "",
      0,
      0
    );

    for (const ticket of existing) {
      const approvalStatus = String(ticket.get("approval_status") || "");

      if (!approvalStatus || approvalStatus === "not_required") continue;

      const already = app.findRecordsByFilter(
        "ticket_approvals",
        "ticket = {:ticket}",
        "",
        1,
        0,
        { ticket: ticket.id }
      );

      if (already.length) continue;

      const record = new Record(approvals);
      record.set("tenant", ticket.get("tenant"));
      record.set("ticket", ticket.id);
      record.set("step", 1);
      record.set("kind", "it_lead");
      record.set(
        "status",
        approvalStatus === "approved"
          ? "approved"
          : approvalStatus === "rejected"
            ? "rejected"
            : "pending"
      );

      if (ticket.get("approved_by")) {
        record.set("approver", ticket.get("approved_by"));
      }

      if (approvalStatus !== "pending") {
        record.set("acted_by", ticket.get("approved_by") || "");
        record.set("acted_at", ticket.get("approved_at") || "");
        record.set("note", ticket.get("approval_note") || "");
      }

      app.save(record);
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId("ticket_approvals"));
    } catch (err) {
      // collection may not exist
    }

    const units = app.findCollectionByNameOrId("units");
    units.fields.removeByName("manager");
    app.save(units);
  }
);
