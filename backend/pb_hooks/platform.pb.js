// Konsol Vendor (Fase 1): mode tenancy + pengelolaan tenant dari dalam aplikasi.
//
// Semua route di sini hanya untuk akun platform (`users.is_platform_staff`),
// dan hanya aktif pada instalasi `TENANCY_MODE=vendor`. Pembacaan lintas tenant
// dilakukan di server dengan filter eksplisit; API rule koleksi tetap
// tenant-scoped, sehingga akun platform tidak otomatis bisa membaca data rumah
// sakit lewat REST biasa.
//
// Catatan: handler route dievaluasi PocketBase di konteks terpisah, jadi file
// ini tidak boleh memakai fungsi top-level — semua helper ada di
// `lib/platform.js`, `lib/tenancy.js`, dan `lib/tenant_seed.js`.
//
// Fase 2 (vendor sebagai resolver tiket) akan menambah cabang rule tersebut.

// ---------------------------------------------------------------------------
// Meta (publik) — dipakai frontend untuk menentukan apakah Konsol Vendor tampil.
// ---------------------------------------------------------------------------

routerAdd("GET", "/api/itsm/app-meta", (e) => {
  var tenancy = require(__hooks + "/lib/tenancy.js");
  var setup = require(__hooks + "/lib/setup.js");
  // "Acme" adalah nama bawaan PocketBase; jangan tampilkan sebagai brand.
  var appName = String(e.app.settings().meta.appName || "").trim();
  if (!appName || appName === "Acme") appName = "Healthcare ITSM";

  var payload = {
    app: appName,
    mode: tenancy.current(),
    vendor_console: tenancy.isVendor(),
    // Frontend memakai ini untuk mengalihkan semua halaman ke /setup selama
    // instalasi belum punya akun.
    setup_required: setup.setupRequired(e.app),
    tenant: null,
  };

  // Halaman login pada instalasi standalone menampilkan identitas rumah sakit.
  // Mode vendor tidak memilih satu tenant, jadi tetap memakai brand aplikasi.
  // Selama setup awal belum selesai, identitas seed belum nyata sehingga brand
  // aplikasi yang ditampilkan (bukan "Rumah Sakit Contoh").
  if (!tenancy.isVendor() && !payload.setup_required) {
    var rows = e.app.findRecordsByFilter(
      "tenants",
      "is_active = true",
      "",
      1,
      0
    );

    if (rows.length) {
      var tenant = rows[0];
      var logo = String(tenant.get("logo") || "");

      payload.tenant = {
        id: tenant.id,
        name: String(tenant.get("name") || ""),
        code: String(tenant.get("code") || ""),
        logo: logo,
        logo_url: logo
          ? "/api/itsm/branding/logo?v=" + encodeURIComponent(logo)
          : "",
      };
    }
  }

  return e.json(200, payload);
});

// ---------------------------------------------------------------------------
// Tenant
// ---------------------------------------------------------------------------

routerAdd(
  "GET",
  "/api/itsm/platform/tenants",
  (e) => {
    var platform = require(__hooks + "/lib/platform.js");
    var tenancy = require(__hooks + "/lib/tenancy.js");
    var paging = require(__hooks + "/lib/paging.js");

    platform.requirePlatform(e, false);

    var query = e.requestInfo().query || {};
    var size = paging.numbers(query);
    var q = paging.search(query);

    var filter = 'id != ""';
    var params = {};

    if (q) {
      filter += " && (name ~ {:q} || code ~ {:q})";
      params.q = q;
    }

    var totalItems = paging.count(e.app, "tenants", filter, params);

    // Ringkasan tetap mencakup seluruh instalasi, bukan hanya halaman ini.
    var all = e.app.findRecordsByFilter("tenants", 'id != ""', "name", 0, 0);
    var summary = { tenants: 0, active: 0, users: 0, open_tickets: 0 };

    for (var i = 0; i < all.length; i++) {
      var counts = platform.countsFor(e.app, all[i].id);

      summary.tenants += 1;
      if (all[i].get("is_active")) summary.active += 1;
      summary.users += counts.users;
      summary.open_tickets += counts.open_tickets;
    }

    var records = e.app.findRecordsByFilter(
      "tenants",
      filter,
      "name",
      size.perPage,
      (size.page - 1) * size.perPage,
      params
    );
    var items = [];

    for (var j = 0; j < records.length; j++) {
      items.push(
        platform.serializeTenant(records[j], platform.countsFor(e.app, records[j].id))
      );
    }

    var meta = paging.meta(size.page, size.perPage, totalItems);

    return e.json(200, {
      mode: tenancy.current(),
      items: items,
      summary: summary,
      page: meta.page,
      perPage: meta.perPage,
      totalItems: meta.totalItems,
      totalPages: meta.totalPages,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/itsm/platform/tenants",
  (e) => {
    var platform = require(__hooks + "/lib/platform.js");
    var tenancy = require(__hooks + "/lib/tenancy.js");
    var tenantSeed = require(__hooks + "/lib/tenant_seed.js");

    var auth = platform.requirePlatform(e, true);
    tenancy.assertVendor();

    var body = e.requestInfo().body || {};
    var input = platform.validateTenantInput(body, false);

    var duplicate = e.app.findRecordsByFilter(
      "tenants",
      "code = {:code}",
      "",
      1,
      0,
      { code: input.code }
    );

    if (duplicate.length > 0) {
      throw new BadRequestError("Kode rumah sakit sudah dipakai");
    }

    var adminInput = null;
    var rawAdmin = body.admin || {};

    if (rawAdmin.email || rawAdmin.password) {
      adminInput = platform.validateUserInput(
        {
          name: rawAdmin.name || "Kepala IT " + input.code,
          email: rawAdmin.email,
          role: rawAdmin.role || "it_lead",
          job_title: rawAdmin.job_title || "",
          team: rawAdmin.team || "",
          password: rawAdmin.password,
        },
        false
      );
    }

    var result = { tenant: null, seed: null, admin: null };

    // Tenant, master data default, dan akun pertama dibuat atomik supaya tidak
    // ada rumah sakit setengah jadi bila salah satu langkah gagal.
    $app.runInTransaction((txApp) => {
      var collection = txApp.findCollectionByNameOrId("tenants");
      var record = new Record(collection);

      record.set("name", input.name);
      record.set("code", input.code);
      record.set("timezone", input.timezone);
      record.set("is_active", input.is_active !== false);
      txApp.save(record);

      result.tenant = record;

      if (body.seed_master !== false) {
        result.seed = tenantSeed.seed(txApp, record.id, input.timezone);
      }

      if (adminInput) {
        result.admin = platform.createTenantUser(txApp, record.id, adminInput);
      }
    });

    platform.writeAudit(e, auth, {
      tenant: result.tenant.id,
      action: "create",
      collection_name: "tenants",
      record_id: result.tenant.id,
      changes: {
        name: input.name,
        code: input.code,
        timezone: input.timezone,
        seeded: body.seed_master !== false,
        admin_email: adminInput ? adminInput.email : "",
      },
    });

    return e.json(201, {
      tenant: platform.serializeTenant(
        result.tenant,
        platform.countsFor($app, result.tenant.id)
      ),
      seed: result.seed,
      admin: result.admin ? platform.serializeUser(result.admin, "") : null,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "GET",
  "/api/itsm/platform/tenants/{id}",
  (e) => {
    var platform = require(__hooks + "/lib/platform.js");

    platform.requirePlatform(e, false);

    var tenant = platform.findTenant(e.app, e.request.pathValue("id"));
    var counts = platform.countsFor(e.app, tenant.id);

    var userRecords = e.app.findRecordsByFilter(
      "users",
      "tenant = {:tenant}",
      "name",
      200,
      0,
      { tenant: tenant.id }
    );

    var unitRecords = e.app.findRecordsByFilter(
      "units",
      "tenant = {:tenant}",
      "name",
      200,
      0,
      { tenant: tenant.id }
    );

    var unitNames = {};
    var units = [];

    for (var u = 0; u < unitRecords.length; u++) {
      unitNames[unitRecords[u].id] = String(unitRecords[u].get("name") || "");
      units.push({
        id: unitRecords[u].id,
        name: String(unitRecords[u].get("name") || ""),
        code: String(unitRecords[u].get("code") || ""),
      });
    }

    var users = [];

    for (var i = 0; i < userRecords.length; i++) {
      users.push(
        platform.serializeUser(
          userRecords[i],
          unitNames[String(userRecords[i].get("unit") || "")] || ""
        )
      );
    }

    return e.json(200, {
      tenant: platform.serializeTenant(tenant, counts),
      counts: counts,
      users: users,
      units: units,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "PATCH",
  "/api/itsm/platform/tenants/{id}",
  (e) => {
    var platform = require(__hooks + "/lib/platform.js");
    var tenancy = require(__hooks + "/lib/tenancy.js");

    var auth = platform.requirePlatform(e, true);
    tenancy.assertVendor();

    var tenant = platform.findTenant(e.app, e.request.pathValue("id"));
    var body = e.requestInfo().body || {};
    var input = platform.validateTenantInput(body, true);

    if (input.code && input.code !== String(tenant.get("code") || "")) {
      var duplicate = e.app.findRecordsByFilter(
        "tenants",
        "code = {:code}",
        "",
        1,
        0,
        { code: input.code }
      );

      if (duplicate.length > 0) {
        throw new BadRequestError("Kode rumah sakit sudah dipakai");
      }
    }

    var changes = {};
    var previousTimezone = String(tenant.get("timezone") || "");
    var timezoneChanged =
      input.timezone !== undefined && String(input.timezone) !== previousTimezone;

    for (var key in input) {
      changes[key] = { from: tenant.get(key), to: input[key] };
      tenant.set(key, input[key]);
    }

    // Policy SLA menyimpan zona sendiri agar bisa dihitung tanpa membaca tenant.
    // Saat zona rumah sakit berubah, policy-nya ikut diselaraskan; tanpa ini
    // tenggat tiket baru tetap memakai zona lama.
    $app.runInTransaction((txApp) => {
      txApp.save(tenant);

      if (!timezoneChanged) return;

      var policies = txApp.findRecordsByFilter(
        "sla_policies",
        "tenant = {:tenant}",
        "",
        0,
        0,
        { tenant: tenant.id }
      );

      for (var i = 0; i < policies.length; i++) {
        policies[i].set("timezone", input.timezone);
        txApp.save(policies[i]);
      }
    });

    platform.writeAudit(e, auth, {
      tenant: tenant.id,
      action: "update",
      collection_name: "tenants",
      record_id: tenant.id,
      changes: changes,
    });

    return e.json(200, {
      tenant: platform.serializeTenant(
        tenant,
        platform.countsFor($app, tenant.id)
      ),
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/itsm/platform/tenants/{id}/seed",
  (e) => {
    var platform = require(__hooks + "/lib/platform.js");
    var tenancy = require(__hooks + "/lib/tenancy.js");
    var tenantSeed = require(__hooks + "/lib/tenant_seed.js");

    var auth = platform.requirePlatform(e, true);
    tenancy.assertVendor();

    var tenant = platform.findTenant(e.app, e.request.pathValue("id"));
    var created = tenantSeed.seed(
      $app,
      tenant.id,
      String(tenant.get("timezone") || "Asia/Jakarta")
    );

    platform.writeAudit(e, auth, {
      tenant: tenant.id,
      action: "update",
      collection_name: "tenants",
      record_id: tenant.id,
      changes: { seeded: created },
    });

    return e.json(200, {
      counts: platform.countsFor($app, tenant.id),
      created: created,
    });
  },
  $apis.requireAuth()
);

// ---------------------------------------------------------------------------
// Pengguna tenant
// ---------------------------------------------------------------------------

routerAdd(
  "POST",
  "/api/itsm/platform/tenants/{id}/users",
  (e) => {
    var platform = require(__hooks + "/lib/platform.js");
    var tenancy = require(__hooks + "/lib/tenancy.js");

    var auth = platform.requirePlatform(e, true);
    tenancy.assertVendor();

    var tenant = platform.findTenant(e.app, e.request.pathValue("id"));
    var body = e.requestInfo().body || {};
    var input = platform.validateUserInput(body, false);

    if (input.unit) {
      var units = e.app.findRecordsByFilter(
        "units",
        "id = {:unit} && tenant = {:tenant}",
        "",
        1,
        0,
        { unit: input.unit, tenant: tenant.id }
      );

      if (units.length === 0) {
        throw new BadRequestError("Unit tidak ditemukan pada rumah sakit ini");
      }
    }

    var user = platform.createTenantUser($app, tenant.id, input);

    platform.writeAudit(e, auth, {
      tenant: tenant.id,
      action: "create",
      collection_name: "users",
      record_id: user.id,
      changes: {
        email: input.email,
        role: input.role,
        job_title: input.job_title || "",
        team: input.team || "",
        unit: input.unit || "",
      },
    });

    return e.json(201, { user: platform.serializeUser(user, "") });
  },
  $apis.requireAuth()
);

routerAdd(
  "PATCH",
  "/api/itsm/platform/tenants/{id}/users/{userId}",
  (e) => {
    var platform = require(__hooks + "/lib/platform.js");
    var tenancy = require(__hooks + "/lib/tenancy.js");

    var auth = platform.requirePlatform(e, true);
    tenancy.assertVendor();

    var tenantId = e.request.pathValue("id");
    platform.findTenant(e.app, tenantId);

    var user = platform.findTenantUser(e.app, tenantId, e.request.pathValue("userId"));
    var body = e.requestInfo().body || {};
    var input = platform.validateUserInput(body, true);

    if (input.unit) {
      var units = e.app.findRecordsByFilter(
        "units",
        "id = {:unit} && tenant = {:tenant}",
        "",
        1,
        0,
        { unit: input.unit, tenant: tenantId }
      );

      if (units.length === 0) {
        throw new BadRequestError("Unit tidak ditemukan pada rumah sakit ini");
      }
    }

    var changes = {};

    for (var key in input) {
      if (key === "password") {
        changes.password = "changed";
        continue;
      }

      changes[key] = { from: user.get(key), to: input[key] };
      user.set(key, input[key]);
    }

    if (input.password) user.setPassword(input.password);

    $app.save(user);

    platform.writeAudit(e, auth, {
      tenant: tenantId,
      action: "update",
      collection_name: "users",
      record_id: user.id,
      changes: changes,
    });

    return e.json(200, { user: platform.serializeUser(user, "") });
  },
  $apis.requireAuth()
);
