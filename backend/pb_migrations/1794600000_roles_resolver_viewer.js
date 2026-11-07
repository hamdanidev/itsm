/// <reference path="../pb_data/types.d.ts" />

// Lima role akses rumah sakit:
//   requester  -> Pemohon
//   it_support -> Staff IT (agent penuh)
//   resolver   -> Teknisi (programmer, jaringan, hardware, DBA, admin SIMRS)
//   it_lead    -> Kepala IT
//   viewer     -> Pengamat (laporan read-only)
//
// Resolver bukan agent penuh: ia hanya dapat membuka tiket yang di-assign
// kepadanya (cabang `assignee` sudah ada di rule tiket), tetapi komentar dan
// lampiran internal perlu cabang tambahan karena sebelumnya hanya `STAFF`.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const role = users.fields.getByName("role");

    if (role) {
      const values = (role.values || []).slice();
      for (const value of ["resolver", "viewer"]) {
        if (values.indexOf(value) < 0) values.push(value);
      }
      role.values = values;
      app.save(users);
    }

    const AUTH = '@request.auth.id != "" && @request.auth.is_active = true';
    const PLATFORM = "@request.auth.is_platform_staff = true";
    const STAFF =
      '(@request.auth.role = "it_support" || @request.auth.role = "it_lead")';
    const TICKET_REL_R =
      "(ticket.requester = @request.auth.id || ticket.assignee = @request.auth.id || " +
      "ticket.unit.manager = @request.auth.id || ticket.delegates.id ?= @request.auth.id || " +
      STAFF +
      ")";
    const INTERNAL =
      '(visibility = "public" || ' +
      STAFF +
      ' || (@request.auth.role = "resolver" && ticket.assignee = @request.auth.id))';

    const ticketRelRead =
      AUTH +
      " && (" +
      PLATFORM +
      " || (ticket.tenant = @request.auth.tenant && " +
      TICKET_REL_R +
      " && " +
      INTERNAL +
      "))";

    for (const name of ["ticket_comments", "ticket_attachments"]) {
      const collection = app.findCollectionByNameOrId(name);
      collection.listRule = ticketRelRead;
      collection.viewRule = ticketRelRead;
      app.save(collection);
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const role = users.fields.getByName("role");

    if (role) {
      role.values = (role.values || []).filter(
        (value) => value !== "resolver" && value !== "viewer"
      );
      app.save(users);
    }

    const AUTH = '@request.auth.id != "" && @request.auth.is_active = true';
    const PLATFORM = "@request.auth.is_platform_staff = true";
    const STAFF =
      '(@request.auth.role = "it_support" || @request.auth.role = "it_lead")';
    const TICKET_REL_R =
      "(ticket.requester = @request.auth.id || ticket.assignee = @request.auth.id || " +
      "ticket.unit.manager = @request.auth.id || ticket.delegates.id ?= @request.auth.id || " +
      STAFF +
      ")";
    const INTERNAL = '(visibility = "public" || ' + STAFF + ")";

    const ticketRelRead =
      AUTH +
      " && (" +
      PLATFORM +
      " || (ticket.tenant = @request.auth.tenant && " +
      TICKET_REL_R +
      " && " +
      INTERNAL +
      "))";

    for (const name of ["ticket_comments", "ticket_attachments"]) {
      const collection = app.findCollectionByNameOrId(name);
      collection.listRule = ticketRelRead;
      collection.viewRule = ticketRelRead;
      app.save(collection);
    }
  }
);
