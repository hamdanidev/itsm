// Laporan SLA untuk Kepala IT dan Pengamat: ringkasan, tren bulanan/mingguan,
// agregat per unit/prioritas/jenis, daftar breach terbaru, dan ekspor CSV per
// tiket.
//
// Akun vendor (scope platform) memakai route yang sama:
//   tanpa `?tenant=` -> gabungan semua rumah sakit + ringkasan per RS
//   dengan `?tenant=`-> satu rumah sakit
// Akun rumah sakit selalu dibatasi ke tenant-nya sendiri oleh reportScope().
//
// Zona laporan dihitung di `lib/report_request.js` (bukan di file ini): callback
// route berjalan di VM baru, jadi helper top-level `.pb.js` tidak tersedia.

routerAdd(
  "GET",
  "/api/itsm/reports/sla",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var reporting = require(__hooks + "/lib/reporting.js");
    var platform = require(__hooks + "/lib/platform.js");
    var reportRequest = require(__hooks + "/lib/report_request.js");

    var ctx = reportRequest.context($app, e, guards, reporting, platform);
    var range = ctx.range;
    var scope = ctx.scope;
    var built = reporting.buildMulti($app, scope.tenants, range);

    var payload = {
      range: {
        from: range.from,
        to: range.to,
        days: range.days,
        bucket: range.bucket,
        timezone: range.timezone,
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
    var reportRequest = require(__hooks + "/lib/report_request.js");

    var ctx = reportRequest.context($app, e, guards, reporting, platform);
    var scope = ctx.scope;
    var report = reporting.buildOperations($app, scope.tenants, ctx.range);

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
    var reportRequest = require(__hooks + "/lib/report_request.js");

    var ctx = reportRequest.context($app, e, guards, reporting, platform);
    var scope = ctx.scope;
    var report = reporting.buildOperations($app, scope.tenants, ctx.range);
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
    var reportRequest = require(__hooks + "/lib/report_request.js");

    var ctx = reportRequest.context($app, e, guards, reporting, platform);
    var range = ctx.range;
    var scope = ctx.scope;
    var built = reporting.buildMulti($app, scope.tenants, range);

    // Kolom tenant hanya ditambahkan saat mengekspor gabungan banyak RS.
    var csv = reporting.toCsv(built.rows, {
      withTenant: scope.mode === "all",
      timezone: range.timezone,
    });

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

// ---------------------------------------------------------------------------
// Jadwal laporan SLA
// ---------------------------------------------------------------------------

routerAdd(
  "GET",
  "/api/itsm/reports/schedule",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var notify = require(__hooks + "/lib/notify.js");

    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var tenantId = String(auth.get("tenant") || "");
    if (!tenantId) {
      throw new BadRequestError(
        "Jadwal laporan hanya tersedia untuk akun rumah sakit"
      );
    }

    var tenant = e.app.findRecordById("tenants", tenantId);
    var recipients = notify.activeLeads(e.app, tenantId);

    return e.json(200, {
      frequency: String(tenant.get("report_frequency") || "off"),
      next_at: String(tenant.get("report_next_at") || ""),
      last_sent_at: String(tenant.get("report_last_sent_at") || ""),
      timezone: String(tenant.get("timezone") || ""),
      recipients: recipients.length,
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "PATCH",
  "/api/itsm/reports/schedule",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var reportSchedule = require(__hooks + "/lib/report_schedule.js");
    var audit = require(__hooks + "/lib/audit.js");

    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var tenantId = String(auth.get("tenant") || "");
    if (!tenantId) {
      throw new BadRequestError(
        "Jadwal laporan hanya tersedia untuk akun rumah sakit"
      );
    }

    var body = e.requestInfo().body || {};
    var frequency = String(body.frequency || "off");

    if (["off", "weekly", "monthly"].indexOf(frequency) < 0) {
      throw new BadRequestError("Frekuensi laporan tidak valid");
    }

    var tenant = e.app.findRecordById("tenants", tenantId);
    var nextAt =
      frequency === "off"
        ? ""
        : reportSchedule.nextRun(
            frequency,
            Date.now(),
            String(tenant.get("timezone") || "")
          );

    tenant.set("report_frequency", frequency);
    tenant.set("report_next_at", nextAt);
    e.app.save(tenant);

    var meta = audit.requestMeta(e);
    audit.write(e.app, {
      tenant: tenantId,
      actor: auth,
      action: "report_schedule",
      collection_name: "tenants",
      record_id: tenant.id,
      changes: { frequency: frequency, next_at: nextAt },
      ip: meta.ip,
      user_agent: meta.user_agent,
    });

    return e.json(200, {
      frequency: frequency,
      next_at: nextAt,
      last_sent_at: String(tenant.get("report_last_sent_at") || ""),
    });
  },
  $apis.requireAuth()
);

routerAdd(
  "POST",
  "/api/itsm/reports/schedule/run",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var reportSchedule = require(__hooks + "/lib/report_schedule.js");
    var audit = require(__hooks + "/lib/audit.js");

    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    var tenantId = String(auth.get("tenant") || "");
    if (!tenantId) {
      throw new BadRequestError(
        "Jadwal laporan hanya tersedia untuk akun rumah sakit"
      );
    }

    var tenant = e.app.findRecordById("tenants", tenantId);
    var result = reportSchedule.sendTenant(e.app, tenant, "manual");
    var now = new Date().toISOString();

    tenant.set("report_last_sent_at", now);
    e.app.save(tenant);

    var meta = audit.requestMeta(e);
    audit.write(e.app, {
      tenant: tenantId,
      actor: auth,
      action: "report_schedule",
      collection_name: "tenants",
      record_id: tenant.id,
      changes: {
        manual: true,
        recipients: result.recipients,
        sent: result.sent,
        range: result.range,
      },
      ip: meta.ip,
      user_agent: meta.user_agent,
    });

    return e.json(200, result);
  },
  $apis.requireAuth()
);
