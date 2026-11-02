// Data master default untuk tenant (rumah sakit) baru.
//
// Dipakai route `POST /api/itsm/platform/tenants` dan
// `POST /api/itsm/platform/tenants/{id}/seed`. Fungsi seed bersifat idempoten:
// record dicocokkan lewat kode/nomor unik per tenant, jadi aman dipanggil ulang
// untuk melengkapi tenant yang sempat gagal di tengah jalan.
//
// Nilai di sini sengaja tidak diimpor dari migrasi seed (migrasi harus tetap
// beku); keduanya harus diubah bersama bila kebijakan default berubah.

var UNITS = [
  ["IGD", "IGD", "clinical"],
  ["Rawat Inap", "RANAP", "clinical"],
  ["Rawat Jalan", "RAJAL", "clinical"],
  ["Farmasi", "FARMASI", "clinical"],
  ["Laboratorium", "LAB", "clinical"],
  ["Radiologi", "RAD", "clinical"],
  ["Kasir dan BPJS", "KASIR", "support"],
  ["Rekam Medis", "RM", "support"],
  ["Manajemen", "MGT", "management"],
  ["IT", "IT", "support"],
];

var CATEGORIES = [
  ["Pendaftaran", "SIMRS-PENDAFTARAN"],
  ["Farmasi", "SIMRS-FARMASI"],
  ["Laboratorium", "SIMRS-LAB"],
  ["Radiologi", "SIMRS-RAD"],
  ["Kasir dan BPJS", "SIMRS-KASIR"],
  ["Rekam Medis", "SIMRS-RM"],
  ["Jaringan dan Infrastruktur", "INFRA"],
  ["Aplikasi Lain", "APP-LAIN"],
  ["Lainnya", "LAINNYA"],
];

// ticket_type, priority, response, approval, resolution, calendar
var POLICIES = [
  ["incident", "critical", 15, 0, 240, "24x7"],
  ["incident", "high", 30, 0, 480, "business_hours"],
  ["incident", "normal", 120, 0, 960, "business_hours"],
  ["incident", "low", 480, 0, 2400, "business_hours"],

  ["service_request", "critical", 30, 120, 480, "24x7"],
  ["service_request", "high", 60, 240, 960, "business_hours"],
  ["service_request", "normal", 120, 240, 1920, "business_hours"],
  ["service_request", "low", 480, 480, 2400, "business_hours"],

  ["change_request", "critical", 30, 120, 0, "24x7"],
  ["change_request", "high", 120, 480, 0, "business_hours"],
  ["change_request", "normal", 240, 960, 0, "business_hours"],
  ["change_request", "low", 480, 2400, 0, "business_hours"],
];

var HOLIDAYS = [
  ["2026-08-17 00:00:00.000Z", "Hari Kemerdekaan RI"],
  ["2026-12-25 00:00:00.000Z", "Hari Raya Natal"],
  ["2027-01-01 00:00:00.000Z", "Tahun Baru"],
];

function findFirst(app, collection, filter, params) {
  try {
    return app.findFirstRecordByFilter(collection, filter, params);
  } catch (err) {
    return null;
  }
}

function seedUnits(app, tenantId, timezone, created) {
  var collection = app.findCollectionByNameOrId("units");

  for (var i = 0; i < UNITS.length; i++) {
    var seed = UNITS[i];
    var existing = findFirst(
      app,
      "units",
      "tenant = {:tenant} && code = {:code}",
      { tenant: tenantId, code: seed[1] }
    );

    if (existing) continue;

    var record = new Record(collection);
    record.set("tenant", tenantId);
    record.set("name", seed[0]);
    record.set("code", seed[1]);
    record.set("kind", seed[2]);
    record.set("is_active", true);
    app.save(record);
    created.units += 1;
  }
}

function seedCategories(app, tenantId, created) {
  var collection = app.findCollectionByNameOrId("ticket_categories");

  for (var i = 0; i < CATEGORIES.length; i++) {
    var seed = CATEGORIES[i];
    var existing = findFirst(
      app,
      "ticket_categories",
      "tenant = {:tenant} && code = {:code}",
      { tenant: tenantId, code: seed[1] }
    );

    if (existing) continue;

    var record = new Record(collection);
    record.set("tenant", tenantId);
    record.set("name", seed[0]);
    record.set("code", seed[1]);
    record.set("kind", "all");
    record.set("is_active", true);
    app.save(record);
    created.categories += 1;
  }
}

function seedPolicies(app, tenantId, timezone, created) {
  var collection = app.findCollectionByNameOrId("sla_policies");

  for (var i = 0; i < POLICIES.length; i++) {
    var seed = POLICIES[i];
    var existing = findFirst(
      app,
      "sla_policies",
      "tenant = {:tenant} && ticket_type = {:type} && priority = {:priority}",
      { tenant: tenantId, type: seed[0], priority: seed[1] }
    );

    if (existing) continue;

    var record = new Record(collection);
    record.set("tenant", tenantId);
    record.set("name", seed[0] + " - " + seed[1]);
    record.set("ticket_type", seed[0]);
    record.set("priority", seed[1]);
    record.set("response_minutes", seed[2]);
    record.set("approval_minutes", seed[3]);
    record.set("resolution_minutes", seed[4]);
    record.set("calendar_mode", seed[5]);
    record.set("business_days", [1, 2, 3, 4, 5]);
    record.set("business_start", "08:00");
    record.set("business_end", "17:00");
    record.set("timezone", timezone);
    record.set("version", 1);
    record.set("is_active", true);
    app.save(record);
    created.policies += 1;
  }
}

function seedHolidays(app, tenantId, created) {
  var collection = app.findCollectionByNameOrId("holidays");

  for (var i = 0; i < HOLIDAYS.length; i++) {
    var seed = HOLIDAYS[i];
    var existing = findFirst(
      app,
      "holidays",
      "tenant = {:tenant} && date = {:date}",
      { tenant: tenantId, date: seed[0] }
    );

    if (existing) continue;

    var record = new Record(collection);
    record.set("tenant", tenantId);
    record.set("date", seed[0]);
    record.set("name", seed[1]);
    record.set("is_active", true);
    app.save(record);
    created.holidays += 1;
  }
}

// Melengkapi tenant dengan unit, kategori, kebijakan SLA, dan hari libur
// default. Mengembalikan jumlah record yang benar-benar dibuat.
function seed(app, tenantId, timezone) {
  var zone = String(timezone || "Asia/Jakarta");
  var created = { units: 0, categories: 0, policies: 0, holidays: 0 };

  seedUnits(app, tenantId, zone, created);
  seedCategories(app, tenantId, created);
  seedPolicies(app, tenantId, zone, created);
  seedHolidays(app, tenantId, created);

  return created;
}

module.exports = {
  seed: seed,
  defaults: {
    units: UNITS,
    categories: CATEGORIES,
    policies: POLICIES,
    holidays: HOLIDAYS,
  },
};
