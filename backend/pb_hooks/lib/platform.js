// Helper Konsol Vendor: validasi input, serialisasi, dan hitungan per tenant.
// Semua fungsi di sini dipanggil dari dalam request hook, kecuali yang murni
// (normalizeCode, normalizeTimezone, validateTenantInput, validateUserInput)
// sehingga bisa diuji unit tanpa PocketBase.

var CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,19}$/;
var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
var TIMEZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

var ROLES = ["requester", "it_support", "it_lead"];
var DEFAULT_TIMEZONE = "Asia/Jakarta";

function text(value, max) {
  var result = String(value == null ? "" : value).trim();
  if (max && result.length > max) {
    throw new BadRequestError("Teks melebihi " + max + " karakter");
  }
  return result;
}

function normalizeCode(raw) {
  return String(raw == null ? "" : raw)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function normalizeTimezone(raw) {
  var value = String(raw == null ? "" : raw).trim();
  if (!value) return DEFAULT_TIMEZONE;
  return value;
}

function isValidTimezone(value) {
  return TIMEZONE_PATTERN.test(String(value || ""));
}

// Mengembalikan objek bersih siap `record.set`. `partial` dipakai untuk PATCH:
// field yang tidak dikirim tidak ikut diubah.
function validateTenantInput(body, partial) {
  var input = body || {};
  var output = {};

  if (!partial || input.name !== undefined) {
    var name = text(input.name, 120);
    if (name.length < 2) {
      throw new BadRequestError("Nama rumah sakit minimal 2 karakter");
    }
    output.name = name;
  }

  if (!partial || input.code !== undefined) {
    var code = normalizeCode(input.code);
    if (!CODE_PATTERN.test(code)) {
      throw new BadRequestError(
        "Kode rumah sakit 2–20 karakter: huruf, angka, titik, garis bawah, atau strip"
      );
    }
    output.code = code;
  }

  if (!partial || input.timezone !== undefined) {
    var timezone = normalizeTimezone(input.timezone);
    if (!isValidTimezone(timezone)) {
      throw new BadRequestError("Zona waktu tidak valid");
    }
    output.timezone = timezone;
  }

  if (input.is_active !== undefined) {
    output.is_active = Boolean(input.is_active);
  }

  return output;
}

function validateUserInput(body, options) {
  var input = body || {};
  // Menerima `true` sebagai singkatan `{ partial: true }` agar pemanggil tidak
  // perlu membungkus opsi untuk kasus yang paling sering dipakai.
  var opts = options === true ? { partial: true } : options || {};
  var output = {};

  if (!opts.partial || input.name !== undefined) {
    var name = text(input.name, 120);
    if (name.length < 2) {
      throw new BadRequestError("Nama pengguna minimal 2 karakter");
    }
    output.name = name;
  }

  if (!opts.partial || input.email !== undefined) {
    var email = text(input.email, 200).toLowerCase();
    if (!EMAIL_PATTERN.test(email)) {
      throw new BadRequestError("Email tidak valid");
    }
    output.email = email;
  }

  if (!opts.partial || input.role !== undefined) {
    var role = text(input.role, 20);
    if (ROLES.indexOf(role) < 0) {
      throw new BadRequestError("Role harus requester, it_support, atau it_lead");
    }
    output.role = role;
  }

  if (!opts.partial || input.password !== undefined) {
    var password = String(input.password == null ? "" : input.password);

    if (!opts.partial) {
      if (password.length < 8) {
        throw new BadRequestError("Password minimal 8 karakter");
      }
      output.password = password;
    } else if (password) {
      if (password.length < 8) {
        throw new BadRequestError("Password minimal 8 karakter");
      }
      output.password = password;
    }
  }

  if (input.unit !== undefined) {
    output.unit = text(input.unit, 64);
  }

  if (input.is_active !== undefined) {
    output.is_active = Boolean(input.is_active);
  }

  return output;
}

function serializeTenant(record, counts) {
  return {
    id: record.id,
    name: String(record.get("name") || ""),
    code: String(record.get("code") || ""),
    timezone: String(record.get("timezone") || "") || DEFAULT_TIMEZONE,
    is_active: Boolean(record.get("is_active")),
    created: String(record.get("created") || ""),
    counts: counts || null,
  };
}

function serializeUser(record, unitName) {
  return {
    id: record.id,
    email: String(record.get("email") || ""),
    name: String(record.get("name") || ""),
    role: String(record.get("role") || ""),
    unit: String(record.get("unit") || ""),
    unit_name: String(unitName || ""),
    is_active: Boolean(record.get("is_active")),
    created: String(record.get("created") || ""),
  };
}

// Hitungan cepat per tenant. `countRecords` dipakai bila tersedia; kalau tidak,
// jatuh ke pembacaan penuh (dataset konsol masih kecil).
function countWhere(app, collection, filter, params) {
  try {
    return Number(app.countRecords(collection, filter, params)) || 0;
  } catch (err) {
    // lanjut ke fallback
  }

  try {
    return app.findRecordsByFilter(collection, filter, "", 0, 0, params).length;
  } catch (err) {
    return 0;
  }
}

function countsFor(app, tenantId) {
  var params = { tenant: tenantId };

  return {
    users: countWhere(app, "users", "tenant = {:tenant}", params),
    units: countWhere(app, "units", "tenant = {:tenant}", params),
    categories: countWhere(app, "ticket_categories", "tenant = {:tenant}", params),
    policies: countWhere(app, "sla_policies", "tenant = {:tenant}", params),
    tickets: countWhere(app, "tickets", "tenant = {:tenant}", params),
    open_tickets: countWhere(
      app,
      "tickets",
      'tenant = {:tenant} && status != "resolved" && status != "closed"',
      params
    ),
  };
}

// ---------------------------------------------------------------------------
// Helper request (dipanggil dari route /api/itsm/platform/*)
//
// Fungsi top-level di file *.pb.js tidak dapat diakses dari handler karena
// PocketBase mengevaluasi handler di konteks VM baru; karena itu helper request
// tinggal di modul ini.
// ---------------------------------------------------------------------------

function requirePlatform(e, adminOnly) {
  var guards = require(__hooks + "/lib/guards.js");
  var auth = guards.requireAuth(e);

  if (adminOnly) guards.assertPlatformAdmin(auth);
  else guards.assertPlatformStaff(auth);

  return auth;
}

function findTenant(app, id) {
  try {
    return app.findRecordById("tenants", String(id || ""));
  } catch (err) {
    throw new NotFoundError("Rumah sakit tidak ditemukan");
  }
}

function findTenantUser(app, tenantId, userId) {
  var user;

  try {
    user = app.findRecordById("users", String(userId || ""));
  } catch (err) {
    throw new NotFoundError("Pengguna tidak ditemukan");
  }

  if (
    String(user.get("tenant") || "") !== String(tenantId) ||
    Boolean(user.get("is_platform_staff"))
  ) {
    throw new NotFoundError("Pengguna tidak ditemukan");
  }

  return user;
}

// Membuat akun rumah sakit. Tidak lewat collection API sehingga
// `users.createRule = null` (superuser saja) tetap berlaku untuk jalur biasa.
function createTenantUser(app, tenantId, input) {
  var duplicated = app.findRecordsByFilter(
    "users",
    "email = {:email}",
    "",
    1,
    0,
    { email: input.email }
  );

  if (duplicated.length > 0) {
    throw new BadRequestError("Email sudah dipakai pengguna lain");
  }

  var collection = app.findCollectionByNameOrId("users");
  var record = new Record(collection);

  record.set("email", input.email);
  record.set("emailVisibility", true);
  record.set("verified", true);
  record.set("name", input.name);
  record.set("role", input.role);
  record.set("tenant", tenantId);
  record.set("is_active", input.is_active !== false);
  record.set("is_platform_staff", false);
  if (input.unit) record.set("unit", input.unit);
  record.setPassword(input.password);

  try {
    app.save(record);
  } catch (err) {
    throw new BadRequestError(
      "Gagal menyimpan pengguna. Periksa email dan kekuatan password."
    );
  }

  return record;
}

function writeAudit(e, auth, opts) {
  var audit = require(__hooks + "/lib/audit.js");

  try {
    var meta = audit.requestMeta(e);

    audit.write(e.app, {
      tenant: opts.tenant || "",
      actor: e.app.findRecordById("users", auth.id),
      action: opts.action,
      collection_name: opts.collection_name || "",
      record_id: opts.record_id || "",
      changes: opts.changes || {},
      ip: meta.ip,
      user_agent: meta.user_agent,
    });
  } catch (err) {
    // Audit tidak boleh menggagalkan operasi konsol, tetapi harus terlihat di log.
    console.log("Platform audit failed: " + String(err));
  }
}

module.exports = {
  ROLES: ROLES,
  DEFAULT_TIMEZONE: DEFAULT_TIMEZONE,
  normalizeCode: normalizeCode,
  normalizeTimezone: normalizeTimezone,
  isValidTimezone: isValidTimezone,
  validateTenantInput: validateTenantInput,
  validateUserInput: validateUserInput,
  serializeTenant: serializeTenant,
  serializeUser: serializeUser,
  countWhere: countWhere,
  countsFor: countsFor,
  requirePlatform: requirePlatform,
  findTenant: findTenant,
  findTenantUser: findTenantUser,
  createTenantUser: createTenantUser,
  writeAudit: writeAudit,
};
