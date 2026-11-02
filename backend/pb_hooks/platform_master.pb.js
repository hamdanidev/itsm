// Konsol Vendor — kelola data master per rumah sakit.
//
// Semua penulisan lewat route ini ($app.save), bukan collection API, sehingga
// rule tulis `LEAD && TENANT` milik rumah sakit tidak perlu dilonggarkan.
// Vendor admin (role it_lead) yang boleh menulis; vendor support hanya membaca.

routerAdd(
  "GET",
  "/api/itsm/platform/tenants/{id}/master",
  (e) => {
    var platform = require(__hooks + "/lib/platform.js");
    var masterData = require(__hooks + "/lib/master_data.js");

    platform.requirePlatform(e, false);

    var tenantId = e.request.pathValue("id");
    var tenant = platform.findTenant(e.app, tenantId);

    function listRecords(collection, sort) {
      return e.app.findRecordsByFilter(
        collection,
        "tenant = {:tenant}",
        sort || "name",
        500,
        0,
        { tenant: tenantId }
      );
    }

    var units = [];
    var categories = [];
    var policies = [];
    var holidays = [];

    var unitRecords = listRecords("units");

    for (var i = 0; i < unitRecords.length; i++) {
      units.push(masterData.serialize("units", unitRecords[i]));
    }

    var categoryRecords = listRecords("ticket_categories");

    for (var j = 0; j < categoryRecords.length; j++) {
      categories.push(masterData.serialize("categories", categoryRecords[j]));
    }

    var policyRecords = listRecords("sla_policies");

    for (var k = 0; k < policyRecords.length; k++) {
      policies.push(masterData.serialize("policies", policyRecords[k]));
    }

    var holidayRecords = listRecords("holidays", "date");

    for (var h = 0; h < holidayRecords.length; h++) {
      holidays.push(masterData.serialize("holidays", holidayRecords[h]));
    }

    var userRecords = listRecords("users");
    var users = [];

    for (var u = 0; u < userRecords.length; u++) {
      users.push({
        id: userRecords[u].id,
        name: String(userRecords[u].get("name") || ""),
        role: String(userRecords[u].get("role") || ""),
        is_active: Boolean(userRecords[u].get("is_active")),
      });
    }

    return e.json(200, {
      tenant: platform.serializeTenant(tenant, null),
      units: units,
      categories: categories,
      policies: policies,
      holidays: holidays,
      users: users,
      options: {
        unit_kinds: masterData.UNIT_KINDS,
        category_kinds: masterData.CATEGORY_KINDS,
        ticket_types: masterData.TICKET_TYPES,
        priorities: masterData.PRIORITIES,
        calendar_modes: masterData.CALENDAR_MODES,
      },
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/itsm/platform/tenants/{id}/master/{kind}",
  (e) => {
    var platform = require(__hooks + "/lib/platform.js");
    var masterData = require(__hooks + "/lib/master_data.js");

    var auth = platform.requirePlatform(e, true);

    var tenantId = e.request.pathValue("id");
    var kind = e.request.pathValue("kind");
    var collectionName = masterData.KINDS[kind];

    if (!collectionName) throw new BadRequestError("Jenis data master tidak dikenal");

    var tenant = platform.findTenant(e.app, tenantId);
    var input = masterData.normalize(kind, e.requestInfo().body || {}, false);

    // Field wajib saat membuat record baru.
    if (kind === "units" || kind === "categories") {
      if (!input.name || !input.code) {
        throw new BadRequestError("Nama dan kode wajib diisi");
      }
    }
    if (kind === "policies") {
      if (!input.name || !input.ticket_type || !input.priority) {
        throw new BadRequestError("Nama, tipe tiket, dan prioritas wajib diisi");
      }
      input.response_minutes = input.response_minutes || 1;
      input.calendar_mode = input.calendar_mode || "business_hours";
      input.business_days = input.business_days || [1, 2, 3, 4, 5];
      input.business_start = input.business_start || "08:00";
      input.business_end = input.business_end || "17:00";
      input.version = input.version || 1;
    }
    if (kind === "holidays" && (!input.name || !input.date)) {
      throw new BadRequestError("Tanggal dan nama hari libur wajib diisi");
    }

    if (kind === "policies") masterData.assertConsistent(kind, input);

    if (input.manager) {
      var managers = e.app.findRecordsByFilter(
        "users",
        "id = {:manager} && tenant = {:tenant} && is_active = true",
        "",
        1,
        0,
        { manager: input.manager, tenant: tenantId }
      );

      if (!managers.length) {
        throw new BadRequestError("Manajer unit harus pengguna aktif rumah sakit ini");
      }
    }

    var unique = masterData.uniqueCheck(kind, tenantId, input, "");
    if (
      unique &&
      e.app.findRecordsByFilter(
        collectionName,
        unique.filter,
        "",
        1,
        0,
        unique.params
      ).length
    ) {
      throw new BadRequestError("Data dengan kode/tanggal yang sama sudah ada");
    }

    var collection = e.app.findCollectionByNameOrId(collectionName);
    var record = new Record(collection);

    record.set("tenant", tenantId);

    for (var key in input) {
      record.set(key, input[key]);
    }

    if (kind === "policies") {
      record.set("timezone", String(tenant.get("timezone") || "Asia/Jakarta"));
    }
    if (input.is_active === undefined) record.set("is_active", true);

    $app.save(record);

    platform.writeAudit(e, auth, {
      tenant: tenantId,
      action: "create",
      collection_name: collectionName,
      record_id: record.id,
      changes: {
        name: String(record.get("name") || ""),
        code: String(record.get("code") || ""),
        date: masterData.dateOnly(record.get("date")),
      },
    });

    return e.json(201, { item: masterData.serialize(kind, record) });
  },
  $apis.requireAuth()
);

routerAdd(
  "PATCH",
  "/api/itsm/platform/tenants/{id}/master/{kind}/{recordId}",
  (e) => {
    var platform = require(__hooks + "/lib/platform.js");
    var masterData = require(__hooks + "/lib/master_data.js");

    var auth = platform.requirePlatform(e, true);

    var tenantId = e.request.pathValue("id");
    var kind = e.request.pathValue("kind");
    var collectionName = masterData.KINDS[kind];

    if (!collectionName) throw new BadRequestError("Jenis data master tidak dikenal");

    platform.findTenant(e.app, tenantId);

    var record;

    try {
      record = e.app.findRecordById(collectionName, e.request.pathValue("recordId"));
    } catch (err) {
      throw new NotFoundError("Data master tidak ditemukan");
    }

    if (String(record.get("tenant") || "") !== tenantId) {
      throw new NotFoundError("Data master tidak ditemukan");
    }

    var input = masterData.normalize(kind, e.requestInfo().body || {}, true);

    if (!Object.keys(input).length) {
      throw new BadRequestError("Tidak ada perubahan yang dikirim");
    }

    // Gabungkan nilai lama dengan perubahan untuk aturan yang melibatkan
    // beberapa field sekaligus (kalender kebijakan SLA).
    if (kind === "policies") {
      var merged = {
        calendar_mode: input.calendar_mode || String(record.get("calendar_mode") || ""),
        business_start:
          input.business_start || String(record.get("business_start") || ""),
        business_end: input.business_end || String(record.get("business_end") || ""),
        business_days:
          input.business_days !== undefined
            ? input.business_days
            : record.get("business_days") || [],
      };

      masterData.assertConsistent(kind, merged);
    }

    if (input.manager) {
      var managers = e.app.findRecordsByFilter(
        "users",
        "id = {:manager} && tenant = {:tenant} && is_active = true",
        "",
        1,
        0,
        { manager: input.manager, tenant: tenantId }
      );

      if (!managers.length) {
        throw new BadRequestError("Manajer unit harus pengguna aktif rumah sakit ini");
      }
    }

    var unique = masterData.uniqueCheck(kind, tenantId, input, record.id);
    if (
      unique &&
      e.app.findRecordsByFilter(
        collectionName,
        unique.filter,
        "",
        1,
        0,
        unique.params
      ).length
    ) {
      throw new BadRequestError("Data dengan kode/tanggal yang sama sudah ada");
    }

    var changes = {};

    for (var key in input) {
      changes[key] = { from: record.get(key), to: input[key] };
      record.set(key, input[key]);
    }

    $app.save(record);

    platform.writeAudit(e, auth, {
      tenant: tenantId,
      action: "update",
      collection_name: collectionName,
      record_id: record.id,
      changes: changes,
    });

    return e.json(200, { item: masterData.serialize(kind, record) });
  },
  $apis.requireAuth()
);
