// Riwayat tiket: proyeksi audit_logs yang aman untuk requester.
// Audit log mentah hanya dapat dibaca IT Lead (lihat listRule collection),
// jadi route ini memfilter sendiri event yang boleh dilihat pemilik tiket:
// komentar/lampiran internal disembunyikan, IP dan user-agent tidak pernah
// dikirim ke client.
routerAdd(
  "GET",
  "/api/itsm/tickets/{id}/timeline",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");

    var auth = guards.requireAuth(e);
    var ticket = guards.findTicket(e, e.request.pathValue("id"));
    guards.assertTicketAccess(e, ticket);

    var staff = guards.isStaff(auth);
    var userNames = {};

    function userName(id) {
      if (!id) return "";
      if (userNames[id] !== undefined) return userNames[id];

      var name = "";
      try {
        var user = $app.findRecordById("users", id);
        name = String(user.get("name") || "");
      } catch (err) {
        name = "";
      }

      userNames[id] = name;
      return name;
    }

    // `changes` disimpan sebagai field JSON. Tergantung versi runtime,
    // nilainya bisa berupa object JS atau string JSON mentah.
    function asObject(value) {
      if (value == null) return {};

      var text = "";
      try {
        text = String(value);
      } catch (err) {
        text = "";
      }

      if (text && text.charAt(0) === "{") {
        try {
          return JSON.parse(text);
        } catch (err) {
          // lanjut ke penanganan object
        }
      }

      if (typeof value === "object") {
        try {
          return JSON.parse(JSON.stringify(value));
        } catch (err) {
          return {};
        }
      }

      return {};
    }

    var records = $app.findRecordsByFilter(
      "audit_logs",
      "ticket = {:ticket}",
      "-created",
      200,
      0,
      { ticket: ticket.id }
    );

    var items = [];

    for (var i = 0; i < records.length; i++) {
      var log = records[i];
      var action = String(log.get("action") || "");

      if (action === "login") continue;

      var changes = asObject(log.get("changes"));

      var internal =
        (action === "comment" || action === "attachment") &&
        String(changes.visibility || "") === "internal";

      if (internal && !staff) continue;

      var actorId = String(log.get("actor") || "");
      var actor = actorId
        ? {
            id: actorId,
            name: userName(actorId),
            role: String(log.get("actor_role") || ""),
          }
        : null;

      if (action === "assign") {
        changes.from_name = userName(String(changes.from || ""));
        changes.to_name = userName(String(changes.to || ""));
      }

      items.push({
        id: log.id,
        action: action,
        actor: actor,
        changes: changes,
        created: String(log.get("created") || ""),
      });
    }

    return e.json(200, { items: items });
  },
  $apis.requireAuth()
);
