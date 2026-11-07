routerAdd(
  "POST",
  "/api/itsm/tickets/{id}/attachments",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");

    var auth = guards.requireAuth(e);
    var ticketId = e.request.pathValue("id");
    var ticket = guards.findTicket(e, ticketId);
    guards.assertTicketAccess(e, ticket);

    if (ticket.get("status") === "closed") {
      throw new BadRequestError("Closed tickets cannot receive attachments");
    }

    var files = e.findUploadedFiles("file");
    if (!files || files.length !== 1) {
      throw new BadRequestError("Exactly one file is required");
    }

    var requestBody = e.requestInfo().body || {};
    var commentId = String(requestBody.comment || "");
    var visibility = String(requestBody.visibility || "public");
    var comment = null;

    if (visibility !== "public" && visibility !== "internal") {
      throw new BadRequestError("Invalid attachment visibility");
    }

    if (commentId) {
      try {
        comment = e.app.findRecordById("ticket_comments", commentId);
      } catch (err) {
        throw new BadRequestError("Invalid comment reference");
      }
      if (String(comment.get("ticket")) !== String(ticket.id)) {
        throw new BadRequestError("Comment does not belong to this ticket");
      }
      visibility = String(comment.get("visibility"));
    }

    if (visibility === "internal" && !guards.canWorkAsStaff(auth, ticket)) {
      throw new ForbiddenError(
        "Hanya Staff IT atau Teknisi pemilik tiket yang dapat menambah lampiran internal"
      );
    }

    var existing = e.app.findRecordsByFilter(
      "ticket_attachments",
      "ticket = {:ticket}",
      "",
      0,
      0,
      { ticket: ticket.id }
    );
    if (existing.length >= 3) {
      throw new BadRequestError("A ticket can have at most 3 attachments");
    }

    var attachment;
    var uploaded = files[0];

    $app.runInTransaction((txApp) => {
      var current = txApp.findRecordById("tickets", ticketId);
      var collection = txApp.findCollectionByNameOrId("ticket_attachments");
      attachment = new Record(collection);
      attachment.set("ticket", current.id);
      attachment.set("uploader", auth.id);
      attachment.set("file", uploaded);
      attachment.set("visibility", visibility);
      attachment.set(
        "original_name",
        String(uploaded.originalName || uploaded.name || "attachment")
      );
      attachment.set("size", Number(uploaded.size || 0));
      if (commentId) attachment.set("comment", commentId);

      txApp.save(attachment);

      current.set("last_activity_at", new Date().toISOString());
      txApp.save(current);

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: current.get("tenant"),
        actor: auth,
        ticket: current,
        action: "attachment",
        collection_name: "ticket_attachments",
        record_id: attachment.id,
        changes: { visibility: visibility },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });
    });

    return e.json(201, {
      id: attachment.id,
      file: attachment.get("file"),
      original_name: attachment.get("original_name"),
      visibility: attachment.get("visibility"),
    });
  },
  $apis.requireAuth()
);
