// Laporan SLA untuk IT Lead: ringkasan, tren bulanan/mingguan, agregat per
// unit/prioritas/jenis, daftar breach terbaru, dan ekspor CSV per tiket.
routerAdd(
  "GET",
  "/api/itsm/reports/sla",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var reporting = require(__hooks + "/lib/reporting.js");

    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var range = reporting.parseRange(e.requestInfo().query, Date.now());
    if (range.error) throw new BadRequestError(range.error);

    var built = reporting.build($app, String(auth.get("tenant")), range);

    return e.json(200, {
      range: {
        from: range.from,
        to: range.to,
        days: range.days,
        bucket: range.bucket,
      },
      summary: built.report.summary,
      trend: built.report.trend,
      units: built.report.units,
      priorities: built.report.priorities,
      types: built.report.types,
      breaches: built.report.breaches,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "GET",
  "/api/itsm/reports/sla.csv",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var reporting = require(__hooks + "/lib/reporting.js");

    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var range = reporting.parseRange(e.requestInfo().query, Date.now());
    if (range.error) throw new BadRequestError(range.error);

    var built = reporting.build($app, String(auth.get("tenant")), range);
    var csv = reporting.toCsv(built.rows);

    e.response.header().set("Content-Type", "text/csv; charset=utf-8");
    e.response.header().set(
      "Content-Disposition",
      'attachment; filename="laporan-sla-' + range.from + '-' + range.to + '.csv"'
    );
    e.response.header().set("Cache-Control", "no-store");

    // BOM agar Excel membaca UTF-8 dengan benar.
    return e.string(200, "\uFEFF" + csv);
  },
  $apis.requireAuth()
);
