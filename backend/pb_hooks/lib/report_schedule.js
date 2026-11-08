// Laporan SLA terjadwal per tenant.
//
// Jadwal disimpan di `tenants.report_frequency`:
//   off      -> tidak ada pengiriman
//   weekly   -> Senin 07:00 WIB
//   monthly  -> tanggal 1 07:00 WIB
//
// Cron memanggil `runDue()`. Route "Kirim sekarang" memanggil `sendTenant()`.
// PDF tidak dibuat di server; halaman Laporan menyediakan Cetak/PDF lewat
// dialog cetak browser.

var WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
var DAY_MS = 24 * 60 * 60 * 1000;

function pad(value) {
  return value < 10 ? "0" + value : String(value);
}

function wibDate(ms) {
  var date = new Date(ms + WIB_OFFSET_MS);

  return (
    date.getUTCFullYear() +
    "-" +
    pad(date.getUTCMonth() + 1) +
    "-" +
    pad(date.getUTCDate())
  );
}

function wibPointMs(year, month, day, hour) {
  // month 0-based; Date.UTC menormalkan overflow bulan/tanggal.
  return Date.UTC(year, month, day, hour - 7, 0, 0, 0);
}

function nextRun(frequency, fromMs) {
  if (frequency !== "weekly" && frequency !== "monthly") return "";

  var now = fromMs || Date.now();
  var wib = new Date(now + WIB_OFFSET_MS);

  if (frequency === "weekly") {
    var dayOfWeek = wib.getUTCDay(); // 0=Sunday, 1=Monday
    var daysAhead = (1 - dayOfWeek + 7) % 7;
    var candidate = wibPointMs(
      wib.getUTCFullYear(),
      wib.getUTCMonth(),
      wib.getUTCDate() + daysAhead,
      7
    );

    if (candidate <= now) candidate += 7 * DAY_MS;

    return new Date(candidate).toISOString();
  }

  var monthly = wibPointMs(
    wib.getUTCFullYear(),
    wib.getUTCMonth(),
    1,
    7
  );

  if (monthly <= now) {
    monthly = wibPointMs(wib.getUTCFullYear(), wib.getUTCMonth() + 1, 1, 7);
  }

  return new Date(monthly).toISOString();
}

function sendTenant(app, tenant, frequencyOverride) {
  var reporting = require(__hooks + "/lib/reporting.js");
  var notify = require(__hooks + "/lib/notify.js");
  var mail = require(__hooks + "/lib/mail.js");

  var now = Date.now();
  var frequency = String(
    frequencyOverride || tenant.get("report_frequency") || "manual"
  );
  var range = reporting.parseRange(
    {
      from: wibDate(now - 29 * DAY_MS),
      to: wibDate(now),
      bucket: "week",
    },
    now
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
      tenant.set("report_next_at", nextRun(frequency, nowMs));
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
