// Status tiket publik dan CSAT pelapor tamu.
//
// Token pada URL adalah satu-satunya kredensial. Jangan menambahkan route yang
// mengembalikan daftar tiket atau data internal lain di bawah prefix ini.
//
// Endpoint:
//   GET  /api/itsm/public/tickets/{token}
//   GET  /api/itsm/public/tickets/{token}/logo
//   POST /api/itsm/public/tickets/{token}/csat

routerAdd("GET", "/api/itsm/public/tickets/{token}", (e) => {
  var publicLib = require(__hooks + "/lib/public_ticket.js");
  var token = e.request.pathValue("token");
  var found = publicLib.findTicket(e.app, token);

  return e.json(200, publicLib.serialize(e.app, found.ticket, found.tenant, token));
});

routerAdd("GET", "/api/itsm/public/tickets/{token}/logo", (e) => {
  var publicLib = require(__hooks + "/lib/public_ticket.js");
  var found = publicLib.findTicket(e.app, e.request.pathValue("token"));
  var logo = String(found.tenant.get("logo") || "");

  if (!logo) throw new NotFoundError("Logo tidak tersedia");

  var collection = e.app.findCollectionByNameOrId("tenants");
  var directory =
    e.app.dataDir() + "/storage/" + collection.id + "/" + found.tenant.id;

  return e.fileFS($os.dirFS(directory), logo);
});

routerAdd("POST", "/api/itsm/public/tickets/{token}/csat", (e) => {
  var publicLib = require(__hooks + "/lib/public_ticket.js");
  var audit = require(__hooks + "/lib/audit.js");

  var token = e.request.pathValue("token");
  var found = publicLib.findTicket(e.app, token);
  var ticket = found.ticket;
  var status = String(ticket.get("status") || "");

  if (status !== "resolved" && status !== "closed") {
    throw new BadRequestError(
      "Penilaian dapat diisi setelah tiket selesai atau ditutup"
    );
  }

  if (publicLib.csatRecord(e.app, ticket.id)) {
    throw new BadRequestError("Penilaian untuk tiket ini sudah dikirim");
  }

  var body = e.requestInfo().body || {};
  var score = Number(body.score);

  if (!isFinite(score) || Math.floor(score) !== score || score < 1 || score > 5) {
    throw new BadRequestError("Skor penilaian harus bilangan bulat 1–5");
  }

  var comment = String(body.comment == null ? "" : body.comment).trim();

  if (comment.length > 2000) {
    throw new BadRequestError("Komentar maksimal 2000 karakter");
  }
  var result;

  $app.runInTransaction((txApp) => {
    var current = txApp.findRecordById("tickets", ticket.id);
    var currentStatus = String(current.get("status") || "");

    if (currentStatus !== "resolved" && currentStatus !== "closed") {
      throw new BadRequestError(
        "Penilaian dapat diisi setelah tiket selesai atau ditutup"
      );
    }

    var existing = null;
    try {
      existing = txApp.findFirstRecordByFilter(
        "ticket_csat",
        "ticket = {:ticket}",
        { ticket: current.id }
      );
    } catch (err) {
      existing = null;
    }

    if (existing) {
      throw new BadRequestError("Penilaian untuk tiket ini sudah dikirim");
    }

    var collection = txApp.findCollectionByNameOrId("ticket_csat");
    result = new Record(collection);
    result.set("tenant", String(current.get("tenant") || ""));
    result.set("ticket", current.id);
    result.set("score", score);
    result.set("comment", comment);
    result.set("source", "guest");
    result.set("submitted_by_name", String(current.get("reporter_name") || ""));
    txApp.save(result);

    var meta = audit.requestMeta(e);
    audit.write(txApp, {
      tenant: String(current.get("tenant") || ""),
      actor: null,
      actor_role: "guest",
      ticket: current,
      action: "csat",
      collection_name: "ticket_csat",
      record_id: result.id,
      changes: {
        score: score,
        source: "guest",
        has_comment: comment ? true : false,
      },
      ip: meta.ip,
      user_agent: meta.user_agent,
    });
  });

  return e.json(201, publicLib.csatPayload(result));
});
