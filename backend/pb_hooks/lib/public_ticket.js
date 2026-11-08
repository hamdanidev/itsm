// Status tiket publik lewat tautan bertoken dan CSAT pelapor tamu.
//
// Dipanggil dari `public_ticket.pb.js`. Callback route berjalan di VM baru,
// jadi helper ini harus di-require di dalam callback.
//
// Prinsip: tautan ini hanya membuka SATU tiket. Jangan pernah mengembalikan
// daftar pengguna, aset, audit mentah, lampiran internal, atau data tiket lain.

function notFound() {
  return new NotFoundError(
    "Tautan status tiket tidak ditemukan atau sudah tidak berlaku"
  );
}

function asText(value) {
  return String(value == null ? "" : value);
}

function findTicket(app, token) {
  var cleaned = asText(token).trim();

  if (cleaned.length < 10 || cleaned.length > 64) throw notFound();

  var rows = app.findRecordsByFilter(
    "tickets",
    "public_token = {:token}",
    "",
    1,
    0,
    { token: cleaned }
  );

  if (!rows.length) throw notFound();

  var ticket = rows[0];
  var tenant;

  try {
    tenant = app.findRecordById("tenants", asText(ticket.get("tenant")));
  } catch (err) {
    throw notFound();
  }

  if (!Boolean(tenant.get("is_active"))) throw notFound();

  return { ticket: ticket, tenant: tenant };
}

// `changes` disimpan sebagai JSON; runtime bisa memberi object atau string.
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
      // lanjut ke object
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

function userName(app, id) {
  if (!id) return "";

  try {
    return asText(app.findRecordById("users", asText(id)).get("name"));
  } catch (err) {
    return "";
  }
}

function serviceName(app, id) {
  if (!id) return "";

  try {
    return asText(app.findRecordById("services", asText(id)).get("name"));
  } catch (err) {
    return "";
  }
}

function csatRecord(app, ticketId) {
  try {
    return app.findFirstRecordByFilter(
      "ticket_csat",
      "ticket = {:ticket}",
      { ticket: ticketId }
    );
  } catch (err) {
    return null;
  }
}

function csatPayload(record) {
  if (!record) return null;

  return {
    score: Number(record.get("score")) || 0,
    comment: asText(record.get("comment")),
    source: asText(record.get("source")) || "portal",
    created: asText(record.get("created")),
  };
}

function updatesFor(app, ticket) {
  var items = [];

  var comments = app.findRecordsByFilter(
    "ticket_comments",
    'ticket = {:ticket} && visibility = "public"',
    "created",
    100,
    0,
    { ticket: ticket.id }
  );

  for (var i = 0; i < comments.length; i++) {
    items.push({
      type: "comment",
      body: asText(comments[i].get("body")),
      author: userName(app, comments[i].get("author")),
      created: asText(comments[i].get("created")),
    });
  }

  var logs = app.findRecordsByFilter(
    "audit_logs",
    'ticket = {:ticket} && action = "transition"',
    "created",
    100,
    0,
    { ticket: ticket.id }
  );

  for (var j = 0; j < logs.length; j++) {
    var changes = asObject(logs[j].get("changes"));
    var from = asText(changes.from);
    var to = asText(changes.to);

    if (!to || to === from) continue;

    items.push({
      type: "status",
      status_from: from,
      status_to: to,
      created: asText(logs[j].get("created")),
    });
  }

  items.push({
    type: "created",
    status_to: "open",
    created: asText(ticket.get("created")),
  });

  items.sort(function (a, b) {
    return asText(a.created).localeCompare(asText(b.created));
  });

  return items;
}

function serialize(app, ticket, tenant, token) {
  var status = asText(ticket.get("status")) || "open";
  var csat = csatRecord(app, ticket.id);
  var closed = status === "resolved" || status === "closed";
  var logo = asText(tenant.get("logo"));

  return {
    tenant: {
      name: asText(tenant.get("name")),
      logo_url: logo
        ? "/api/itsm/public/tickets/" + encodeURIComponent(token) + "/logo"
        : "",
    },
    ticket: {
      ticket_no: asText(ticket.get("ticket_no")),
      title: asText(ticket.get("title")),
      type: asText(ticket.get("type")),
      status: status,
      priority: asText(ticket.get("priority")),
      impact: asText(ticket.get("impact")),
      location: asText(ticket.get("location")),
      team: asText(ticket.get("team")),
      service_name: serviceName(app, ticket.get("service")),
      created: asText(ticket.get("created")),
      last_activity_at: asText(ticket.get("last_activity_at")),
      response_due_at: asText(ticket.get("response_due_at")),
      resolution_due_at: asText(ticket.get("resolution_due_at")),
      resolved_at: asText(ticket.get("resolved_at")),
      closed_at: asText(ticket.get("closed_at")),
      resolution_summary: asText(ticket.get("resolution_summary")),
    },
    updates: updatesFor(app, ticket),
    csat: csatPayload(csat),
    can_submit_csat: closed && !csat,
  };
}

module.exports = {
  notFound: notFound,
  findTicket: findTicket,
  csatRecord: csatRecord,
  csatPayload: csatPayload,
  serialize: serialize,
};
