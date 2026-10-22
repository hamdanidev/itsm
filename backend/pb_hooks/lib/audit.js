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

function write(app, opts) {
  var collection = app.findCollectionByNameOrId("audit_logs");
  var record = new Record(collection);

  var tenant = opts.tenant || "";
  if (!tenant && opts.ticket) tenant = opts.ticket.get("tenant");
  if (!tenant && opts.actor) tenant = opts.actor.get("tenant");

  if (!tenant) {
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
    record.set("actor_role", String(opts.actor.get("role") || ""));
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
