routerAdd(
  "POST",
  "/api/itsm/tickets",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var sla = require(__hooks + "/lib/sla.js");
    var audit = require(__hooks + "/lib/audit.js");
    var constants = require(__hooks + "/lib/constants.js");

    var auth = guards.requireAuth(e);
    var tenantId = String(auth.get("tenant") || "");
    var unitId = String(auth.get("unit") || "");
    var body = e.requestInfo().body || {};
    var authStaff = guards.isStaff(auth);

    if (!tenantId) throw new BadRequestError("User has no tenant");
    if (!unitId) throw new BadRequestError("User has no unit");

    var type = String(body.type || "");
    if (constants.TICKET_TYPES.indexOf(type) < 0) {
      throw new BadRequestError("Invalid ticket type");
    }

    var source = String(body.source || "web");
    if (constants.SOURCES.indexOf(source) < 0) {
      throw new BadRequestError("Invalid ticket source");
    }

    var requestedForId = String(body.requested_for || "");
    if (requestedForId && !authStaff) {
      throw new ForbiddenError("Hanya staf IT yang dapat membuat tiket atas nama pengguna lain");
    }

    var serviceId = String(body.service || "");
    var serviceItemId = String(body.service_item || "");
    var assetId = String(body.asset_id || body.asset || "");
    var location = guards.cleanText(body.location, 120);

    var title = guards.cleanText(body.title, 160);
    var description = guards.cleanText(body.description, 10000);
    var impact = String(body.impact || "");

    if (title.length < 5) {
      throw new BadRequestError("Title must be at least 5 characters");
    }
    if (description.length < 10) {
      throw new BadRequestError("Description must be at least 10 characters");
    }
    if (constants.IMPACTS.indexOf(impact) < 0) {
      throw new BadRequestError("Invalid clinical impact");
    }

    var confirmed =
      body.patient_data_confirmed === true ||
      body.patient_data_confirmed === "true";
    if (!confirmed) {
      throw new BadRequestError(
        "You must confirm that this ticket contains no patient identifiers"
      );
    }

    var priority = sla.priorityFromImpact(impact);
    var prefix = {
      incident: "INC",
      service_request: "SR",
      change_request: "CHG",
    }[type];
    var stamp = new Date(Date.now() + 7 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
    var ticketNo =
      prefix +
      "-" +
      stamp +
      "-" +
      $security.randomStringWithAlphabet(
        6,
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
      );

    var categoryId = String(body.category || "");
    var changeRisk = String(body.change_risk || "");
    var plannedStart = guards.optionalDate(
      body.planned_start,
      "planned_start"
    );
    var plannedEnd = guards.optionalDate(body.planned_end, "planned_end");

    if (
      changeRisk &&
      ["low", "medium", "high"].indexOf(changeRisk) < 0
    ) {
      throw new BadRequestError("Invalid change risk");
    }
    if (plannedStart && plannedEnd && plannedEnd <= plannedStart) {
      throw new BadRequestError("planned_end must be after planned_start");
    }

    var ticket;
    var due;
    var linkedAssetId = "";

    $app.runInTransaction((txApp) => {
      if (categoryId) {
        try {
          var category = txApp.findRecordById(
            "ticket_categories",
            categoryId
          );
          if (
            String(category.get("tenant")) !== tenantId ||
            !category.get("is_active")
          ) {
            throw new Error("invalid category");
          }
        } catch (err) {
          throw new BadRequestError("Invalid ticket category");
        }
      }

      // Pemohon sebenarnya: default diri sendiri, atau pengguna lain bila staf
      // mencatat tiket walk-up/telepon atas nama mereka.
      var requesterId = auth.id;
      var ticketUnitId = unitId;

      if (requestedForId) {
        var targetUser = null;

        try {
          targetUser = txApp.findRecordById("users", requestedForId);
        } catch (err) {
          throw new BadRequestError("Pengguna tujuan tidak ditemukan");
        }

        if (!targetUser.get("is_active")) {
          throw new BadRequestError("Pengguna tujuan tidak aktif");
        }
        if (String(targetUser.get("tenant")) !== tenantId) {
          throw new BadRequestError("Pengguna tujuan harus dari rumah sakit yang sama");
        }

        requesterId = targetUser.id;
        ticketUnitId = String(targetUser.get("unit") || "") || unitId;
      }

      if (!ticketUnitId) {
        throw new BadRequestError("Unit pemohon belum ditentukan");
      }

      // Layanan dan item katalog. Item harus milik layanan yang dipilih.
      var selectedService = null;
      var selectedItem = null;

      if (serviceId) {
        try {
          selectedService = txApp.findRecordById("services", serviceId);
        } catch (err) {
          throw new BadRequestError("Layanan tidak ditemukan");
        }

        if (
          String(selectedService.get("tenant")) !== tenantId ||
          !selectedService.get("is_active")
        ) {
          throw new BadRequestError("Layanan tidak aktif atau bukan milik rumah sakit ini");
        }
      }

      if (serviceItemId) {
        try {
          selectedItem = txApp.findRecordById("service_items", serviceItemId);
        } catch (err) {
          throw new BadRequestError("Item layanan tidak ditemukan");
        }

        if (
          String(selectedItem.get("tenant")) !== tenantId ||
          !selectedItem.get("is_active")
        ) {
          throw new BadRequestError(
            "Item layanan tidak aktif atau bukan milik rumah sakit ini"
          );
        }

        if (!selectedService) {
          try {
            selectedService = txApp.findRecordById(
              "services",
              String(selectedItem.get("service"))
            );
            serviceId = selectedService.id;
          } catch (err) {
            throw new BadRequestError("Layanan item tidak ditemukan");
          }
        }

        if (String(selectedItem.get("service")) !== serviceId) {
          throw new BadRequestError("Item layanan tidak sesuai dengan layanan yang dipilih");
        }
      }

      var selectedAsset = null;
      if (assetId) {
        try {
          selectedAsset = txApp.findRecordById("assets", assetId);
        } catch (err) {
          throw new BadRequestError("Aset tidak ditemukan");
        }

        if (String(selectedAsset.get("tenant")) !== tenantId) {
          throw new BadRequestError("Aset harus milik rumah sakit yang sama");
        }
        if (String(selectedAsset.get("status")) === "retired") {
          throw new BadRequestError("Aset sudah dinonaktifkan");
        }
      }

      // Mode approval: incident selalu tanpa approval; request/change mengikuti
      // item layanan, atau perilaku default bila tiket tidak memakai katalog.
      var approvalMode = "default";

      if (type === "incident") {
        approvalMode = "none";
      } else if (selectedItem) {
        approvalMode = String(selectedItem.get("approval_mode") || "lead");
      }

      if (constants.APPROVAL_MODES.indexOf(approvalMode) < 0) {
        throw new BadRequestError("Mode approval tidak valid");
      }

      // SLA: item -> layanan -> policy tipe x prioritas.
      var policy = null;

      if (selectedItem && selectedItem.get("sla_policy")) {
        try {
          policy = txApp.findRecordById(
            "sla_policies",
            String(selectedItem.get("sla_policy"))
          );
          if (String(policy.get("tenant")) !== tenantId || !policy.get("is_active")) {
            policy = null;
          }
        } catch (err) {
          policy = null;
        }
      }

      if (!policy && selectedService && selectedService.get("default_sla")) {
        try {
          policy = txApp.findRecordById(
            "sla_policies",
            String(selectedService.get("default_sla"))
          );
          if (String(policy.get("tenant")) !== tenantId || !policy.get("is_active")) {
            policy = null;
          }
        } catch (err) {
          policy = null;
        }
      }

      if (!policy) {
        policy = sla.findPolicy(txApp, tenantId, type, priority);
      }

      var holidays = sla.loadHolidays(txApp, tenantId);
      due = sla.computeDue(new Date(), type, priority, policy, holidays);

      var collection = txApp.findCollectionByNameOrId("tickets");
      ticket = new Record(collection);
      ticket.set("ticket_no", ticketNo);
      ticket.set("tenant", tenantId);
      ticket.set("type", type);
      ticket.set("title", title);
      ticket.set("description", description);
      ticket.set("status", "open");
      ticket.set("source", source);
      ticket.set("impact", impact);
      ticket.set("priority", priority);
      ticket.set("requester", requesterId);
      ticket.set("requested_for", requesterId);
      ticket.set("created_by", auth.id);
      ticket.set("unit", ticketUnitId);
      // Relasi delegates dipakai juga untuk penerima delegasi approval; isi
      // minimal requester agar filter relasi selalu bisa dievaluasi.
      ticket.set(
        "delegates",
        requesterId === auth.id ? [auth.id] : [requesterId, auth.id]
      );
      ticket.set("patient_data_confirmed", true);
      ticket.set("approval_mode", approvalMode);
      ticket.set(
        "approval_status",
        type === "incident" || approvalMode === "none"
          ? "not_required"
          : "pending"
      );
      ticket.set("last_activity_at", new Date().toISOString());

      if (categoryId) ticket.set("category", categoryId);
      if (serviceId) ticket.set("service", serviceId);
      if (selectedItem) ticket.set("service_item", selectedItem.id);
      // Tim tiket mewarisi tim layanan agar langsung masuk antrean yang tepat.
      if (selectedService && selectedService.get("team")) {
        ticket.set("team", String(selectedService.get("team")));
      }
      if (location) ticket.set("location", location);
      if (body.reporter_name) {
        ticket.set("reporter_name", guards.cleanText(body.reporter_name, 120));
      }
      if (body.reporter_contact) {
        ticket.set(
          "reporter_contact",
          guards.cleanText(body.reporter_contact, 120)
        );
      }
      if (changeRisk) ticket.set("change_risk", changeRisk);
      if (plannedStart) ticket.set("planned_start", plannedStart);
      if (plannedEnd) ticket.set("planned_end", plannedEnd);
      if (body.implementation_plan) {
        ticket.set(
          "implementation_plan",
          guards.cleanText(body.implementation_plan, 10000)
        );
      }
      if (body.rollback_plan) {
        ticket.set("rollback_plan", guards.cleanText(body.rollback_plan, 10000));
      }

      if (policy) ticket.set("sla_policy", policy.id);
      if (due.response) ticket.set("response_due_at", due.response.toISOString());
      if (due.approval) ticket.set("approval_due_at", due.approval.toISOString());
      if (due.resolution) {
        ticket.set("resolution_due_at", due.resolution.toISOString());
      }

      // SLA gate yang masih berlaku: approval untuk SR/CR, resolution untuk
      // incident. Dipakai untuk pengurutan "SLA terdekat" tanpa perlu
      // mengurutkan tiga kolom tanggal yang bisa kosong.
      var nextDue =
        type === "incident"
          ? due.resolution
          : due.approval || due.resolution;
      if (nextDue) ticket.set("next_due_at", nextDue.toISOString());

      ticket.set("sla_snapshot", due.snapshot);

      txApp.save(ticket);

      if (selectedAsset) {
        var assetLib = require(__hooks + "/lib/assets.js");
        assetLib.linkTicket(txApp, selectedAsset, ticket, "affected");
        linkedAssetId = selectedAsset.id;
      }

      if (type !== "incident" && approvalMode !== "none") {
        var approvals = require(__hooks + "/lib/approvals.js");
        var flow = approvals.createFlow(
          txApp,
          ticket,
          due.approval ? due.approval.toISOString() : "",
          approvalMode
        );

        if (flow.length) {
          approvals.notifyStep(txApp, ticket, flow[0]);
        }
      }

      if (priority === "critical") {
        var notify = require(__hooks + "/lib/notify.js");
        // Lead rumah sakit + lead vendor, karena vendor menangani semua RS.
        var leads = notify.approvalAlerts(txApp, tenantId);

        for (var i = 0; i < leads.length; i++) {
          notify.create(txApp, {
            tenant: tenantId,
            user: leads[i].id,
            ticket: ticket.id,
            actor: auth.id,
            type: "sla",
            title: "Tiket kritis baru",
            body: ticketNo + " · " + title,
          });
        }
      }

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: tenantId,
        actor: auth,
        ticket: ticket,
        action: "create",
        collection_name: "tickets",
        record_id: ticket.id,
        changes: {
          type: type,
          impact: impact,
          priority: priority,
          source: source,
          service: serviceId || "",
          service_item: selectedItem ? selectedItem.id : "",
          team: String(ticket.get("team") || ""),
          asset: selectedAsset ? selectedAsset.id : "",
          approval_mode: approvalMode,
          requested_for: requesterId,
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });
    });

    return e.json(201, {
      id: ticket.id,
      ticket_no: ticket.get("ticket_no"),
      status: ticket.get("status"),
      priority: ticket.get("priority"),
      source: ticket.get("source"),
      service: ticket.get("service"),
      service_item: ticket.get("service_item"),
      team: ticket.get("team"),
      asset: linkedAssetId,
      requested_for: ticket.get("requested_for"),
      approval_mode: ticket.get("approval_mode"),
      approval_status: ticket.get("approval_status"),
      response_due_at: ticket.get("response_due_at"),
      approval_due_at: ticket.get("approval_due_at"),
      resolution_due_at: ticket.get("resolution_due_at"),
    });
  },
  $apis.requireAuth()
);
