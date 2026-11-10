// Kelola tim rumah sakit oleh IT Lead: lihat, tambah, ubah, nonaktifkan, dan
// reset password staf di tenant sendiri.
//
// Semua fungsi di sini dipanggil dari route /api/itsm/team; tenant selalu
// berasal dari `e.auth`, tidak pernah dari body request.

var ROLES = ["requester", "it_support", "resolver", "it_lead", "viewer"];

var ROLE_LABELS = {
  requester: "Pemohon",
  it_support: "Staff IT",
  resolver: "Teknisi",
  it_lead: "Kepala IT",
  viewer: "Pengamat",
};

// Batas aman untuk satu berkas impor; satu RS pilot memiliki 300-800 staf.
var MAX_IMPORT_ROWS = 1000;

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
    job_title: String(record.get("job_title") || ""),
    team: String(record.get("team") || ""),
    unit: String(record.get("unit") || ""),
    unit_name: String(unitName || ""),
    is_active: Boolean(record.get("is_active")),
    must_change_password: Boolean(record.get("must_change_password")),
    totp_enabled: Boolean(record.get("totp_enabled")),
    login_failed_count: Number(record.get("login_failed_count") || 0),
    login_locked_until: String(record.get("login_locked_until") || ""),
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

// Daftar anggota tim dengan pagination + pencarian nama/email.
// `options` boleh kosong agar pemanggil lama tetap mendapat halaman pertama.
function list(app, tenantId, options) {
  var paging = require(__hooks + "/lib/paging.js");
  var opts = options || {};
  var page = Math.max(1, parseInt(String(opts.page || 1), 10) || 1);
  var perPage = Math.min(
    paging.MAX_PER_PAGE,
    Math.max(1, parseInt(String(opts.perPage || paging.DEFAULT_PER_PAGE), 10) || paging.DEFAULT_PER_PAGE)
  );
  var q = String(opts.q || "").trim();

  var filter = "tenant = {:tenant} && is_platform_staff != true";
  var params = { tenant: tenantId };

  if (q) {
    filter += " && (name ~ {:q} || email ~ {:q})";
    params.q = q;
  }

  var totalItems = paging.count(app, "users", filter, params);
  var names = unitNames(app, tenantId);
  var records = app.findRecordsByFilter(
    "users",
    filter,
    "name",
    perPage,
    (page - 1) * perPage,
    params
  );
  var items = [];

  for (var i = 0; i < records.length; i++) {
    items.push(
      serialize(records[i], names[String(records[i].get("unit") || "")] || "")
    );
  }

  var meta = paging.meta(page, perPage, totalItems);
  meta.items = items;

  return meta;
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

// Menyimpan satu akun staf baru dengan password acak. Dipakai route tambah
// anggota maupun impor CSV; password hanya dikembalikan sekali.
function insertMember(app, tenantId, input) {
  var password = generatedPassword();
  var collection = app.findCollectionByNameOrId("users");
  var record = new Record(collection);

  record.set("email", input.email);
  record.set("emailVisibility", true);
  record.set("verified", true);
  record.set("name", input.name);
  record.set("role", input.role);
  if (input.job_title) record.set("job_title", input.job_title);
  if (input.team) record.set("team", input.team);
  record.set("tenant", tenantId);
  record.set("is_active", true);
  record.set("is_platform_staff", false);
  record.set("must_change_password", true);
  if (input.unit) record.set("unit", input.unit);
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

// Membuat akun staf dengan password acak. Password hanya dikembalikan sekali
// lewat respons route, tidak pernah disimpan dalam bentuk terbaca.
function create(app, tenantId, input) {
  var name = text(input.name, 120);
  var email = text(input.email, 200).toLowerCase();
  var role = text(input.role, 20);
  var jobTitle = text(input.job_title, 80);
  var team = text(input.team, 20);
  var unit = text(input.unit, 64);
  var constants = require(__hooks + "/lib/constants.js");

  if (name.length < 2) {
    throw new BadRequestError("Nama minimal 2 karakter");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BadRequestError("Email tidak valid");
  }
  if (ROLES.indexOf(role) < 0) {
    throw new BadRequestError(
      "Role harus Pemohon, Staff IT, Teknisi, Kepala IT, atau Pengamat"
    );
  }
  if (team && constants.TEAMS.indexOf(team) < 0) {
    throw new BadRequestError("Tim tidak valid");
  }

  assertUnit(app, tenantId, unit);
  assertEmailFree(app, email);

  return insertMember(app, tenantId, {
    name: name,
    email: email,
    role: role,
    job_title: jobTitle,
    team: team,
    unit: unit,
  });
}

// ---------------------------------------------------------------------------
// Impor CSV
// ---------------------------------------------------------------------------

// Kunci longgar untuk mencocokkan role/tim dalam bahasa Indonesia maupun kunci
// internal: "Staff IT", "it_support", dan "IT Support" dianggap sama.
function normalizeKey(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeHeader(value) {
  return String(value == null ? "" : value)
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function resolveRole(value) {
  var key = normalizeKey(value);
  if (!key) return "";

  for (var i = 0; i < ROLES.length; i++) {
    if (normalizeKey(ROLES[i]) === key) return ROLES[i];
    if (normalizeKey(ROLE_LABELS[ROLES[i]]) === key) return ROLES[i];
  }

  return "";
}

function resolveTeam(value) {
  var key = normalizeKey(value);
  if (!key) return "";

  var constants = require(__hooks + "/lib/constants.js");

  for (var i = 0; i < constants.TEAMS.length; i++) {
    if (normalizeKey(constants.TEAMS[i]) === key) return constants.TEAMS[i];
    if (normalizeKey(constants.TEAM_LABELS[constants.TEAMS[i]]) === key) {
      return constants.TEAMS[i];
    }
  }

  return "";
}

// Peta unit per tenant: kode diutamakan, lalu nama. Nama ganda ditandai agar
// baris impor tidak menebak unit yang salah.
function unitLookup(app, tenantId) {
  var records = app.findRecordsByFilter(
    "units",
    "tenant = {:tenant}",
    "",
    0,
    0,
    { tenant: tenantId }
  );
  var byCode = {};
  var byName = {};

  for (var i = 0; i < records.length; i++) {
    var code = String(records[i].get("code") || "").trim().toLowerCase();
    var name = String(records[i].get("name") || "").trim().toLowerCase();

    if (code) byCode[code] = records[i];
    if (name) {
      if (!byName[name]) byName[name] = [];
      byName[name].push(records[i]);
    }
  }

  return { byCode: byCode, byName: byName };
}

function resolveUnit(lookup, value) {
  var key = String(value == null ? "" : value).trim().toLowerCase();
  if (!key) return { record: null, error: "" };

  if (lookup.byCode[key]) return { record: lookup.byCode[key], error: "" };

  var matches = lookup.byName[key] || [];
  if (matches.length === 1) return { record: matches[0], error: "" };
  if (matches.length > 1) {
    return {
      record: null,
      error: "Nama unit ambigu; gunakan kode unit: " + String(value),
    };
  }

  return {
    record: null,
    error: "Unit tidak ditemukan: " + String(value),
  };
}

function existingEmailSet(app) {
  var records = app.findRecordsByFilter("users", "email != ''", "", 0, 0);
  var emails = {};

  for (var i = 0; i < records.length; i++) {
    var email = String(records[i].get("email") || "").trim().toLowerCase();
    if (email) emails[email] = true;
  }

  return emails;
}

var HEADER_ALIASES = {
  nama: "name",
  name: "name",
  "nama lengkap": "name",
  email: "email",
  "e-mail": "email",
  "alamat email": "email",
  role: "role",
  peran: "role",
  unit: "unit",
  "nama unit": "unit",
  tim: "team",
  team: "team",
  jabatan: "job_title",
  "job title": "job_title",
  job_title: "job_title",
};

// Kolom yang wajib ada di header. Unit dan tim boleh kosong per baris, tetapi
// kolomnya harus ada supaya pemetaan tidak ditebak.
var REQUIRED_HEADERS = ["name", "email", "role", "unit", "team"];

function mapHeaders(cells) {
  var mapping = {};

  for (var i = 0; i < cells.length; i++) {
    var field = HEADER_ALIASES[normalizeHeader(cells[i])];
    if (!field) continue;
    if (mapping[field] !== undefined) {
      throw new BadRequestError(
        "Kolom " + field + " muncul lebih dari sekali pada header CSV"
      );
    }
    mapping[field] = i;
  }

  var missing = [];

  for (var r = 0; r < REQUIRED_HEADERS.length; r++) {
    var required = REQUIRED_HEADERS[r];
    if (mapping[required] === undefined) {
      missing.push(
        required === "name"
          ? "nama"
          : required === "team"
            ? "tim"
            : required
      );
    }
  }

  if (missing.length) {
    throw new BadRequestError(
      "Header CSV harus memuat kolom: nama, email, role, unit, tim. " +
        "Kolom tidak ditemukan: " +
        missing.join(", ")
    );
  }

  return mapping;
}

function cellValue(cells, mapping, field) {
  var index = mapping[field];
  if (index === undefined) return "";
  return String(cells[index] == null ? "" : cells[index]).trim();
}

// Memvalidasi seluruh baris lebih dulu, lalu membuat akun hanya untuk baris
// yang lolos. Baris gagal tidak membatalkan baris lain; ringkasan per baris
// dikembalikan ke UI agar Kepala IT dapat memperbaiki berkas dan mengulang.
function importCsv(app, tenantId, csvText) {
  var csv = require(__hooks + "/lib/csv.js");
  var parsed = csv.parse(csvText);

  if (!parsed.length) {
    throw new BadRequestError("Berkas CSV kosong");
  }

  var mapping = mapHeaders(parsed[0]);
  var rows = parsed.slice(1);

  if (!rows.length) {
    throw new BadRequestError(
      "Berkas CSV hanya berisi header; tambahkan minimal satu baris anggota"
    );
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new BadRequestError(
      "Satu berkas maksimal " + MAX_IMPORT_ROWS + " baris; pecah menjadi beberapa berkas"
    );
  }

  var units = unitLookup(app, tenantId);
  var emails = existingEmailSet(app);
  var seen = {};
  var imported = [];
  var failed = [];

  for (var i = 0; i < rows.length; i++) {
    var cells = rows[i];
    var rowNumber = i + 2;
    var name = cellValue(cells, mapping, "name");
    var email = cellValue(cells, mapping, "email").toLowerCase();
    var roleInput = cellValue(cells, mapping, "role");
    var teamInput = cellValue(cells, mapping, "team");
    var unitInput = cellValue(cells, mapping, "unit");
    var jobTitle = cellValue(cells, mapping, "job_title");
    var errors = [];

    if (name.length < 2) {
      errors.push("Nama minimal 2 karakter");
    } else if (name.length > 120) {
      errors.push("Nama maksimal 120 karakter");
    }

    if (!email) {
      errors.push("Email wajib diisi");
    } else if (email.length > 200) {
      errors.push("Email maksimal 200 karakter");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push("Email tidak valid");
    } else if (seen[email]) {
      errors.push("Email duplikat di dalam berkas (baris " + seen[email] + ")");
    } else if (emails[email]) {
      errors.push("Email sudah dipakai pengguna lain");
    }

    var role = resolveRole(roleInput);
    if (!roleInput) {
      errors.push("Role wajib diisi");
    } else if (!role) {
      errors.push(
        "Role tidak dikenal: " +
          roleInput +
          " (pakai Pemohon, Staff IT, Teknisi, Kepala IT, atau Pengamat)"
      );
    }

    var team = "";
    if (teamInput) {
      team = resolveTeam(teamInput);
      if (!team) {
        errors.push("Tim tidak dikenal: " + teamInput);
      }
    }

    var unit = "";
    var unitName = "";
    if (unitInput) {
      var unitMatch = resolveUnit(units, unitInput);
      if (unitMatch.error) {
        errors.push(unitMatch.error);
      } else {
        unit = unitMatch.record.id;
        unitName = String(unitMatch.record.get("name") || "");

        if (!unitMatch.record.get("is_active")) {
          errors.push("Unit nonaktif: " + unitName);
        }
      }
    }

    if (jobTitle.length > 80) {
      errors.push("Jabatan maksimal 80 karakter");
    }

    if (errors.length) {
      failed.push({
        row: rowNumber,
        name: name,
        email: email,
        errors: errors,
      });
      continue;
    }

    try {
      var created = insertMember(app, tenantId, {
        name: name,
        email: email,
        role: role,
        job_title: jobTitle,
        team: team,
        unit: unit,
      });

      seen[email] = rowNumber;
      emails[email] = true;
      imported.push({
        row: rowNumber,
        id: created.record.id,
        name: name,
        email: email,
        role: role,
        job_title: jobTitle,
        team: team,
        unit: unit,
        unit_name: unitName,
        password: created.password,
      });
    } catch (err) {
      failed.push({
        row: rowNumber,
        name: name,
        email: email,
        errors: [String((err && err.message) || err)],
      });
    }
  }

  return {
    summary: {
      total: rows.length,
      imported: imported.length,
      failed: failed.length,
    },
    imported: imported,
    failed: failed,
  };
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
        "Role harus Pemohon, Staff IT, Teknisi, Kepala IT, atau Pengamat"
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
          "Tidak dapat menurunkan Kepala IT aktif terakhir"
        );
      }

      changes.role = { from: currentRole, to: role };
      record.set("role", role);
    }
  }

  if (input.team !== undefined) {
    var team = text(input.team, 20);
    var constants = require(__hooks + "/lib/constants.js");

    if (team && constants.TEAMS.indexOf(team) < 0) {
      throw new BadRequestError("Tim tidak valid");
    }
    if (team !== String(record.get("team") || "")) {
      changes.team = { from: String(record.get("team") || ""), to: team };
      record.set("team", team);
    }
  }

  if (input.job_title !== undefined) {
    var jobTitle = text(input.job_title, 80);

    if (jobTitle !== String(record.get("job_title") || "")) {
      changes.job_title = {
        from: String(record.get("job_title") || ""),
        to: jobTitle,
      };
      record.set("job_title", jobTitle);
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
          "Tidak dapat menonaktifkan Kepala IT aktif terakhir"
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

// Mencari anggota tenant sendiri; akun platform dan tenant lain selalu 404.
function findMember(app, tenantId, userId) {
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

  return record;
}

function resetPassword(app, tenantId, userId) {
  var record = findMember(app, tenantId, userId);
  var password = generatedPassword();

  record.setPassword(password);
  record.set("must_change_password", true);
  record.refreshTokenKey();
  app.save(record);

  return { record: record, password: password };
}

module.exports = {
  ROLES: ROLES,
  MAX_IMPORT_ROWS: MAX_IMPORT_ROWS,
  serialize: serialize,
  list: list,
  create: create,
  importCsv: importCsv,
  update: update,
  resetPassword: resetPassword,
  findMember: findMember,
  activeLeads: activeLeads,
};
