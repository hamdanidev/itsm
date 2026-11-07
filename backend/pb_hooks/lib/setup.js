// Setup awal instalasi (first-run).
//
// Instalasi dianggap baru selama belum ada satu pun akun aplikasi (`users`).
// Begitu akun pertama dibuat, setup tertutup permanen — tidak ada flag terpisah
// yang bisa lupa di-set atau dihapus.
//
// Halaman setup bisa membuat akun secara anonim, jadi aksesnya dilindungi kode
// setup sekali pakai:
//   - `SETUP_TOKEN` dari environment (paling cocok untuk deployment otomatis), atau
//   - kode acak yang dibuat saat pertama dibutuhkan, disimpan di
//     `<dataDir>/setup_token`, dan dicetak ke log server.
//
// Catatan: callback route berjalan di VM baru, jadi semua helper request ada di
// modul ini dan `require` dilakukan di dalam fungsi (bukan di top-level) agar
// modul juga bisa dimuat unit test Node.

var TOKEN_FILE = "setup_token";
var TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
var TOKEN_GROUPS = 4;
var TOKEN_GROUP_SIZE = 4;
var MIN_PASSWORD = 8;
var PLACEHOLDER_TENANT_NAME = "Rumah Sakit Contoh";
var DEFAULT_TIMEZONE = "Asia/Jakarta";

function readEnv(name) {
  try {
    if (typeof $os !== "undefined" && $os && typeof $os.getenv === "function") {
      return String($os.getenv(name) || "");
    }
  } catch (err) {
    // Environment tidak tersedia (mis. unit test Node).
  }

  return "";
}

// Gagal menghitung akun diperlakukan sebagai "sudah disiapkan" supaya route
// setup tidak terbuka karena error tak terduga (fail closed).
function setupRequired(app) {
  try {
    return Number(app.countRecords("users")) === 0;
  } catch (err) {
    return false;
  }
}

function tokenPath(app) {
  return String(app.dataDir() || "") + "/" + TOKEN_FILE;
}

// Kode setup dibandingkan tanpa memperhatikan huruf besar/kecil, spasi, atau
// tanda hubung supaya mudah disalin dari log server.
function normalizeToken(raw) {
  return String(raw == null ? "" : raw)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function generateToken() {
  var raw = $security.randomStringWithAlphabet(
    TOKEN_GROUPS * TOKEN_GROUP_SIZE,
    TOKEN_ALPHABET
  );
  var groups = [];

  for (var i = 0; i < TOKEN_GROUPS; i++) {
    groups.push(raw.substr(i * TOKEN_GROUP_SIZE, TOKEN_GROUP_SIZE));
  }

  return groups.join("-");
}

function readTokenFile(app) {
  try {
    var raw = $os.readFile(tokenPath(app));
    var text;

    // Go mengembalikan []byte; di Goja nilainya bisa berupa array angka.
    if (raw && typeof raw !== "string" && typeof raw.length === "number") {
      var chars = [];
      for (var i = 0; i < raw.length; i++) {
        chars.push(String.fromCharCode(Number(raw[i])));
      }
      text = chars.join("");
    } else {
      text = String(raw == null ? "" : raw);
    }

    return text.trim();
  } catch (err) {
    return "";
  }
}

// Mengembalikan kode setup aktif, membuat file kode bila belum ada.
// Melempar error bila kode tidak bisa dipersistensi: lebih baik setup berhenti
// dengan pesan jelas daripada memakai kode yang berubah setiap request.
function ensureToken(app) {
  if (!setupRequired(app)) return "";

  var override = String(readEnv("SETUP_TOKEN") || "").trim();
  if (override) return override;

  var existing = readTokenFile(app);
  if (existing) return existing;

  var token = generateToken();
  var file = tokenPath(app);

  try {
    $os.writeFile(file, token, 0o600);
  } catch (err) {
    console.log("[setup] Gagal menulis " + file + ": " + String(err));
    throw new BadRequestError(
      "Kode setup tidak bisa disimpan di " + file +
        ". Setel environment SETUP_TOKEN lalu ulangi."
    );
  }

  console.log(
    "[setup] Instalasi belum disiapkan. Kode setup (sekali pakai): " +
      token +
      " — tersimpan di " +
      file
  );

  return token;
}

function assertToken(app, raw) {
  var expected = normalizeToken(ensureToken(app));
  var given = normalizeToken(raw);

  if (!given) {
    throw new ForbiddenError("Kode setup wajib diisi");
  }

  if (!expected || !$security.equal(expected, given)) {
    throw new ForbiddenError("Kode setup tidak cocok");
  }
}

function clearToken(app) {
  // Kode dari environment tidak dihapus (bukan milik aplikasi).
  if (String(readEnv("SETUP_TOKEN") || "").trim()) return;

  try {
    $os.remove(tokenPath(app));
  } catch (err) {
    // Kode yang tersisa tidak membuka apa pun: setup sudah tertutup oleh akun.
  }
}

function findFirstTenant(app) {
  var rows = app.findRecordsByFilter("tenants", 'id != ""', "created", 1, 0);

  return rows.length ? rows[0] : null;
}

function findFirst(app, collection, filter, params) {
  try {
    return app.findFirstRecordByFilter(collection, filter, params);
  } catch (err) {
    return null;
  }
}

// Validasi memakai helper Konsol Vendor supaya aturan nama/kode/zona waktu dan
// akun tetap satu sumber.
function validateHospital(body) {
  var platform = require(__hooks + "/lib/platform.js");
  var input = platform.validateTenantInput(body || {}, false);

  input.is_active = true;

  return input;
}

function validateAccount(body) {
  var platform = require(__hooks + "/lib/platform.js");
  var input = platform.validateUserInput(
    {
      name: (body || {}).name,
      email: (body || {}).email,
      password: (body || {}).password,
      role: "it_lead",
    },
    false
  );

  if (input.password.length < MIN_PASSWORD) {
    throw new BadRequestError(
      "Password minimal " + MIN_PASSWORD + " karakter"
    );
  }

  return input;
}

function auditSetup(app, actor, tenantId, recordId, changes, meta) {
  var audit = require(__hooks + "/lib/audit.js");

  try {
    audit.write(app, {
      tenant: tenantId || "",
      actor: actor,
      action: "setup",
      collection_name: tenantId ? "tenants" : "users",
      record_id: recordId,
      changes: changes,
      ip: (meta || {}).ip || "",
      user_agent: (meta || {}).user_agent || "",
    });
  } catch (err) {
    // Audit tidak boleh menggagalkan setup; akun pertama sudah jadi.
    console.log("[setup] Gagal menulis audit: " + String(err));
  }
}

function createPlatformAccount(app, input) {
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
  record.set("role", "it_lead");
  record.set("job_title", "Administrator vendor");
  record.set("is_active", true);
  record.set("is_platform_staff", true);
  record.setPassword(input.password);

  try {
    app.save(record);
  } catch (err) {
    throw new BadRequestError(
      "Gagal menyimpan akun. Periksa email dan kekuatan password."
    );
  }

  return record;
}

// Mode standalone: satu rumah sakit. Tenant seed `RS01` dari migrasi dipakai
// ulang (diganti namanya), lalu data master default dilengkapi secara idempoten
// dan akun Kepala IT pertama dibuat — semuanya dalam satu transaksi.
function runStandaloneSetup(e, body) {
  var platform = require(__hooks + "/lib/platform.js");
  var tenantSeed = require(__hooks + "/lib/tenant_seed.js");
  var hospital = validateHospital(body.hospital || {});
  var account = validateAccount(body.account || {});
  var meta = require(__hooks + "/lib/audit.js").requestMeta(e);
  var result = {};

  e.app.runInTransaction(function (txApp) {
    // Cek ulang di dalam transaksi: dua request setup bersamaan tidak boleh
    // menghasilkan dua akun pertama.
    if (Number(txApp.countRecords("users")) > 0) {
      throw new ApiError(409, "Instalasi ini sudah disiapkan");
    }

    var tenant = findFirstTenant(txApp);

    if (!tenant) {
      tenant = new Record(txApp.findCollectionByNameOrId("tenants"));
      tenant.set("is_active", true);
    }

    tenant.set("name", hospital.name);
    tenant.set("code", hospital.code);
    tenant.set("timezone", hospital.timezone);
    tenant.set("is_active", true);
    txApp.save(tenant);
    result.tenant = tenant;

    result.seed = tenantSeed.seed(txApp, tenant.id, hospital.timezone);

    var itUnit = findFirst(
      txApp,
      "units",
      'tenant = {:tenant} && code = "IT"',
      { tenant: tenant.id }
    );

    result.user = platform.createTenantUser(txApp, tenant.id, {
      name: account.name,
      email: account.email,
      role: "it_lead",
      password: account.password,
      unit: itUnit ? itUnit.id : "",
      is_active: true,
    });

    auditSetup(
      txApp,
      result.user,
      tenant.id,
      tenant.id,
      {
        name: hospital.name,
        code: hospital.code,
        timezone: hospital.timezone,
        admin_email: account.email,
      },
      meta
    );
  });

  return {
    mode: "standalone",
    tenant: {
      id: result.tenant.id,
      name: hospital.name,
      code: hospital.code,
      timezone: hospital.timezone,
    },
    user: {
      email: account.email,
      name: account.name,
      role: "it_lead",
    },
    seed: result.seed,
  };
}

// Mode vendor: instalasi dikelola akun platform (tanpa tenant). Rumah sakit
// dibuat setelah login lewat Konsol Vendor.
function runVendorSetup(e, body) {
  var account = validateAccount(body.account || {});
  var meta = require(__hooks + "/lib/audit.js").requestMeta(e);
  var result = {};

  e.app.runInTransaction(function (txApp) {
    if (Number(txApp.countRecords("users")) > 0) {
      throw new ApiError(409, "Instalasi ini sudah disiapkan");
    }

    result.user = createPlatformAccount(txApp, account);

    auditSetup(
      txApp,
      result.user,
      "",
      result.user.id,
      { admin_email: account.email, role: "it_lead", platform: true },
      meta
    );
  });

  return {
    mode: "vendor",
    user: {
      email: account.email,
      name: account.name,
      role: "it_lead",
    },
  };
}

function statusPayload(app) {
  var tenancy = require(__hooks + "/lib/tenancy.js");
  var required = setupRequired(app);
  var appName = String(app.settings().meta.appName || "").trim();
  if (!appName || appName === "Acme") appName = "Healthcare ITSM";

  var payload = {
    required: required,
    mode: tenancy.current(),
    token_required: required,
    min_password: MIN_PASSWORD,
    app: appName,
    hospital: null,
  };

  if (!required || tenancy.isVendor()) return payload;

  var tenant = findFirstTenant(app);
  if (!tenant) return payload;

  var name = String(tenant.get("name") || "");

  payload.hospital = {
    name: name,
    code: String(tenant.get("code") || ""),
    timezone: String(tenant.get("timezone") || "") || DEFAULT_TIMEZONE,
    // Nama seed migrasi bukan nama rumah sakit sebenarnya; frontend
    // mengosongkannya agar operator wajib mengisi.
    placeholder: name === PLACEHOLDER_TENANT_NAME,
  };

  return payload;
}

function performSetup(e) {
  var tenancy = require(__hooks + "/lib/tenancy.js");

  if (!setupRequired(e.app)) {
    throw new ApiError(409, "Instalasi ini sudah disiapkan");
  }

  var body = e.requestInfo().body || {};

  assertToken(e.app, body.token);

  var result = tenancy.isVendor()
    ? runVendorSetup(e, body)
    : runStandaloneSetup(e, body);

  clearToken(e.app);

  return result;
}

module.exports = {
  MIN_PASSWORD: MIN_PASSWORD,
  TOKEN_FILE: TOKEN_FILE,
  setupRequired: setupRequired,
  tokenPath: tokenPath,
  normalizeToken: normalizeToken,
  ensureToken: ensureToken,
  assertToken: assertToken,
  clearToken: clearToken,
  validateHospital: validateHospital,
  validateAccount: validateAccount,
  statusPayload: statusPayload,
  performSetup: performSetup,
};
