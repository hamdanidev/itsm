/// <reference path="../pb_data/types.d.ts" />

// Stage 12: SLA per tahap approval, delegasi approver, dan tahap CAB untuk
// Change Request berisiko tinggi.
//
// - due_at          : tenggat tahap, dihitung saat tahap tersebut aktif.
// - delegated_from  : approver asli sebelum didelegasikan.
// - delegated_by    : siapa yang mendelegasikan (approver sendiri atau IT Lead).
// - delegated_at    : waktu delegasi.
// - delegation_note : alasan delegasi (wajib, agar audit jelas).
// - kind = "cab"    : persetujuan kedua oleh IT Lead lain untuk CR high risk.
// - tickets.delegates: penerima delegasi yang bukan staf/manager unit, supaya
//   ia bisa membuka tiket yang harus ia setujui (API rules ikut diperluas).
//   Minimal berisi requester agar relasi tidak kosong: filter relasi kosong
//   membuat evaluasi rule error, bukan sekadar false.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const tickets = app.findCollectionByNameOrId("tickets");
    const comments = app.findCollectionByNameOrId("ticket_comments");
    const attachments = app.findCollectionByNameOrId("ticket_attachments");
    const approvals = app.findCollectionByNameOrId("ticket_approvals");

    const AUTH = '@request.auth.id != "" && @request.auth.is_active = true';
    const STAFF =
      '(@request.auth.role = "it_support" || @request.auth.role = "it_lead")';
    const TICKET_READ =
      "(requester = @request.auth.id || assignee = @request.auth.id || " +
      "unit.manager = @request.auth.id || delegates.id ?= @request.auth.id || " +
      STAFF +
      ")";
    const REL_TICKET_READ =
      "(ticket.requester = @request.auth.id || ticket.assignee = @request.auth.id || " +
      "ticket.unit.manager = @request.auth.id || ticket.delegates.id ?= @request.auth.id || " +
      STAFF +
      ")";

    // 1. Penerima delegasi pada tiket (relasi; selalu berisi minimal requester).
    if (!tickets.fields.getByName("delegates")) {
      tickets.fields.addMarshaledJSON(
        JSON.stringify([
          {
            name: "delegates",
            type: "relation",
            maxSelect: 50,
            collectionId: users.id,
          },
        ])
      );
    }

    tickets.listRule = AUTH + " && tenant = @request.auth.tenant && " + TICKET_READ;
    tickets.viewRule = tickets.listRule;
    app.save(tickets);

    // 2. Langkah approval: tenggat per tahap + jejak delegasi.
    const wanted = [
      { name: "due_at", type: "date" },
      {
        name: "delegated_from",
        type: "relation",
        maxSelect: 1,
        collectionId: users.id,
      },
      {
        name: "delegated_by",
        type: "relation",
        maxSelect: 1,
        collectionId: users.id,
      },
      { name: "delegated_at", type: "date" },
      { name: "delegation_note", type: "text", max: 2000 },
    ].filter((field) => !approvals.fields.getByName(field.name));

    if (wanted.length) {
      approvals.fields.addMarshaledJSON(JSON.stringify(wanted));
    }

    const kind = approvals.fields.getByName("kind");
    if (kind && kind.values.indexOf("cab") < 0) {
      kind.values = kind.values.concat("cab");
    }

    app.save(approvals);

    approvals.listRule = AUTH + " && tenant = @request.auth.tenant && " + REL_TICKET_READ;
    approvals.viewRule = approvals.listRule;
    app.save(approvals);

    // 3. Komentar dan lampiran tetap mengikuti akses tiket; penerima delegasi
    //    non-staf hanya melihat yang publik.
    comments.listRule =
      AUTH +
      " && ticket.tenant = @request.auth.tenant && " +
      REL_TICKET_READ +
      ' && (visibility = "public" || ' +
      STAFF +
      ")";
    comments.viewRule = comments.listRule;
    app.save(comments);

    attachments.listRule =
      AUTH +
      " && ticket.tenant = @request.auth.tenant && " +
      REL_TICKET_READ +
      ' && (visibility = "public" || ' +
      STAFF +
      ")";
    attachments.viewRule = attachments.listRule;
    app.save(attachments);

    // 4. Audit append-only punya daftar aksi tertutup; delegasi harus terdaftar
    //    agar hook bisa menulis jejaknya.
    const audit = app.findCollectionByNameOrId("audit_logs");
    const action = audit.fields.getByName("action");
    if (action && action.values.indexOf("delegate") < 0) {
      action.values = action.values.concat("delegate");
      app.save(audit);
    }

    // 5. Pastikan relasi delegates tidak kosong pada tiket lama: evaluasi filter
    //    relasi kosong error, sehingga rule akan menolak semua akses.
    const allTickets = app.findRecordsByFilter("tickets", "", "created", 0, 0);

    for (const ticket of allTickets) {
      const current = ticket.get("delegates");

      if (current && current.length) continue;

      const requester = String(ticket.get("requester") || "");
      if (!requester) continue;

      ticket.set("delegates", [requester]);
      app.save(ticket);
    }

    // 6. Tiket yang masih menunggu approval memakai tenggat tiket yang sudah ada
    //    sebagai tenggat tahap aktif, supaya SLA tidak mundur setelah upgrade.
    const pending = app.findRecordsByFilter(
      "ticket_approvals",
      'status = "pending"',
      "",
      0,
      0
    );

    for (const step of pending) {
      if (step.get("due_at")) continue;

      try {
        const ticket = app.findRecordById("tickets", step.get("ticket"));
        const due = ticket.get("approval_due_at");
        if (!due) continue;

        step.set("due_at", due);
        app.save(step);
      } catch (err) {
        // Tiket sudah tidak ada; biarkan langkah tanpa tenggat.
      }
    }
  },
  (app) => {
    const tickets = app.findCollectionByNameOrId("tickets");
    const approvals = app.findCollectionByNameOrId("ticket_approvals");
    const comments = app.findCollectionByNameOrId("ticket_comments");
    const attachments = app.findCollectionByNameOrId("ticket_attachments");

    const AUTH = '@request.auth.id != "" && @request.auth.is_active = true';
    const STAFF =
      '(@request.auth.role = "it_support" || @request.auth.role = "it_lead")';

    // Kembalikan rules ke bentuk sebelum Stage 12.
    tickets.listRule =
      AUTH +
      " && tenant = @request.auth.tenant && " +
      "(requester = @request.auth.id || assignee = @request.auth.id || " +
      "unit.manager = @request.auth.id || " +
      STAFF +
      ")";
    tickets.viewRule = tickets.listRule;

    try {
      tickets.fields.removeByName("delegates");
    } catch (err) {
      // field mungkin sudah tidak ada
    }

    app.save(tickets);

    const REL_TICKET_READ =
      "(ticket.requester = @request.auth.id || ticket.assignee = @request.auth.id || " +
      "ticket.unit.manager = @request.auth.id || " +
      STAFF +
      ")";

    comments.listRule =
      AUTH +
      " && ticket.tenant = @request.auth.tenant && " +
      REL_TICKET_READ +
      ' && (visibility = "public" || ' +
      STAFF +
      ")";
    comments.viewRule = comments.listRule;
    app.save(comments);

    attachments.listRule = comments.listRule;
    attachments.viewRule = comments.listRule;
    app.save(attachments);

    for (const field of [
      "due_at",
      "delegated_from",
      "delegated_by",
      "delegated_at",
      "delegation_note",
    ]) {
      try {
        approvals.fields.removeByName(field);
      } catch (err) {
        // field mungkin sudah tidak ada
      }
    }

    const kind = approvals.fields.getByName("kind");
    if (kind) {
      kind.values = kind.values.filter((value) => value !== "cab");
    }

    approvals.listRule = AUTH + " && tenant = @request.auth.tenant && " + REL_TICKET_READ;
    approvals.viewRule = approvals.listRule;
    app.save(approvals);

    const audit = app.findCollectionByNameOrId("audit_logs");
    const action = audit.fields.getByName("action");
    if (action) {
      action.values = action.values.filter((value) => value !== "delegate");
      app.save(audit);
    }
  }
);
