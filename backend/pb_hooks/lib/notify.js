// Helper notifikasi in-app. Dipanggil dari dalam transaksi route aksi.
// Notifikasi untuk diri sendiri tidak dibuat agar tidak berisik.

function create(app, opts) {
  if (!opts || !opts.user || !opts.tenant) return null;
  if (opts.actor && String(opts.actor) === String(opts.user)) return null;

  var collection = app.findCollectionByNameOrId("notifications");
  var record = new Record(collection);

  record.set("tenant", String(opts.tenant));
  record.set("user", String(opts.user));
  if (opts.ticket) record.set("ticket", String(opts.ticket));
  record.set("type", opts.type || "status");
  record.set("title", String(opts.title || "").slice(0, 200));
  record.set("body", String(opts.body || "").slice(0, 500));
  record.set("is_read", false);

  app.save(record);
  return record;
}

function ticketLabel(ticket) {
  if (!ticket) return "";
  return (
    String(ticket.get("ticket_no") || "") +
    " · " +
    String(ticket.get("title") || "")
  );
}

// IT Lead milik satu rumah sakit. Dipakai sebagai gate CAB: komite perubahan
// tetap milik rumah sakit, sehingga jumlah lead vendor tidak mengubah alur
// approval tenant mana pun.
function activeLeads(app, tenantId) {
  if (!tenantId) return [];

  return app.findRecordsByFilter(
    "users",
    "role = 'it_lead' && is_active = true && tenant = {:tenant}",
    "name",
    50,
    0,
    { tenant: tenantId }
  );
}

// IT Lead vendor (scope platform) yang menangani semua rumah sakit.
function platformLeads(app) {
  return app.findRecordsByFilter(
    "users",
    "role = 'it_lead' && is_active = true && is_platform_staff = true",
    "name",
    50,
    0
  );
}

// Penerima notifikasi approval: lead rumah sakit + lead vendor, tanpa duplikat.
function approvalAlerts(app, tenantId) {
  var recipients = [];
  var seen = {};

  function push(list) {
    for (var i = 0; i < list.length; i++) {
      var id = String(list[i].id || "");
      if (!id || seen[id]) continue;
      seen[id] = true;
      recipients.push(list[i]);
    }
  }

  push(activeLeads(app, tenantId));
  push(platformLeads(app));

  return recipients;
}

function notifyTicketRecipients(app, ticket, opts) {
  var tenant = String(ticket.get("tenant") || "");
  var actor = String(opts.actor || "");
  var label = ticketLabel(ticket);
  var seen = {};

  function send(userId, type, title, body) {
    if (!userId) return;
    if (String(userId) === actor) return;
    if (seen[String(userId)]) return;
    seen[String(userId)] = true;

    create(app, {
      tenant: tenant,
      user: userId,
      ticket: ticket.id,
      actor: actor,
      type: type,
      title: title,
      body: body || label,
    });
  }

  send(ticket.get("requester"), opts.requesterType || "status", opts.requesterTitle || opts.title, label);

  if (opts.alsoAssignee) {
    send(ticket.get("assignee"), opts.assigneeType || "status", opts.assigneeTitle || opts.title, label);
  }

  if (opts.leads) {
    var leads = activeLeads(app, tenant);
    for (var i = 0; i < leads.length; i++) {
      send(leads[i].id, opts.leadType || "sla", opts.leadTitle || opts.title, label);
    }
  }
}

module.exports = {
  create: create,
  ticketLabel: ticketLabel,
  activeLeads: activeLeads,
  platformLeads: platformLeads,
  approvalAlerts: approvalAlerts,
  notifyTicketRecipients: notifyTicketRecipients,
};
