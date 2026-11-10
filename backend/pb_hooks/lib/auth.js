// Keamanan login: pembatasan percobaan, audit login gagal, dan verifikasi
// faktor kedua (TOTP atau kode pemulihan).
//
// Dipakai oleh hook `onRecordAuthWithPasswordRequest` (main.pb.js) dan route
// pengaturan 2FA. Record selalu berasal dari server; tidak ada input tenant dari
// klien.

var MAX_ATTEMPTS_DEFAULT = 5;
var LOCK_MINUTES_DEFAULT = 15;

function envNumber(name, fallback) {
  try {
    if (typeof $os !== "undefined" && $os && typeof $os.getenv === "function") {
      var raw = Number($os.getenv(name));
      if (isFinite(raw) && raw > 0) return Math.floor(raw);
    }
  } catch (err) {
    // Environment tidak tersedia; pakai default.
  }

  return fallback;
}

function maxAttempts() {
  var value = envNumber("LOGIN_MAX_ATTEMPTS", MAX_ATTEMPTS_DEFAULT);
  return Math.min(20, Math.max(1, value));
}

function lockMinutes() {
  var value = envNumber("LOGIN_LOCK_MINUTES", LOCK_MINUTES_DEFAULT);
  return Math.min(1440, Math.max(1, value));
}

function timestampOf(value) {
  if (!value) return 0;
  var ms = new Date(String(value)).getTime();
  return isNaN(ms) ? 0 : ms;
}

function lockedUntilMs(record) {
  return timestampOf(record.get("login_locked_until"));
}

function lockInfo(record) {
  var until = lockedUntilMs(record);
  var now = Date.now();
  var locked = until > now;

  return {
    locked: locked,
    until: locked ? String(record.get("login_locked_until") || "") : "",
    minutes_left: locked ? Math.ceil((until - now) / 60000) : 0,
    attempts: Number(record.get("login_failed_count") || 0),
  };
}

function hashesEqual(left, right) {
  try {
    if (typeof $security !== "undefined" && $security && $security.equal) {
      return $security.equal(String(left), String(right));
    }
  } catch (err) {
    // Jatuh ke perbandingan biasa untuk unit test.
  }

  return String(left) === String(right);
}

function readRecoveryEntries(record) {
  var raw = record.get("totp_recovery_hashes");

  if (!raw) return [];

  // PocketBase JSVM mengembalikan field JSON sebagai []byte (array angka),
  // bukan objek JavaScript. Ubah ke teks lalu parse.
  if (typeof raw !== "string") {
    if (typeof raw.length === "number") {
      var chars = [];

      for (var index = 0; index < raw.length; index++) {
        chars.push(String.fromCharCode(Number(raw[index])));
      }

      raw = chars.join("");
    } else {
      raw = String(raw);
    }
  }

  try {
    raw = JSON.parse(raw);
  } catch (err) {
    return [];
  }

  if (!raw || typeof raw.length !== "number") return [];

  var entries = [];

  for (var i = 0; i < raw.length; i++) {
    if (!raw[i] || typeof raw[i] !== "object") continue;
    entries.push({
      hash: String(raw[i].hash || ""),
      used_at: String(raw[i].used_at || ""),
    });
  }

  return entries;
}

function writeFailureAudit(app, record, meta, changes) {
  try {
    var audit = require(__hooks + "/lib/audit.js");

    audit.write(app, {
      tenant: String(record.get("tenant") || ""),
      actor: record,
      action: "login_failed",
      collection_name: "users",
      record_id: record.id,
      changes: changes,
      ip: meta.ip,
      user_agent: meta.user_agent,
    });
  } catch (err) {
    // Kegagalan audit tidak boleh mengubah hasil autentikasi.
    console.log("Failed login audit error: " + String(err));
  }
}

function requestMeta(e) {
  try {
    return require(__hooks + "/lib/audit.js").requestMeta(e);
  } catch (err) {
    return { ip: "", user_agent: "" };
  }
}

// Mencatat satu percobaan gagal. Setelah N percobaan, akun dikunci sementara.
// Nilai password/kode tidak pernah disimpan.
function recordFailure(app, record, reason, e, extra) {
  var attempts = Number(record.get("login_failed_count") || 0) + 1;
  var lockedUntil = "";
  var changes = {
    reason: String(reason || "password"),
    attempts: attempts,
  };

  if (reason === "totp" && extra && extra.method) {
    changes.method = String(extra.method);
  }

  record.set("login_failed_count", attempts);

  if (attempts >= maxAttempts()) {
    lockedUntil = new Date(Date.now() + lockMinutes() * 60000).toISOString();
    record.set("login_locked_until", lockedUntil);
    changes.locked_until = lockedUntil;
  }

  try {
    app.save(record);
  } catch (err) {
    console.log("Failed to save login attempt: " + String(err));
  }

  writeFailureAudit(app, record, requestMeta(e), changes);
}

function resetLockState(record) {
  record.set("login_failed_count", 0);
  record.set("login_locked_until", "");
}

// Mengunci akun setelah percobaan berulang; kunci yang sudah kedaluwarsa
// dibersihkan saat percobaan berikutnya.
function assertNotLocked(app, record) {
  var until = lockedUntilMs(record);
  if (!until) return;

  var now = Date.now();

  if (until > now) {
    var seconds = Math.ceil((until - now) / 1000);
    var minutes = Math.max(1, Math.ceil(seconds / 60));

    throw new TooManyRequestsError(
      "Terlalu banyak percobaan masuk. Coba lagi dalam " +
        minutes +
        " menit atau minta IT membuka kunci akun.",
      { code: "login_locked", retry_after_seconds: seconds }
    );
  }

  resetLockState(record);

  try {
    app.save(record);
  } catch (err) {
    console.log("Failed to clear expired login lock: " + String(err));
  }
}

function clearFailures(app, record) {
  if (
    !Number(record.get("login_failed_count") || 0) &&
    !String(record.get("login_locked_until") || "")
  ) {
    return;
  }

  resetLockState(record);

  try {
    app.save(record);
  } catch (err) {
    console.log("Failed to clear login failures: " + String(err));
  }
}

// Memeriksa kode TOTP 6 digit atau kode pemulihan sekali pakai.
// Opsi `ignoreReplay` dipakai saat mengaktifkan/menonaktifkan 2FA agar kode
// yang baru saja dipakai mendaftar tidak langsung dianggap replay.
function verifySecondFactor(record, code, options) {
  var totp = require(__hooks + "/lib/totp.js");
  var opts = options || {};
  var secret = String(record.get("totp_secret") || "");

  if (!secret) return { valid: false, method: "" };

  var normalized = totp.normalizeCode(code);

  if (/^\d{6}$/.test(normalized)) {
    var result = totp.verifyStep(secret, normalized, { window: 1 });

    if (!result.valid) return { valid: false, method: "totp" };

    var lastStep = Number(record.get("totp_last_step") || 0);

    if (!opts.ignoreReplay && result.step <= lastStep) {
      return { valid: false, method: "totp", replay: true };
    }

    if (!opts.ignoreReplay) record.set("totp_last_step", result.step);

    return { valid: true, method: "totp", step: result.step };
  }

  var recoveryCode = totp.normalizeRecoveryCode(code);
  if (recoveryCode.length !== 12) return { valid: false, method: "" };

  var entries = readRecoveryEntries(record);
  var hash = totp.hashRecoveryCode(recoveryCode);

  for (var i = 0; i < entries.length; i++) {
    if (entries[i].used_at) continue;

    if (hashesEqual(entries[i].hash, hash)) {
      entries[i].used_at = new Date().toISOString();
      record.set("totp_recovery_hashes", entries);
      return { valid: true, method: "recovery" };
    }
  }

  return { valid: false, method: "recovery" };
}

// Dipanggil sebelum PocketBase memverifikasi password pada endpoint
// auth-with-password. Password divalidasi di sini supaya lockout dan audit
// hanya mencatat percobaan yang benar-benar salah, bukan request tanpa arti.
function beforePasswordLogin(app, e) {
  var record = e.record;
  if (!record) return;

  var body = {};

  try {
    body = e.requestInfo().body || {};
  } catch (err) {
    body = {};
  }

  try {
    assertNotLocked(app, record);
  } catch (err) {
    // Percobaan saat akun masih terkunci tetap tercatat, tetapi tidak menambah
    // hitungan (masa kunci tidak diperpanjang oleh percobaan baru).
    writeFailureAudit(app, record, requestMeta(e), {
      reason: "locked",
      attempts: Number(record.get("login_failed_count") || 0),
      locked_until: String(record.get("login_locked_until") || ""),
    });
    throw err;
  }

  var passwordOk = false;

  try {
    passwordOk = record.validatePassword(String(e.password || ""));
  } catch (err) {
    passwordOk = false;
  }

  if (!passwordOk) {
    recordFailure(app, record, "password", e);
    return; // PocketBase mengembalikan pesan gagal autentikasi generik.
  }

  if (!record.get("totp_enabled")) {
    clearFailures(app, record);
    return;
  }

  var code = String(body.totp || body.code || body.otp || "").trim();

  if (!code) {
    throw new ForbiddenError("Kode autentikasi dua faktor wajib diisi", {
      code: "2fa_required",
    });
  }

  var check = verifySecondFactor(record, code, {});

  if (!check.valid) {
    recordFailure(app, record, "totp", e, { method: check.method });
    throw new UnauthorizedError("Kode autentikasi dua faktor salah", {
      code: "2fa_invalid",
    });
  }

  // Kode benar: kode pemulihan yang terpakai dan langkah TOTP terakhir harus
  // tersimpan sebelum token dibuat.
  resetLockState(record);
  app.save(record);
}

function resetSecondFactor(record) {
  record.set("totp_secret", "");
  record.set("totp_enabled", false);
  record.set("totp_confirmed_at", "");
  record.set("totp_last_step", 0);
  record.set("totp_recovery_hashes", []);
}

function unlock(record) {
  resetLockState(record);
}

module.exports = {
  maxAttempts: maxAttempts,
  lockMinutes: lockMinutes,
  lockInfo: lockInfo,
  recordFailure: recordFailure,
  clearFailures: clearFailures,
  assertNotLocked: assertNotLocked,
  verifySecondFactor: verifySecondFactor,
  beforePasswordLogin: beforePasswordLogin,
  resetSecondFactor: resetSecondFactor,
  unlock: unlock,
  readRecoveryEntries: readRecoveryEntries,
};
