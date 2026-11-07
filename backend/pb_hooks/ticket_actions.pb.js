// NOTE: PocketBase hook callbacks run in a fresh VM context, so helper
// functions/constants declared at file top-level are not available inside
// router callbacks. Keep shared values inside each handler.

// ---------------------------------------------------------------------------
// Assignment
// ---------------------------------------------------------------------------
routerAdd(
  "POST",
  "/api/itsm/tickets/{id}/assign",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var ASSIGNEE_ROLES = ["it_support", "it_lead", "resolver"];

    var auth = guards.requireAuth(e);
    var staff = guards.isStaff(auth);
    var resolver = guards.isResolver(auth);

    if (!staff && !resolver) {
      throw new ForbiddenError("Staff or resolver role required");
    }

    var ticket = guards.findTicket(e, e.request.pathValue("id"));
    guards.assertTicketAccess(e, ticket);

    var body = e.requestInfo().body || {};
    var assigneeId = guards.cleanText(body.assignee, 32);
    var lead = guards.isLead(auth);

    if (resolver) {
      if (!assigneeId || assigneeId !== auth.id) {
        throw new ForbiddenError(
          "Teknisi hanya dapat mengambil tiket untuk dirinya sendiri"
        );
      }

      var currentAssignee = String(ticket.get("assignee") || "");
      if (currentAssignee && currentAssignee !== auth.id) {
        throw new ForbiddenError("Tiket sudah ditugaskan ke staf lain");
      }
      if (!currentAssignee && !guards.canClaimTeamTicket(auth, ticket)) {
        throw new ForbiddenError("Tiket bukan bagian dari antrean tim Anda");
      }
    }

    if (assigneeId && !lead && assigneeId !== auth.id) {
      throw new ForbiddenError(
        "Staff IT hanya dapat menugaskan tiket ke dirinya sendiri"
      );
    }

    var result;

    $app.runInTransaction((txApp) => {
      var current = txApp.findRecordById("tickets", ticket.id);
      var status = String(current.get("status") || "");
      var previousAssignee = String(current.get("assignee") || "");

      if (status === "resolved" || status === "closed") {
        throw new BadRequestError(
          "Tiket yang sudah selesai atau ditutup harus dibuka kembali sebelum di-assign"
        );
      }

      if (!assigneeId) {
        if (!lead) {
          throw new ForbiddenError(
            "Hanya Kepala IT yang dapat melepas assignment"
          );
        }
        if (status === "in_progress") {
          throw new BadRequestError(
            "Tiket sedang dikerjakan. Selesaikan atau buka kembali sebelum melepas assignment"
          );
        }

        current.set("assignee", "");
        current.set("assigned_at", "");
        current.set("assigned_by", "");
        if (status === "assigned") current.set("status", "open");
      } else {
        var assignee;
        try {
          assignee = txApp.findRecordById("users", assigneeId);
        } catch (err) {
          throw new BadRequestError("Assignee tidak ditemukan");
        }

        // Assignee boleh staf rumah sakit pemilik tiket, atau staf vendor
        // (scope platform) yang melayani semua rumah sakit.
        var ticketTenant = String(current.get("tenant") || "");
        var assigneePlatform = Boolean(assignee.get("is_platform_staff"));

        if (
          !assigneePlatform &&
          String(assignee.get("tenant") || "") !== ticketTenant
        ) {
          throw new BadRequestError("Assignee berada di tenant yang berbeda");
        }
        if (!assignee.get("is_active")) {
          throw new BadRequestError("Assignee tidak aktif");
        }
        if (ASSIGNEE_ROLES.indexOf(String(assignee.get("role"))) < 0) {
          throw new BadRequestError(
            "Assignee harus memiliki role Staff IT, Teknisi, atau Kepala IT"
          );
        }

        current.set("assignee", assignee.id);
        current.set("assigned_at", new Date().toISOString());
        current.set("assigned_by", auth.id);
        if (status === "open" || status === "reopened") {
          current.set("status", "assigned");
        }
      }

      current.set("last_activity_at", new Date().toISOString());
      txApp.save(current);

      if (assigneeId) {
        var notify = require(__hooks + "/lib/notify.js");
        var notifyTenant = String(current.get("tenant"));
        var requesterId = String(current.get("requester") || "");
        var notifyLabel = notify.ticketLabel(current);
        var notified = {};

        notify.create(txApp, {
          tenant: notifyTenant,
          user: assigneeId,
          ticket: current.id,
          actor: auth.id,
          type: "assigned",
          title: "Tiket ditugaskan kepada Anda",
          body: notifyLabel,
        });
        notified[assigneeId] = true;

        // Requester dan assignee bisa orang yang sama.
        if (requesterId && !notified[requesterId]) {
          notify.create(txApp, {
            tenant: notifyTenant,
            user: requesterId,
            ticket: current.id,
            actor: auth.id,
            type: "status",
            title: "Tiket Anda sedang ditangani",
            body: notifyLabel,
          });
          notified[requesterId] = true;
        }
      }

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: current.get("tenant"),
        actor: auth,
        ticket: current,
        action: "assign",
        collection_name: "tickets",
        record_id: current.id,
        changes: {
          from: previousAssignee,
          to: assigneeId,
          status: String(current.get("status")),
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });

      result = current;
    });

    return e.json(200, {
      id: result.id,
      status: String(result.get("status")),
      assignee: String(result.get("assignee") || ""),
      assigned_at: String(result.get("assigned_at") || ""),
    });
  },
  $apis.requireAuth()
);

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------
routerAdd(
  "POST",
  "/api/itsm/tickets/{id}/transition",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var sla = require(__hooks + "/lib/sla.js");
    var RESOLUTION_CODES = [
      "fixed",
      "workaround",
      "duplicate",
      "not_reproducible",
      "rejected",
      "other",
    ];

    var auth = guards.requireAuth(e);
    var constants = require(__hooks + "/lib/constants.js");
    var ticket = guards.findTicket(e, e.request.pathValue("id"));
    guards.assertTicketAccess(e, ticket);

    var body = e.requestInfo().body || {};
    var target = String(body.status || "");
    var lead = guards.isLead(auth);
    var staff = guards.isStaff(auth);

    if (
      ["in_progress", "waiting", "resolved", "closed", "reopened"].indexOf(
        target
      ) < 0
    ) {
      throw new BadRequestError("Status tujuan tidak valid");
    }

    if (target === "reopened") {
      var isRequester = String(ticket.get("requester")) === auth.id;
      if (!staff && !isRequester) {
        throw new ForbiddenError(
          "Hanya staff IT atau requester pemilik tiket yang dapat membuka kembali"
        );
      }
    } else if (target === "closed") {
      // Menutup tiket tetap milik agent penuh; resolver hanya menyelesaikan.
      guards.assertStaff(auth);
    } else {
      guards.assertStaffOrResolver(auth);
    }

    var summary = guards.cleanText(body.resolution_summary, 5000);
    var code = String(body.resolution_code || "");
    var changeOutcome = String(body.change_outcome || "");
    var result;
    var reopenSla = "";

    if (target === "resolved") {
      if (summary.length < 10) {
        throw new BadRequestError(
          "Ringkasan resolusi wajib diisi minimal 10 karakter"
        );
      }
      if (code && RESOLUTION_CODES.indexOf(code) < 0) {
        throw new BadRequestError("Kode resolusi tidak valid");
      }
      if (!code) code = "other";

      if (
        String(ticket.get("type")) === "change_request" &&
        constants.CHANGE_OUTCOMES.indexOf(changeOutcome) < 0
      ) {
        throw new BadRequestError(
          "Hasil perubahan wajib dipilih: successful, failed, rolled_back, atau partial"
        );
      }
    }

    $app.runInTransaction((txApp) => {
      var current = txApp.findRecordById("tickets", ticket.id);
      var from = String(current.get("status") || "");
      var assignee = String(current.get("assignee") || "");
      var requester = String(current.get("requester") || "");
      var now = new Date().toISOString();
      // Service/Change Request hanya butuh approval bila memang punya alur
      // approval. Item katalog dengan mode `none` disimpan sebagai
      // `approval_status = not_required`, sehingga tidak boleh diblokir.
      var approvalSatisfied =
        String(current.get("type")) === "incident" ||
        String(current.get("approval_mode")) === "none" ||
        String(current.get("approval_status")) === "approved" ||
        String(current.get("approval_status")) === "not_required";

      if (target === "in_progress") {
        if (["open", "assigned", "reopened", "waiting"].indexOf(from) < 0) {
          throw new BadRequestError(
            "Tiket tidak dapat dimulai dari status " + from
          );
        }
        if (!approvalSatisfied) {
          throw new BadRequestError(
            String(current.get("approval_status")) === "rejected"
              ? "Approval permintaan ditolak; Kepala IT harus menyetujui ulang sebelum pekerjaan dimulai"
              : "Permintaan menunggu approval Kepala IT sebelum pekerjaan dapat dimulai"
          );
        }
        if (assignee && assignee !== auth.id && !lead) {
          throw new ForbiddenError(
            "Tiket sedang ditugaskan ke staf lain"
          );
        }
        if (!staff && !assignee && !guards.canClaimTeamTicket(auth, ticket)) {
          throw new ForbiddenError(
            "Tiket belum ditugaskan kepada Anda dan bukan bagian dari antrean tim Anda."
          );
        }

        // Claim an unassigned ticket automatically when work starts.
        if (!assignee) {
          current.set("assignee", auth.id);
          current.set("assigned_at", now);
          current.set("assigned_by", auth.id);
        }

        // Melanjutkan dari waiting menggeser tenggat penyelesaian persis
        // sebesar durasi jeda, lalu mencatat total jeda.
        if (from === "waiting") {
          var pausedAt = String(current.get("sla_paused_at") || "");

          if (pausedAt) {
            var pausedMs =
              new Date(now).getTime() -
              new Date(String(pausedAt).replace(" ", "T")).getTime();

            if (pausedMs > 0) {
              var resolutionDue = String(
                current.get("resolution_due_at") || ""
              );
              if (resolutionDue) {
                current.set(
                  "resolution_due_at",
                  new Date(
                    new Date(String(resolutionDue).replace(" ", "T")).getTime() +
                      pausedMs
                  ).toISOString()
                );
              }

              var nextDue = String(current.get("next_due_at") || "");
              if (nextDue) {
                current.set(
                  "next_due_at",
                  new Date(
                    new Date(String(nextDue).replace(" ", "T")).getTime() +
                      pausedMs
                  ).toISOString()
                );
              }

              current.set(
                "sla_paused_minutes",
                (Number(current.get("sla_paused_minutes")) || 0) +
                  Math.round(pausedMs / 60000)
              );
            }

            current.set("sla_paused_at", "");
          }
        }

        if (
          String(current.get("type")) === "change_request" &&
          !String(current.get("actual_start") || "")
        ) {
          current.set("actual_start", now);
        }

        current.set("status", "in_progress");
      } else if (target === "waiting") {
        if (["assigned", "in_progress"].indexOf(from) < 0) {
          throw new BadRequestError(
            "Hanya tiket assigned atau in_progress yang dapat menunggu requester"
          );
        }
        if (!approvalSatisfied) {
          throw new BadRequestError(
            "Permintaan harus disetujui Kepala IT sebelum menunggu requester"
          );
        }
        if (!assignee) {
          throw new BadRequestError(
            "Tugaskan tiket ke staf IT sebelum menunggu requester"
          );
        }
        if (assignee !== auth.id && !lead) {
          throw new ForbiddenError(
            "Hanya assignee atau Kepala IT yang dapat menjeda tiket ini"
          );
        }

        current.set("status", "waiting");
        if (!String(current.get("sla_paused_at") || "")) {
          current.set("sla_paused_at", now);
        }
      } else if (target === "resolved") {
        if (["assigned", "in_progress"].indexOf(from) < 0) {
          throw new BadRequestError(
            "Tiket harus dalam status assigned atau in_progress sebelum diselesaikan"
          );
        }
        if (!approvalSatisfied) {
          throw new BadRequestError(
            "Permintaan harus disetujui Kepala IT sebelum diselesaikan"
          );
        }
        if (assignee && assignee !== auth.id && !lead) {
          throw new ForbiddenError(
            "Hanya assignee atau Kepala IT yang dapat menyelesaikan tiket ini"
          );
        }
        if (!assignee && !lead) {
          throw new ForbiddenError(
            "Mulai kerjakan tiket ini terlebih dahulu sebelum menyelesaikannya"
          );
        }

        current.set("status", "resolved");
        current.set("resolved_at", now);
        current.set("resolved_by", auth.id);
        current.set("resolution_summary", summary);
        current.set("resolution_code", code);

        if (String(current.get("type")) === "change_request") {
          current.set("change_outcome", changeOutcome);
          current.set("actual_end", now);
          if (!String(current.get("actual_start") || "")) {
            current.set("actual_start", now);
          }
        }
      } else if (target === "closed") {
        if (from !== "resolved") {
          throw new BadRequestError(
            "Tiket harus berstatus resolved sebelum ditutup"
          );
        }
        current.set("status", "closed");
        current.set("closed_at", now);
        current.set("closed_by", auth.id);
      } else if (target === "reopened") {
        if (["resolved", "closed"].indexOf(from) < 0) {
          throw new BadRequestError(
            "Hanya tiket resolved atau closed yang dapat dibuka kembali"
          );
        }
        if (!staff && requester !== auth.id) {
          throw new ForbiddenError(
            "Hanya requester pemilik tiket yang dapat membuka kembali"
          );
        }

        var reopenCount = Number(current.get("reopen_count")) || 0;
        current.set("status", "reopened");
        current.set("reopened_at", now);
        current.set("reopen_count", reopenCount + 1);
        current.set("closed_at", "");
        current.set("closed_by", "");
        current.set("resolved_at", "");
        current.set("resolved_by", "");
        current.set("resolution_summary", "");
        current.set("resolution_code", "");
        current.set("change_outcome", "");
        current.set("actual_start", "");
        current.set("actual_end", "");

        // Reopen memulai siklus SLA penyelesaian baru: hitung ulang tenggat
        // dari sekarang memakai policy aktif, lalu bersihkan breach lama.
        // Riwayat breach sebelumnya tetap tersimpan di audit log.
        var policy = null;
        var policyId = String(current.get("sla_policy") || "");
        if (policyId) {
          try {
            policy = txApp.findRecordById("sla_policies", policyId);
          } catch (err) {
            policy = null;
          }
        }

        var due = sla.computeDue(
          new Date(now),
          String(current.get("type")),
          String(current.get("priority")),
          policy,
          sla.loadHolidays(txApp, String(current.get("tenant") || ""))
        );

        if (due.resolution) {
          reopenSla = due.resolution.toISOString();
          current.set("resolution_due_at", reopenSla);
          current.set("next_due_at", reopenSla);
          current.set("resolution_breach_at", "");
          current.set("escalation_level", 0);
          current.set("escalated_at", "");
        }
      }

      current.set("last_activity_at", now);
      txApp.save(current);

      var notify = require(__hooks + "/lib/notify.js");
      var notifyBase = {
        tenant: String(current.get("tenant")),
        ticket: current.id,
        actor: auth.id,
        body: notify.ticketLabel(current),
      };

      if (target === "waiting") {
        notify.create(txApp, {
          tenant: notifyBase.tenant,
          user: requester,
          ticket: current.id,
          actor: auth.id,
          type: "status",
          title: "Menunggu informasi Anda",
          body: notifyBase.body,
        });
      } else if (target === "in_progress" && from === "waiting") {
        notify.create(txApp, {
          tenant: notifyBase.tenant,
          user: requester,
          ticket: current.id,
          actor: auth.id,
          type: "status",
          title: "Tiket dilanjutkan",
          body: notifyBase.body,
        });
      } else if (target === "resolved") {
        notify.create(txApp, {
          tenant: notifyBase.tenant,
          user: requester,
          ticket: current.id,
          actor: auth.id,
          type: "status",
          title: "Tiket selesai",
          body: notifyBase.body,
        });
      } else if (target === "closed") {
        notify.create(txApp, {
          tenant: notifyBase.tenant,
          user: requester,
          ticket: current.id,
          actor: auth.id,
          type: "status",
          title: "Tiket ditutup",
          body: notifyBase.body,
        });
      } else if (target === "reopened") {
        if (assignee) {
          notify.create(txApp, {
            tenant: notifyBase.tenant,
            user: assignee,
            ticket: current.id,
            actor: auth.id,
            type: "status",
            title: "Tiket dibuka kembali",
            body: notifyBase.body,
          });
        } else {
          var reopenLeads = notify.activeLeads(txApp, notifyBase.tenant);
          for (var li = 0; li < reopenLeads.length; li++) {
            notify.create(txApp, {
              tenant: notifyBase.tenant,
              user: reopenLeads[li].id,
              ticket: current.id,
              actor: auth.id,
              type: "status",
              title: "Tiket dibuka kembali",
              body: notifyBase.body,
            });
          }
        }
      }

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: current.get("tenant"),
        actor: auth,
        ticket: current,
        action: "transition",
        collection_name: "tickets",
        record_id: current.id,
        changes: {
          from: from,
          to: String(current.get("status")),
          resolution_code: target === "resolved" ? code : "",
          change_outcome:
            target === "resolved" ? String(current.get("change_outcome") || "") : "",
          sla_recomputed: reopenSla ? true : false,
          resolution_due_at: reopenSla,
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });

      result = current;
    });

    return e.json(200, {
      id: result.id,
      status: String(result.get("status")),
      assignee: String(result.get("assignee") || ""),
      resolved_at: String(result.get("resolved_at") || ""),
      closed_at: String(result.get("closed_at") || ""),
      reopened_at: String(result.get("reopened_at") || ""),
      reopen_count: Number(result.get("reopen_count")) || 0,
      change_outcome: String(result.get("change_outcome") || ""),
      actual_start: String(result.get("actual_start") || ""),
      actual_end: String(result.get("actual_end") || ""),
      resolution_due_at: String(result.get("resolution_due_at") || ""),
      next_due_at: String(result.get("next_due_at") || ""),
      sla_paused_minutes: Number(result.get("sla_paused_minutes")) || 0,
    });
  },
  $apis.requireAuth()
);

// ---------------------------------------------------------------------------
// Approval (service request / change request)
// ---------------------------------------------------------------------------
routerAdd(
  "POST",
  "/api/itsm/tickets/{id}/approval",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var notify = require(__hooks + "/lib/notify.js");
    var approvals = require(__hooks + "/lib/approvals.js");

    var auth = guards.requireAuth(e);
    var ticket = guards.findTicket(e, e.request.pathValue("id"));
    guards.assertTicketAccess(e, ticket);

    var body = e.requestInfo().body || {};
    var decision = String(body.decision || "");
    var note = guards.cleanText(body.note, 2000);
    var delegateId = guards.cleanText(body.delegate, 64);

    if (["approved", "rejected", "delegated"].indexOf(decision) < 0) {
      throw new BadRequestError("Keputusan approval tidak valid");
    }
    if (decision === "rejected" && note.length < 5) {
      throw new BadRequestError(
        "Alasan penolakan wajib diisi minimal 5 karakter"
      );
    }
    if (decision === "delegated") {
      if (!delegateId) {
        throw new BadRequestError("Pilih approver pengganti");
      }
      if (note.length < 5) {
        throw new BadRequestError(
          "Alasan delegasi wajib diisi minimal 5 karakter"
        );
      }
    }
    if (String(ticket.get("type")) === "incident") {
      throw new BadRequestError("Incident tidak memerlukan approval");
    }

    var result;
    var responseStep = 0;
    var responseTotal = 0;
    var activatedStep = 0;
    var delegatedTo = "";

    $app.runInTransaction((txApp) => {
      var current = txApp.findRecordById("tickets", ticket.id);
      var status = String(current.get("status") || "");
      var now = new Date().toISOString();
      var lead = guards.isLead(auth);
      var tenantId = String(current.get("tenant") || "");

      if (["resolved", "closed"].indexOf(status) >= 0) {
        throw new BadRequestError(
          "Tiket sudah selesai atau ditutup; approval tidak dapat diubah"
        );
      }
      if (status === "in_progress") {
        throw new BadRequestError(
          "Pekerjaan sudah dimulai; approval tidak dapat diubah"
        );
      }
      if (["open", "assigned", "reopened"].indexOf(status) < 0) {
        throw new BadRequestError(
          "Approval hanya dapat diproses sebelum pekerjaan dimulai"
        );
      }

      var steps = approvals.listSteps(txApp, current.id);
      responseTotal = steps.length;
      var currentApproval = String(current.get("approval_status") || "");

      var pending = [];
      for (var i = 0; i < steps.length; i++) {
        if (String(steps[i].get("status")) === "pending") pending.push(steps[i]);
      }

      var step = pending.length ? pending[0] : null;

      if (currentApproval === "rejected") {
        if (decision === "delegated") {
          throw new BadRequestError(
            "Approval sudah ditolak; delegasi tidak tersedia"
          );
        }
        if (!lead) {
          throw new ForbiddenError(
            "Approval ditolak; hanya Kepala IT yang dapat menyetujui ulang"
          );
        }
        if (decision === "rejected") {
          throw new BadRequestError("Approval tiket ini sudah ditolak");
        }

        // Override: semua tahap, termasuk yang sudah ditolak, disetujui.
        step = null;
      } else if (!step) {
        if (currentApproval === "approved") {
          throw new BadRequestError("Approval tiket ini sudah disetujui");
        }
        if (decision === "delegated") {
          throw new BadRequestError("Tidak ada tahap approval yang menunggu");
        }
        if (!lead) {
          throw new ForbiddenError("Approval sedang tidak menunggu keputusan");
        }
        if (decision === "rejected") {
          throw new BadRequestError("Tidak ada tahap yang menunggu penolakan");
        }
      } else {
        var stepKind = String(step.get("kind") || "");
        var approverId = String(step.get("approver") || "");
        var allowed =
          stepKind === "cab"
            ? lead
            : lead || (approverId !== "" && approverId === auth.id);

        if (!allowed) {
          throw new ForbiddenError("Anda bukan approver untuk tahap ini");
        }

        responseStep = Number(step.get("step")) || 0;

        // Empat mata: tahap CAB harus diputuskan Kepala IT yang berbeda dari
        // tahap Kepala IT sebelumnya.
        if (stepKind === "cab") {
          var cabLeadStep = approvals.stepOfKind(steps, "it_lead");
          if (cabLeadStep && String(cabLeadStep.get("acted_by")) === auth.id) {
            throw new ForbiddenError(
              "Tahap CAB harus diputuskan Kepala IT yang berbeda"
            );
          }
        }
      }

      if (decision === "delegated") {
        var target;
        try {
          target = txApp.findRecordById("users", delegateId);
        } catch (err) {
          throw new BadRequestError("Approver pengganti tidak ditemukan");
        }

        // Penerima delegasi: staf rumah sakit pemilik tiket, atau staf vendor.
        if (
          !target.get("is_platform_staff") &&
          String(target.get("tenant") || "") !== tenantId
        ) {
          throw new BadRequestError(
            "Approver pengganti berada di tenant yang berbeda"
          );
        }
        if (!target.get("is_active")) {
          throw new BadRequestError("Approver pengganti tidak aktif");
        }
        if (target.id === auth.id) {
          throw new BadRequestError(
            "Delegasi tidak dapat ditujukan ke diri sendiri"
          );
        }

        var delegateStepKind = String(step.get("kind") || "");

        if (delegateStepKind === "it_lead" || delegateStepKind === "cab") {
          if (String(target.get("role")) !== "it_lead") {
            throw new BadRequestError(
              "Tahap ini hanya dapat didelegasikan ke Kepala IT"
            );
          }
        }

        if (delegateStepKind === "cab") {
          var cabStep = approvals.stepOfKind(steps, "it_lead");
          if (cabStep && String(cabStep.get("acted_by")) === target.id) {
            throw new BadRequestError(
              "Tahap CAB harus diputuskan Kepala IT yang berbeda"
            );
          }
        }

        var fromId = String(step.get("approver") || "");
        step.set("approver", target.id);
        step.set("delegated_from", fromId);
        step.set("delegated_by", auth.id);
        step.set("delegated_at", now);
        step.set("delegation_note", note);
        txApp.save(step);

        delegatedTo = target.id;

        // Penerima delegasi perlu akses baca tiket meski bukan staf/manager unit.
        var currentDelegates = current.get("delegates");
        var delegateList = [];

        if (currentDelegates) {
          for (var d = 0; d < currentDelegates.length; d++) {
            delegateList.push(String(currentDelegates[d]));
          }
        }

        if (delegateList.indexOf(target.id) < 0) {
          delegateList.push(target.id);
          current.set("delegates", delegateList);
        }

        notify.create(txApp, {
          tenant: tenantId,
          user: target.id,
          ticket: current.id,
          actor: auth.id,
          type: "approval",
          title: "Approval didelegasikan kepada Anda",
          body: notify.ticketLabel(current) + " · " + note,
        });

        var delegateMeta = audit.requestMeta(e);
        audit.write(txApp, {
          tenant: tenantId,
          actor: auth,
          ticket: current,
          action: "delegate",
          collection_name: "ticket_approvals",
          record_id: step.id,
          changes: {
            step: responseStep,
            kind: delegateStepKind,
            from: fromId,
            to: target.id,
            note: note,
          },
          ip: delegateMeta.ip,
          user_agent: delegateMeta.user_agent,
        });

        current.set("last_activity_at", now);
        txApp.save(current);
        result = current;
        return;
      }

      if (decision === "approved") {
        if (step) {
          step.set("status", "approved");
          step.set("acted_by", auth.id);
          step.set("acted_at", now);
          step.set("note", note);
          txApp.save(step);
        } else {
          // Override Kepala IT untuk tiket yang sebelumnya ditolak.
          for (var oi = 0; oi < steps.length; oi++) {
            if (String(steps[oi].get("status")) === "approved") continue;
            steps[oi].set("status", "approved");
            steps[oi].set("acted_by", auth.id);
            steps[oi].set("acted_at", now);
            steps[oi].set("note", note);
            txApp.save(steps[oi]);
          }
        }

        var next = approvals.activateNext(txApp, current, steps);

        if (next) {
          activatedStep = Number(next.get("step")) || 0;
          current.set("approval_status", "pending");
          approvals.notifyStep(txApp, current, next, auth.id);
        } else {
          // Setelah final approval, gerbang SLA pindah ke penyelesaian (SR)
          // atau jadwal implementasi (CR).
          var nextDue =
            String(current.get("type")) === "change_request"
              ? String(current.get("planned_end") || "") ||
                String(current.get("resolution_due_at") || "")
              : String(current.get("resolution_due_at") || "");

          if (nextDue) current.set("next_due_at", nextDue);

          current.set("approval_status", "approved");
          current.set("approved_by", auth.id);
          current.set("approved_at", now);
          current.set("approval_note", note);

          notify.create(txApp, {
            tenant: String(current.get("tenant")),
            user: String(current.get("requester") || ""),
            ticket: current.id,
            actor: auth.id,
            type: "approval",
            title: "Permintaan disetujui",
            body: notify.ticketLabel(current),
          });
        }
      } else {
        step.set("status", "rejected");
        step.set("acted_by", auth.id);
        step.set("acted_at", now);
        step.set("note", note);
        txApp.save(step);

        current.set("approval_status", "rejected");
        current.set("approval_note", note);

        notify.create(txApp, {
          tenant: String(current.get("tenant")),
          user: String(current.get("requester") || ""),
          ticket: current.id,
          actor: auth.id,
          type: "approval",
          title: "Permintaan ditolak",
          body: notify.ticketLabel(current),
        });
      }

      current.set("last_activity_at", now);
      txApp.save(current);

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: current.get("tenant"),
        actor: auth,
        ticket: current,
        action: decision === "approved" ? "approve" : "reject",
        collection_name: "tickets",
        record_id: current.id,
        changes: {
          decision: decision,
          note: note,
          step: responseStep,
          total_steps: responseTotal,
          kind: step ? String(step.get("kind")) : "override",
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });

      result = current;
    });

    return e.json(200, {
      id: result.id,
      approval_status: String(result.get("approval_status")),
      step: responseStep,
      total_steps: responseTotal,
      next_step: activatedStep,
      delegate: delegatedTo,
      approval_due_at: String(result.get("approval_due_at") || ""),
      approved_at: String(result.get("approved_at") || ""),
    });
  },
  $apis.requireAuth()
);

