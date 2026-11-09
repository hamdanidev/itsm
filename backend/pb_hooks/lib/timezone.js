// Konversi waktu sadar zona (termasuk DST) untuk hook PocketBase.
//
// Kenapa modul ini ada: Goja tidak punya `Intl`, jadi `Date` di hook hanya tahu
// UTC. Sebelumnya seluruh perhitungan memakai offset tetap +07:00, sehingga RS
// di WITA/WIT dan negara lain selalu salah. Di sini konversi dilakukan lewat
// dua backend yang sama-sama memakai basis data zona IANA:
//
//   goja  : `Timezone` + `DateTime` (Go time.LoadLocation) — runtime PocketBase
//   intl  : `Intl.DateTimeFormat`                          — unit test Node
//   fixed : +07:00                                          — cadangan terakhir
//
// Modul ini tidak menyentuh `$app` dan tidak menyimpan apa pun, supaya bisa
// diuji tanpa menjalankan PocketBase.

var DEFAULT_TIMEZONE = "Asia/Jakarta";
var ZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+\-]*(\/[A-Za-z0-9_+\-]+)*$/;
var FALLBACK_OFFSET_MS = 7 * 60 * 60 * 1000;

var zoneObjects = {};
var intlFormatters = {};

function hasGojaTime() {
  return typeof DateTime === "function" && typeof Timezone === "function";
}

function hasIntl() {
  return (
    typeof Intl !== "undefined" &&
    Intl &&
    typeof Intl.DateTimeFormat === "function"
  );
}

function backend() {
  if (hasGojaTime()) return "goja";
  if (hasIntl()) return "intl";
  return "fixed";
}

function pad(value) {
  return value < 10 ? "0" + value : String(value);
}

// PocketBase menyimpan datetime sebagai "YYYY-MM-DD HH:MM:SS.sssZ"; format itu
// yang paling aman untuk konstruktor `DateTime`.
function pbString(ms) {
  return new Date(ms).toISOString().replace("T", " ");
}

function zoneObject(zone) {
  if (!zoneObjects[zone]) zoneObjects[zone] = new Timezone(zone);
  return zoneObjects[zone];
}

function gojaZoneName(zone) {
  var location = zoneObject(zone);
  return String(location);
}

function intlFormatter(zone) {
  if (!intlFormatters[zone]) {
    intlFormatters[zone] = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  return intlFormatters[zone];
}

function intlWallMs(ms, zone) {
  var parts = intlFormatter(zone).formatToParts(new Date(ms));
  var map = {};

  for (var i = 0; i < parts.length; i++) {
    map[parts[i].type] = parts[i].value;
  }

  return Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour) % 24,
    Number(map.minute),
    Number(map.second)
  );
}

function gojaWallMs(ms, zone) {
  var instant = new DateTime(pbString(ms)).time().in(zoneObject(zone));
  var dateText = instant.format("2006-01-02");
  var clock = instant.clock();

  return Date.UTC(
    Number(dateText.slice(0, 4)),
    Number(dateText.slice(5, 7)) - 1,
    Number(dateText.slice(8, 10)),
    clock[0],
    clock[1],
    clock[2]
  );
}

// Waktu dinding (wall clock) dari sebuah instan, dinyatakan sebagai milidetik
// UTC. Selisihnya dengan instan asli adalah offset zona pada saat itu.
function wallMs(ms, zone) {
  var truncated = Math.floor(ms / 1000) * 1000;

  if (backend() === "goja") return gojaWallMs(truncated, zone);
  if (backend() === "intl") return intlWallMs(truncated, zone);

  return truncated + FALLBACK_OFFSET_MS;
}

function offsetMs(ms, zone) {
  var truncated = Math.floor(ms / 1000) * 1000;
  return wallMs(truncated, zone) - truncated;
}

function offsetMinutes(ms, zone) {
  return Math.round(offsetMs(ms, zone) / 60000);
}

// Kebalikan `wallMs`: jam dinding lokal -> instan UTC. Offset bergantung pada
// instan yang sedang dicari, jadi dihitung dengan iterasi titik tetap. Tiga
// putaran cukup untuk transisi DST (termasuk zona dengan offset negatif).
function fromLocal(year, month, day, hour, minute, zone) {
  var wall = Date.UTC(
    Number(year),
    Number(month) || 0,
    Number(day),
    Number(hour) || 0,
    Number(minute) || 0,
    0
  );
  var guess = wall;

  for (var i = 0; i < 3; i++) {
    var next = wall - offsetMs(guess, zone);

    if (next === guess) break;
    guess = next;
  }

  return guess;
}

function localParts(ms, zone) {
  var date = new Date(wallMs(ms, zone));

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    weekday: date.getUTCDay() || 7,
  };
}

function dateKey(ms, zone) {
  var parts = localParts(ms, zone);

  return (
    parts.year + "-" + pad(parts.month + 1) + "-" + pad(parts.day)
  );
}

function startOfDay(ms, zone) {
  var parts = localParts(ms, zone);

  return fromLocal(parts.year, parts.month, parts.day, 0, 0, zone);
}

function endOfDay(ms, zone) {
  var parts = localParts(ms, zone);

  // Awal hari berikutnya minus 1 ms: aman untuk hari yang panjangnya 23/24/25
  // jam karena peralihan DST.
  return (
    fromLocal(parts.year, parts.month, parts.day + 1, 0, 0, zone) - 1
  );
}

function isValidZone(name) {
  var zone = String(name == null ? "" : name).trim();

  if (!zone || zone.length > 64 || !ZONE_PATTERN.test(zone)) return false;
  // "Local" bergantung pada TZ proses, bukan pada zona tenant. Tolak agar
  // hasil SLA tidak berubah karena setelan mesin.
  if (zone === "Local") return false;

  try {
    if (hasGojaTime()) {
      // Tanpa basis data zona (mis. Windows tanpa ZONEINFO), Go mengembalikan
      // UTC untuk nama apa pun. Mismatch nama berarti zona tidak benar-benar
      // dikenali, dan itu harus ditolak — bukan diam-diam dihitung sebagai UTC.
      return gojaZoneName(zone) === zone;
    }

    if (hasIntl()) {
      intlFormatter(zone);
      return true;
    }
  } catch (err) {
    return false;
  }

  // Tanpa backend zona, hanya nama yang jelas tetap yang bisa dipercaya.
  return zone === DEFAULT_TIMEZONE || zone === "UTC";
}

function resolveZone(name) {
  var zone = String(name == null ? "" : name).trim();

  if (isValidZone(zone)) return zone;
  if (isValidZone(DEFAULT_TIMEZONE)) return DEFAULT_TIMEZONE;

  // Terakhir: UTC tetap deterministik, dan `selfCheck` sudah menandai bahwa
  // instalasi ini tidak punya basis data zona.
  return "UTC";
}

function readEnv(name) {
  try {
    if (typeof $os !== "undefined" && $os && typeof $os.getenv === "function") {
      return String($os.getenv(name) || "");
    }
  } catch (err) {
    // Environment tidak tersedia (unit test Node).
  }

  return "";
}

// Dipakai saat bootstrap untuk memastikan perhitungan SLA tidak jatuh ke UTC
// tanpa disadari.
function selfCheck() {
  var backendName = backend();
  var result = {
    ok: false,
    backend: backendName,
    default_zone: DEFAULT_TIMEZONE,
    resolved: "",
    zoneinfo: readEnv("ZONEINFO"),
  };

  if (backendName === "goja") {
    result.resolved = gojaZoneName(DEFAULT_TIMEZONE);
    result.ok = result.resolved === DEFAULT_TIMEZONE;
  } else if (backendName === "intl") {
    result.resolved = DEFAULT_TIMEZONE;
    result.ok = true;
  }

  return result;
}

module.exports = {
  DEFAULT_TIMEZONE: DEFAULT_TIMEZONE,
  backend: backend,
  isValidZone: isValidZone,
  resolveZone: resolveZone,
  selfCheck: selfCheck,
  wallMs: wallMs,
  offsetMs: offsetMs,
  offsetMinutes: offsetMinutes,
  fromLocal: fromLocal,
  localParts: localParts,
  dateKey: dateKey,
  startOfDay: startOfDay,
  endOfDay: endOfDay,
};
