/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const tenants = app.findCollectionByNameOrId("tenants");
  const units = app.findCollectionByNameOrId("units");
  const categories = app.findCollectionByNameOrId("ticket_categories");
  const slaPolicies = app.findCollectionByNameOrId("sla_policies");
  const holidays = app.findCollectionByNameOrId("holidays");

  let tenant;
  try {
    tenant = app.findFirstRecordByData("tenants", "code", "RS01");
  } catch (err) {
    tenant = new Record(tenants);
    tenant.set("name", "Rumah Sakit Contoh");
    tenant.set("code", "RS01");
    tenant.set("timezone", "Asia/Jakarta");
    tenant.set("is_active", true);
    app.save(tenant);
  }

  const unitSeeds = [
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

  for (const seed of unitSeeds) {
    let unit;
    try {
      unit = app.findFirstRecordByData("units", "code", seed[1]);
    } catch (err) {
      unit = new Record(units);
      unit.set("tenant", tenant.id);
      unit.set("name", seed[0]);
      unit.set("code", seed[1]);
      unit.set("kind", seed[2]);
      unit.set("is_active", true);
      app.save(unit);
    }
  }

  const categorySeeds = [
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

  for (const seed of categorySeeds) {
    try {
      app.findFirstRecordByData("ticket_categories", "code", seed[1]);
    } catch (err) {
      const category = new Record(categories);
      category.set("tenant", tenant.id);
      category.set("name", seed[0]);
      category.set("code", seed[1]);
      category.set("kind", "all");
      category.set("is_active", true);
      app.save(category);
    }
  }

  const policies = [
    // ticket_type, priority, response, approval, resolution, calendar
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

  for (const p of policies) {
    let existing = null;
    try {
      existing = app.findFirstRecordByFilter(
        "sla_policies",
        "tenant = {:tenant} && ticket_type = {:type} && priority = {:priority}",
        { tenant: tenant.id, type: p[0], priority: p[1] }
      );
    } catch (err) {
      // not found
    }

    if (!existing) {
      const policy = new Record(slaPolicies);
      policy.set("tenant", tenant.id);
      policy.set("name", p[0] + " - " + p[1]);
      policy.set("ticket_type", p[0]);
      policy.set("priority", p[1]);
      policy.set("response_minutes", p[2]);
      policy.set("approval_minutes", p[3]);
      policy.set("resolution_minutes", p[4]);
      policy.set("calendar_mode", p[5]);
      policy.set("business_days", [1, 2, 3, 4, 5]);
      policy.set("business_start", "08:00");
      policy.set("business_end", "17:00");
      policy.set("timezone", "Asia/Jakarta");
      policy.set("version", 1);
      policy.set("is_active", true);
      app.save(policy);
    }
  }

  const holidaySeeds = [
    ["2026-08-17 00:00:00.000Z", "Hari Kemerdekaan RI"],
    ["2026-12-25 00:00:00.000Z", "Hari Raya Natal"],
    ["2027-01-01 00:00:00.000Z", "Tahun Baru"],
  ];

  for (const h of holidaySeeds) {
    let existing = null;
    try {
      existing = app.findFirstRecordByFilter(
        "holidays",
        "tenant = {:tenant} && date = {:date}",
        { tenant: tenant.id, date: h[0] }
      );
    } catch (err) {
      // not found
    }

    if (!existing) {
      const holiday = new Record(holidays);
      holiday.set("tenant", tenant.id);
      holiday.set("date", h[0]);
      holiday.set("name", h[1]);
      holiday.set("is_active", true);
      app.save(holiday);
    }
  }
}, (app) => {
  // Seed data is intentionally retained on rollback. Removing master data in a
  // down migration could orphan tickets that reference it.
});
