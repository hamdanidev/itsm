// Audit rumah sakit untuk Kepala IT dan Pengamat.
//
// Rule koleksi `audit_logs` tetap hanya untuk Kepala IT. Pengamat tidak membuka
// koleksi mentah; route ini membaca dengan tenant dari `e.auth` dan memakai
// helper yang sama dengan audit vendor, sehingga tidak ada risiko cross-tenant.
routerAdd(
  "GET",
  "/api/itsm/audit",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var auditView = require(__hooks + "/lib/platform_audit.js");
    var reporting = require(__hooks + "/lib/reporting.js");

    var auth = guards.requireAuth(e);
    guards.assertReportReader(auth);

    var tenantId = String(auth.get("tenant") || "");
    if (!tenantId) {
      throw new BadRequestError("Akun tidak memiliki tenant");
    }

    var query = e.requestInfo().query || {};
    var range = reporting.parseRange(query, Date.now());
    if (range.error) throw new BadRequestError(range.error);

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
