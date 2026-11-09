// Laporan SLA terjadwal per tenant.
//
// Jadwal disimpan di `tenants.report_frequency`:
//   off      -> tidak ada pengiriman
//   weekly   -> Senin 07:00 waktu lokal tenant
//   monthly  -> tanggal 1 07:00 waktu lokal tenant
//
// "07:00" adalah jam dinding tenant, bukan WIB: rumah sakit di WITA/WIT atau
// negara lain menerima laporan pada pagi hari mereka sendiri. Cron memanggil
// `runDue()`; route "Kirim sekarang" memanggil `sendTenant()`.
// PDF tidak dibuat di server; halaman Laporan menyediakan Cetak/PDF lewat
// dialog cetak browser.

var timezone = require(__hooks + "/lib/timezone.js");

var DAY_MS = 24 * 60 * 60 * 1000;
var SEND_HOUR = 7;

function tenantZone(tenant) {
  return timezone.resolveZone(tenant && tenant.get("timezone"));
}

function nextRun(frequency, fromMs, zoneName) {
  if (frequency !== "weekly" && frequency !== "monthly") return "";

  var zone = timezone.resolveZone(zoneName);
  var now = fromMs || Date.now();
  var parts = timezone.localParts(now, zone);

  if (frequency === "weekly") {
    // 1 = Senin (ISO), jadi jarak ke Senin berikutnya dihitung dari situ.
    var daysAhead = (1 - parts.weekday + 7) % 7;
    var candidate = timezone.fromLocal(
      parts.year,
      parts.month,
      parts.day + daysAhead,
      SEND_HOUR,
      0,
      zone
    );

    if (candidate <= now) {
      candidate = timezone.fromLocal(
        parts.year,
        parts.month,
        parts.day + daysAhead + 7,
        SEND_HOUR,
        0,
        zone
      );
    }

    return new Date(candidate).toISOString();
  }

  var monthly = timezone.fromLocal(
    parts.year,
    parts.month,
    1,
    SEND_HOUR,
    0,
    zone
  );

  if (monthly <= now) {
    monthly = timezone.fromLocal(
      parts.year,
      parts.month + 1,
      1,
      SEND_HOUR,
      0,
      zone
    );
  }

  return new Date(monthly).toISOString();
}

function sendTenant(app, tenant, frequencyOverride) {
  var reporting = require(__hooks + "/lib/reporting.js");
  var notify = require(__hooks + "/lib/notify.js");
  var mail = require(__hooks + "/lib/mail.js");

  var now = Date.now();
  var zone = tenantZone(tenant);
  var parts = timezone.localParts(now, zone);
  var frequency = String(
    frequencyOverride || tenant.get("report_frequency") || "manual"
  );

  var range = reporting.parseRange(
    {
      from: timezone.dateKey(
        timezone.fromLocal(parts.year, parts.month, parts.day - 29, 0, 0, zone),
        zone
      ),
      to: timezone.dateKey(now, zone),
      bucket: "week",
    },
    now,
    zone
  );

  if (range.error) throw new BadRequestError(range.error);

  var tenantId = String(tenant.id || "");
  var built = reporting.buildMulti(app, [tenant], range);
  var report = built.report;
  var summary = report.summary;
  var recipients = notify.activeLeads(app, tenantId);
  var sent = 0;

  for (var i = 0; i < recipients.length; i++) {
    var queued = mail.queueReportSummary(app, {
      tenantId: tenantId,
      userId: String(recipients[i].id || ""),
      to: String(recipients[i].get("email") || ""),
      recipientName: String(recipients[i].get("name") || ""),
      tenantName: String(tenant.get("name") || ""),
      frequency: frequency,
      period_from: range.from,
      period_to: range.to,
      summary: summary,
      units: report.units,
    });

    if (queued) sent += 1;
  }

  return {
    tenant: tenantId,
    tenant_name: String(tenant.get("name") || ""),
    range: { from: range.from, to: range.to },
    timezone: zone,
    recipients: recipients.length,
    sent: sent,
    summary: summary,
  };
}

function runDue(app) {
  var nowMs = Date.now();
  var now = new Date(nowMs).toISOString().replace("T", " ");
  var tenants = app.findRecordsByFilter(
    "tenants",
    "is_active = true && report_frequency != '' && report_frequency != 'off' && " +
      "report_next_at != '' && report_next_at <= {:now}",
    "report_next_at",
    50,
    0,
    { now: now }
  );

  var result = { tenants: 0, sent: 0, items: [] };
  var audit = require(__hooks + "/lib/audit.js");

  for (var i = 0; i < tenants.length; i++) {
    var tenant = tenants[i];
    var frequency = String(tenant.get("report_frequency") || "");

    try {
      var sent = sendTenant(app, tenant);
      result.tenants += 1;
      result.sent += sent.sent;

      tenant.set("report_last_sent_at", now);
      tenant.set("report_next_at", nextRun(frequency, nowMs, tenantZone(tenant)));
      app.save(tenant);

      audit.write(app, {
        tenant: tenant.id,
        action: "report_schedule",
        collection_name: "tenants",
        record_id: tenant.id,
        changes: {
          frequency: frequency,
          recipients: sent.recipients,
          sent: sent.sent,
          range: sent.range,
        },
      });

      result.items.push({
        tenant: tenant.id,
        name: String(tenant.get("name") || ""),
        sent: sent.sent,
      });
    } catch (err) {
      result.items.push({
        tenant: tenant.id,
        name: String(tenant.get("name") || ""),
        error: String((err && err.message) || err),
      });
    }
  }

  return result;
}

module.exports = {
  nextRun: nextRun,
  sendTenant: sendTenant,
  runDue: runDue,
};
