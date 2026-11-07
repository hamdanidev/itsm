// Laporan SLA untuk Kepala IT dan Pengamat: ringkasan, tren bulanan/mingguan,
// agregat per unit/prioritas/jenis, daftar breach terbaru, dan ekspor CSV per
// tiket.
//
// Akun vendor (scope platform) memakai route yang sama:
//   tanpa `?tenant=` -> gabungan semua rumah sakit + ringkasan per RS
//   dengan `?tenant=`-> satu rumah sakit
// Akun rumah sakit selalu dibatasi ke tenant-nya sendiri oleh reportScope().
routerAdd(
  "GET",
  "/api/itsm/reports/sla",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var reporting = require(__hooks + "/lib/reporting.js");
    var platform = require(__hooks + "/lib/platform.js");

    var auth = guards.requireAuth(e);
    guards.assertReportReader(auth);

    var query = e.requestInfo().query || {};
    var range = reporting.parseRange(query, Date.now());
    if (range.error) throw new BadRequestError(range.error);

    var scope = platform.reportScope(
      $app,
      auth,
      reporting.queryText(query, "tenant"),
      guards.isPlatformStaff(auth)
    );
    var built = reporting.buildMulti($app, scope.tenants, range);

    var payload = {
      range: {
        from: range.from,
        to: range.to,
        days: range.days,
        bucket: range.bucket,
      },
      scope: { mode: scope.mode, tenant: scope.selected },
      summary: built.report.summary,
      trend: built.report.trend,
      units: built.report.units,
      priorities: built.report.priorities,
      types: built.report.types,
      breaches: built.report.breaches,
    };

    // Perbandingan antar rumah sakit hanya relevan saat cakupannya gabungan.
    if (scope.mode === "all") {
      payload.tenants = built.report.tenants;
    }

    return e.json(200, payload);
  },
  $apis.requireAuth()
);

routerAdd(
  "GET",
  "/api/itsm/reports/operations",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var reporting = require(__hooks + "/lib/reporting.js");
    var platform = require(__hooks + "/lib/platform.js");

    var auth = guards.requireAuth(e);
    guards.assertReportReader(auth);

    var query = e.requestInfo().query || {};
    var range = reporting.parseRange(query, Date.now());
    if (range.error) throw new BadRequestError(range.error);

    var scope = platform.reportScope(
      $app,
      auth,
      reporting.queryText(query, "tenant"),
      guards.isPlatformStaff(auth)
    );

    var report = reporting.buildOperations($app, scope.tenants, range);

    return e.json(200, {
      range: report.range,
      scope: { mode: scope.mode, tenant: scope.selected },
      sla: report.sla,
      incidents: report.incidents,
      csat: report.csat,
      knowledge: report.knowledge,
      top_problems: report.top_problems,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "GET",
  "/api/itsm/reports/operations.csv",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var reporting = require(__hooks + "/lib/reporting.js");
    var platform = require(__hooks + "/lib/platform.js");

    var auth = guards.requireAuth(e);
    guards.assertReportReader(auth);

    var query = e.requestInfo().query || {};
    var range = reporting.parseRange(query, Date.now());
    if (range.error) throw new BadRequestError(range.error);

    var scope = platform.reportScope(
      $app,
      auth,
      reporting.queryText(query, "tenant"),
      guards.isPlatformStaff(auth)
    );

    var report = reporting.buildOperations($app, scope.tenants, range);
    var csv = reporting.operationsCsv(report);

    e.response.header().set("Content-Type", "text/csv; charset=utf-8");
    e.response.header().set(
      "Content-Disposition",
      'attachment; filename="laporan-operasional-' +
        report.range.from +
        "-" +
        report.range.to +
        '.csv"'
    );
    e.response.header().set("Cache-Control", "no-store");

    return e.string(200, "\uFEFF" + csv);
  },
  $apis.requireAuth()
);

routerAdd(
  "GET",
  "/api/itsm/reports/sla.csv",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var reporting = require(__hooks + "/lib/reporting.js");
    var platform = require(__hooks + "/lib/platform.js");

    var auth = guards.requireAuth(e);
    guards.assertReportReader(auth);

    var query = e.requestInfo().query || {};
    var range = reporting.parseRange(query, Date.now());
    if (range.error) throw new BadRequestError(range.error);

    var scope = platform.reportScope(
      $app,
      auth,
      reporting.queryText(query, "tenant"),
      guards.isPlatformStaff(auth)
    );
    var built = reporting.buildMulti($app, scope.tenants, range);

    // Kolom tenant hanya ditambahkan saat mengekspor gabungan banyak RS.
    var csv = reporting.toCsv(built.rows, { withTenant: scope.mode === "all" });

    e.response.header().set("Content-Type", "text/csv; charset=utf-8");
    e.response.header().set(
      "Content-Disposition",
      'attachment; filename="laporan-sla-' + range.from + "-" + range.to + '.csv"'
    );
    e.response.header().set("Cache-Control", "no-store");

    // BOM agar Excel membaca UTF-8 dengan benar.
    return e.string(200, "\uFEFF" + csv);
  },
  $apis.requireAuth()
);
