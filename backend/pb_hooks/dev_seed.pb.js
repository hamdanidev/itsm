// Route bantu SEED DATA MANUAL — hanya untuk development/testing.
//
// Dipakai oleh `scripts/seed.mjs` untuk dua hal yang tidak bisa dilakukan lewat
// API biasa:
//   1. memundurkan/menyebar waktu record (created & turunannya) supaya dataset
//      terlihat seperti dipakai berbulan-bulan, dan
//   2. membersihkan data demo satu rumah sakit sebelum seeding ulang.
//
// Kedua route hanya menerima **superuser PocketBase**
// (`$apis.requireSuperuserAuth()`), jadi tidak menambah hak akses baru: superuser
// memang sudah dapat mengelola seluruh data lewat Admin UI. Aplikasi biasa
// (frontend) tidak pernah memanggil route ini.
//
// Logika berat ada di `lib/dev_seed.js` karena callback route dievaluasi pada
// konteks VM terpisah.

routerAdd(
  "POST",
  "/api/itsm/dev/seed/age",
  (e) => {
    var devSeed = require(__hooks + "/lib/dev_seed.js");
    var body = e.requestInfo().body || {};
    var items = body.items;

    if (!items || typeof items.length !== "number") {
      throw new BadRequestError("items wajib berupa array");
    }
    if (items.length > 500) {
      throw new BadRequestError("Maksimal 500 item per permintaan");
    }

    var result = devSeed.age(e.app, items);
    var summary = {
      tickets: result.tickets.length,
      problems: result.problems.length,
      incidents: result.incidents.length,
      articles: result.articles.length,
      comments: 0,
      attachments: 0,
      approvals: 0,
      audit: 0,
    };

    for (var i = 0; i < result.tickets.length; i++) {
      summary.comments += Number(result.tickets[i].comments) || 0;
      summary.attachments += Number(result.tickets[i].attachments) || 0;
      summary.approvals += Number(result.tickets[i].approvals) || 0;
      summary.audit += Number(result.tickets[i].audit) || 0;
    }

    return e.json(200, summary);
  },
  $apis.requireSuperuserAuth()
);

routerAdd(
  "POST",
  "/api/itsm/dev/seed/reset",
  (e) => {
    var devSeed = require(__hooks + "/lib/dev_seed.js");
    var body = e.requestInfo().body || {};

    return e.json(200, devSeed.reset(e.app, { tenant: body.tenant || "" }));
  },
  $apis.requireSuperuserAuth()
);
