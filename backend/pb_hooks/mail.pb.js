// Status dan pengiriman email. Cron berjalan setiap menit untuk menguras
// antrean notifikasi; route dispatch hanya untuk superuser (operasional/test).

routerAdd(
  "GET",
  "/api/itsm/mail/status",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var mail = require(__hooks + "/lib/mail.js");

    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    return e.json(
      200,
      mail.status(e.app, { tenantId: String(auth.get("tenant") || "") })
    );
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/itsm/mail/dispatch",
  (e) => {
    var mail = require(__hooks + "/lib/mail.js");

    return e.json(200, mail.dispatch(e.app, 50));
  },
  $apis.requireSuperuserAuth()
);

cronAdd("email_dispatch", "* * * * *", () => {
  var mail = require(__hooks + "/lib/mail.js");

  // Mode capture dipakai suite test: antrean sengaja tidak dikuras otomatis
  // agar test bisa memeriksa status queued sebelum memanggil route dispatch.
  if (mail.transport() === "capture") return;

  mail.dispatch($app, 20);
});
