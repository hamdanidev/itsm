/// <reference path="../pb_data/types.d.ts" />

// Jabatan (job title) terpisah dari role akses. Dipakai untuk menampilkan
// Programmer, Teknisi Jaringan, DBA, Admin SIMRS, dan sejenisnya tanpa
// menambah nilai `users.role`.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    if (!users.fields.getByName("job_title")) {
      users.fields.addMarshaledJSON(
        JSON.stringify([{ name: "job_title", type: "text", max: 80 }])
      );
      app.save(users);
    }
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    if (users.fields.getByName("job_title")) {
      users.fields.removeByName("job_title");
      app.save(users);
    }
  }
);
