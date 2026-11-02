// Konsol Vendor — audit lintas rumah sakit.
//
// Hanya baca. Sumbernya `audit_logs` yang sudah diisi hook internal; route ini
// menambahkan filter tenant eksplisit dan melengkapi nama aktor/tenant karena
// akun platform tidak cocok dengan rule baca koleksi audit.
routerAdd(
  "GET",
  "/api/itsm/platform/audit",
  (e) => {
    var platform = require(__hooks + "/lib/platform.js");
    var auditView = require(__hooks + "/lib/platform_audit.js");
    var reporting = require(__hooks + "/lib/reporting.js");

    platform.requirePlatform(e, false);

    var query = e.requestInfo().query || {};
    var range = reporting.parseRange(query, Date.now());
    if (range.error) throw new BadRequestError(range.error);

    var tenantId = reporting.queryText(query, "tenant");
    if (tenantId) platform.findTenant(e.app, tenantId);

    var action = reporting.queryText(query, "action");
    if (action && auditView.ACTIONS.indexOf(action) < 0) {
      throw new BadRequestError("Aksi audit tidak dikenal");
    }

    var collection = reporting.queryText(query, "collection");
    if (collection && auditView.COLLECTIONS.indexOf(collection) < 0) {
      throw new BadRequestError("Koleksi audit tidak dikenal");
    }

    var scope = reporting.queryText(query, "scope");
    if (["platform", "tenant", "superuser"].indexOf(scope) < 0) scope = "";

    var result = auditView.list(e.app, {
      tenantId: tenantId,
      action: action,
      collection: collection,
      actorId: reporting.queryText(query, "actor"),
      scope: scope,
      q: auditView.cleanText(reporting.queryText(query, "q"), 40),
      page: Number(reporting.queryText(query, "page")) || 1,
      perPage: Number(reporting.queryText(query, "perPage")) || 25,
      fromMs: range.fromMs,
      toMs: range.toMs,
    });

    return e.json(200, {
      range: { from: range.from, to: range.to, days: range.days },
      page: result.page,
      perPage: result.perPage,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      items: result.items,
      actors: auditView.actors(e.app, tenantId),
    });
  },
  $apis.requireAuth()
);
