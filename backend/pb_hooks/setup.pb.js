// Setup awal instalasi (first-run): status + pembuatan akun pertama untuk mode
// standalone (rumah sakit + Kepala IT) maupun vendor (akun platform).
//
// Kedua route bersifat publik karena justru dipakai sebelum ada akun. Akses tulis
// dijaga kode setup sekali pakai dan status "belum ada akun"; lihat lib/setup.js.
//
// Catatan: handler route dievaluasi PocketBase di konteks terpisah, jadi file ini
// tidak boleh memakai fungsi top-level — semua helper ada di `lib/setup.js`.

routerAdd("GET", "/api/itsm/setup/status", (e) => {
  var setup = require(__hooks + "/lib/setup.js");

  return e.json(200, setup.statusPayload(e.app));
});

routerAdd("POST", "/api/itsm/setup", (e) => {
  var setup = require(__hooks + "/lib/setup.js");

  return e.json(201, setup.performSetup(e));
});
