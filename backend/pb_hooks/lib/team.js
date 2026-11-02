// Kelola tim rumah sakit oleh IT Lead: lihat, tambah, ubah, nonaktifkan, dan
// reset password staf di tenant sendiri.
//
// Semua fungsi di sini dipanggil dari route /api/itsm/team; tenant selalu
// berasal dari `e.auth`, tidak pernah dari body request.

var ROLES = ["requester", "it_support", "it_lead"];

// Tanpa karakter ambigu (0/O, 1/l/I) supaya mudah diserahkan secara lisan.
var PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function generatedPassword() {
  return $security.randomStringWithAlphabet(16, PASSWORD_ALPHABET);
}

function text(value, max) {
  var result = String(value == null ? "" : value).trim();
  if (max && result.length > max) {
    throw new BadRequestError("Teks melebihi " + max + " karakter");
  }
  return result;
}

function serialize(record, unitName) {
  return {
    id: record.id,
    email: String(record.get("email") || ""),
    name: String(record.get("name") || ""),
    role: String(record.get("role") || ""),
    unit: String(record.get("unit") || ""),
    unit_name: String(unitName || ""),
    is_active: Boolean(record.get("is_active")),
    must_change_password: Boolean(record.get("must_change_password")),
    created: String(record.get("created") || ""),
  };
}

function unitNames(app, tenantId) {
  var map = {};
  var records = app.findRecordsByFilter(
    "units",
    "tenant = {:tenant}",
    "",
    0,
    0,
    { tenant: tenantId }
  );

  for (var i = 0; i < records.length; i++) {
    map[records[i].id] = String(records[i].get("name") || "");
  }

  return map;
}

function list(app, tenantId) {
  var names = unitNames(app, tenantId);
  var records = app.findRecordsByFilter(
    "users",
    "tenant = {:tenant} && is_platform_staff != true",
    "name",
    500,
    0,
    { tenant: tenantId }
  );
  var items = [];

  for (var i = 0; i < records.length; i++) {
    items.push(
      serialize(records[i], names[String(records[i].get("unit") || "")] || "")
    );
  }

  return items;
}

function activeLeads(app, tenantId, excludeId) {
  var records = app.findRecordsByFilter(
    "users",
    'tenant = {:tenant} && role = "it_lead" && is_active = true && is_platform_staff != true',
    "",
    0,
    0,
    { tenant: tenantId }
  );
  var leads = [];

  for (var i = 0; i < records.length; i++) {
    if (excludeId && records[i].id === excludeId) continue;
    leads.push(records[i]);
  }

  return leads;
}

function assertUnit(app, tenantId, unitId) {
  if (!unitId) return;

  var units = app.findRecordsByFilter(
    "units",
    "id = {:unit} && tenant = {:tenant}",
    "",
    1,
    0,
    { unit: unitId, tenant: tenantId }
  );

  if (!units.length) {
    throw new BadRequestError("Unit tidak ditemukan pada rumah sakit ini");
  }
}

function assertEmailFree(app, email) {
  var existing = app.findRecordsByFilter(
    "users",
    "email = {:email}",
    "",
    1,
    0,
    { email: email }
  );

  if (existing.length) {
    throw new BadRequestError("Email sudah dipakai pengguna lain");
  }
}

// Membuat akun staf dengan password acak. Password hanya dikembalikan sekali
// lewat respons route, tidak pernah disimpan dalam bentuk terbaca.
function create(app, tenantId, input) {
  var name = text(input.name, 120);
  var email = text(input.email, 200).toLowerCase();
  var role = text(input.role, 20);
  var unit = text(input.unit, 64);

  if (name.length < 2) {
    throw new BadRequestError("Nama minimal 2 karakter");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestError("Email tidak valid");
  }
  if (ROLES.indexOf(role) < 0) {
    throw new BadRequestError("Role harus requester, it_support, atau it_lead");
  }

  assertUnit(app, tenantId, unit);
  assertEmailFree(app, email);

  var password = generatedPassword();
  var collection = app.findCollectionByNameOrId("users");
  var record = new Record(collection);

  record.set("email", email);
  record.set("emailVisibility", true);
  record.set("verified", true);
  record.set("name", name);
  record.set("role", role);
  record.set("tenant", tenantId);
  record.set("is_active", true);
  record.set("is_platform_staff", false);
  record.set("must_change_password", true);
  if (unit) record.set("unit", unit);
  record.setPassword(password);

  try {
    app.save(record);
  } catch (err) {
    throw new BadRequestError(
      "Gagal menyimpan pengguna. Periksa email dan coba lagi."
    );
  }

  return { record: record, password: password };
}

// `changes` dihitung dari nilai lama untuk audit dan pengembalian.
function update(app, tenantId, userId, input, actorId) {
  var record;

  try {
    record = app.findRecordById("users", String(userId || ""));
  } catch (err) {
    throw new NotFoundError("Pengguna tidak ditemukan");
  }

  if (
    String(record.get("tenant") || "") !== tenantId ||
    Boolean(record.get("is_platform_staff"))
  ) {
    throw new NotFoundError("Pengguna tidak ditemukan");
  }

  var currentRole = String(record.get("role") || "");
  var currentActive = Boolean(record.get("is_active"));
  var changes = {};

  if (input.name !== undefined) {
    var name = text(input.name, 120);

    if (name.length < 2) {
      throw new BadRequestError("Nama minimal 2 karakter");
    }
    if (name !== String(record.get("name") || "")) {
      changes.name = { from: String(record.get("name") || ""), to: name };
      record.set("name", name);
    }
  }

  if (input.role !== undefined) {
    var role = text(input.role, 20);

    if (ROLES.indexOf(role) < 0) {
      throw new BadRequestError(
        "Role harus requester, it_support, atau it_lead"
      );
    }
    if (role !== currentRole) {
      if (String(actorId) === record.id) {
        throw new BadRequestError("Anda tidak dapat mengubah role sendiri");
      }
      if (
        currentRole === "it_lead" &&
        role !== "it_lead" &&
        activeLeads(app, tenantId, record.id).length === 0
      ) {
        throw new BadRequestError(
          "Tidak dapat menurunkan IT Lead aktif terakhir"
        );
      }

      changes.role = { from: currentRole, to: role };
      record.set("role", role);
    }
  }

  if (input.unit !== undefined) {
    var unit = text(input.unit, 64);

    assertUnit(app, tenantId, unit);

    if (unit !== String(record.get("unit") || "")) {
      changes.unit = { from: String(record.get("unit") || ""), to: unit };
      record.set("unit", unit);
    }
  }

  if (input.is_active !== undefined) {
    var active = Boolean(input.is_active);

    if (active !== currentActive) {
      if (!active && String(actorId) === record.id) {
        throw new BadRequestError("Anda tidak dapat menonaktifkan akun sendiri");
      }
      if (
        !active &&
        currentRole === "it_lead" &&
        activeLeads(app, tenantId, record.id).length === 0
      ) {
        throw new BadRequestError(
          "Tidak dapat menonaktifkan IT Lead aktif terakhir"
        );
      }

      changes.is_active = { from: currentActive, to: active };
      record.set("is_active", active);

      // Menonaktifkan akun juga memutus sesi yang masih berjalan.
      if (!active) record.refreshTokenKey();
    }
  }

  if (!Object.keys(changes).length) {
    throw new BadRequestError("Tidak ada perubahan yang dikirim");
  }

  app.save(record);

  return { record: record, changes: changes };
}

function resetPassword(app, tenantId, userId) {
  var record;

  try {
    record = app.findRecordById("users", String(userId || ""));
  } catch (err) {
    throw new NotFoundError("Pengguna tidak ditemukan");
  }

  if (
    String(record.get("tenant") || "") !== tenantId ||
    Boolean(record.get("is_platform_staff"))
  ) {
    throw new NotFoundError("Pengguna tidak ditemukan");
  }

  var password = generatedPassword();

  record.setPassword(password);
  record.set("must_change_password", true);
  record.refreshTokenKey();
  app.save(record);

  return { record: record, password: password };
}

module.exports = {
  ROLES: ROLES,
  serialize: serialize,
  list: list,
  create: create,
  update: update,
  resetPassword: resetPassword,
  activeLeads: activeLeads,
};
