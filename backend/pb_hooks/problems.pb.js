// Problem management: satu problem dapat menaungi beberapa insiden.
//
// Problem ditulis lewat route ini (bukan collection API) agar nomor problem,
// penautan tiket, transisi status, dan audit konsisten. Requester tidak dapat
// membaca problem; hanya staf IT dan akun platform.

routerAdd(
  "POST",
  "/api/itsm/problems",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var problemLib = require(__hooks + "/lib/problem.js");

    var auth = guards.requireAuth(e);
    guards.assertStaff(auth);

    var tenantId = String(auth.get("tenant") || "");
    if (!tenantId) {
      throw new BadRequestError("Akun platform tidak dapat membuat problem");
    }

    var body = e.requestInfo().body || {};
    var title = guards.cleanText(body.title, 160);
    var description = guards.cleanText(body.description, 10000);
    var ticketId = String(body.ticket_id || "");
    var serviceId = String(body.service || "");
    var ownerId = String(body.owner || "");

    if (title.length < 5) {
      throw new BadRequestError("Judul problem minimal 5 karakter");
    }

    var problem;

    $app.runInTransaction((txApp) => {
      var ticket = null;

      if (ticketId) {
        ticket = guards.findTicket(e, ticketId);
        guards.assertTicketAccess(e, ticket);
        if (String(ticket.get("tenant")) !== tenantId) {
          throw new BadRequestError("Tiket bukan milik rumah sakit ini");
        }
        if (!description) description = String(ticket.get("description") || "");
        if (!serviceId) serviceId = String(ticket.get("service") || "");
      }

      var service = null;
      if (serviceId) {
        try {
          service = txApp.findRecordById("services", serviceId);
        } catch (err) {
          throw new BadRequestError("Layanan tidak ditemukan");
        }
        if (String(service.get("tenant")) !== tenantId) {
          throw new BadRequestError("Layanan harus milik rumah sakit yang sama");
        }
      }

      var owner = auth;
      if (ownerId) {
        try {
          owner = txApp.findRecordById("users", ownerId);
        } catch (err) {
          throw new BadRequestError("Owner problem tidak ditemukan");
        }
        if (
          String(owner.get("tenant")) !== tenantId ||
          !owner.get("is_active")
        ) {
          throw new BadRequestError("Owner problem harus pengguna aktif rumah sakit yang sama");
        }
      }

      var collection = txApp.findCollectionByNameOrId("problems");
      problem = new Record(collection);

      var stamp = new Date(Date.now() + 7 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "");
      var problemNo = "";

      for (var i = 0; i < 5; i++) {
        var candidate =
          "PRB-" +
          stamp +
          "-" +
          $security.randomStringWithAlphabet(
            6,
            "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
          );

        var exists = null;
        try {
          exists = txApp.findFirstRecordByFilter(
            "problems",
            "tenant = {:tenant} && problem_no = {:no}",
            { tenant: tenantId, no: candidate }
          );
        } catch (err) {
          exists = null;
        }

        if (!exists) {
          problemNo = candidate;
          break;
        }
      }

      if (!problemNo) {
        throw new BadRequestError("Gagal membuat nomor problem, coba lagi");
      }

      problem.set("tenant", tenantId);
      problem.set("problem_no", problemNo);
      problem.set("title", title);
      problem.set("description", description);
      problem.set("status", "identified");
      problem.set("service", serviceId);
      problem.set("owner", owner.id);
      txApp.save(problem);

      if (ticket) {
        problemLib.linkTicket(txApp, problem, ticket, "caused_by");
      }

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: tenantId,
        actor: auth,
        action: "create",
        collection_name: "problems",
        record_id: problem.id,
        changes: {
          problem_no: problemNo,
          title: title,
          service: serviceId,
          owner: owner.id,
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });

      if (ticket) {
        audit.write(txApp, {
          tenant: tenantId,
          actor: auth,
          ticket: ticket,
          action: "problem_link",
          collection_name: "problems",
          record_id: problem.id,
          changes: {
            problem_no: problemNo,
            relation: "caused_by",
          },
          ip: meta.ip,
          user_agent: meta.user_agent,
        });
      }
    });

    return e.json(201, problemLib.response(problem));
  },
  $apis.requireAuth()
);

routerAdd(
  "PATCH",
  "/api/itsm/problems/{id}",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var problemLib = require(__hooks + "/lib/problem.js");

    var auth = guards.requireAuth(e);
    guards.assertStaff(auth);

    var tenantId = String(auth.get("tenant") || "");
    var problemId = e.request.pathValue("id");
    var body = e.requestInfo().body || {};

    function has(key) {
      return Object.prototype.hasOwnProperty.call(body, key);
    }

    var result;

    $app.runInTransaction((txApp) => {
      var problem = null;

      try {
        problem = txApp.findRecordById("problems", problemId);
      } catch (err) {
        throw new NotFoundError("Problem tidak ditemukan");
      }

      if (String(problem.get("tenant")) !== tenantId) {
        throw new NotFoundError("Problem tidak ditemukan");
      }

      var previous = {
        status: String(problem.get("status") || ""),
        root_cause: String(problem.get("root_cause") || ""),
        workaround: String(problem.get("workaround") || ""),
        permanent_fix: String(problem.get("permanent_fix") || ""),
      };

      var nextStatus = has("status")
        ? String(body.status || "")
        : previous.status;

      if (
        ["identified", "investigating", "known_error", "resolved", "closed"].indexOf(
          nextStatus
        ) < 0
      ) {
        throw new BadRequestError("Status problem tidak valid");
      }

      var nextRoot =
        has("root_cause")
          ? guards.cleanText(body.root_cause, 10000)
          : previous.root_cause;
      var nextWorkaround =
        has("workaround")
          ? guards.cleanText(body.workaround, 10000)
          : previous.workaround;
      var nextFix =
        has("permanent_fix")
          ? guards.cleanText(body.permanent_fix, 10000)
          : previous.permanent_fix;

      if (nextStatus === "known_error") {
        if (!nextRoot || !nextWorkaround) {
          throw new BadRequestError(
            "Known error membutuhkan root cause dan workaround"
          );
        }
      }

      if (nextStatus === "resolved" && !nextFix) {
        throw new BadRequestError(
          "Problem resolved membutuhkan permanent fix"
        );
      }

      if (nextStatus === "closed" && previous.status !== "resolved") {
        throw new BadRequestError(
          "Problem hanya dapat ditutup setelah berstatus resolved"
        );
      }

      if (has("title")) {
        var title = guards.cleanText(body.title, 160);
        if (title.length < 5) {
          throw new BadRequestError("Judul problem minimal 5 karakter");
        }
        problem.set("title", title);
      }
      if (has("description")) {
        problem.set("description", guards.cleanText(body.description, 10000));
      }

      if (has("service")) {
        var serviceId = String(body.service || "");
        if (serviceId) {
          var service = null;
          try {
            service = txApp.findRecordById("services", serviceId);
          } catch (err) {
            throw new BadRequestError("Layanan tidak ditemukan");
          }
          if (String(service.get("tenant")) !== tenantId) {
            throw new BadRequestError("Layanan harus milik rumah sakit yang sama");
          }
        }
        problem.set("service", serviceId);
      }

      if (has("owner")) {
        var ownerId = String(body.owner || "");
        if (ownerId) {
          var owner = null;
          try {
            owner = txApp.findRecordById("users", ownerId);
          } catch (err) {
            throw new BadRequestError("Owner problem tidak ditemukan");
          }
          if (
            String(owner.get("tenant")) !== tenantId ||
            !owner.get("is_active")
          ) {
            throw new BadRequestError(
              "Owner problem harus pengguna aktif rumah sakit yang sama"
            );
          }
        }
        problem.set("owner", ownerId);
      }

      problem.set("status", nextStatus);
      problem.set("root_cause", nextRoot);
      problem.set("workaround", nextWorkaround);
      problem.set("permanent_fix", nextFix);

      if (nextStatus === "resolved" && previous.status !== "resolved") {
        problem.set("resolved_at", new Date().toISOString());
      }
      if (nextStatus !== "resolved" && nextStatus !== "closed") {
        problem.set("resolved_at", "");
      }

      txApp.save(problem);

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: tenantId,
        actor: auth,
        action: "update",
        collection_name: "problems",
        record_id: problem.id,
        changes: {
          status: { from: previous.status, to: nextStatus },
          root_cause: { from: previous.root_cause, to: nextRoot },
          workaround: { from: previous.workaround, to: nextWorkaround },
          permanent_fix: { from: previous.permanent_fix, to: nextFix },
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });

      result = problem;
    });

    return e.json(200, problemLib.response(result));
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/itsm/problems/{id}/tickets",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var problemLib = require(__hooks + "/lib/problem.js");

    var auth = guards.requireAuth(e);
    guards.assertStaff(auth);

    var tenantId = String(auth.get("tenant") || "");
    var problemId = e.request.pathValue("id");
    var body = e.requestInfo().body || {};
    var ticketId = String(body.ticket_id || "");
    var relation = String(body.relation || "caused_by");

    if (["caused_by", "duplicate", "related"].indexOf(relation) < 0) {
      throw new BadRequestError("Relasi problem tidak valid");
    }
    if (!ticketId) {
      throw new BadRequestError("Tiket wajib dipilih");
    }

    var problem = null;
    var join = null;

    $app.runInTransaction((txApp) => {
      try {
        problem = txApp.findRecordById("problems", problemId);
      } catch (err) {
        throw new NotFoundError("Problem tidak ditemukan");
      }

      if (String(problem.get("tenant")) !== tenantId) {
        throw new NotFoundError("Problem tidak ditemukan");
      }

      var ticket = guards.findTicket(e, ticketId);
      guards.assertTicketAccess(e, ticket);

      if (String(ticket.get("tenant")) !== tenantId) {
        throw new BadRequestError("Tiket bukan milik rumah sakit ini");
      }

      join = problemLib.linkTicket(txApp, problem, ticket, relation);

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: tenantId,
        actor: auth,
        ticket: ticket,
        action: "problem_link",
        collection_name: "problems",
        record_id: problem.id,
        changes: {
          problem_no: String(problem.get("problem_no") || ""),
          relation: relation,
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });
    });

    return e.json(200, {
      problem: problemLib.response(problem),
      link: join ? join.id : "",
    });
  },
  $apis.requireAuth()
);
