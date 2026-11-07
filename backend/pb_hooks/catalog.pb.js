// Validasi katalog layanan. Ditulis sebagai hook (bukan hanya route) karena
// IT Lead mengelola katalog langsung lewat collection API dari halaman
// Pengaturan; rule PocketBase tidak bisa memeriksa konsistensi relasi antar
// koleksi.
//
// Catatan: callback hook berjalan di VM context baru, jadi helper harus
// di-require di dalam callback (lihat lib/catalog.js).

onRecordValidate((e) => {
  e.next();

  var record = e.record;
  if (!record) return;

  var catalog = require(__hooks + "/lib/catalog.js");
  var constants = require(__hooks + "/lib/constants.js");
  var tenantId = String(record.get("tenant") || "");
  var code = String(record.get("code") || "").trim().toUpperCase();
  var team = String(record.get("team") || "");

  if (code) record.set("code", code);
  if (String(record.get("name") || "").trim().length < 2) {
    throw new BadRequestError("Nama layanan minimal 2 karakter");
  }
  if (team && constants.TEAMS.indexOf(team) < 0) {
    throw new BadRequestError("Tim layanan tidak valid");
  }

  if (!catalog.sameTenant($app, "users", String(record.get("owner") || ""), tenantId)) {
    throw new BadRequestError("Owner layanan harus pengguna rumah sakit yang sama");
  }

  if (
    !catalog.sameTenant(
      $app,
      "units",
      String(record.get("support_unit") || ""),
      tenantId
    )
  ) {
    throw new BadRequestError("Unit pendukung harus unit rumah sakit yang sama");
  }

  if (
    !catalog.sameTenant(
      $app,
      "sla_policies",
      String(record.get("default_sla") || ""),
      tenantId
    )
  ) {
    throw new BadRequestError("Kebijakan SLA harus milik rumah sakit yang sama");
  }
}, "services");

onRecordValidate((e) => {
  e.next();

  var record = e.record;
  if (!record) return;

  var catalog = require(__hooks + "/lib/catalog.js");
  var tenantId = String(record.get("tenant") || "");
  var serviceId = String(record.get("service") || "");
  var code = String(record.get("code") || "").trim().toUpperCase();

  if (code) record.set("code", code);
  if (String(record.get("name") || "").trim().length < 2) {
    throw new BadRequestError("Nama item minimal 2 karakter");
  }

  if (!serviceId) {
    throw new BadRequestError("Layanan wajib dipilih");
  }

  if (!catalog.sameTenant($app, "services", serviceId, tenantId)) {
    throw new BadRequestError("Layanan harus milik rumah sakit yang sama");
  }

  if (
    !catalog.sameTenant(
      $app,
      "sla_policies",
      String(record.get("sla_policy") || ""),
      tenantId
    )
  ) {
    throw new BadRequestError("Kebijakan SLA harus milik rumah sakit yang sama");
  }
}, "service_items");
