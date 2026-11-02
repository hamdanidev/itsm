function requestMeta(e) {
  var ip = "";
  var ua = "";

  try {
    if (e && typeof e.realIP === "function") ip = String(e.realIP() || "");
  } catch (err) {
    ip = "";
  }

  try {
    if (e && e.request && e.request.header) {
      ua = String(e.request.header.get("User-Agent") || "");
    }
  } catch (err) {
    ua = "";
  }

  return { ip: ip, user_agent: ua };
}

function isPlatformActor(actor) {
  try {
    return !!(
      actor &&
      typeof actor.get === "function" &&
      actor.get("is_platform_staff")
    );
  } catch (err) {
    return false;
  }
}

function write(app, opts) {
  var collection = app.findCollectionByNameOrId("audit_logs");
  var record = new Record(collection);

  var platform = isPlatformActor(opts.actor);
  var tenant = opts.tenant || "";
  if (!tenant && opts.ticket) tenant = opts.ticket.get("tenant");
  if (!tenant && opts.actor && !platform) tenant = opts.actor.get("tenant");

  // Baris audit akun platform tidak punya tenant. Baris seperti itu hanya
  // terlihat superuser karena list/view rule mewajibkan tenant yang sama.
  if (!tenant && !platform) {
    throw new Error("Audit log requires a tenant");
  }

  record.set("tenant", tenant);
  record.set("action", opts.action);
  record.set("collection_name", opts.collection_name || "");
  record.set("record_id", opts.record_id || "");
  record.set("changes", opts.changes || {});
  record.set("ip", opts.ip || "");
  record.set("user_agent", opts.user_agent || "");

  if (opts.ticket) {
    record.set("ticket", opts.ticket.id);
    if (!opts.record_id) record.set("record_id", opts.ticket.id);
  }

  if (opts.actor) {
    record.set("actor", opts.actor.id);

    var actorRole = String(opts.actor.get("role") || "");
    record.set("actor_role", platform ? "platform_" + actorRole : actorRole);

    if (!opts.record_id) record.set("record_id", opts.actor.id);
  } else if (opts.actor_role) {
    record.set("actor_role", opts.actor_role);
  }

  app.save(record);
  return record;
}

module.exports = {
  write: write,
  requestMeta: requestMeta,
};
