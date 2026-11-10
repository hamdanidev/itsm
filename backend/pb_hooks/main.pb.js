onBootstrap((e) => {
  e.next();

  // Zona cron bersifat tingkat instalasi. Semua job berjalan tiap menit atau
  // tiap 5 menit, jadi hanya `daily_backup` (02:00) yang terpengaruh.
  try {
    $app.cron().setTimezone(new Timezone("Asia/Jakarta"));
  } catch (err) {
    console.log("Failed to set cron timezone", err);
  }

  // Perhitungan SLA memakai zona tenant. Pastikan basis data zona IANA benar-
  // benar termuat: tanpa itu Go hanya mengenal UTC dan tenggat SLA menjadi
  // salah tanpa error apa pun.
  try {
    var tzCheck = require(__hooks + "/lib/timezone.js").selfCheck();

    if (!tzCheck.ok) {
      console.log(
        "PERINGATAN: basis data zona waktu tidak tersedia (backend " +
          tzCheck.backend +
          ", '" +
          tzCheck.default_zone +
          "' terbaca sebagai '" +
          tzCheck.resolved +
          "', ZONEINFO=" +
          (tzCheck.zoneinfo || "kosong") +
          "). SLA akan dihitung dalam UTC. Set ZONEINFO ke backend/zoneinfo.zip."
      );
    }
  } catch (err) {
    console.log("Failed to verify timezone data", err);
  }

  // Konfigurasi SMTP dari environment (Mailtrap di dev, relay di produksi).
  // Bila env kosong, setelan Admin UI yang dipakai.
  try {
    var mail = require(__hooks + "/lib/mail.js");
    mail.applyEnv($app);
  } catch (err) {
    console.log("Failed to apply SMTP env", err);
  }

  // Setup awal: bila instalasi belum punya akun, pastikan kode setup sudah ada
  // dan tercetak di log server sejak boot (memudahkan deploy pertama).
  try {
    var setup = require(__hooks + "/lib/setup.js");
    setup.ensureToken($app);
  } catch (err) {
    console.log("Failed to prepare setup token", err);
  }

  console.log("Healthcare ITSM hooks loaded");
});

onRecordAuthRequest((e) => {
  var tenancy = require(__hooks + "/lib/tenancy.js");

  // Akun vendor hanya boleh masuk pada instalasi mode vendor. Ditegakkan di
  // sini (bukan di rule) karena mode adalah environment, dan hook ini juga
  // menutup `auth-refresh` sehingga sesi lama tidak bertahan setelah mode
  // berubah menjadi standalone.
  tenancy.assertPlatformLoginAllowed(e.record);

  e.next();

  try {
    var audit = require(__hooks + "/lib/audit.js");
    var tenant = e.record.get("tenant");
    if (!tenant) return;

    audit.write(e.app, {
      tenant: tenant,
      actor: e.record,
      action: "login",
      collection_name: "users",
      record_id: e.record.id,
      changes: {},
    });
  } catch (err) {
    // Authentication must not fail because audit logging failed.
    console.log("Login audit failed", err);
  }
}, "users");

// Pembatasan percobaan login + faktor kedua TOTP. Hook berjalan sebelum
// PocketBase memverifikasi password, sehingga lockout dan audit dapat mencatat
// percobaan yang gagal tanpa mengubah respons gagal autentikasi standar.
onRecordAuthWithPasswordRequest((e) => {
  var authLib = require(__hooks + "/lib/auth.js");
  authLib.beforePasswordLogin(e.app, e);
  e.next();
}, "users");

// Invariant scope akun: akun platform tidak punya tenant, akun rumah sakit
// wajib punya tepat satu tenant. Kolom `tenant` dibuat opsional di skema hanya
// untuk memberi ruang akun platform.
//
// `e.next()` WAJIB dipanggil lebih dulu: validasi bawaan PocketBase (termasuk
// tipe dan ukuran file avatar) berjalan di rantai hook ini.
onRecordValidate((e) => {
  e.next();

  var record = e.record;
  if (!record) return;

  var isPlatform = Boolean(record.get("is_platform_staff"));
  var tenant = String(record.get("tenant") || "");

  if (isPlatform) {
    if (tenant) {
      throw new BadRequestError("Akun vendor tidak boleh terikat satu rumah sakit");
    }
    // Cabang rule `is_platform_staff` membuka data semua tenant, jadi role
    // akun platform dibatasi ke peran staf.
    var platformRole = String(record.get("role") || "");
    if (platformRole !== "it_support" && platformRole !== "it_lead") {
      throw new BadRequestError(
        "Akun vendor harus memiliki role it_support atau it_lead"
      );
    }
    return;
  }

  if (!tenant) {
    throw new BadRequestError("Tenant wajib diisi untuk akun rumah sakit");
  }
}, "users");

onRecordEnrich((e) => {
  var info = e.requestInfo;
  var auth = info ? info.auth : null;

  var isSuperuser = false;
  try {
    isSuperuser = !!(info && info.hasSuperuserAuth && info.hasSuperuserAuth());
  } catch (err) {
    isSuperuser = false;
  }

  var isSelf = !!(auth && e.record.id === auth.id);
  var isLead = !!(auth && auth.get("role") === "it_lead");

  if (!isSuperuser && !isSelf && !isLead) {
    e.record.hide("phone");
    e.record.hide("employee_no");
    e.record.hide("external_id");
    e.record.hide("external_issuer");
    e.record.hide("external_groups");
  }

  e.next();
}, "users");

onRecordCreateRequest((e) => {
  throw new ForbiddenError("Audit logs are append-only");
}, "audit_logs");

onRecordUpdateRequest((e) => {
  throw new ForbiddenError("Audit logs are append-only");
}, "audit_logs");

onRecordDeleteRequest((e) => {
  throw new ForbiddenError("Audit logs are append-only");
}, "audit_logs");
