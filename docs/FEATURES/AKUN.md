# Akun, notifikasi, email, dan pengaturan admin

Notifikasi in-app, email transaksional, lupa password, logo, profil, dan pengaturan master oleh Kepala IT.

Bagian ini dipindahkan dari README (perapian dokumen 2026-11-10). Daftar route ada di [API.md](../API.md); data model di [DATA-MODEL.md](../DATA-MODEL.md).

## Notifikasi in-app

Setiap pengguna punya pusat notifikasi sendiri: ikon lonceng di top bar dengan
badge jumlah belum dibaca, dropdown 8 notifikasi terbaru, dan halaman
`/notifications` (filter Semua/Belum dibaca, tandai semua dibaca). Badge dan
daftar diperbarui realtime lewat subscribe ke collection `notifications`.

| Event | Penerima |
|---|---|
| Tiket ditugaskan | assignee baru + requester ("sedang ditangani") |
| Komentar publik | requester dan assignee (kecuali penulis) |
| Komentar/lampiran internal | assignee saja; requester tidak pernah menerima |
| Menunggu requester / dilanjutkan | requester |
| Resolved / closed | requester |
| Reopen | assignee, atau IT Lead bila belum ada assignee |
| Approval disetujui/ditolak | requester |
| Approval didelegasikan | penerima delegasi |
| Tiket kritis baru | semua IT Lead aktif |
| SLA breach / Eskalasi Level 3 | assignee + IT Lead (Level 3 khusus lead) |

- Notifikasi untuk diri sendiri tidak dibuat; klik notifikasi menandainya dibaca
  lalu membuka tiket terkait.
- Badge diperbarui langsung dari payload event (optimistic), lalu disegarkan
  dari server. Bila koneksi realtime terputus atau event terlewat, daftar
  disegarkan saat tab kembali fokus/terlihat dan setiap 60 detik.
- Penerima dideduplikasi per event. Bila requester dan assignee orang yang sama
  (mis. staf membuat tiket untuk dirinya), atau assignee juga IT Lead, hanya
  satu notifikasi yang dibuat.
- Collection `notifications` hanya bisa dibaca/diubah pemiliknya (`user`), dan
  hanya server yang membuat/menghapus (create/delete rule `null`).
- Notifikasi in-app tetap menjadi saluran utama. Salinan email dikirim untuk
  penerima yang mengaktifkan preferensi (lihat bagian Email).

## Email (SMTP)

Email transaksional dipakai untuk dua hal:

1. **Undangan akun dan reset password** dari tab **Tim** — dikirim langsung,
   berisi email, password sementara, peran, dan tautan login. Bila SMTP belum
   aktif atau pengiriman gagal, password tetap ditampilkan di UI untuk
   diserahkan manual.
2. **Notifikasi tiket** — salinan dari notifikasi in-app (penugasan, approval,
   komentar, status, SLA breach, eskalasi) masuk antrean `email_outbox` dan
   dikirim cron setiap menit dengan retry 1/5/15/60/240 menit.

Konfigurasi lewat environment (menang atas setelan Admin UI):

```env
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USERNAME=isi-dari-mailtrap
SMTP_PASSWORD=isi-dari-mailtrap
SMTP_TLS=false
SMTP_AUTH_METHOD=PLAIN
SMTP_FROM=no-reply@itsm.local
SMTP_FROM_NAME=Healthcare ITSM
APP_NAME=Healthcare ITSM
APP_URL=http://localhost:5173
```

- **Mailtrap (development)**: buka inbox Sandbox → *SMTP Settings*, salin
  host/port/username/password. Port 2525/587 memakai STARTTLS, jadi
  `SMTP_TLS=false`; isi `true` hanya untuk TLS implisit (biasanya 465).
- **Produksi**: gunakan relay SMTP organisasi, `APP_URL` domain publik, dan
  pertimbangkan `PB_ENCRYPTION_KEY` agar password SMTP di database terenkripsi.
- `SMTP_HOST` kosong berarti aplikasi memakai setelan SMTP yang diisi lewat
  Admin UI PocketBase (`Settings → Mail settings`).
- Tanpa SMTP, aplikasi tetap berjalan: undangan menampilkan password manual dan
  notifikasi email menumpuk di antrean tanpa dikirim.
- `MAIL_TRANSPORT=capture` dipakai suite test: tidak ada email keluar, tetapi
  salinan dicatat di `email_outbox` untuk pemeriksaan. Cron tidak menguras
  antrean pada mode ini; gunakan route dispatch superuser bila perlu.
- Setiap pengguna dapat mematikan notifikasi email di **Profil saya**; undangan
  akun dan email keamanan tetap dikirim.
- Antrean hanya menyimpan email notifikasi (tanpa password). Email undangan
  dikirim langsung agar password sementara tidak tersimpan lama di database.
- `GET /api/itsm/mail/status` (IT Lead) menampilkan transport, host, antrean,
  dan kegagalan terakhir; `POST /api/itsm/mail/dispatch` (superuser) memaksa
  pengiriman untuk operasional.

## Lupa password mandiri

Halaman masuk punya tautan **Lupa password?** yang membuka `/forgot-password`:

1. Pengguna memasukkan email. Server selalu membalas pesan generik, baik email
   terdaftar maupun tidak, agar tidak bisa dipakai menebak akun.
2. Bila akun aktif, server membuat token reset bertanda tangan (masa berlaku
   mengikuti setelan collection `users`, sekali pakai) dan mengirim tautan
   `/reset-password?token=...` lewat email.
3. Pengguna membuat password baru. Server memutar `tokenKey`, sehingga tautan
   yang sama tidak berlaku lagi dan semua sesi lama keluar.
4. `must_change_password` diturunkan, lalu aksi dicatat di audit sebagai
   `password_reset_request` dan `password_reset`.

- Permintaan dibatasi satu kali per menit per pengguna (ditandai lewat audit).
- Akun nonaktif dan rumah sakit nonaktif tidak menerima tautan.
- Tanpa SMTP aktif, tautan tidak terkirim; IT Lead tetap bisa reset dari tab
  **Tim**.
- Token tidak disimpan di database; hanya hash/tanda tangan PocketBase yang
  divalidasi saat konfirmasi.

## Logo rumah sakit

IT Lead mengunggah logo di **Pengaturan → Identitas**. Logo (PNG/JPG/WEBP, maks
2 MB) tampil di sidebar, halaman masuk, dan pratinjau tab Identitas.

- File disimpan di `tenants.logo`; pengguna login membacanya lewat file API
  dengan sesi.
- Halaman login belum punya sesi, jadi pada mode standalone logo disajikan lewat
  route publik `/api/itsm/branding/logo` yang hanya mengembalikan logo rumah
  sakit aktif. Route ini dinonaktifkan pada mode vendor agar tidak membocorkan
  identitas tenant.
- Hanya IT Lead rumah sakit yang bisa mengunggah/menghapus; setiap perubahan
  menulis audit `update` pada collection `tenants`.
- Logo bisa dihapus; UI kembali memakai brand aplikasi.

## Profil pengguna

Setiap pengguna membuka **Profil saya** dari menu akun di kanan atas (`/profile`):

| Bagian | Isi |
|---|---|
| Informasi profil | nama, telepon, nomor pegawai, preferensi notifikasi email |
| Foto profil | unggah atau hapus avatar (PNG/JPG/WEBP, maks 2 MB) |
| Keamanan | ganti password dengan verifikasi password saat ini |

- Nama wajib 2–120 karakter; telepon hanya angka dan `+ - ( )`; nomor pegawai
  hanya huruf, angka, titik, garis miring, atau strip.
- Email, peran, unit, dan tenant tidak dapat diubah sendiri; perubahan tetap
  lewat administrator.
- Preferensi **Kirim notifikasi tiket ke email saya** aktif secara default;
  mematikannya tidak menghapus notifikasi in-app dan tidak menghentikan email
  undangan/keamanan.
- Avatar disimpan di `users.avatar`, dibuat thumbnail 96×96, dan tampil di top
  bar serta komentar tiket. File avatar tidak diproteksi (nama file acak) agar
  bisa dirender sebagai gambar biasa.
- Ganti password wajib mengisi password saat ini, minimal 8 karakter, dan
  konfirmasi harus sama. Setelah berhasil `tokenKey` diperbarui sehingga semua
  sesi lain keluar; pengguna diarahkan ke halaman login dengan pesan sukses.
- Setiap perubahan profil, avatar, dan password menulis audit `update` pada
  `collection_name=users` (nilai password tidak pernah disimpan).

Route: `GET/PATCH /api/itsm/profile`, `POST/DELETE /api/itsm/profile/avatar`,
dan `POST /api/itsm/profile/password`.

## Pengaturan (admin in-app)

Kepala IT mengelola data master dan timnya sendiri lewat `/admin`; menu
**Pengaturan** hanya tampil untuk role `it_lead`, dan role lain yang membuka
URL-nya dialihkan ke daftar tiket.

| Tab | Isi | Catatan |
|---|---|---|
| Identitas | nama, kode, logo rumah sakit, zona waktu | logo dipakai sidebar dan halaman masuk; zona waktu hanya bisa diubah pada instalasi standalone |
| Unit | nama, kode, jenis (klinis/penunjang/manajemen), manajer | dipakai pada form intake; manajer menjadi approver tahap 1 |
| Kategori | nama, kode, jenis tiket | filter pilihan kategori per tipe |
| Layanan | layanan + item permintaan, approval mode, SLA, owner, unit | dipakai pada katalog dan intake |
| Kebijakan SLA | tipe, prioritas, respons/approval/penyelesaian, kalender | unik per `(tipe, prioritas)` |
| Hari libur | tanggal + nama | memengaruhi SLA jam kerja |
| Tim | anggota tim IT, role, jabatan, tim/bidang, unit, status | password awal dibuat sistem + email undangan |

Aturan tab **Tim**:

- Cakupan selalu tenant si lead (diambil server dari `e.auth`).
- Role yang bisa dibuat: `requester`, `it_support`, `resolver`, `it_lead`, `viewer`.
- `job_title` (Jabatan) hanya metadata tampilan; tidak mengubah hak akses.
- `team` (Tim) menentukan antrean tiket yang terlihat oleh Teknisi; tidak
  mengubah role akses.
- Password awal **dibuat sistem** (16 karakter) dan hanya ditampilkan sekali;
  anggota wajib menggantinya saat login pertama.
- Bila SMTP aktif, undangan berisi password awal dikirim ke email anggota saat
  akun dibuat; reset password juga mengirim password baru. Bila SMTP mati atau
  gagal, password tetap ditampilkan di UI untuk diserahkan manual.
- Lead tidak bisa menonaktifkan akun sendiri atau mengubah role sendiri.
- Kepala IT aktif terakhir tidak bisa dinonaktifkan atau diturunkan.
- Email tidak bisa diubah setelah akun dibuat; tidak ada hard delete.

- Semua data memakai `tenant` dari user, bukan dari body bebas.
- Tidak ada hard delete dari UI. Tombol **Nonaktifkan** mengubah `is_active`
  agar tiket lama tetap valid; `deleteRule` tetap `null` (superuser saja).
- Ada 12 kombinasi tipe × prioritas. Bila semuanya sudah punya kebijakan,
  tombol tambah SLA dinonaktifkan dan UI mengarahkan untuk mengedit yang ada.
- Perubahan kebijakan hanya berlaku untuk tiket baru; tiket lama memakai
  `sla_snapshot` saat dibuat.
- Setiap create/update data master menulis audit (`collection_name`,
  `record_id`, dan diff field yang berubah) lewat `pb_hooks/admin_audit.pb.js`.
- Akun rumah sakit kini dibuat lewat tab **Tim** dan akun pertama lewat
  `/setup`; Admin UI PocketBase hanya untuk operasi teknis superuser.

## Detail teknis: profil pengguna

> Pelengkap bagian di atas: kontrak level field dan detail implementasi (dipindahkan dari SCHEMA, 2026-11-10).

Route profil hanya menyentuh record `e.auth`; tidak ada parameter id, sehingga
pengguna tidak bisa mengubah profil orang lain.

- `GET /api/itsm/profile` — data sendiri + `unit_name`/`tenant_name`.
- `PATCH /api/itsm/profile` — `name` (2–120 karakter), `phone` (angka dan
  `+ - ( )`), `employee_no` (huruf/angka/titik/garis miring/strip), dan
  `email_notifications` (boolean, disimpan terbalik di `email_opt_out`). Field
  `role`, `tenant`, `unit`, `is_active`, dan email diabaikan walau dikirim.
- `POST /api/itsm/profile/avatar` — multipart `avatar`; PocketBase memvalidasi
  tipe dan ukuran (maks 2 MB). `DELETE` menghapus avatar.
- `POST /api/itsm/profile/password` — `current_password`, `new_password`,
  `new_password_confirm`. Password lama diverifikasi dengan
  `record.validatePassword()`, minimal 8 karakter, lalu `refreshTokenKey()`
  membuat semua sesi lama tidak berlaku.
- `POST /api/itsm/profile/2fa/start` — body `current_password`; membuat secret
  baru (aktivasi belum berlaku sampai dikonfirmasi) dan mengembalikan
  `secret`, `otpauth_uri`, `issuer`, dan `account`. Secret lama ditimpa bila
  pengguna mengulang.
- `POST /api/itsm/profile/2fa/confirm` — body `code` 6 digit; memverifikasi
  dengan toleransi ±1 langkah, menaikkan `totp_enabled`, dan mengembalikan 10
  `recovery_codes` sekali pakai. Tidak mengubah langkah TOTP terakhir sehingga
  kode yang baru dipakai untuk aktivasi masih boleh dipakai sekali saat login.
- `POST /api/itsm/profile/2fa/disable` — body `password` + `code` (TOTP atau
  kode pemulihan). Menghapus secret, hash pemulihan, dan langkah terakhir.

Setiap perubahan menulis `audit_logs` dengan `action=update`,
`collection_name=users`, `record_id` pengguna, dan `changes` tanpa nilai
password. Notifikasi tidak dibuat untuk perubahan profil.

## Detail teknis: lupa password

> Pelengkap bagian di atas: kontrak level field dan detail implementasi (dipindahkan dari SCHEMA, 2026-11-10).

`POST /api/itsm/auth/forgot-password` adalah endpoint guest (`requireGuestOnly`)
dengan body `{email}` dan selalu membalas `200 {ok:true}` agar tidak bisa
dipakai menebak akun.

1. Cari user aktif dengan email tersebut. Bila tidak ada, akun nonaktif, atau
   tenant nonaktif, tidak ada email yang dikirim.
2. Batasi satu permintaan per menit per pengguna. Penanda dibaca dari
   `audit_logs` (`action=password_reset_request`, `actor=user`) agar tidak perlu
   field/tabel tambahan.
3. Buat token dengan `record.newPasswordResetToken()` (JWT bertanda tangan,
   memakai `tokenKey` + secret collection; tidak disimpan di database).
4. Kirim tautan `${APP_URL}/reset-password?token=...` lewat `lib/mail.js`.
   Mode capture menyimpan salinannya di `email_outbox` (`template=password_reset`,
   `event=link`) untuk test.
5. Halaman `/reset-password` memanggil endpoint bawaan PocketBase
   `POST /api/collections/users/confirm-password-reset`.

Hook `onRecordConfirmPasswordResetRequest` setelah konfirmasi berhasil:
menurunkan `must_change_password`, memanggil `refreshTokenKey()` (token reset
tidak bisa dipakai ulang dan sesi lama keluar), lalu menulis audit
`password_reset` dengan `changes.sessions_revoked=true`.

## Detail teknis: logo rumah sakit

> Pelengkap bagian di atas: kontrak level field dan detail implementasi (dipindahkan dari SCHEMA, 2026-11-10).

- `POST /api/itsm/tenant/logo` — multipart `logo`, hanya IT Lead; field
  `tenants.logo` memvalidasi tipe (PNG/JPG/WEBP) dan ukuran (maks 2 MB).
- `DELETE /api/itsm/tenant/logo` — menghapus logo.
- `GET /api/itsm/branding/logo` — publik, hanya mode standalone, menyajikan file
  logo rumah sakit aktif lewat `e.fileFS($os.dirFS(...))`. Mode vendor selalu
  404.
- Setiap unggah/hapus menulis audit `update` pada `collection_name=tenants`.
- Frontend memakai `tenantLogoUrl()` (`/api/files/tenants/{id}/{logo}`) untuk
  pengguna login, dan route publik di atas untuk halaman login.

## Detail teknis: tim rumah sakit

> Pelengkap bagian di atas: kontrak level field dan detail implementasi (dipindahkan dari SCHEMA, 2026-11-10).

IT Lead mengelola staf di tenant-nya sendiri lewat `/api/itsm/team`. Penulisan
memakai `$app.save`, sehingga `users.createRule` tetap `null` (superuser saja).

- Cakupan: `tenant = e.auth.tenant`; akun platform dan pengguna tenant lain
  selalu menghasilkan 404.
- Role yang boleh dibuat: `requester`, `it_support`, `resolver`, `it_lead`, `viewer`.
- Email wajib unik global dan tidak dapat diubah setelah akun dibuat.
- Password awal dibuat server: 16 karakter dari alfabet tanpa karakter ambigu.
  Password hanya dikembalikan sekali pada respons `POST` (create) dan
  `POST .../password` (reset); `audit_logs` tidak menyimpannya.
- Bila SMTP aktif, respons yang sama diikuti email undangan/reset berisi
  password sementara. Kegagalan email tidak membatalkan akun; UI menampilkan
  password dan pesan kegagalan agar bisa diserahkan manual.
- `POST` membuat akun dengan `must_change_password = true`; reset password juga
  menaikkan flag itu dan memanggil `refreshTokenKey()` (sesi lama berakhir).
- Lead tidak dapat menonaktifkan akun sendiri atau mengubah role sendiri.
- IT Lead aktif terakhir tidak dapat dinonaktifkan atau diturunkan; bila
  perubahan itu dicoba, server menolak 400.
- Unit yang dipasang harus milik tenant yang sama.
- Setiap create/update/reset menulis `audit_logs` (`collection_name=users`).
- `POST /api/itsm/team/{userId}/2fa-reset` menghapus secret, hash kode
  pemulihan, dan status 2FA anggota, lalu memanggil `refreshTokenKey()` agar
  semua sesinya berakhir. IT Lead tidak dapat mereset 2FA akun sendiri lewat
  route ini (gunakan Profil). Audit `mfa_reset`.
- `POST /api/itsm/team/{userId}/unlock` menghapus `login_failed_count` dan
  `login_locked_until`; audit `update` dengan `changes.field=login_lock`.
  Ditolak 400 bila akun tidak sedang terkunci dan tidak punya percobaan gagal.
- Serialisasi tim memuat `totp_enabled`, `login_failed_count`, dan
  `login_locked_until` agar UI menampilkan badge 2FA/terkunci dan tombol aksi
  yang relevan.

### Impor massal dari CSV

`POST /api/itsm/team/import` menerima satu berkas multipart bernama `file`
(maks 2 MB, maks 1.000 baris data). Berkas dibaca dan divalidasi di server;
tidak ada akun yang dibuat untuk baris yang gagal.

- Header wajib: `nama`, `email`, `role`, `unit`, `tim` (alias bahasa Inggris
  `name`, `team`, dan `jabatan`/`job_title` opsional). Urutan kolom bebas;
  pemisah koma, titik koma, atau tab dideteksi otomatis; kutip ganda dan BOM
  UTF-8 didukung.
- `role` menerima kunci internal (`it_support`) maupun label UI
  (`Staff IT`). `tim` menerima kunci maupun label (`application` /
  `Aplikasi / SIMRS`). `unit` dicocokkan lewat kode lebih dulu, lalu nama;
  nama unit ganda harus memakai kode.
- Per baris divalidasi nama (2–120), email valid dan unik global, role dikenal,
  tim dikenal, unit ada dan aktif, serta jabatan maks 80 karakter. Email
  duplikat di dalam berkas dilaporkan dengan nomor baris asalnya.
- Respons: `summary {total, imported, failed}`, `imported[]` (termasuk
  `password` awal, hanya sekali), dan `failed[]` (`row`, `name`, `email`,
  `errors[]`). Email undangan tidak dikirim massal; UI menyediakan unduhan
  kredensial CSV.
- Setiap impor menulis satu audit `action=import`, `collection_name=users`,
  berisi `file_name`, jumlah baris/berhasil/gagal, dan maksimal 50 baris gagal
  sebagai contoh. Password awal tidak pernah masuk `audit_logs`.

Halaman `/change-password` dipakai untuk memaksa penggantian password awal:
selama `must_change_password = true`, `guards.requireAuth` menolak route ITSM
lain dan router mengalihkan pengguna ke halaman itu.
