/// <reference path="../pb_data/types.d.ts" />

// Akun yang dibuat oleh IT Lead rumah sakit memakai password awal yang dibuat
// sistem. Flag ini memaksa pengguna mengganti password sebelum memakai
// aplikasi; route profil yang menurunkan flag setelah password berhasil diubah.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    if (!users.fields.getByName("must_change_password")) {
      users.fields.addMarshaledJSON(
        JSON.stringify([{ name: "must_change_password", type: "bool" }])
      );
      app.save(users);
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    if (users.fields.getByName("must_change_password")) {
      users.fields.removeByName("must_change_password");
      app.save(users);
    }
  }
);
