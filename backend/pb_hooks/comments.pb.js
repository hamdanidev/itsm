routerAdd(
  "POST",
  "/api/itsm/tickets/{id}/comments",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");

    var auth = guards.requireAuth(e);
    var ticketId = e.request.pathValue("id");
    var ticket = guards.findTicket(e, ticketId);
    guards.assertTicketAccess(e, ticket);

    if (ticket.get("status") === "closed") {
      throw new BadRequestError("Closed tickets cannot receive comments");
    }

    var requestBody = e.requestInfo().body || {};
    var text = guards.cleanText(requestBody.body, 5000);
    var visibility = String(requestBody.visibility || "public");

    if (text.length < 1) throw new BadRequestError("Comment cannot be empty");
    if (["public", "internal"].indexOf(visibility) < 0) {
      throw new BadRequestError("Invalid comment visibility");
    }
    if (visibility === "internal" && !guards.isStaff(auth)) {
      throw new ForbiddenError("Only IT staff can post internal comments");
    }

    var comment;
    var now = new Date().toISOString();

    $app.runInTransaction((txApp) => {
      var current = txApp.findRecordById("tickets", ticketId);
      var collection = txApp.findCollectionByNameOrId("ticket_comments");
      comment = new Record(collection);
      comment.set("ticket", current.id);
      comment.set("author", auth.id);
      comment.set("body", text);
      comment.set("visibility", visibility);
      txApp.save(comment);

      current.set("last_activity_at", now);

      var firstResponse = current.get("first_response_at");
      var hasFirstResponse =
        firstResponse && String(firstResponse).length > 0;

      if (
        visibility === "public" &&
        guards.isStaff(auth) &&
        !hasFirstResponse
      ) {
        current.set("first_response_at", now);
        current.set("first_response_by", auth.id);
      }

      txApp.save(current);

      var notify = require(__hooks + "/lib/notify.js");
      var notifyTitle =
        visibility === "internal" ? "Catatan internal baru" : "Komentar baru";
      var recipients = [];

      if (visibility === "public") {
        recipients.push(String(current.get("requester") || ""));
      }
      recipients.push(String(current.get("assignee") || ""));

      for (var i = 0; i < recipients.length; i++) {
        notify.create(txApp, {
          tenant: String(current.get("tenant")),
          user: recipients[i],
          ticket: current.id,
          actor: auth.id,
          type: "comment",
          title: notifyTitle,
          body: notify.ticketLabel(current),
        });
      }

      var meta = audit.requestMeta(e);
      audit.write(txApp, {
        tenant: current.get("tenant"),
        actor: auth,
        ticket: current,
        action: "comment",
        collection_name: "ticket_comments",
        record_id: comment.id,
        changes: { visibility: visibility },
        ip: meta.ip,
        user_agent: meta.user_agent,
      });
    });

    return e.json(201, {
      id: comment.id,
      visibility: comment.get("visibility"),
      created: comment.get("created"),
    });
  },
  $apis.requireAuth()
);
