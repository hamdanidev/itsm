onBootstrap((e) => {
  e.next();

  try {
    $app.cron().setTimezone(new Timezone("Asia/Jakarta"));
  } catch (err) {
    console.log("Failed to set cron timezone", err);
  }

  console.log("Healthcare ITSM hooks loaded");
});

onRecordAuthRequest((e) => {
  e.next();

  try {
    var audit = require(__hooks + "/lib/audit.js");
    var tenant = e.record.get("tenant");
    if (!tenant) return;

    audit.write(e.app, {
      tenant: tenant,
      actor: e.record,
      action: "login",
      collection_name: "users",
      record_id: e.record.id,
      changes: {},
    });
  } catch (err) {
    // Authentication must not fail because audit logging failed.
    console.log("Login audit failed", err);
  }
}, "users");

onRecordEnrich((e) => {
  var info = e.requestInfo;
  var auth = info ? info.auth : null;

  var isSuperuser = false;
  try {
    isSuperuser = !!(info && info.hasSuperuserAuth && info.hasSuperuserAuth());
  } catch (err) {
    isSuperuser = false;
  }

  var isSelf = !!(auth && e.record.id === auth.id);
  var isLead = !!(auth && auth.get("role") === "it_lead");

  if (!isSuperuser && !isSelf && !isLead) {
    e.record.hide("phone");
    e.record.hide("employee_no");
    e.record.hide("external_id");
    e.record.hide("external_issuer");
    e.record.hide("external_groups");
  }

  e.next();
}, "users");

onRecordCreateRequest((e) => {
  throw new ForbiddenError("Audit logs are append-only");
}, "audit_logs");

onRecordUpdateRequest((e) => {
  throw new ForbiddenError("Audit logs are append-only");
}, "audit_logs");

onRecordDeleteRequest((e) => {
  throw new ForbiddenError("Audit logs are append-only");
}, "audit_logs");
