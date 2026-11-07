// CSAT: satu respons per tiket, hanya dari requester, setelah tiket
// resolved/closed. Dibaca lewat route agar komentar tidak bocor ke pengguna
// yang tidak punya akses tiket.

routerAdd(
  "GET",
  "/api/itsm/tickets/{id}/csat",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var assets = require(__hooks + "/lib/assets.js");

    var auth = guards.requireAuth(e);
    var ticket = guards.findTicket(e, e.request.pathValue("id"));
    guards.assertTicketAccess(e, ticket);

    var record = null;
    try {
      record = $app.findFirstRecordByFilter(
        "ticket_csat",
        "ticket = {:ticket}",
        { ticket: ticket.id }
      );
    } catch (err) {
      record = null;
    }

    return e.json(200, { csat: assets.csatResponse(record) });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/itsm/tickets/{id}/csat",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var assets = require(__hooks + "/lib/assets.js");

    var auth = guards.requireAuth(e);
    var ticket = guards.findTicket(e, e.request.pathValue("id"));
    guards.assertTicketAccess(e, ticket);

    if (String(ticket.get("requester")) !== auth.id) {
      throw new ForbiddenError("Hanya pemohon yang dapat mengisi CSAT");
    }

    var status = String(ticket.get("status") || "");
    if (status !== "resolved" && status !== "closed") {
      throw new BadRequestError(
        "CSAT dapat diisi setelah tiket selesai atau ditutup"
      );
    }

    var body = e.requestInfo().body || {};
    var score = Number(body.score);

    if (!isFinite(score) || Math.floor(score) !== score || score < 1 || score > 5) {
      throw new BadRequestError("Skor CSAT harus bilangan bulat 1–5");
    }

    var comment = guards.cleanText(body.comment, 2000);
    var tenantId = String(ticket.get("tenant") || "");
    var result;

    $app.runInTransaction((txApp) => {
      var existing = null;
      try {
        existing = txApp.findFirstRecordByFilter(
          "ticket_csat",
          "ticket = {:ticket}",
          { ticket: ticket.id }
        );
      } catch (err) {
        existing = null;
      }

      if (existing) {
        throw new BadRequestError("CSAT untuk tiket ini sudah dikirim");
      }

      var collection = txApp.findCollectionByNameOrId("ticket_csat");
      result = new Record(collection);
      result.set("tenant", tenantId);
      result.set("ticket", ticket.id);
      result.set("score", score);
      result.set("comment", comment);
      result.set("submitted_by", auth.id);
      txApp.save(result);

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: tenantId,
        actor: auth,
        ticket: ticket,
        action: "csat",
        collection_name: "ticket_csat",
        record_id: result.id,
        changes: { score: score, has_comment: comment ? true : false },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });
    });

    return e.json(201, assets.csatResponse(result));
  },
  $apis.requireAuth()
);
