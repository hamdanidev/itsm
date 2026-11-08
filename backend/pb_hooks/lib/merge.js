// Merge tiket duplikat.
//
// Tiket sumber ditutup sebagai duplikat dan menunjuk ke tiket tujuan. Komentar,
// lampiran, tautan aset/problem/insiden, dan metadata yang belum ada di tujuan
// dipindahkan agar riwayat tidak terpecah. Operasi berjalan dalam satu
// transaksi; audit ditulis pada kedua tiket.

function cleanNote(value) {
  var text = String(value == null ? "" : value).trim();
  if (text.length > 500) {
    throw new BadRequestError("Catatan merge maksimal 500 karakter");
  }
  return text;
}

function isClosed(ticket) {
  var status = String(ticket.get("status") || "");
  return status === "resolved" || status === "closed";
}

function assertMergeable(source, target) {
  if (String(source.id) === String(target.id)) {
    throw new BadRequestError("Tiket tidak dapat digabung ke dirinya sendiri");
  }

  if (String(source.get("tenant")) !== String(target.get("tenant"))) {
    throw new BadRequestError("Tiket tujuan harus berasal dari rumah sakit yang sama");
  }

  if (String(source.get("type")) !== String(target.get("type"))) {
    throw new BadRequestError("Tiket hanya dapat digabung dengan jenis yang sama");
  }

  if (String(source.get("merged_into") || "")) {
    throw new BadRequestError("Tiket ini sudah pernah digabung");
  }

  if (String(target.get("merged_into") || "")) {
    throw new BadRequestError("Tiket tujuan sudah menjadi tiket duplikat");
  }

  if (isClosed(source)) {
    throw new BadRequestError(
      "Tiket yang sudah selesai atau ditutup tidak dapat digabung"
    );
  }

  if (isClosed(target)) {
    throw new BadRequestError(
      "Tiket tujuan sudah selesai atau ditutup; pilih tiket aktif"
    );
  }
}

function moveRecords(app, collection, sourceId, targetId) {
  var moved = 0;

  while (true) {
    var rows = app.findRecordsByFilter(
      collection,
      "ticket = {:source}",
      "created",
      200,
      0,
      { source: sourceId }
    );

    if (!rows.length) break;

    for (var i = 0; i < rows.length; i++) {
      rows[i].set("ticket", targetId);
      app.save(rows[i]);
      moved += 1;
    }
  }

  return moved;
}

// Tautan many-to-many memiliki indeks unik (relasi, tiket). Bila tiket tujuan
// sudah memiliki relasi yang sama, baris sumber dihapus agar tidak duplikat.
function moveUniqueLinks(app, collection, linkField, sourceId, targetId) {
  var moved = 0;

  while (true) {
    var rows = app.findRecordsByFilter(
      collection,
      "ticket = {:source}",
      "created",
      200,
      0,
      { source: sourceId }
    );

    if (!rows.length) break;

    for (var i = 0; i < rows.length; i++) {
      var linkId = String(rows[i].get(linkField) || "");
      var existing = null;

      if (linkId) {
        try {
          existing = app.findFirstRecordByFilter(
            collection,
            "ticket = {:target} && " + linkField + " = {:link}",
            { target: targetId, link: linkId }
          );
        } catch (err) {
          existing = null;
        }
      }

      if (existing) {
        app.delete(rows[i]);
      } else {
        rows[i].set("ticket", targetId);
        app.save(rows[i]);
        moved += 1;
      }
    }
  }

  return moved;
}

function rejectPendingApprovals(app, source, target, actorId, now) {
  var approvals = require(__hooks + "/lib/approvals.js");
  var steps = approvals.listSteps(app, source.id);
  var rejected = 0;

  for (var i = 0; i < steps.length; i++) {
    if (String(steps[i].get("status")) !== "pending") continue;

    steps[i].set("status", "rejected");
    steps[i].set(
      "note",
      "Tiket digabung ke " + String(target.get("ticket_no") || "") + "."
    );
    steps[i].set("acted_by", actorId);
    steps[i].set("acted_at", now);
    app.save(steps[i]);
    rejected += 1;
  }

  return rejected;
}

function copyMissingFields(source, target) {
  var fields = [
    "service",
    "service_item",
    "category",
    "team",
    "location",
    "problem",
    "major_incident",
  ];

  for (var i = 0; i < fields.length; i++) {
    var current = String(target.get(fields[i]) || "");
    var incoming = String(source.get(fields[i]) || "");

    if (!current && incoming) target.set(fields[i], incoming);
  }

  // Pemohon tiket sumber tetap dapat membuka tiket tujuan lewat delegasi agar
  // tidak kehilangan jejak setelah tiketnya ditutup sebagai duplikat.
  var requester = String(source.get("requester") || "");

  if (requester && requester !== String(target.get("requester") || "")) {
    var delegates = target.get("delegates");
    var list = Array.isArray(delegates) ? delegates.slice() : [];

    if (list.indexOf(requester) < 0) {
      list.push(requester);
      target.set("delegates", list);
    }
  }
}

function notifyMerge(app, opts) {
  var notify = require(__hooks + "/lib/notify.js");
  var seen = {};

  function send(userId, ticketId, title, body, actorId) {
    var id = String(userId || "");
    if (!id || seen[id + ":" + ticketId]) return;

    seen[id + ":" + ticketId] = true;
    notify.create(app, {
      tenant: String(opts.tenant),
      user: id,
      ticket: ticketId,
      actor: actorId,
      type: "status",
      title: title,
      body: body,
    });
  }

  var sourceLabel = String(opts.source.get("ticket_no") || "");
  var targetLabel = String(opts.target.get("ticket_no") || "");

  send(
    opts.source.get("requester"),
    opts.source.id,
    "Tiket digabung",
    sourceLabel + " digabung ke " + targetLabel,
    opts.actorId
  );
  send(
    opts.source.get("assignee"),
    opts.source.id,
    "Tiket digabung",
    sourceLabel + " digabung ke " + targetLabel,
    opts.actorId
  );
  send(
    opts.target.get("assignee"),
    opts.target.id,
    "Tiket duplikat digabung",
    sourceLabel + " digabung ke tiket ini",
    opts.actorId
  );
}

function merge(app, opts) {
  var sourceId = String((opts && opts.sourceId) || "");
  var targetId = String((opts && opts.targetId) || "");
  var actor = opts && opts.actor;
  var note = cleanNote(opts && opts.note);

  if (!sourceId || !targetId) {
    throw new BadRequestError("Tiket sumber dan tujuan wajib dipilih");
  }
  if (!actor || !actor.id) {
    throw new ForbiddenError("Merge memerlukan akun staf");
  }

  var result = {};

  app.runInTransaction(function (txApp) {
    var source = txApp.findRecordById("tickets", sourceId);
    var target = txApp.findRecordById("tickets", targetId);

    assertMergeable(source, target);

    var now = new Date().toISOString();
    var sourceNo = String(source.get("ticket_no") || "");
    var targetNo = String(target.get("ticket_no") || "");

    var comments = moveRecords(txApp, "ticket_comments", source.id, target.id);
    var attachments = moveRecords(
      txApp,
      "ticket_attachments",
      source.id,
      target.id
    );
    var assets = moveUniqueLinks(
      txApp,
      "asset_tickets",
      "asset",
      source.id,
      target.id
    );
    var problems = moveUniqueLinks(
      txApp,
      "problem_tickets",
      "problem",
      source.id,
      target.id
    );
    var incidents = moveUniqueLinks(
      txApp,
      "major_incident_tickets",
      "incident",
      source.id,
      target.id
    );
    var approvals = rejectPendingApprovals(
      txApp,
      source,
      target,
      actor.id,
      now
    );

    copyMissingFields(source, target);

    source.set("status", "closed");
    source.set("closed_at", now);
    source.set("closed_by", actor.id);
    source.set("resolved_at", now);
    source.set("resolved_by", actor.id);
    source.set("resolution_code", "duplicate");
    source.set(
      "resolution_summary",
      ("Digabung ke " + targetNo + ". " + (note || "")).trim()
    );
    source.set("merged_into", target.id);
    source.set("merged_at", now);
    source.set("merged_by", actor.id);
    source.set("merge_reason", note);
    source.set("next_due_at", "");
    source.set("last_activity_at", now);

    if (String(source.get("approval_status")) === "pending") {
      source.set("approval_status", "rejected");
      source.set("approval_note", "Tiket digabung ke " + targetNo + ".");
    }

    target.set("last_activity_at", now);

    txApp.save(target);
    txApp.save(source);

    var audit = require(__hooks + "/lib/audit.js");
    var changes = {
      source_no: sourceNo,
      target_no: targetNo,
      target_id: target.id,
      source_id: source.id,
      note: note,
      moved: {
        comments: comments,
        attachments: attachments,
        assets: assets,
        problems: problems,
        incidents: incidents,
        approvals: approvals,
      },
    };

    audit.write(txApp, {
      tenant: source.get("tenant"),
      actor: actor,
      ticket: source,
      action: "merge",
      collection_name: "tickets",
      record_id: source.id,
      changes: changes,
    });

    audit.write(txApp, {
      tenant: target.get("tenant"),
      actor: actor,
      ticket: target,
      action: "merge",
      collection_name: "tickets",
      record_id: target.id,
      changes: changes,
    });

    notifyMerge(txApp, {
      tenant: source.get("tenant"),
      source: source,
      target: target,
      actorId: actor.id,
    });

    result.source = {
      id: source.id,
      ticket_no: sourceNo,
      status: String(source.get("status")),
    };
    result.target = {
      id: target.id,
      ticket_no: targetNo,
      status: String(target.get("status")),
    };
  });

  return result;
}

module.exports = {
  merge: merge,
};
