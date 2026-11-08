// Gabungkan tiket duplikat ke tiket tujuan.
//
// Hanya staf IT (bukan resolver) yang boleh melakukan merge karena aksi ini
// menutup tiket sumber dan memindahkan riwayat. Logika berat ada di
// `lib/merge.js` agar callback route tetap tipis.

routerAdd(
  "POST",
  "/api/itsm/tickets/{id}/merge",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var mergeLib = require(__hooks + "/lib/merge.js");

    var auth = guards.requireAuth(e);
    guards.assertStaff(auth);

    var source = guards.findTicket(e, e.request.pathValue("id"));
    guards.assertTicketAccess(e, source);

    var body = e.requestInfo().body || {};
    var targetId = String(body.target || "").trim();

    if (!targetId) {
      throw new BadRequestError("Pilih tiket tujuan penggabungan");
    }

    var target = guards.findTicket(e, targetId);
    guards.assertTicketAccess(e, target);

    var result = mergeLib.merge(e.app, {
      sourceId: source.id,
      targetId: target.id,
      actor: auth,
      note: body.note,
    });

    return e.json(200, result);
  },
  $apis.requireAuth()
);
