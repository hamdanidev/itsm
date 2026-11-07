// Helper insiden mayor. Wajib di-require di dalam callback route karena
// callback berjalan pada VM context baru.

var STATUSES = [
  "declared",
  "investigating",
  "mitigating",
  "monitoring",
  "resolved",
  "closed",
];
var ACTIVE_STATUSES = ["declared", "investigating", "mitigating", "monitoring"];
var SEVERITIES = ["sev1", "sev2", "sev3"];
var RELATIONS = ["impacted", "caused", "related"];
var UPDATE_KINDS = ["update", "decision", "communication"];
var VISIBILITIES = ["internal", "public"];

// Transisi yang diizinkan. `resolved` boleh dibuka kembali ke `investigating`
// bila gangguan ternyata berulang; `closed` bersifat final.
var TRANSITIONS = {
  declared: ["investigating", "mitigating", "monitoring", "resolved"],
  investigating: ["mitigating", "monitoring", "resolved"],
  mitigating: ["investigating", "monitoring", "resolved"],
  monitoring: ["investigating", "mitigating", "resolved"],
  resolved: ["investigating", "closed"],
  closed: [],
};

function canTransition(from, to) {
  if (from === to) return true;
  return (TRANSITIONS[from] || []).indexOf(to) >= 0;
}

function isActive(status) {
  return ACTIVE_STATUSES.indexOf(status) >= 0;
}

// PocketBase menyimpan tanggal kosong sebagai tahun 0001; perlakukan sebagai
// belum diisi agar validasi close/PIR dan laporan tidak salah hitung.
function dateText(value) {
  var text = String(value == null ? "" : value);
  if (!text || text.indexOf("0001-") === 0) return "";
  return text;
}

function generateNumber(app, tenantId, security) {
  var stamp = new Date(Date.now() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "");

  for (var i = 0; i < 5; i++) {
    var candidate =
      "INC-" +
      stamp +
      "-" +
      security.randomStringWithAlphabet(6, "ABCDEFGHJKLMNPQRSTUVWXYZ23456789");

    var exists = null;
    try {
      exists = app.findFirstRecordByFilter(
        "major_incidents",
        "tenant = {:tenant} && incident_no = {:no}",
        { tenant: tenantId, no: candidate }
      );
    } catch (err) {
      exists = null;
    }

    if (!exists) return candidate;
  }

  return "";
}

function response(record) {
  if (!record) return null;

  var services = [];
  try {
    var list = record.get("affected_services");
    if (list) {
      for (var i = 0; i < list.length; i++) services.push(String(list[i]));
    }
  } catch (err) {
    services = [];
  }

  return {
    id: record.id,
    incident_no: String(record.get("incident_no") || ""),
    title: String(record.get("title") || ""),
    description: String(record.get("description") || ""),
    severity: String(record.get("severity") || ""),
    status: String(record.get("status") || ""),
    commander: String(record.get("commander") || ""),
    declared_by: String(record.get("declared_by") || ""),
    impact_summary: String(record.get("impact_summary") || ""),
    affected_services: services,
    source_ticket: String(record.get("source_ticket") || ""),
    resolution_summary: String(record.get("resolution_summary") || ""),
    root_cause: String(record.get("root_cause") || ""),
    pir_actions: String(record.get("pir_actions") || ""),
    pir_completed_at: dateText(record.get("pir_completed_at")),
    pir_by: String(record.get("pir_by") || ""),
    started_at: dateText(record.get("started_at")),
    resolved_at: dateText(record.get("resolved_at")),
    closed_at: dateText(record.get("closed_at")),
    created: String(record.get("created") || ""),
    updated: String(record.get("updated") || ""),
  };
}

function responseUpdate(record) {
  return {
    id: record.id,
    kind: String(record.get("kind") || ""),
    visibility: String(record.get("visibility") || ""),
    body: String(record.get("body") || ""),
    author: String(record.get("author") || ""),
    created: String(record.get("created") || ""),
  };
}

// Tautkan tiket ke insiden. Mengembalikan record join (dibuat atau diperbarui)
// dan menyinkronkan `tickets.major_incident`.
function linkTicket(app, incident, ticket, relation) {
  var existing = null;

  try {
    existing = app.findFirstRecordByFilter(
      "major_incident_tickets",
      "incident = {:incident} && ticket = {:ticket}",
      { incident: incident.id, ticket: ticket.id }
    );
  } catch (err) {
    existing = null;
  }

  if (!existing) {
    var collection = app.findCollectionByNameOrId("major_incident_tickets");
    existing = new Record(collection);
    existing.set("tenant", String(incident.get("tenant")));
    existing.set("incident", incident.id);
    existing.set("ticket", ticket.id);
  }

  existing.set("relation", relation || "impacted");
  app.save(existing);

  ticket.set("major_incident", incident.id);
  ticket.set("last_activity_at", new Date().toISOString());
  app.save(ticket);

  return existing;
}

function broadcast(app, opts) {
  var notify = require(__hooks + "/lib/notify.js");
  var tenant = String(opts.tenant || "");
  var actor = String(opts.actor || "");
  var skip = opts.skip || {};
  var seen = {};
  var sent = 0;

  function send(userId) {
    userId = String(userId || "");
    if (!userId || userId === actor || skip[userId] || seen[userId]) return;

    seen[userId] = true;

    try {
      notify.create(app, {
        tenant: tenant,
        user: userId,
        ticket: opts.ticket || "",
        actor: actor,
        type: "incident",
        title: opts.title || "Insiden mayor",
        body: opts.body || "",
      });
      sent += 1;
    } catch (err) {
      // Notifikasi tidak boleh menggagalkan aksi insiden.
    }
  }

  var staff = [];

  try {
    staff = app.findRecordsByFilter(
      "users",
      "is_active = true && tenant = {:tenant} && (role = 'it_support' || role = 'it_lead')",
      "name",
      100,
      0,
      { tenant: tenant }
    );
  } catch (err) {
    staff = [];
  }

  for (var i = 0; i < staff.length; i++) send(staff[i].id);

  try {
    var platformLeads = notify.platformLeads(app);
    for (var j = 0; j < platformLeads.length; j++) {
      send(platformLeads[j].id);
    }
  } catch (err) {
    // lanjut tanpa lead platform
  }

  return sent;
}

function notifyTicketOwners(app, ticket, opts) {
  var notify = require(__hooks + "/lib/notify.js");
  var tenant = String(ticket.get("tenant") || "");
  var actor = String(opts.actor || "");
  var label = notify.ticketLabel(ticket);
  var seen = {};

  function send(userId) {
    userId = String(userId || "");
    if (!userId || userId === actor || seen[userId]) return;
    seen[userId] = true;

    try {
      notify.create(app, {
        tenant: tenant,
        user: userId,
        ticket: ticket.id,
        actor: actor,
        type: "incident",
        title: opts.title || "Insiden mayor",
        body: opts.body ? opts.body + " · " + label : label,
      });
    } catch (err) {
      // abaikan kegagalan notifikasi
    }
  }

  send(ticket.get("requester"));
  send(ticket.get("assignee"));
}

module.exports = {
  STATUSES: STATUSES,
  ACTIVE_STATUSES: ACTIVE_STATUSES,
  SEVERITIES: SEVERITIES,
  RELATIONS: RELATIONS,
  UPDATE_KINDS: UPDATE_KINDS,
  VISIBILITIES: VISIBILITIES,
  canTransition: canTransition,
  isActive: isActive,
  dateText: dateText,
  generateNumber: generateNumber,
  response: response,
  responseUpdate: responseUpdate,
  linkTicket: linkTicket,
  broadcast: broadcast,
  notifyTicketOwners: notifyTicketOwners,
};

