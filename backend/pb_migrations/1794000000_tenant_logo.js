/// <reference path="../pb_data/types.d.ts" />

// Logo rumah sakit. Dipakai sidebar, halaman masuk, dan tab Identitas.
// Logo disajikan lewat file PocketBase untuk pengguna login, dan lewat route
// publik `/api/itsm/branding/logo` khusus instalasi standalone (halaman login
// belum punya sesi).

migrate(
  (app) => {
    const tenants = app.findCollectionByNameOrId("tenants");

    if (!tenants.fields.getByName("logo")) {
      tenants.fields.addMarshaledJSON(
        JSON.stringify([
          {
            name: "logo",
            type: "file",
            maxSelect: 1,
            maxSize: 2097152,
            mimeTypes: ["image/png", "image/jpeg", "image/webp"],
            thumbs: ["96x96"],
          },
        ])
      );
      app.save(tenants);
    }
  },
  (app) => {
    const tenants = app.findCollectionByNameOrId("tenants");

    if (tenants.fields.getByName("logo")) {
      tenants.fields.removeByName("logo");
      app.save(tenants);
    }
  }
);
