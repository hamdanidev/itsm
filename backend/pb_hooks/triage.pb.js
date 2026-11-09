// Triage tiket: koreksi prioritas/klasifikasi/layanan sebelum pekerjaan dimulai.
//
// Triage sengaja dibatasi ke status open/assigned dan belum ada approval yang
// diputuskan. Alasannya: mengubah prioritas/layanan setelah SLA berjalan atau
// setelah approval disetujui akan membuat histori dan gate SLA sulit
// dipertanggungjawabkan. Perubahan sebelum pekerjaan dimulai dapat dihitung
// ulang dengan aman.

routerAdd(
  "POST",
  "/api/itsm/tickets/{id}/triage",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var sla = require(__hooks + "/lib/sla.js");
    var audit = require(__hooks + "/lib/audit.js");
    var approvals = require(__hooks + "/lib/approvals.js");
    var constants = require(__hooks + "/lib/constants.js");

    var auth = guards.requireAuth(e);
    guards.assertStaff(auth);

    var ticket = guards.findTicket(e, e.request.pathValue("id"));
    guards.assertTicketAccess(e, ticket);

    var body = e.requestInfo().body || {};
    var reason = guards.cleanText(body.reason, 500);

    function has(key) {
      return Object.prototype.hasOwnProperty.call(body, key);
    }

    var result;

    $app.runInTransaction((txApp) => {
      var current = txApp.findRecordById("tickets", ticket.id);
      var status = String(current.get("status") || "");

      if (["open", "assigned"].indexOf(status) < 0) {
        throw new BadRequestError(
          "Triage hanya dapat dilakukan sebelum pekerjaan dimulai"
        );
      }

      if (reason.length < 5) {
        throw new BadRequestError(
          "Alasan triage wajib diisi minimal 5 karakter"
        );
      }

      var type = String(current.get("type") || "");
      var tenantId = String(current.get("tenant") || "");
      var now = new Date().toISOString();

      var previous = {
        priority: String(current.get("priority") || ""),
        impact: String(current.get("impact") || ""),
        category: String(current.get("category") || ""),
        service: String(current.get("service") || ""),
        service_item: String(current.get("service_item") || ""),
        team: String(current.get("team") || ""),
        location: String(current.get("location") || ""),
        approval_mode: String(current.get("approval_mode") || "default"),
      };

      var nextPriority =
        has("priority") && body.priority
          ? String(body.priority)
          : previous.priority;
      var nextImpact =
        has("impact") && body.impact ? String(body.impact) : previous.impact;

      if (constants.PRIORITIES.indexOf(nextPriority) < 0) {
        throw new BadRequestError("Prioritas tidak valid");
      }
      if (constants.IMPACTS.indexOf(nextImpact) < 0) {
        throw new BadRequestError("Dampak klinis tidak valid");
      }

      var nextCategory = previous.category;

      if (has("category")) {
        nextCategory = String(body.category || "");

        if (nextCategory) {
          var category = null;

          try {
            category = txApp.findRecordById("ticket_categories", nextCategory);
          } catch (err) {
            throw new BadRequestError("Kategori tidak ditemukan");
          }

          if (
            String(category.get("tenant")) !== tenantId ||
            !category.get("is_active")
          ) {
            throw new BadRequestError(
              "Kategori tidak aktif atau bukan milik rumah sakit ini"
            );
          }
        }
      }

      var nextService = previous.service;
      var nextItem = previous.service_item;

      if (has("service")) {
        nextService = String(body.service || "");
      }
      if (has("service_item")) {
        nextItem = String(body.service_item || "");
      }

      var selectedService = null;
      var selectedItem = null;

      if (nextService) {
        try {
          selectedService = txApp.findRecordById("services", nextService);
        } catch (err) {
          throw new BadRequestError("Layanan tidak ditemukan");
        }

        if (
          String(selectedService.get("tenant")) !== tenantId ||
          !selectedService.get("is_active")
        ) {
          throw new BadRequestError(
            "Layanan tidak aktif atau bukan milik rumah sakit ini"
          );
        }
      }

      if (nextItem) {
        try {
          selectedItem = txApp.findRecordById("service_items", nextItem);
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
            nextService = selectedService.id;
          } catch (err) {
            throw new BadRequestError("Layanan item tidak ditemukan");
          }
        }

        if (String(selectedItem.get("service")) !== nextService) {
          throw new BadRequestError(
            "Item layanan tidak sesuai dengan layanan yang dipilih"
          );
        }
      }

      var serviceChanged =
        nextService !== previous.service || nextItem !== previous.service_item;

      // Tim mengikuti layanan baru bila triage tidak menyebut tim secara
      // eksplisit; nilai eksplisit tetap dihormati.
      var nextTeam = previous.team;

      if (has("team")) {
        nextTeam = String(body.team || "");
      } else if (serviceChanged && selectedService) {
        nextTeam = String(selectedService.get("team") || "");
      }

      if (nextTeam && constants.TEAMS.indexOf(nextTeam) < 0) {
        throw new BadRequestError("Tim tidak valid");
      }

      if (serviceChanged) {
        var steps = approvals.listSteps(txApp, current.id);

        for (var i = 0; i < steps.length; i++) {
          if (
            String(steps[i].get("status")) !== "pending" ||
            String(steps[i].get("acted_by") || "")
          ) {
            throw new BadRequestError(
              "Layanan tidak dapat diubah setelah approval diputuskan"
            );
          }
        }

        // Hapus alur lama; alur baru dibuat setelah tiket disimpan.
        for (var j = 0; j < steps.length; j++) {
          txApp.delete(steps[j]);
        }
      }

      var approvalMode = previous.approval_mode || "default";

      if (serviceChanged) {
        if (type === "incident") {
          approvalMode = "none";
        } else if (selectedItem) {
          approvalMode = String(selectedItem.get("approval_mode") || "lead");
        } else {
          approvalMode = "default";
        }
      }

      if (type === "incident") approvalMode = "none";
      if (constants.APPROVAL_MODES.indexOf(approvalMode) < 0) {
        throw new BadRequestError("Mode approval tidak valid");
      }

      // SLA dihitung ulang dari waktu tiket dibuat, memakai policy layanan
      // baru bila ada.
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
        policy = sla.findPolicy(txApp, tenantId, type, nextPriority);
      }

      var createdText = String(current.get("created") || "");
      var createdDate = new Date(createdText.replace(" ", "T"));
      if (isNaN(createdDate.getTime())) createdDate = new Date();

      var due = sla.computeDue(
        createdDate,
        type,
        nextPriority,
        policy,
        sla.loadHolidays(txApp, tenantId),
        sla.tenantTimezone(txApp, tenantId)
      );

      var approvalStatus = String(current.get("approval_status") || "");
      if (serviceChanged) {
        approvalStatus =
          type === "incident" || approvalMode === "none"
            ? "not_required"
            : "pending";
      }

      if (has("location")) {
        current.set("location", guards.cleanText(body.location, 120));
      }

      current.set("priority", nextPriority);
      current.set("impact", nextImpact);
      current.set("category", nextCategory);
      current.set("service", nextService);
      current.set("service_item", nextItem);
      current.set("team", nextTeam);
      current.set("approval_mode", approvalMode);
      current.set("approval_status", approvalStatus);

      if (policy) current.set("sla_policy", policy.id);
      else current.set("sla_policy", "");
      current.set("sla_snapshot", due.snapshot);
      current.set("response_due_at", due.response ? due.response.toISOString() : "");
      current.set("approval_due_at", due.approval ? due.approval.toISOString() : "");
      current.set(
        "resolution_due_at",
        due.resolution ? due.resolution.toISOString() : ""
      );

      // Triage terjadi sebelum pekerjaan; breach lama tidak relevan lagi dan
      // nilainya tetap tersimpan di audit.
      current.set("response_breach_at", "");
      current.set("approval_breach_at", "");
      current.set("resolution_breach_at", "");
      current.set("response_warned_at", "");
      current.set("approval_warned_at", "");
      current.set("resolution_warned_at", "");
      current.set("escalation_level", 0);
      current.set("escalated_at", "");

      if (serviceChanged) {
        current.set("approved_by", "");
        current.set("approved_at", "");
        current.set("approval_note", "");
      }

      var nextDue = "";

      if (approvalStatus === "pending" && due.approval) {
        nextDue = due.approval.toISOString();
      } else if (type === "change_request") {
        nextDue =
          String(current.get("planned_end") || "") ||
          (due.resolution ? due.resolution.toISOString() : "");
      } else if (due.resolution) {
        nextDue = due.resolution.toISOString();
      }

      current.set("next_due_at", nextDue);
      current.set("last_activity_at", now);
      txApp.save(current);

      // Perbarui tenggat tahap approval yang masih menunggu (bila alur tidak
      // dibangun ulang).
      if (!serviceChanged && approvalStatus === "pending") {
        var pendingSteps = approvals.listSteps(txApp, current.id);

        for (var k = 0; k < pendingSteps.length; k++) {
          if (String(pendingSteps[k].get("status")) === "pending") {
            pendingSteps[k].set(
              "due_at",
              due.approval ? due.approval.toISOString() : ""
            );
            txApp.save(pendingSteps[k]);
            break;
          }
        }
      }

      if (serviceChanged && type !== "incident" && approvalMode !== "none") {
        var flow = approvals.createFlow(
          txApp,
          current,
          due.approval ? due.approval.toISOString() : "",
          approvalMode
        );

        if (flow.length) approvals.notifyStep(txApp, current, flow[0], auth.id);
      }

      var changes = {
        priority: { from: previous.priority, to: nextPriority },
        impact: { from: previous.impact, to: nextImpact },
        category: { from: previous.category, to: nextCategory },
        service: { from: previous.service, to: nextService },
        service_item: { from: previous.service_item, to: nextItem },
        team: { from: previous.team, to: nextTeam },
        location: { from: previous.location, to: String(current.get("location") || "") },
        approval_mode: { from: previous.approval_mode, to: approvalMode },
        reason: reason,
      };

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: tenantId,
        actor: auth,
        ticket: current,
        action: "triage",
        collection_name: "tickets",
        record_id: current.id,
        changes: changes,
        ip: meta.ip,
        user_agent: meta.user_agent,
      });

      result = current;
    });

    return e.json(200, {
      id: result.id,
      priority: result.get("priority"),
      impact: result.get("impact"),
      category: result.get("category"),
      service: result.get("service"),
      service_item: result.get("service_item"),
      team: result.get("team"),
      location: result.get("location"),
      approval_mode: result.get("approval_mode"),
      approval_status: result.get("approval_status"),
      response_due_at: result.get("response_due_at"),
      approval_due_at: result.get("approval_due_at"),
      resolution_due_at: result.get("resolution_due_at"),
      next_due_at: result.get("next_due_at"),
    });
  },
  $apis.requireAuth()
);
