// Bentuk data profil yang aman dikirim ke klien (tanpa field SSO internal).

function serialize(user) {
  return {
    id: user.id,
    email: String(user.get("email") || ""),
    name: String(user.get("name") || ""),
    phone: String(user.get("phone") || ""),
    employee_no: String(user.get("employee_no") || ""),
    role: String(user.get("role") || ""),
    job_title: String(user.get("job_title") || ""),
    team: String(user.get("team") || ""),
    unit: String(user.get("unit") || ""),
    tenant: String(user.get("tenant") || ""),
    avatar: String(user.get("avatar") || ""),
    is_active: Boolean(user.get("is_active")),
    must_change_password: Boolean(user.get("must_change_password")),
    totp_enabled: Boolean(user.get("totp_enabled")),
    email_notifications: !Boolean(user.get("email_opt_out")),
  };
}

// Lengkapi dengan nama unit/tenant supaya halaman profil tidak perlu query
// tambahan dari browser.
function details(app, user) {
  var data = serialize(user);

  try {
    var unit = app.findRecordById("units", String(user.get("unit") || ""));
    data.unit_name = String(unit.get("name") || "");
  } catch (err) {
    data.unit_name = "";
  }

  try {
    var tenant = app.findRecordById("tenants", String(user.get("tenant") || ""));
    data.tenant_name = String(tenant.get("name") || "");
  } catch (err) {
    data.tenant_name = "";
  }

  return data;
}

module.exports = {
  serialize: serialize,
  details: details,
};
