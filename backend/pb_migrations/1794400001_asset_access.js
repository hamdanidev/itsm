/// <reference path="../pb_data/types.d.ts" />

// Requester hanya perlu katalog aset ringkas untuk memilih aset terdampak.
// Catatan, owner, garansi, dan riwayat tetap khusus staf; opsi ringkas dibaca
// lewat GET /api/itsm/assets/options.

migrate(
  (app) => {
    const AUTH =
      '@request.auth.id != "" && @request.auth.is_active = true';
    const TENANT = "tenant = @request.auth.tenant";
    const PLATFORM = "@request.auth.is_platform_staff = true";
    const STAFF =
      '(@request.auth.role = "it_support" || @request.auth.role = "it_lead")';
    const rule =
      AUTH + " && (" + PLATFORM + " || (" + TENANT + " && " + STAFF + "))";

    const assets = app.findCollectionByNameOrId("assets");
    assets.listRule = rule;
    assets.viewRule = rule;
    app.save(assets);
  },
  (app) => {
    const AUTH =
      '@request.auth.id != "" && @request.auth.is_active = true';
    const TENANT = "tenant = @request.auth.tenant";
    const PLATFORM = "@request.auth.is_platform_staff = true";
    const rule = AUTH + " && (" + PLATFORM + " || " + TENANT + ")";

    try {
      const assets = app.findCollectionByNameOrId("assets");
      assets.listRule = rule;
      assets.viewRule = rule;
      app.save(assets);
    } catch (err) {
      // assets tidak ada
    }
  }
);
