// Pengaturan rumah sakit yang boleh diubah sendiri oleh IT Lead pada instalasi
// standalone.
//
// Zona waktu hanya bisa diubah dari sini ketika tidak ada Konsol Vendor: pada
// mode vendor, konfigurasi tenant dikelola vendor agar SLA satu rumah sakit tidak
// berubah tanpa sepengetahuan pengelola instalasi. Route logo berada di
// `tenant_branding.pb.js`; route ini khusus setelan yang memengaruhi SLA.
//
// Mengubah zona tidak menyentuh tiket lama: tanggal tenggatnya sudah tersimpan
// sebagai instan UTC dan `sla_snapshot` menyimpan zona saat itu. Yang ikut
// disesuaikan adalah policy SLA (agar tiket baru memakai zona baru) dan jadwal
// laporan (agar tetap 07.00 waktu lokal).

routerAdd(
  "PATCH",
  "/api/itsm/tenant",
  (e) => {
    var guards = require(__hooks + "/lib/guards.js");
    var audit = require(__hooks + "/lib/audit.js");
    var tenancy = require(__hooks + "/lib/tenancy.js");
    var timezone = require(__hooks + "/lib/timezone.js");
    var reportSchedule = require(__hooks + "/lib/report_schedule.js");

    var auth = guards.requireAuth(e);
    guards.assertLead(auth);

    if (tenancy.isVendor()) {
      throw new ForbiddenError("Zona waktu dikelola dari Konsol Vendor");
    }

    var tenantId = String(auth.get("tenant") || "");
    if (!tenantId) throw new BadRequestError("Akun tidak memiliki tenant");

    var body = e.requestInfo().body || {};
    if (body.timezone === undefined) {
      throw new BadRequestError("Zona waktu wajib diisi");
    }

    var next = String(body.timezone || "").trim();
    if (!timezone.isValidZone(next)) {
      throw new BadRequestError("Zona waktu tidak valid");
    }

    var tenant = e.app.findRecordById("tenants", tenantId);
    var previous = String(tenant.get("timezone") || "");

    if (previous === next) {
      return e.json(200, {
        tenant: {
          id: tenant.id,
          name: String(tenant.get("name") || ""),
          code: String(tenant.get("code") || ""),
          timezone: next,
          report_next_at: String(tenant.get("report_next_at") || ""),
        },
      });
    }

    tenant.set("timezone", next);

    // Jadwal laporan disimpan sebagai instan UTC; tanpa dihitung ulang, laporan
    // 07.00 lokal akan bergeser sebesar selisih zona.
    var frequency = String(tenant.get("report_frequency") || "off");
    var previousNext = String(tenant.get("report_next_at") || "");
    var nextAt =
      frequency === "weekly" || frequency === "monthly"
        ? reportSchedule.nextRun(frequency, Date.now(), next)
        : "";

    if (nextAt) tenant.set("report_next_at", nextAt);

    e.app.runInTransaction((txApp) => {
      txApp.save(tenant);

      var policies = txApp.findRecordsByFilter(
        "sla_policies",
        "tenant = {:tenant}",
        "",
        0,
        0,
        { tenant: tenantId }
      );

      for (var i = 0; i < policies.length; i++) {
        policies[i].set("timezone", next);
        txApp.save(policies[i]);
      }
    });

    var meta = audit.requestMeta(e);
    audit.write(e.app, {
      tenant: tenantId,
      actor: auth,
      action: "update",
      collection_name: "tenants",
      record_id: tenant.id,
      changes: {
        timezone: { from: previous, to: next },
        report_next_at: { from: previousNext, to: String(tenant.get("report_next_at") || "") },
      },
      ip: meta.ip,
      user_agent: meta.user_agent,
    });

    return e.json(200, {
      tenant: {
        id: tenant.id,
        name: String(tenant.get("name") || ""),
        code: String(tenant.get("code") || ""),
        timezone: next,
        report_next_at: String(tenant.get("report_next_at") || ""),
      },
    });
  },
  $apis.requireAuth()
);
