/// <reference path="../pb_data/types.d.ts" />

// Antrean tim: teknisi dapat melihat tiket yang menjadi bagian timnya, bukan
// hanya tiket yang sudah di-assign kepadanya.
//
// Tim disimpan sebagai select `users.team`, `tickets.team`, dan `services.team`.
// Tiket mewarisi tim dari layanan saat dibuat; triage dapat mengoreksinya.
// Visibilitas tim sengaja hanya untuk role `resolver`; Staff IT dan Kepala IT
// sudah melihat seluruh tenant.
migrate(
  (app) => {
    const TEAMS = [
      "service_desk",
      "application",
      "network",
      "hardware",
      "database",
      "biomedical",
      "other",
    ];

    function addTeamField(collectionName) {
      const collection = app.findCollectionByNameOrId(collectionName);

      if (!collection.fields.getByName("team")) {
        collection.fields.addMarshaledJSON(
          JSON.stringify([
            {
              name: "team",
              type: "select",
              maxSelect: 1,
              values: TEAMS,
            },
          ])
        );
        app.save(collection);
      }
    }

    addTeamField("users");
    addTeamField("tickets");
    addTeamField("services");

    const AUTH = '@request.auth.id != "" && @request.auth.is_active = true';
    const PLATFORM = "@request.auth.is_platform_staff = true";
    const TENANT = "tenant = @request.auth.tenant";
    const STAFF =
      '(@request.auth.role = "it_support" || @request.auth.role = "it_lead")';
    const TEAM =
      '(team != "" && team = @request.auth.team && @request.auth.role = "resolver")';
    const TICKET_REL_TEAM =
      '(ticket.team != "" && ticket.team = @request.auth.team && @request.auth.role = "resolver")';
    const TICKET_R =
      "(requester = @request.auth.id || assignee = @request.auth.id || " +
      "unit.manager = @request.auth.id || delegates.id ?= @request.auth.id || " +
      STAFF +
      " || " +
      TEAM +
      ")";
    const TICKET_REL_R =
      "(ticket.requester = @request.auth.id || ticket.assignee = @request.auth.id || " +
      "ticket.unit.manager = @request.auth.id || ticket.delegates.id ?= @request.auth.id || " +
      STAFF +
      " || " +
      TICKET_REL_TEAM +
      ")";
    const INTERNAL =
      '(visibility = "public" || ' +
      STAFF +
      ' || (@request.auth.role = "resolver" && ticket.assignee = @request.auth.id))';

    const rules = {
      tickets: AUTH + " && (" + PLATFORM + " || (" + TENANT + " && " + TICKET_R + "))",
      ticket_comments:
        AUTH +
        " && (" +
        PLATFORM +
        " || (ticket.tenant = @request.auth.tenant && " +
        TICKET_REL_R +
        " && " +
        INTERNAL +
        "))",
      ticket_attachments:
        AUTH +
        " && (" +
        PLATFORM +
        " || (ticket.tenant = @request.auth.tenant && " +
        TICKET_REL_R +
        " && " +
        INTERNAL +
        "))",
      ticket_approvals:
        AUTH +
        " && (" +
        PLATFORM +
        " || (" +
        TENANT +
        " && " +
        TICKET_REL_R +
        "))",
    };

    for (const name of Object.keys(rules)) {
      const collection = app.findCollectionByNameOrId(name);
      collection.listRule = rules[name];
      collection.viewRule = rules[name];
      app.save(collection);
    }
  },
  (app) => {
    for (const name of ["users", "tickets", "services"]) {
      const collection = app.findCollectionByNameOrId(name);

      if (collection.fields.getByName("team")) {
        collection.fields.removeByName("team");
        app.save(collection);
      }
    }

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
    const INTERNAL =
      '(visibility = "public" || ' +
      STAFF +
      ' || (@request.auth.role = "resolver" && ticket.assignee = @request.auth.id))';

    const rules = {
      tickets: AUTH + " && (" + PLATFORM + " || (" + TENANT + " && " + TICKET_R + "))",
      ticket_comments:
        AUTH +
        " && (" +
        PLATFORM +
        " || (ticket.tenant = @request.auth.tenant && " +
        TICKET_REL_R +
        " && " +
        INTERNAL +
        "))",
      ticket_attachments:
        AUTH +
        " && (" +
        PLATFORM +
        " || (ticket.tenant = @request.auth.tenant && " +
        TICKET_REL_R +
        " && " +
        INTERNAL +
        "))",
      ticket_approvals:
        AUTH +
        " && (" +
        PLATFORM +
        " || (" +
        TENANT +
        " && " +
        TICKET_REL_R +
        "))",
    };

    for (const name of Object.keys(rules)) {
      const collection = app.findCollectionByNameOrId(name);
      collection.listRule = rules[name];
      collection.viewRule = rules[name];
      app.save(collection);
    }
  }
);
