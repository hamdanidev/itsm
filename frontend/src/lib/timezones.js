// Daftar zona IANA untuk pemilih zona rumah sakit.
//
// Sebelumnya hanya tiga zona Indonesia yang bisa dipilih. Server memvalidasi
// nama zona terhadap basis data IANA, jadi daftar di UI harus mencakup zona
// lain; kalau tidak, rumah sakit di luar WIB/WITA/WIT tidak bisa didaftarkan.
// Tiga zona lokal tetap di atas dengan label yang akrab.

const LOCAL_LABELS = {
  "Asia/Jakarta": "WIB · Asia/Jakarta",
  "Asia/Makassar": "WITA · Asia/Makassar",
  "Asia/Jayapura": "WIT · Asia/Jayapura",
};

let cached = null;

function supportedZones() {
  try {
    if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
      const zones = Intl.supportedValuesOf("timeZone");
      if (Array.isArray(zones) && zones.length) return zones;
    }
  } catch {
    // Lingkungan tanpa ICU: jatuh ke daftar lokal.
  }

  return [];
}

export function timeZoneOptions() {
  if (cached) return cached;

  const local = Object.keys(LOCAL_LABELS);
  const rest = supportedZones()
    .filter((zone) => !local.includes(zone))
    .sort((a, b) => a.localeCompare(b));

  cached = [
    ...local.map((zone) => [zone, LOCAL_LABELS[zone]]),
    ...rest.map((zone) => [zone, zone]),
  ];

  return cached;
}

export function timeZoneLabel(value) {
  const zone = String(value || "").trim();
  if (!zone) return "—";

  const option = timeZoneOptions().find(([candidate]) => candidate === zone);
  return option ? option[1] : zone;
}
