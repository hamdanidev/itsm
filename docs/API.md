# API

Satu-satunya daftar route yang dipakai frontend, integrasi, dan operasi.
Dokumen ini menggantikan tabel route yang dulu ada di README dan SCHEMA;
jangan menulis ulang tabel route di tempat lain.

- **Base URL:** origin aplikasi (`https://$APP_DOMAIN`). Frontend memakai
  `window.location.origin`; `VITE_API_BASE_URL` hanya diperlukan bila API
  sengaja dipisah ke origin lain.
- **Autentikasi:** header `Authorization: <token>` dengan token auth PocketBase.
  Route publik dan route setup tidak memakai header ini; route `/dev/*` memakai
  sesi superuser PocketBase.
- **Format:** JSON. Error memakai bentuk standar PocketBase
  `{"code":404,"message":"...","data":{...}}`. Endpoint `.csv` mengembalikan
  `text/csv` (UTF-8 dengan BOM) dan mengirim `Content-Disposition`.
- **Tenant:** pengguna rumah sakit hanya melihat data tenant-nya; akun vendor
  (`is_platform_staff`) boleh membaca semua tenant lewat pengecekan server-side.

## Tiket

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| POST | `/api/itsm/tickets` | Auth | Buat Incident, Service Request, atau Change Request |
| POST | `/api/itsm/tickets/{id}/assign` | Staf IT | Assign atau lepas assignee |
| POST | `/api/itsm/tickets/{id}/transition` | Staf IT | Mulai, menunggu/lanjutkan, selesaikan, tutup, buka kembali |
| POST | `/api/itsm/tickets/{id}/merge` | Staf IT | Gabungkan tiket duplikat ke tiket tujuan |
| POST | `/api/itsm/tickets/{id}/triage` | Staf IT | Koreksi prioritas/dampak/kategori/layanan/lokasi sebelum pekerjaan dimulai |
| POST | `/api/itsm/tickets/{id}/approval` | Approver tahap aktif | Setujui, tolak, atau delegasikan tahap approval |
| POST | `/api/itsm/tickets/{id}/comments` | Auth | Komentar publik atau internal |
| POST | `/api/itsm/tickets/{id}/attachments` | Auth | Unggah lampiran (multipart, maks. 3 per tiket, 10 MB per file) |
| GET | `/api/itsm/tickets/{id}/timeline` | Auth | Riwayat aktivitas tiket (proyeksi audit) |
| GET | `/api/itsm/tickets/{id}/assets` | Auth | Aset/CI yang tertaut ke tiket |
| POST | `/api/itsm/tickets/{id}/assets` | Staf IT | Tautkan aset ke tiket |
| DELETE | `/api/itsm/tickets/{id}/assets/{assetId}` | Staf IT | Lepas aset dari tiket |
| GET | `/api/itsm/tickets/{id}/csat` | Auth | Baca CSAT tiket |
| POST | `/api/itsm/tickets/{id}/csat` | Requester tiket | Kirim CSAT setelah tiket selesai/ditutup |

## Problem, insiden mayor, dan pengetahuan

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| POST | `/api/itsm/problems` | Staf IT | Buat problem; opsional tautkan `ticket_id` |
| PATCH | `/api/itsm/problems/{id}` | Staf IT | Ubah status, root cause, workaround, permanent fix |
| POST | `/api/itsm/problems/{id}/tickets` | Staf IT | Tautkan tiket ke problem |
| POST | `/api/itsm/incidents` | Staf IT | Deklarasikan insiden mayor; opsional `source_ticket` |
| PATCH | `/api/itsm/incidents/{id}` | Staf IT | Ubah status, severity, komandan, layanan, PIR |
| POST | `/api/itsm/incidents/{id}/updates` | Staf IT | Tambah update komunikasi internal/publik |
| POST | `/api/itsm/incidents/{id}/tickets` | Staf IT | Tautkan tiket terdampak |
| GET | `/api/itsm/incidents/stats` | Kepala IT | MTTR, jumlah insiden, tren, dan PIR |
| POST | `/api/itsm/knowledge` | Staf IT | Buat artikel draft; opsional tautkan `ticket_id` |
| PATCH | `/api/itsm/knowledge/{id}` | Staf IT | Ubah isi, visibilitas, atau tag artikel; ajukan review |
| POST | `/api/itsm/knowledge/{id}/publish` | Kepala IT | Terbitkan atau pensiunkan artikel |
| GET | `/api/itsm/knowledge/search` | Auth | Cari artikel terbit dan workaround known error |

## Aset dan CI

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| POST | `/api/itsm/assets` | Staf IT | Buat aset/CI; nomor aset otomatis bila kosong |
| PATCH | `/api/itsm/assets/{id}` | Staf IT | Ubah aset/CI dan sinkronkan service CI |
| GET | `/api/itsm/assets/{id}` | Auth | Detail aset + riwayat tiketnya |
| GET | `/api/itsm/assets/options` | Auth | Opsi aset ringkas untuk intake |

## Laporan

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/itsm/reports/sla` | Kepala IT atau Pengamat | Laporan SLA (JSON); rentang maks. 366 hari |
| GET | `/api/itsm/reports/sla.csv` | Kepala IT atau Pengamat | Ekspor CSV per tiket |
| GET | `/api/itsm/reports/operations` | Kepala IT atau Pengamat | Laporan operasional (JSON) |
| GET | `/api/itsm/reports/operations.csv` | Kepala IT atau Pengamat | Ekspor CSV laporan operasional |
| GET | `/api/itsm/reports/schedule` | Kepala IT | Baca jadwal laporan otomatis |
| PATCH | `/api/itsm/reports/schedule` | Kepala IT | Ubah jadwal laporan |
| POST | `/api/itsm/reports/schedule/run` | Kepala IT | Kirim ringkasan laporan sekarang |

## Profil, autentikasi, dan 2FA

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/itsm/profile` | Auth | Baca profil sendiri |
| PATCH | `/api/itsm/profile` | Auth | Ubah profil sendiri |
| POST | `/api/itsm/profile/avatar` | Auth | Unggah avatar (maks. 2 MB) |
| DELETE | `/api/itsm/profile/avatar` | Auth | Hapus avatar |
| POST | `/api/itsm/profile/password` | Auth | Ganti password dengan verifikasi password lama |
| POST | `/api/itsm/profile/2fa/start` | Auth | Mulai aktivasi TOTP; mengembalikan secret + URI |
| POST | `/api/itsm/profile/2fa/confirm` | Auth | Konfirmasi kode 6 digit; mengembalikan 10 kode pemulihan |
| POST | `/api/itsm/profile/2fa/disable` | Auth | Nonaktifkan 2FA (password + kode TOTP/pemulihan) |
| POST | `/api/itsm/auth/forgot-password` | Publik | Minta tautan reset password (respons generik) |

## Tenant, tim, dan email

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| PATCH | `/api/itsm/tenant` | Kepala IT | Ubah zona waktu rumah sakit; hanya mode standalone |
| POST | `/api/itsm/tenant/logo` | Kepala IT | Unggah logo rumah sakit |
| DELETE | `/api/itsm/tenant/logo` | Kepala IT | Hapus logo rumah sakit |
| GET | `/api/itsm/branding/logo` | Publik | Logo tenant aktif (standalone); 404 pada mode vendor |
| GET | `/api/itsm/team` | Kepala IT | Daftar anggota tim |
| POST | `/api/itsm/team` | Kepala IT | Tambah anggota (password awal dibuat sistem) |
| POST | `/api/itsm/team/import` | Kepala IT | Impor anggota dari CSV (multipart `file`) |
| PATCH | `/api/itsm/team/{userId}` | Kepala IT | Ubah nama, role, unit, atau status anggota |
| POST | `/api/itsm/team/{userId}/password` | Kepala IT | Reset password anggota |
| POST | `/api/itsm/team/{userId}/2fa-reset` | Kepala IT | Hapus 2FA dan kode pemulihan anggota, akhiri sesi |
| POST | `/api/itsm/team/{userId}/unlock` | Kepala IT | Buka kunci login akibat percobaan gagal |
| GET | `/api/itsm/mail/status` | Kepala IT | Status SMTP dan hitungan antrean tenant |
| POST | `/api/itsm/mail/dispatch` | Superuser | Kirim antrean email sekarang |

## Intake publik (tanpa autentikasi pengguna)

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/itsm/public/intake/{token}` | Publik | Meta form QR: tenant, titik, layanan/item, dampak |
| POST | `/api/itsm/public/intake/{token}` | Publik | Buat tiket tamu (multipart: `payload` + `files`) |
| GET | `/api/itsm/public/intake/{token}/logo` | Publik | Logo tenant untuk halaman QR |
| GET | `/api/itsm/public/tickets/{token}` | Publik | Status satu tiket tamu + pembaruan publik |
| POST | `/api/itsm/public/tickets/{token}/csat` | Publik | CSAT tamu setelah tiket selesai/ditutup |
| GET | `/api/itsm/public/tickets/{token}/logo` | Publik | Logo tenant untuk halaman status |
| GET | `/api/itsm/intake-points` | Kepala IT | Daftar titik QR tenant |
| POST | `/api/itsm/intake-points` | Kepala IT | Buat titik QR + token |
| PATCH | `/api/itsm/intake-points/{id}` | Kepala IT | Ubah nama, unit, lokasi, batas, atau status titik |
| POST | `/api/itsm/intake-points/{id}/rotate` | Kepala IT | Rotasi token titik QR |

## Setup awal dan metadata

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/itsm/setup/status` | Publik | Status setup awal + identitas RS untuk prefill |
| POST | `/api/itsm/setup` | Publik + kode setup | Buat data awal dan akun pertama; menutup diri setelahnya |
| GET | `/api/itsm/app-meta` | Publik | Mode tenancy aktif + `setup_required` |

`GET /api/itsm/setup/status` mengembalikan `required`, `mode`, `hospital`
(prefill standalone), `token_required`, dan `min_password`.
`POST /api/itsm/setup` menerima body `token` + `hospital`/`account`. Begitu akun
pertama ada, kedua route menolak dengan 409.

## Konsol vendor

Hanya untuk akun `is_platform_staff` pada `TENANCY_MODE=vendor`; aksi tulis
menuntut `role = it_lead`.

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/itsm/platform/tenants` | Daftar rumah sakit + hitungan |
| POST | `/api/itsm/platform/tenants` | Buat rumah sakit + seed + akun IT pertama (atomik) |
| GET | `/api/itsm/platform/tenants/{id}` | Detail rumah sakit, pengguna, unit |
| PATCH | `/api/itsm/platform/tenants/{id}` | Ubah nama, kode, zona waktu, status |
| POST | `/api/itsm/platform/tenants/{id}/seed` | Lengkapi data master default (idempoten) |
| POST | `/api/itsm/platform/tenants/{id}/users` | Tambah pengguna rumah sakit |
| PATCH | `/api/itsm/platform/tenants/{id}/users/{userId}` | Ubah status, role, unit, password |
| GET | `/api/itsm/platform/tenants/{id}/master` | Data master RS: unit, kategori, SLA, hari libur, pengguna |
| POST | `/api/itsm/platform/tenants/{id}/master/{kind}` | Tambah data master |
| PATCH | `/api/itsm/platform/tenants/{id}/master/{kind}/{recordId}` | Ubah/nonaktifkan data master |
| GET | `/api/itsm/platform/audit` | Audit lintas rumah sakit |

## Audit

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/api/itsm/audit` | Kepala IT atau Pengamat | Audit tenant; filter aktor, aksi, cakupan, tanggal, nomor tiket |

## Development (hanya superuser)

Alat bantu `scripts/seed.mjs` dan uji lokal, bukan API bisnis. Frontend tidak
memanggil route ini dan tidak ada menu untuk membukanya.

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/itsm/dev/seed/age` | Mundurkan/sebar waktu record untuk seed manual |
| POST | `/api/itsm/dev/seed/reset` | Hapus data transaksional satu tenant |
| POST | `/api/itsm/dev/sla/scan` | Jalankan pemindaian pengingat pra-SLA sekarang |
| POST | `/api/itsm/dev/reports/scan` | Jalankan pemindaian jadwal laporan sekarang |

## Route PocketBase bawaan

Koleksi dibaca lewat REST bawaan PocketBase dengan API rules, bukan lewat route
khusus. Penulisan tetap ditutup (`create/update/delete: null`) kecuali yang
memang diizinkan rule.

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/collections/tickets/records` | Tiket sesuai API rules |
| GET | `/api/collections/services/records` | Katalog layanan |
| GET | `/api/collections/service_items/records` | Item permintaan per layanan |
| GET | `/api/collections/problems/records` | Problem (staf IT/akun platform) |
| GET | `/api/collections/problem_tickets/records` | Tiket terkait problem |
| GET | `/api/collections/knowledge_articles/records` | Artikel; requester hanya published + public |
| GET | `/api/collections/ticket_comments/records` | Komentar sesuai rules |
| GET | `/api/collections/ticket_attachments/records` | Lampiran sesuai rules |
| GET | `/api/collections/audit_logs/records` | Audit (hanya Kepala IT) |
| GET | `/api/collections/notifications/records` | Notifikasi milik sendiri |
| GET | `/api/health` | Healthcheck untuk monitoring |

## Aturan akses

- Semua `/api/itsm/*` memakai `$apis.requireAuth()` kecuali
  `/api/itsm/public/*`, `/api/itsm/setup*`, dan `/api/itsm/app-meta`.
- `/api/itsm/dev/*` memakai `$apis.requireSuperuserAuth()`.
- `/api/itsm/platform/*` hanya menerima `is_platform_staff` dan memanggil
  `tenancy.assertVendor()`, sehingga selalu 403 pada mode standalone.
- Route publik intake memvalidasi token titik, tenant aktif, rate limit,
  honeypot, dan attestation data pasien.
- Route publik tiket hanya membuka satu tiket berdasarkan `public_token` dan
  tidak pernah mengirim komentar internal atau data pengguna.
- Service/Change Request harus `approval_status = approved` sebelum pekerjaan
  bisa dimulai, dijeda, atau diselesaikan. Item katalog dengan
  `approval_mode = none` memakai `approval_status = not_required`.
- Setiap aksi tulis menulis audit log. Detail field dan rule per koleksi ada di
  [`DATA-MODEL.md`](DATA-MODEL.md).

## Batasan saat ini

- Belum ada API key, scope, atau kuota per integrasi: konsumen mesin harus
  memakai akun staf. Ini yang perlu dibangun sebelum integrasi SIMRS/monitoring
  otomatis (lihat roadmap B3/B4).
- Belum ada webhook keluar; integrasi realtime harus memakai API ini atau
  realtime PocketBase.
- Belum ada versi API (`/v1`); perubahan route mengikuti rilis aplikasi.

## Perawatan

Saat menambah atau mengubah route: ubah tabel di dokumen ini pada commit yang
sama dengan kodenya. Route baru yang tidak tercatat di sini dianggap belum
selesai, dan `tests/unit/docs.test.mjs` akan gagal di CI.
