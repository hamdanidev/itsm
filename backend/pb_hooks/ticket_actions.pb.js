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
    var STAFF_ROLES = ["it_support", "it_lead"];

    var auth = guards.requireAuth(e);
    guards.assertStaff(auth);

    var ticket = guards.findTicket(e, e.request.pathValue("id"));
    guards.assertTicketAccess(e, ticket);

    var body = e.requestInfo().body || {};
    var assigneeId = guards.cleanText(body.assignee, 32);
    var lead = guards.isLead(auth);

    if (assigneeId && !lead && assigneeId !== auth.id) {
      throw new ForbiddenError(
        "IT Support hanya dapat menugaskan tiket ke dirinya sendiri"
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
            "Hanya IT Lead yang dapat melepas assignment"
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

        if (
          String(assignee.get("tenant")) !== String(auth.get("tenant") || "")
        ) {
          throw new BadRequestError("Assignee berada di tenant yang berbeda");
        }
        if (!assignee.get("is_active")) {
          throw new BadRequestError("Assignee tidak aktif");
        }
        if (STAFF_ROLES.indexOf(String(assignee.get("role"))) < 0) {
          throw new BadRequestError("Assignee harus memiliki role staf IT");
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
    var RESOLUTION_CODES = [
      "fixed",
      "workaround",
      "duplicate",
      "not_reproducible",
      "rejected",
      "other",
    ];

    var auth = guards.requireAuth(e);
    var ticket = guards.findTicket(e, e.request.pathValue("id"));
    guards.assertTicketAccess(e, ticket);

    var body = e.requestInfo().body || {};
    var target = String(body.status || "");
    var lead = guards.isLead(auth);
    var staff = guards.isStaff(auth);

    if (
      ["in_progress", "resolved", "closed", "reopened"].indexOf(target) < 0
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
    } else {
      guards.assertStaff(auth);
    }

    var summary = guards.cleanText(body.resolution_summary, 5000);
    var code = String(body.resolution_code || "");
    var result;

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
    }

    $app.runInTransaction((txApp) => {
      var current = txApp.findRecordById("tickets", ticket.id);
      var from = String(current.get("status") || "");
      var assignee = String(current.get("assignee") || "");
      var requester = String(current.get("requester") || "");
      var now = new Date().toISOString();

      if (target === "in_progress") {
        if (["open", "assigned", "reopened"].indexOf(from) < 0) {
          throw new BadRequestError(
            "Tiket tidak dapat dimulai dari status " + from
          );
        }
        if (
          String(current.get("type")) !== "incident" &&
          String(current.get("approval_status")) !== "approved"
        ) {
          throw new BadRequestError(
            String(current.get("approval_status")) === "rejected"
              ? "Approval permintaan ditolak; IT Lead harus menyetujui ulang sebelum pekerjaan dimulai"
              : "Permintaan menunggu approval IT Lead sebelum pekerjaan dapat dimulai"
          );
        }
        if (assignee && assignee !== auth.id && !lead) {
          throw new ForbiddenError(
            "Tiket sedang ditugaskan ke staf lain"
          );
        }

        // Claim an unassigned ticket automatically when work starts.
        if (!assignee) {
          current.set("assignee", auth.id);
          current.set("assigned_at", now);
          current.set("assigned_by", auth.id);
        }
        current.set("status", "in_progress");
      } else if (target === "resolved") {
        if (["assigned", "in_progress"].indexOf(from) < 0) {
          throw new BadRequestError(
            "Tiket harus dalam status assigned atau in_progress sebelum diselesaikan"
          );
        }
        if (
          String(current.get("type")) !== "incident" &&
          String(current.get("approval_status")) !== "approved"
        ) {
          throw new BadRequestError(
            "Permintaan harus disetujui IT Lead sebelum diselesaikan"
          );
        }
        if (assignee && assignee !== auth.id && !lead) {
          throw new ForbiddenError(
            "Hanya assignee atau IT Lead yang dapat menyelesaikan tiket ini"
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
      }

      current.set("last_activity_at", now);
      txApp.save(current);

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

    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var ticket = guards.findTicket(e, e.request.pathValue("id"));
    guards.assertTicketAccess(e, ticket);
    var body = e.requestInfo().body || {};
    var decision = String(body.decision || "");
    var note = guards.cleanText(body.note, 2000);

    if (["approved", "rejected"].indexOf(decision) < 0) {
      throw new BadRequestError("Keputusan approval tidak valid");
    }
    if (decision === "rejected" && note.length < 5) {
      throw new BadRequestError(
        "Alasan penolakan wajib diisi minimal 5 karakter"
      );
    }

    if (String(ticket.get("type")) === "incident") {
      throw new BadRequestError("Incident tidak memerlukan approval");
    }

    var result;

    $app.runInTransaction((txApp) => {
      var current = txApp.findRecordById("tickets", ticket.id);
      var currentApproval = String(current.get("approval_status") || "");
      var status = String(current.get("status") || "");
      var now = new Date().toISOString();

      if (["resolved", "closed"].indexOf(status) >= 0) {
        throw new BadRequestError(
          "Tiket sudah selesai atau ditutup; approval tidak dapat diubah"
        );
      }
      if (["in_progress"].indexOf(status) >= 0) {
        throw new BadRequestError(
          "Pekerjaan sudah dimulai; approval tidak dapat diubah"
        );
      }
      if (["open", "assigned", "reopened"].indexOf(status) < 0) {
        throw new BadRequestError(
          "Approval hanya dapat diproses sebelum pekerjaan dimulai"
        );
      }
      if (currentApproval === "approved") {
        throw new BadRequestError("Approval tiket ini sudah disetujui");
      }
      if (currentApproval === "rejected" && decision === "rejected") {
        throw new BadRequestError("Approval tiket ini sudah ditolak");
      }

      current.set("approval_status", decision);
      current.set("approved_by", auth.id);
      current.set("approved_at", now);
      current.set("approval_note", note);
      current.set("last_activity_at", now);

      if (decision === "approved") {
        // Setelah approval, gerbang SLA berpindah ke penyelesaian (SR/incident)
        // atau jadwal implementasi (CR).
        var nextDue =
          String(current.get("type")) === "change_request"
            ? String(current.get("planned_end") || "") ||
              String(current.get("resolution_due_at") || "")
            : String(current.get("resolution_due_at") || "");
        if (nextDue) current.set("next_due_at", nextDue);
      }

      txApp.save(current);

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: current.get("tenant"),
        actor: auth,
        ticket: current,
        action: decision === "approved" ? "approve" : "reject",
        collection_name: "tickets",
        record_id: current.id,
        changes: { decision: decision, note: note },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });

      result = current;
    });

    return e.json(200, {
      id: result.id,
      approval_status: String(result.get("approval_status")),
      approved_at: String(result.get("approved_at") || ""),
    });
  },
  $apis.requireAuth()
);
