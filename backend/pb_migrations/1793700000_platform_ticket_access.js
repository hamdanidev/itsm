/// <reference path="../pb_data/types.d.ts" />

// Fase 2: vendor (scope platform) sebagai resolver tiket lintas rumah sakit.
//
// Akun platform tidak punya tenant, sehingga rule lama `tenant = @request.auth.tenant`
// selalu gagal untuk mereka. Setiap rule baca yang dibutuhkan vendor diberi satu
// cabang `@request.auth.is_platform_staff = true`; cabang tenant lama dibiarkan
// apa adanya sehingga isolasi rumah sakit tidak berubah.
//
// Yang dibuka hanya READ. Semua penulisan tetap lewat route /api/itsm/* yang
// memeriksa role dan tenant per record (`guards.findTicket`), jadi vendor tidak
// bisa memindahkan data antar tenant lewat REST biasa.
//
// `users` juga membuka `is_platform_staff = true` untuk pembaca tenant: tanpa itu
// nama assignee/approver vendor tidak bisa di-expand di tiket rumah sakit.
//
// Catatan: semua string rule dibangun di dalam callback `migrate` karena callback
// migrasi dan handler hook dievaluasi di konteks VM terpisah.

migrate(
  (app) => {
    const AUTH = '@request.auth.id != "" && @request.auth.is_active = true';
    const PLATFORM = "@request.auth.is_platform_staff = true";
    const TENANT = "tenant = @request.auth.tenant";
    const STAFF =
      '(@request.auth.role = "it_support" || @request.auth.role = "it_lead")';

    const TICKET_R =
      "(requester = @request.auth.id || assignee = @request.auth.id || " +
      "unit.manager = @request.auth.id || delegates.id ?= @request.auth.id || " +
      STAFF +
      ")";

    const TICKET_REL_R =
      "(ticket.requester = @request.auth.id || ticket.assignee = @request.auth.id || " +
      "ticket.unit.manager = @request.auth.id || ticket.delegates.id ?= @request.auth.id || " +
      STAFF +
      ")";

    const ticketRead =
      AUTH + " && (" + PLATFORM + " || (" + TENANT + " && " + TICKET_R + "))";

    const ticketRelRead =
      AUTH +
      " && (" +
      PLATFORM +
      " || (ticket.tenant = @request.auth.tenant && " +
      TICKET_REL_R +
      ' && (visibility = "public" || ' +
      STAFF +
      ")))";

    const approvalRead =
      AUTH + " && (" + PLATFORM + " || (" + TENANT + " && " + TICKET_REL_R + "))";

    const tenantRead = AUTH + " && (" + PLATFORM + " || " + TENANT + ")";

    const rules = {
      tickets: ticketRead,
      ticket_comments: ticketRelRead,
      ticket_attachments: ticketRelRead,
      ticket_approvals: approvalRead,
      notifications:
        AUTH + " && user = @request.auth.id && (" + PLATFORM + " || " + TENANT + ")",
      users: AUTH + " && (" + PLATFORM + " || " + TENANT + " || is_platform_staff = true)",
      units: tenantRead,
      ticket_categories: tenantRead,
      sla_policies: tenantRead,
      holidays: tenantRead,
      tenants: AUTH + " && (" + PLATFORM + " || id = @request.auth.tenant)",
    };

    const names = Object.keys(rules);

    for (let i = 0; i < names.length; i++) {
      const collection = app.findCollectionByNameOrId(names[i]);
      collection.listRule = rules[names[i]];
      collection.viewRule = rules[names[i]];
      app.save(collection);
    }
  },
  (app) => {
    const AUTH = '@request.auth.id != "" && @request.auth.is_active = true';
    const TENANT = "tenant = @request.auth.tenant";
    const STAFF =
      '(@request.auth.role = "it_support" || @request.auth.role = "it_lead")';

    const TICKET_R =
      "(requester = @request.auth.id || assignee = @request.auth.id || " +
      "unit.manager = @request.auth.id || delegates.id ?= @request.auth.id || " +
      STAFF +
      ")";

    const TICKET_REL_R =
      "(ticket.requester = @request.auth.id || ticket.assignee = @request.auth.id || " +
      "ticket.unit.manager = @request.auth.id || ticket.delegates.id ?= @request.auth.id || " +
      STAFF +
      ")";

    const rules = {
      tickets: AUTH + " && " + TENANT + " && " + TICKET_R,
      ticket_comments:
        AUTH +
        " && ticket.tenant = @request.auth.tenant && " +
        TICKET_REL_R +
        ' && (visibility = "public" || ' +
        STAFF +
        ")",
      ticket_attachments:
        AUTH +
        " && ticket.tenant = @request.auth.tenant && " +
        TICKET_REL_R +
        ' && (visibility = "public" || ' +
        STAFF +
        ")",
      ticket_approvals: AUTH + " && " + TENANT + " && " + TICKET_REL_R,
      notifications: AUTH + " && user = @request.auth.id && " + TENANT,
      users: AUTH + " && " + TENANT,
      units: AUTH + " && " + TENANT,
      ticket_categories: AUTH + " && " + TENANT,
      sla_policies: AUTH + " && " + TENANT,
      holidays: AUTH + " && " + TENANT,
      tenants: AUTH + " && id = @request.auth.tenant",
    };

    const names = Object.keys(rules);

    for (let i = 0; i < names.length; i++) {
      const collection = app.findCollectionByNameOrId(names[i]);
      collection.listRule = rules[names[i]];
      collection.viewRule = rules[names[i]];
      app.save(collection);
    }
  }
);
