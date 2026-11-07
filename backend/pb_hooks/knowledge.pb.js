// Knowledge base: artikel SOP/known error yang bisa dicari saat intake.
//
// Penulisan lewat route agar slug, author, lifecycle draft -> review ->
// published -> retired, audit, dan visibilitas konsisten. Requester hanya dapat
// membaca artikel `published` + `public`; staf IT dapat membaca semua.

routerAdd(
  "POST",
  "/api/itsm/knowledge",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var knowledgeLib = require(__hooks + "/lib/knowledge.js");

    var auth = guards.requireAuth(e);
    guards.assertStaff(auth);

    var tenantId = String(auth.get("tenant") || "");
    if (!tenantId) {
      throw new BadRequestError("Akun platform tidak dapat menulis artikel");
    }

    var body = e.requestInfo().body || {};
    var title = guards.cleanText(body.title, 160);
    var content = guards.cleanText(body.body, 30000);
    var visibility = String(body.visibility || "internal");
    var tags = guards.cleanText(body.tags, 500);
    var ticketId = String(body.ticket_id || "");
    var serviceId = String(body.service || "");
    var problemId = String(body.problem || "");

    if (title.length < 5) {
      throw new BadRequestError("Judul artikel minimal 5 karakter");
    }
    if (content.length < 20) {
      throw new BadRequestError("Isi artikel minimal 20 karakter");
    }
    if (["internal", "public"].indexOf(visibility) < 0) {
      throw new BadRequestError("Visibilitas artikel tidak valid");
    }

    var article = null;

    $app.runInTransaction((txApp) => {
      var ticket = null;

      if (ticketId) {
        ticket = guards.findTicket(e, ticketId);
        guards.assertTicketAccess(e, ticket);
        if (String(ticket.get("tenant")) !== tenantId) {
          throw new BadRequestError("Tiket bukan milik rumah sakit ini");
        }
        if (!serviceId) serviceId = String(ticket.get("service") || "");
        if (!problemId) problemId = String(ticket.get("problem") || "");
      }

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

      if (problemId) {
        var problem = null;
        try {
          problem = txApp.findRecordById("problems", problemId);
        } catch (err) {
          throw new BadRequestError("Problem tidak ditemukan");
        }
        if (String(problem.get("tenant")) !== tenantId) {
          throw new BadRequestError("Problem harus milik rumah sakit yang sama");
        }
      }

      var collection = txApp.findCollectionByNameOrId("knowledge_articles");
      article = new Record(collection);
      article.set("tenant", tenantId);
      article.set("title", title);
      article.set("slug", knowledgeLib.uniqueSlug(txApp, tenantId, title));
      article.set("body", content);
      article.set("status", "draft");
      article.set("visibility", visibility);
      article.set("service", serviceId);
      article.set("problem", problemId);
      article.set("tags", tags);
      article.set("author", auth.id);
      txApp.save(article);

      if (ticket) knowledgeLib.linkTicket(txApp, article, ticket);

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: tenantId,
        actor: auth,
        action: "create",
        collection_name: "knowledge_articles",
        record_id: article.id,
        changes: {
          title: title,
          visibility: visibility,
          service: serviceId,
          problem: problemId,
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });

      if (ticket) {
        audit.write(txApp, {
          tenant: tenantId,
          actor: auth,
          ticket: ticket,
          action: "knowledge_link",
          collection_name: "knowledge_articles",
          record_id: article.id,
          changes: { title: title },
          ip: meta.ip,
          user_agent: meta.user_agent,
        });
      }
    });

    return e.json(201, knowledgeLib.response(article));
  },
  $apis.requireAuth()
);

routerAdd(
  "PATCH",
  "/api/itsm/knowledge/{id}",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var knowledgeLib = require(__hooks + "/lib/knowledge.js");

    var auth = guards.requireAuth(e);
    guards.assertStaff(auth);

    var tenantId = String(auth.get("tenant") || "");
    var articleId = e.request.pathValue("id");
    var body = e.requestInfo().body || {};

    function has(key) {
      return Object.prototype.hasOwnProperty.call(body, key);
    }

    var result;

    $app.runInTransaction((txApp) => {
      var article = null;

      try {
        article = txApp.findRecordById("knowledge_articles", articleId);
      } catch (err) {
        throw new NotFoundError("Artikel tidak ditemukan");
      }

      if (String(article.get("tenant")) !== tenantId) {
        throw new NotFoundError("Artikel tidak ditemukan");
      }

      var previousStatus = String(article.get("status") || "");

      if (has("title")) {
        var title = guards.cleanText(body.title, 160);
        if (title.length < 5) {
          throw new BadRequestError("Judul artikel minimal 5 karakter");
        }
        article.set("title", title);
      }

      if (has("body")) {
        var content = guards.cleanText(body.body, 30000);
        if (content.length < 20) {
          throw new BadRequestError("Isi artikel minimal 20 karakter");
        }
        article.set("body", content);
      }

      if (has("visibility")) {
        var visibility = String(body.visibility || "");
        if (["internal", "public"].indexOf(visibility) < 0) {
          throw new BadRequestError("Visibilitas artikel tidak valid");
        }
        article.set("visibility", visibility);
      }

      if (has("tags")) {
        article.set("tags", guards.cleanText(body.tags, 500));
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
        article.set("service", serviceId);
      }

      if (has("problem")) {
        var problemId = String(body.problem || "");
        if (problemId) {
          var problem = null;
          try {
            problem = txApp.findRecordById("problems", problemId);
          } catch (err) {
            throw new BadRequestError("Problem tidak ditemukan");
          }
          if (String(problem.get("tenant")) !== tenantId) {
            throw new BadRequestError("Problem harus milik rumah sakit yang sama");
          }
        }
        article.set("problem", problemId);
      }

      // Status `review` boleh diajukan staf; publish/retire hanya lewat route
      // publish (khusus IT Lead).
      if (has("status")) {
        var requested = String(body.status || "");
        if (requested === "review") {
          if (previousStatus !== "draft" && previousStatus !== "review") {
            throw new BadRequestError(
              "Hanya artikel draft yang dapat diajukan review"
            );
          }
          article.set("status", "review");
        } else if (requested && requested !== previousStatus) {
          throw new BadRequestError(
            "Gunakan aksi publish/retire untuk mengubah status artikel"
          );
        }
      }

      txApp.save(article);

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: tenantId,
        actor: auth,
        action: "update",
        collection_name: "knowledge_articles",
        record_id: article.id,
        changes: {
          title: String(article.get("title") || ""),
          visibility: String(article.get("visibility") || ""),
          status: String(article.get("status") || ""),
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });

      result = article;
    });

    return e.json(200, knowledgeLib.response(result));
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/itsm/knowledge/{id}/publish",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var knowledgeLib = require(__hooks + "/lib/knowledge.js");

    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var tenantId = String(auth.get("tenant") || "");
    var articleId = e.request.pathValue("id");
    var body = e.requestInfo().body || {};
    var target = String(body.status || "published");

    if (["published", "retired"].indexOf(target) < 0) {
      throw new BadRequestError("Status publikasi tidak valid");
    }

    var result;

    $app.runInTransaction((txApp) => {
      var article = null;

      try {
        article = txApp.findRecordById("knowledge_articles", articleId);
      } catch (err) {
        throw new NotFoundError("Artikel tidak ditemukan");
      }

      if (String(article.get("tenant")) !== tenantId) {
        throw new NotFoundError("Artikel tidak ditemukan");
      }

      if (target === "published" && String(article.get("body") || "").length < 20) {
        throw new BadRequestError("Artikel terlalu pendek untuk dipublikasikan");
      }

      var previousStatus = String(article.get("status") || "");

      article.set("status", target);
      article.set("reviewer", auth.id);

      if (target === "published") {
        article.set("published_at", new Date().toISOString());
      }

      txApp.save(article);

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: tenantId,
        actor: auth,
        action: "update",
        collection_name: "knowledge_articles",
        record_id: article.id,
        changes: {
          status: { from: previousStatus, to: target },
          title: String(article.get("title") || ""),
        },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });

      result = article;
    });

    return e.json(200, knowledgeLib.response(result));
  },
  $apis.requireAuth()
);

routerAdd(
  "GET",
  "/api/itsm/knowledge/search",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var knowledgeLib = require(__hooks + "/lib/knowledge.js");

    var auth = guards.requireAuth(e);
    var tenantId = String(auth.get("tenant") || "");

    if (!tenantId) {
      return e.json(200, { items: [] });
    }

    var query = e.requestInfo().query || {};
    var q = String(query.q || "").trim().slice(0, 120);
    var serviceId = String(query.service || "");
    var limit = Number(query.limit) || 5;

    if (limit < 1) limit = 1;
    if (limit > 10) limit = 10;

    var filter =
      'tenant = {:tenant} && status = "published"';
    var params = { tenant: tenantId };

    if (!guards.isStaff(auth)) {
      filter += ' && visibility = "public"';
    }

    if (q) {
      filter += " && (title ~ {:q} || body ~ {:q} || tags ~ {:q})";
      params.q = q;
    }

    if (serviceId) {
      filter += " && service = {:service}";
      params.service = serviceId;
    }

    var records = [];
    try {
      records = $app.findRecordsByFilter(
        "knowledge_articles",
        filter,
        "-updated",
        limit,
        0,
        params
      );
    } catch (err) {
      records = [];
    }

    var items = [];

    for (var i = 0; i < records.length; i++) {
      var article = records[i];
      var problemId = String(article.get("problem") || "");
      var knownError = false;
      var workaround = "";

      if (problemId) {
        try {
          var problem = $app.findRecordById("problems", problemId);
          if (String(problem.get("status")) === "known_error") {
            knownError = true;
            workaround = String(problem.get("workaround") || "");
          }
        } catch (err) {
          // problem sudah dihapus; abaikan
        }
      }

      items.push({
        id: article.id,
        title: String(article.get("title") || ""),
        slug: String(article.get("slug") || ""),
        snippet: knowledgeLib.snippet(article.get("body"), 280),
        visibility: String(article.get("visibility") || ""),
        service: String(article.get("service") || ""),
        problem: problemId,
        known_error: knownError,
        workaround: workaround,
      });
    }

    return e.json(200, { items: items });
  },
  $apis.requireAuth()
);
