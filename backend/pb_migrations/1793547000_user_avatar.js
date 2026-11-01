/// <reference path="../pb_data/types.d.ts" />

// Foto profil pengguna. File tidak diproteksi (avatar memang ditampilkan di
// daftar komentar), dengan batas 2 MB dan tipe gambar yang aman.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    if (!users.fields.getByName("avatar")) {
      users.fields.addMarshaledJSON(
        JSON.stringify([
          {
            name: "avatar",
            type: "file",
            maxSelect: 1,
            maxSize: 2097152,
            mimeTypes: ["image/png", "image/jpeg", "image/webp"],
            thumbs: ["96x96"],
          },
        ])
      );
      app.save(users);
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    try {
      users.fields.removeByName("avatar");
      app.save(users);
    } catch (err) {
      // field mungkin sudah tidak ada
    }
  }
);
