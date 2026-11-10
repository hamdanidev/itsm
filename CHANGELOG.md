# Changelog

Riwayat fitur, perilaku, dan verifikasi Healthcare ITSM. README hanya memuat
ringkasan; detail per rilis ada di sini.

## 2026-11-10 — Panduan v1.1: pengantar ITSM

- bab 00 "Apa itu ITSM dan mengapa rumah sakit membutuhkannya": definisi
  sederhana, analogi pendaftaran pasien, manfaat (satu pintu, prioritas berbasis
  dampak klinis, SLA, riwayat/audit, problem & known error, laporan), peran,
  batasan (bukan SIMRS/kanal data pasien), dan kapan memakai tiket;
- tautan **Bantuan** kini juga ada di menu pengguna (Profil saya → Bantuan),
  selain ikon tanya di topbar;
- versi panduan dinaikkan ke 1.1; PDF dibangun ulang (81 halaman, 68 screenshot).
- perbaikan: tautan daftar isi di /panduan.html tidak lagi diarahkan ke
  /panduan/ (penyebab halaman 404 aplikasi); <base> diganti path gambar
  absolut saat publish.
## 2026-11-10 — Panduan pengguna v1.0

Panduan bergambar untuk staf rumah sakit tersedia lengkap di `docs/USER-GUIDE/`:

- tujuh bab: 01 masuk/akun/2FA, 02 pemohon, 03 service desk, 04 admin,
  05 konsol vendor, 06 QR publik, dan 99 lampiran (peran, status, glosarium,
  FAQ);
- bab 05 "Konsol vendor" (5 langkah bergambar): KPI dan daftar rumah sakit,
  tambah RS + admin pertama, data master per tenant, tiket lintas RS lewat
  pemilih tenant, dan audit lintas RS;
- gambar diambil otomatis lewat `npm run guide:shots` (Playwright + manifest
  `shots.json`) dari instance demo terpisah (`RS Sehat Digital`, seed
  `--seed 42`), dengan outline dan nomor panggil yang disuntik saat capture;
  dukungan `anonymous`, `vars` (token QR, token reset dari `email_outbox`), dan
  instance mode vendor terpisah untuk bab 05;
- `npm run guide:publish` menyalin HTML ke `frontend/public/panduan.html` dan gambar ke `frontend/public/panduan/img/`
  sehingga tersedia di `/panduan.html`; tautan **Bantuan** ditambahkan di topbar
  (`VITE_GUIDE_URL`, bisa dimatikan dengan `off`);
- image Docker membangun panduan pada stage `frontend`; CI menjalankan
  `npm run guide:build` agar tautan/gambar putus tertangkap;
- `tests/unit/guide.test.mjs` menjaga bab terdaftar, metadata wajib, alt text,
  gambar ada dan ≤300 KB, tidak ada gambar yatim, serta setiap route screenshot
  masih terdaftar di `frontend/src/app/router.jsx`.

Verifikasi: 96 unit test lulus; 67 screenshot; PDF 76 halaman (8,4 MB).

## 2026-11-10 — Increment A–D selesai

Increment A–D selesai: service catalog, problem management, knowledge base,
asset/CI, CSAT, laporan operasional, multi-tenant, tim tenant, email
transaksional, dan identitas rumah sakit. Fitur sampai konsol vendor
multi-tenant, pengelolaan tim oleh IT Lead, logo rumah sakit, serta lupa
password mandiri:

- autentikasi staff dan intake tiga jenis tiket;
- setup awal instalasi: halaman `/setup` membuat data awal dan akun pertama
  (rumah sakit + Kepala IT pada mode standalone, akun vendor pada mode vendor)
  dengan kode setup sekali pakai, lalu menutup diri;
- intake publik lewat **titik QR per unit**: staf memindai QR, mengisi form tanpa
  login, dan tiket memakai unit/lokasi dari titik QR; lampiran screenshot bisa
  dikirim sejak awal, dengan rate limit dan attestation data pasien; langkah
  form bisa dibuka kembali lewat indikator, ada progres langkah, dan nomor tiket
  di layar sukses bisa disalin beserta ringkasan laporan;
- **status tiket tamu lewat tautan bertoken** (`/t/{token}`): pelapor QR dapat
  melihat status, pembaruan publik, ringkasan penyelesaian, dan mengisi CSAT
  tanpa akun; tautan juga dikirim ke email pelapor bila diisi;
- katalog layanan dan item permintaan: approval mode per item, SLA per layanan,
  serta intake yang bisa mencatat sumber telepon/email/WhatsApp dan pemohon
  atas nama (on-behalf);
- triage tiket oleh staf IT: koreksi prioritas, dampak klinis, kategori,
  layanan, item, dan lokasi sebelum pekerjaan dimulai, dengan recompute SLA dan
  audit;
- problem management: kelompokkan beberapa insiden, root cause, workaround,
  known error, permanent fix, dan status problem;
- knowledge base: artikel SOP/known error dengan lifecycle draft → review →
  terbit → pensiun, visibilitas internal/publik, pencarian, serta saran artikel
  dan workaround saat intake;
- daftar tiket dengan pagination/filter/URL state dan dashboard antrean kerja;
- daftar tiket lanjutan: tampilan tersimpan (Aktif, Tiket saya, Belum di-assign,
  SLA lewat, Menunggu approval), pilih massal + assign/mulai, aksi cepat per
  baris, kolom tim/SLA, kepadatan tabel yang tersimpan, dan mode Daftar/Papan
  terakhir yang diingat;
- form buat tiket tiga langkah (klasifikasi → detail → tinjau & kirim) dengan
  validasi per langkah, ringkasan sebelum submit, dan navigasi kembali tanpa
  kehilangan isian;
- papan kerja (Kanban) sebagai mode tampilan sekunder: empat kolom
  (Baru, Dikerjakan, Menunggu pelapor, Selesai), seret kartu untuk transisi
  tervalidasi, menu "pindahkan" untuk layar sentuh, badge approval/SLA, dan
  modal penyelesaian bersama;
- detail tiket dengan riwayat aktivitas + pembaruan realtime;
- detail tiket lanjutan: bilah aksi lengket, panel SLA/approval di atas kolom
  samping (lengket + bisa digulir sendiri), riwayat dikelompokkan per hari
  dengan jam, komposer dengan pilihan Publik/Internal, pintasan Ctrl+Enter, dan
  draf komentar tersimpan lokal; modal penyelesaian dipakai bersama (siap untuk
  papan Kanban);
- assignment, transisi status termasuk `waiting` dengan jeda SLA, recompute SLA
  saat reopen, eskalasi berjenjang, pengingat pra-SLA sekali per fase, dan merge
  tiket duplikat ke tiket tujuan;
- approval berjenjang (manajer unit → IT Lead → CAB), delegasi approver, dan
  tenggat per tahap;
- laporan SLA server-side dengan ekspor CSV per tiket, cetak/PDF, jadwal
  pengiriman email mingguan/bulanan, termasuk laporan lintas rumah sakit untuk
  akun vendor;
- profil pengguna: nama, telepon, nomor pegawai, avatar, ganti password, dan
  preferensi notifikasi email;
- lupa password mandiri: tautan email bertoken, sekali pakai, dan sesi lama
  otomatis berakhir;
- logo rumah sakit: unggah oleh IT Lead, tampil di sidebar dan halaman masuk;
- konsol vendor: kelola rumah sakit, data master, pengguna, laporan, dan audit
  lintas tenant;
- pengelolaan tim oleh IT Lead: tambah anggota, ubah role/unit, aktif-nonaktif,
  reset password, dan undangan email berisi password awal;
- impor massal anggota dari CSV (nama, email, role, unit, tim): validasi per
  baris, ringkasan berhasil/gagal, duplikat ditolak, unduhan kredensial awal,
  dan audit `import` — dipakai saat onboarding ratusan staf;
- keamanan akun: **2FA TOTP** (QR + kunci manual, 10 kode pemulihan sekali
  pakai, reset oleh IT Lead dari tab Tim), pembatasan percobaan login dengan
  lockout sementara, buka kunci oleh IT Lead, dan audit `login_failed` tanpa
  menyimpan password/kode;
- email transaksional lewat SMTP (Mailtrap saat development) dengan antrean,
  retry, dan preferensi penerima;
- komentar publik/internal, lampiran terproteksi, pengaturan unit/kategori/SLA/
  hari libur, notifikasi in-app, SLA awal + breach scan, dan audit log;- seluruh form data-entry memakai **Formik** (nilai, validasi, status submit,
  dan error server) — termasuk auth, tiket, problem, pengetahuan, pengaturan,
  tim, serta konsol vendor;
- editor rich text untuk artikel, deskripsi tiket, komentar, resolusi, problem,
  dan change plan: toolbar tebal/miring/daftar/judul/kutipan/kode/tautan, dengan
  sanitasi HTML berbasis allowlist sebelum disimpan dan dirender;
- asset/CI register: tipe perangkat, lokasi, unit, layanan, criticality, garansi,
  status, penanggung jawab, service CI, dan riwayat tiket per aset;
- tautan aset ke tiket dari intake maupun detail tiket, plus CSAT satu respons
  per tiket setelah tiket selesai/ditutup;
- laporan operasional bulanan: insiden per layanan, problem teratas, pemakaian
  KB, CSAT per layanan, dan compliance SLA, dengan ekspor CSV.

## Catatan verifikasi

Rekaman uji yang dijalankan saat fitur di atas selesai (dipindahkan dari README).
Angka suite adalah angka saat penulisan; jumlah terkini ada di hasil CI, bukan di
dokumen ini.

- Suite otomatis lulus lokal (Windows): 49 unit test, 254 test API, dan 52
  skenario e2e — lihat bagian [Testing](README.md#testing) di README.
- Pengingat pra-SLA diverifikasi test API: tiket dengan tenggat ≤ 30 menit
  mendapat satu notifikasi + email, audit `sla_warn`, dan penanda
  `*_warned_at`; pemindaian ulang tidak mengirim duplikat, sedangkan tenggat
  yang masih jauh tidak diberi peringatan.
- Merge tiket diverifikasi test API + Playwright: tiket sumber ditutup sebagai
  duplikat, komentar dan lampiran berpindah ke tujuan, audit `merge` tercatat
  di kedua tiket, notifikasi terkirim, serta merge ke diri sendiri, jenis
  berbeda, tiket selesai, lintas rumah sakit, dan sumber yang sudah digabung
  ditolak.
- Laporan terjadwal diverifikasi test API + Playwright: hanya Kepala IT yang
  dapat membaca/mengubah jadwal, jadwal mingguan/bulanan menghitung `next_at`,
  pengiriman manual dan cron mengantrekan email `report` ke Kepala IT, serta
  menonaktifkan jadwal membersihkan `next_at`. Tombol Cetak/PDF memakai dialog
  cetak browser dengan sidebar/filter disembunyikan.
- Status tiket tamu + CSAT QR diverifikasi test API + Playwright: tiket QR
  mendapat token 32 karakter, halaman publik hanya memuat satu tiket, komentar
  internal tidak bocor, email konfirmasi masuk antrean, CSAT ditolak sebelum
  tiket selesai, hanya satu respons, dan audit mencatat `actor_role=guest`.
- Rich editor diverifikasi Playwright: toolbar tebal menghasilkan format,
  HTML berbahaya (`script`, atribut `onclick`) dibuang sebelum disimpan, dan
  script tidak dieksekusi saat artikel dirender.
- Asset/CI + CSAT + laporan operasional diverifikasi test API + Playwright:
  pembuatan aset dengan nomor otomatis, service CI, isolasi tenant, tautan dan
  pelepasan aset dengan audit, riwayat tiket pada detail aset, CSAT hanya oleh
  requester setelah resolved, satu respons per tiket, serta laporan operasional
  dan CSV yang memuat insiden per layanan, CSAT, KB, problem, dan SLA.
- Insiden mayor diverifikasi test API + Playwright: deklarasi dari tiket dengan
  nomor otomatis dan broadcast, tautan beberapa tiket tanpa duplikasi, update
  internal/publik, resolusi wajib ringkasan, penutupan wajib PIR lengkap, PIR
  tersimpan, isolasi tenant, statistik MTTR, dan tautan balik di detail tiket.
- Problem & pengetahuan diverifikasi test API + Playwright: problem dari tiket,
  syarat known error/resolved/closed, penautan tiket kedua + audit, isolasi
  tenant, draft internal tidak terlihat requester, publish hanya IT Lead,
  artikel publik terlihat requester, pencarian known error membawa workaround,
  artikel internal hanya untuk staf, dan item knowledge lintas tenant ditolak.
  UI problem known error dan saran artikel di intake diuji Playwright.
- Katalog layanan diverifikasi test API + Playwright: seed 6 layanan/7 item,
  kode dinormalisasi, item lintas tenant ditolak, support tidak bisa menulis
  katalog, item `none` tidak membuat approval, item `manager` membuat tahap
  manajer, SLA layanan dipakai, on-behalf + sumber telepon, triage menghitung
  ulang SLA dan menulis audit, triage membangun ulang approval, triage ditolak
  setelah pekerjaan dimulai, dan CR wajib outcome/tanggal aktual. UI katalog,
  intake, triage, dan pengelolaan layanan diuji Playwright.
- Konsol Vendor diverifikasi test API: mode `standalone` menolak login akun
  vendor, mode `vendor` mengizinkan; pengguna rumah sakit ditolak dari route
  platform; `it_support` hanya baca; pembuatan tenant (seed 10 unit, 9 kategori,
  12 kebijakan, 3 hari libur, 6 layanan + 7 item + akun IT pertama) atomik; seed
  idempoten; kode unik; email duplikat ditolak; menonaktifkan tenant memblokir
  login.
- Vendor sebagai resolver diverifikasi test API: membaca tiket dan master data
  rumah sakit lain, ditugaskan lalu menyelesaikan siklus tiket rumah sakit,
  menerima notifikasi penugasan, menyetujui semua tahap service request,
  `audit_logs` mencatat `actor_role=platform_it_lead`, vendor tidak bisa
  membuat tiket atau menulis lewat REST, dan isolasi antar rumah sakit untuk
  pengguna biasa tetap utuh.
- Laporan lintas RS diverifikasi test API: vendor mendapat mode `all` dengan
  ringkasan per rumah sakit, bisa membatasi ke satu tenant, tenant tak dikenal
  ditolak 404, vendor support ditolak 403, parameter `tenant` tidak bisa dipakai
  IT Lead rumah sakit untuk memperluas cakupan, serta CSV gabungan memakai
  kolom `tenant` sementara ekspor satu RS tetap memakai header lama.
- Audit lintas RS diverifikasi test API: jejak aksi terbaca per tenant dengan
  nama aktor dan nomor tiket, filter aksi/cakupan/pencarian nomor tiket bekerja,
  paginasi membatasi baris, vendor support boleh membaca, filter tidak valid
  ditolak 400/404, dan pengguna rumah sakit ditolak 403. Perubahan data master
  oleh superuser kini ikut tercatat (`actor_role=superuser`).
- Data master per RS diverifikasi test API: vendor membaca seluruh master,
  support hanya baca (tulis 403), unit/kategori/hari libur bisa dibuat dan
  diubah, kode & tanggal duplikat ditolak, manajer unit harus pengguna aktif
  rumah sakit yang sama, kebijakan SLA memvalidasi jam kerja dan respons,
  record tenant lain tidak bisa diubah lewat id (404), dan perubahan tercatat
  di audit.
- Tim rumah sakit diverifikasi test API: IT Lead melihat/menambah/mengubah
  stafnya, support dan requester ditolak, email duplikat dan role asing ditolak,
  unit lintas tenant ditolak, lead boleh membuat lead lain, tidak bisa
  menonaktifkan akun sendiri atau mengubah role sendiri, staf tenant lain tidak
  dapat disentuh (404), reset password mematikan password lama, akun baru
  terhalang dari route ITSM sampai password diganti, dan setiap aksi tercatat
  di audit. Skenario UI-nya (buat anggota → login password awal → wajib ganti →
  login ulang) diuji Playwright.
- Email transaksional diverifikasi test API + SMTP lokal: undangan berisi
  password awal, reset password berisi password baru, notifikasi tiket masuk
  antrean lalu ditandai terkirim setelah dispatch, preferensi email yang
  dimatikan menghentikan antrean, dan support/requester tidak bisa membaca
  status atau koleksi email. Jalur SMTP nyata (bukan capture) juga diuji dengan
  server SMTP lokal: konfigurasi dari environment diterapkan, pesan terkirim
  dengan sender dan tautan yang benar, dan password awal ada di isi email.
- Lupa password diverifikasi test API + Playwright: email tak dikenal tetap
  mendapat respons generik, tautan bertoken terkirim, konfirmasi mengganti
  password dan menurunkan `must_change_password`, token yang sama ditolak,
  sesi/password lama tidak berlaku, permintaan kedua dalam satu menit tidak
  mengirim email lagi, akun nonaktif tidak dikirimi tautan, dan audit
  `password_reset_request`/`password_reset` tercatat.
- Logo rumah sakit diverifikasi test API + Playwright: IT Lead mengunggah dan
  menghapus logo, support/requester ditolak, file bisa dibaca pengguna login,
  route logo publik hanya aktif di standalone (404 pada mode vendor), logo
  tampil di sidebar, dan logo termuat di halaman login tanpa sesi.
- Konsol Vendor diverifikasi Playwright (instance `TENANCY_MODE=vendor` sendiri):
  login vendor mendarat di `/platform`, sidebar berisi menu vendor, pembuatan
  rumah sakit lewat modal, detail master data + pengguna tampil, pemilih tenant
  bekerja, dan tiket rumah sakit bisa dibuka dengan staf vendor sebagai
  calon assignee — tanpa console error.
- Laporan SLA diverifikasi test API: ringkasan, compliance, median, agregat
  unit/prioritas/jenis, filter rentang, bucket mingguan, validasi 366 hari,
  ekspor CSV (BOM, header, isi baris), dan akses khusus IT Lead.
- Laporan UI diverifikasi Playwright: IT Lead membuka `/reports`, lima KPI dan
  tabel tampil, unduhan CSV menghasilkan nama file yang benar, dan requester
  dialihkan keluar.
- Profil diverifikasi test API: data diri, penolakan perubahan role/tenant/unit,
  validasi nama/telepon/nomor pegawai, unggah avatar (PNG, batas 2 MB, tipe
  file), hapus avatar, ganti password (password lama, konfirmasi, panjang), sesi
  lama tidak berlaku, serta audit `update`.
- Profil diverifikasi Playwright: ubah nama di `/profile`, unggah avatar sampai
  tampil di top bar, ganti password, login ulang dengan password baru, dan
  password lama ditolak.
- Stage 12 diverifikasi test API: rencana tiga tahap untuk CR high risk (dan
  pelewatan CAB bila hanya satu lead), tenggat tahap dihitung ulang saat aktif,
  empat mata CAB, delegasi manajer unit dan IT Lead, penolakan validasi
  delegasi, serta audit `delegate`.
- Delegasi UI diverifikasi Playwright: manajer mendelegasikan tahap 1 ke wakil,
  jejak delegasi tampil di stepper, dan wakil dapat menyetujui tahap tersebut.
- Perbaikan: hari libur kini benar-benar dipakai dalam perhitungan SLA. Sebelumnya
  daftar record `holidays` diberikan langsung ke fungsi kalender sehingga tidak
  pernah cocok; unit test menangkap regresi ini.
- Migrasi schema + seed diterapkan pada PocketBase v0.40.5 native (Windows).
- Login requester/support/lead.
- Create Incident, Service Request, dan Change Request via custom route.
- SLA due date dihitung; cron `sla_breach_scan` menandai breach + audit.
- Komentar publik/internal; requester tidak melihat komentar internal.
- First response terisi saat staff memberi komentar publik.
- Upload lampiran dan download protected file dengan token.
- Audit log hanya terlihat IT Lead; create audit ditolak.
- Assignment, transisi status, approval, resolution, dan reopen diuji lewat API:
  aturan role, approval gating, validasi ringkasan resolusi, dan audit.
- Approval gating diuji: Service/Change Request `pending`/`rejected` tidak dapat
  dimulai atau diselesaikan; approval hanya sebelum pekerjaan dimulai; request
  yang ditolak dapat disetujui ulang.
- `npm run build` sukses.
- UI diverifikasi dengan Playwright pada viewport 1440, 1280, 1024, 768, dan
  390 px: login, list, detail, create, empty state, menu, drawer mobile.
- Dashboard dan antrean diverifikasi Playwright (23 check): KPI, panel antrean,
  chip filter, pagination, sort SLA, sinkronisasi pencarian ke URL, guard role
  requester, dan layout 390 px.
- Riwayat + realtime diverifikasi Playwright (14 check, dua browser): status dan
  komentar berubah tanpa reload, komentar internal tidak bocor ke requester,
  event internal tidak muncul di riwayat requester, indikator `Live` aktif.
- SLA diverifikasi Playwright + API (19 check): status menunggu, jeda 90 menit
  menggeser tenggat persis 90 menit, total jeda tercatat, reopen menghitung
  ulang tenggat serta membersihkan breach/eskalasi, badge Eskalasi L3, dan
  cron eskalasi menaikkan level 2 → 3 tanpa menyentuh tiket `waiting`.
- Approval berjenjang diverifikasi Playwright + API (16 check): dua langkah
  tampil, manajer unit bisa membuka tiket unitnya, hanya approver tahap aktif
  yang bisa memutuskan (support ditolak 403), pekerjaan terblokir sampai tahap
  akhir, override IT Lead setelah penolakan menandai semua tahap approved, dan
  pemilihan manajer unit tersedia di Pengaturan.
- Pengaturan diverifikasi Playwright (21 check): IT Lead bisa membuat/mengubah/
  menonaktifkan unit dan kategori, mengubah kebijakan SLA, menambah hari libur,
  kode duplikat ditolak dengan pesan jelas, tombol tambah SLA nonaktif saat 12
  kombinasi terisi, perubahan tercatat di audit, dan requester/support dialihkan
  keluar dari `/admin`.
- Notifikasi in-app diverifikasi Playwright + API (12 check, dua browser):
  badge muncul untuk assignee dan requester, klik notifikasi membuka tiket dan
  menandai dibaca, komentar publik memicu badge realtime, komentar internal
  tidak menambah notifikasi requester, filter belum dibaca dan tandai semua
  dibaca bekerja, serta notifikasi pengguna lain tidak bisa dibaca.
- Alur UI end-to-end: login, pencarian, filter prioritas, buat tiket, komentar,
  upload lampiran, logout, tanpa console error.
- Alur UI tiket: support assign ke diri sendiri → mulai → selesaikan lewat modal
  → tutup; lead setujui/tolak; requester buka kembali tiket sendiri.
- Docker image backend/web/backup berhasil dibangun dan diverifikasi.
- Image backend dijalankan dengan volume kosong: migrasi + seed berjalan, hooks
  termuat, health 200, dan route assign/transition/approval terdaftar.
- Image web dijalankan dengan Caddy: `/healthz`, security headers, dan halaman
  login production build terverifikasi lewat HTTPS.
