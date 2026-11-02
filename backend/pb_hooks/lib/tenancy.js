// Mode tenancy menentukan peran instalasi:
//
//   standalone  satu instalasi melayani satu rumah sakit (default)
//   vendor      satu instalasi melayani banyak rumah sakit lewat Konsol Vendor
//
// Mode dibaca dari environment, bukan dari database: mode adalah sifat
// deployment (on-prem per RS vs pusat), tidak boleh bisa dinaikkan sendiri oleh
// admin tenant. Nilai tidak dikenal jatuh ke `standalone` agar gagal tertutup.

var DEFAULT_MODE = "standalone";

var ALIASES = {
  standalone: "standalone",
  single: "standalone",
  rs: "standalone",
  vendor: "vendor",
  multi: "vendor",
  multisite: "vendor",
};

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

function normalize(raw) {
  var value = String(raw == null ? "" : raw)
    .trim()
    .toLowerCase();

  if (!value) return DEFAULT_MODE;

  return ALIASES[value] || DEFAULT_MODE;
}

function current() {
  return normalize(readEnv("TENANCY_MODE"));
}

function isVendor() {
  return current() === "vendor";
}

function assertVendor() {
  if (!isVendor()) {
    throw new ForbiddenError(
      "Konsol vendor tidak aktif pada instalasi ini (TENANCY_MODE bukan vendor)"
    );
  }
}

// Akun platform hanya boleh masuk pada instalasi mode vendor. Dipakai hook
// onRecordAuthRequest supaya sesi lama pun ikut ditolak saat mode berubah.
function assertPlatformLoginAllowed(record) {
  var isPlatform = false;

  try {
    isPlatform = !!(record && typeof record.get === "function" && record.get("is_platform_staff"));
  } catch (err) {
    isPlatform = false;
  }

  if (isPlatform && !isVendor()) {
    throw new ForbiddenError(
      "Akun vendor tidak dapat digunakan pada instalasi standalone"
    );
  }
}

module.exports = {
  DEFAULT_MODE: DEFAULT_MODE,
  readEnv: readEnv,
  normalize: normalize,
  current: current,
  isVendor: isVendor,
  assertVendor: assertVendor,
  assertPlatformLoginAllowed: assertPlatformLoginAllowed,
};
