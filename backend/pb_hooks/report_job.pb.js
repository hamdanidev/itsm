// Cron laporan SLA terjadwal dan route bantu development untuk menguji
// pengiriman tanpa menunggu jadwal.
//
// Jadwal disimpan di `tenants.report_frequency` dan `report_next_at`.
// PDF tidak dibuat di server; email berisi ringkasan + tautan ke halaman
// Laporan, tempat pengguna dapat mencetak/menyimpan PDF.

cronAdd("report_schedule_scan", "10 * * * *", () => {
  var reportSchedule = require(__hooks + "/lib/report_schedule.js");

  reportSchedule.runDue($app);
});

routerAdd(
  "POST",
  "/api/itsm/dev/reports/scan",
  (e) => {
    var reportSchedule = require(__hooks + "/lib/report_schedule.js");

    return e.json(200, reportSchedule.runDue(e.app));
  },
  $apis.requireSuperuserAuth()
);
