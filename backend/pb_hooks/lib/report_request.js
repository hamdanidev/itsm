// Konteks bersama untuk route laporan: autentikasi, cakupan tenant, dan rentang
// tanggal pada zona yang benar.
//
// Kenapa di modul, bukan di `reports.pb.js`: setiap callback route dijalankan di
// VM Goja tersendiri, sehingga fungsi top-level pada file `.pb.js` tidak bisa
// dipanggil dari dalam handler (ReferenceError). Helper harus di-`require`.

var DEFAULT_ZONE = "Asia/Jakarta";

// Zona laporan: `?timezone=` (divalidasi) > zona tenant yang dilihat >
// `Asia/Jakarta`. Untuk laporan gabungan lintas negara, zona eksplisit
// mencegah tanggal jatuh ke hari/bulan yang berbeda.
function resolveZone(query, scope) {
  var timezone = require(__hooks + "/lib/timezone.js");
  var reporting = require(__hooks + "/lib/reporting.js");
  var requested = reporting.queryText(query, "timezone");

  if (requested) {
    if (!timezone.isValidZone(requested)) {
      throw new BadRequestError("Zona waktu laporan tidak valid");
    }

    return requested;
  }

  if (scope && scope.tenants && scope.tenants.length === 1) {
    return timezone.resolveZone(String(scope.tenants[0].get("timezone") || ""));
  }

  return timezone.resolveZone(DEFAULT_ZONE);
}

function context(app, e, guards, reporting, platform) {
  var auth = guards.requireAuth(e);
  guards.assertReportReader(auth);

  var query = e.requestInfo().query || {};
  var scope = platform.reportScope(
    app,
    auth,
    reporting.queryText(query, "tenant"),
    guards.isPlatformStaff(auth)
  );
  var range = reporting.parseRange(query, Date.now(), resolveZone(query, scope));

  if (range.error) throw new BadRequestError(range.error);

  return { auth: auth, query: query, scope: scope, range: range };
}

module.exports = {
  resolveZone: resolveZone,
  context: context,
};
