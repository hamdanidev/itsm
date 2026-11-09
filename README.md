# Healthcare ITSM

Platform tata kelola layanan TI untuk rumah sakit: Incident, Service Request,
Change Request, Problem, dan Knowledge Base dalam satu portal yang terstruktur,
memiliki SLA, RBAC, dan audit trail.

Status saat ini: **Increment A+B+C selesai — service catalog, problem
management, knowledge base, asset/CI, CSAT, laporan operasional, multi-tenant,
tim tenant, email transaksional, dan identitas rumah sakit**. Fitur sampai
konsol vendor multi-tenant, pengelolaan tim oleh IT Lead, logo rumah sakit,
serta lupa password mandiri:

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

## Stack

- Frontend: React 19 + Vite 8 + CSS (tanpa framework UI)
- Form state: Formik (semua form data-entry)
- Rich text: contenteditable kustom + sanitizer allowlist (tanpa dependency baru)
- Backend: PocketBase v0.40.5 (API, auth, realtime, file storage, Admin UI)
- Development: PocketBase native binary + Vite, **tanpa Docker**
- Production: Docker + Docker Compose + Caddy
- Data: SQLite di `backend/pb_data` (dev) atau named volume
  `healthcare_itsm_pb_data` (production)

## Struktur

```text
healthcare-itsm/
├── frontend/                  # React + Vite
│   └── src/styles/app.css     # design system (Atlassian/Jira-inspired)
├── backend/
│   ├── pb_migrations/         # schema + seed (committed)
│   ├── pb_hooks/              # Goja hooks/routes (committed)
│   ├── zoneinfo.zip           # basis data zona IANA untuk ZONEINFO
│   ├── pb_data/               # gitignored, data lokal dev
│   └── .bin/                  # gitignored, binary PocketBase hasil unduhan
├── scripts/
│   ├── dev.mjs                # jalankan PocketBase + Vite tanpa Docker
│   ├── pocketbase.mjs         # CLI download/serve/superuser/migrate
│   ├── zoneinfo.mjs           # segarkan backend/zoneinfo.zip dari toolchain Go
│   ├── seed.mjs               # seed data manual untuk testing
│   └── lib/pocketbase.mjs     # resolver binary, checksum, args serve
├── docker/
│   ├── Caddyfile
│   ├── entrypoint.sh
│   └── backup.sh
├── docker-compose.yml         # production (TLS + backup)
├── Dockerfile                 # production image
├── package.json               # dev tooling root
├── .env.example
├── README.md
└── SCHEMA.md
```

## Prasyarat

- **Development:** Node.js 20.19+ (disarankan 22/24). Docker tidak diperlukan.
- **Production:** Docker Engine + Docker Compose v2, domain yang mengarah ke
  server, dan port 80/443 terbuka.

## Development

### 1. Jalankan PocketBase + frontend

```bash
npm install --prefix frontend
npm run dev
```

`npm run dev` akan:

1. Mengunduh PocketBase v0.40.5 untuk OS/arsitektur Anda ke `backend/.bin/`
   (sekali saja) dan memverifikasi SHA-256 dari rilis resmi.
2. Menjalankan PocketBase dengan `backend/pb_data`, `backend/pb_migrations`,
   `backend/pb_hooks`, dan `--automigrate=true`.
3. Menjalankan Vite di <http://localhost:5173> dengan proxy `/api` dan `/_` ke
   PocketBase, sehingga tidak ada CORS terbuka.

URL:

- Frontend: <http://localhost:5173>
- PocketBase Admin UI: <http://127.0.0.1:8090/_/>
- Healthcheck: <http://127.0.0.1:8090/api/health>

Data dev tersimpan di `backend/pb_data/` dan tidak ikut ter-commit.

### 2. Setup awal (wajib sekali)

Instalasi yang belum punya akun otomatis dialihkan ke `/setup`. Halaman ini
membuat data awal sekaligus akun pertama:

- **standalone** — identitas rumah sakit (nama, kode, zona waktu) + akun
  Kepala IT pertama;
- **vendor** — akun platform (vendor) pertama yang mengelola seluruh rumah sakit.

Langkahnya:

1. Ambil kode setup dari server. Kode dibuat otomatis saat instalasi pertama
   dijalankan, disimpan di `backend/pb_data/setup_token`, dan dicetak di log
   server:

   ```bash
   npm run pb:setup-token
   ```

   Untuk deployment otomatis, setel environment `SETUP_TOKEN` sebelum
   PocketBase dijalankan; nilai itu yang dipakai tanpa menulis berkas.

2. Buka <http://localhost:5173>. Isi kode setup, data rumah sakit (mode
   standalone), dan akun pertama. Password minimal 8 karakter.

3. Setelah selesai, akun langsung dipakai masuk ke dashboard, kode setup
   dihapus, dan halaman `/setup` tertutup. Setup hanya bisa dilakukan selama
   belum ada satu pun akun.

### 3. Superuser PocketBase (opsional)

Hanya diperlukan untuk membuka Admin UI `http://127.0.0.1:8090/_/` (mis. inspeksi
database). Aplikasi sehari-hari tidak memakainya:

```bash
npm run pb:superuser -- admin@itsm.local "PasswordKuat123!"
```

### 4. Akun staf lain

Kepala IT menambah anggota lewat **Pengaturan → Tim**. Password awal dibuat
sistem, dikirim lewat email undangan, dan wajib diganti saat login pertama.

`users.createRule` sengaja dikunci: pembuatan akun di luar alur Tim (mis. Admin
UI) hanya untuk keperluan darurat superuser. Akun rumah sakit wajib punya
`tenant`, sedangkan akun platform wajib `is_platform_staff = true` tanpa
`tenant` — hook validasi menolak kombinasi lain. Rumah sakit baru pada mode
vendor dibuat dari menu **Konsol Vendor**, bukan dari Admin UI.

### 5. Perintah dev lain

```bash
npm run dev:pb       # PocketBase saja
npm run dev:web      # Vite saja (PocketBase harus sudah jalan)
npm run pb:download  # unduh/segarkan binary saja
npm run pb:serve     # PocketBase foreground dengan opsi dev
npm run pb:migrate -- collections
npm run pb:setup-token  # cetak kode setup instalasi baru
```

Reset data lokal: hentikan dev, hapus `backend/pb_data/`, lalu jalankan
`npm run dev` lagi dan ulangi setup (langkah 2).

Debug query SQL PocketBase:

```bash
PB_DEBUG=1 npm run dev
```

Di PowerShell: `$env:PB_DEBUG=1; npm run dev`.

`PB_VERSION`, `PB_HTTP`, dan `DEV_ORIGINS` dapat diatur lewat environment atau
`.env` (opsional; default sudah cocok untuk dev).

### 6. Seed data manual (testing)

`npm run seed` mengisi satu instalasi yang sedang berjalan dengan data demo
yang saling terhubung: tiket di semua status, komentar, approval berjenjang
(termasuk CAB dan delegasi), breach/escalation, CSAT, problem, artikel
pengetahuan, insiden mayor, aset, dan titik QR. Waktu record ikut dimundurkan
dan disebar sehingga laporan 90 hari, tren, dan antrean dashboard terlihat
seperti sistem yang sudah dipakai berbulan-bulan.

Semua tulisan dibuat lewat route aplikasi biasa (bukan insert langsung), jadi
SLA, audit log, notifikasi, dan aturan RBAC tetap berjalan. Backdate memakai
route development khusus superuser (`/api/itsm/dev/*`, lihat SCHEMA.md);
route itu tidak dipanggil frontend dan tidak menambah hak akses karena hanya
menerima superuser PocketBase.

```bash
npm run dev                      # PocketBase + Vite harus jalan lebih dulu
npm run pb:superuser -- admin@itsm.local "PasswordKuat123!"   # sekali saja
npm run seed                     # profil small
npm run seed:busy                # ±150 tiket dalam 3 bulan
npm run seed -- --profile tiny --reset --yes
```

| Profil | Isi |
|---|---|
| `tiny` | 10 tiket, satu per status penting; cukup untuk smoke test UI |
| `small` | ±24 tiket dalam 14 hari (default) |
| `medium` | ±60 tiket dalam 30 hari |
| `busy` | ±150 tiket dalam 90 hari, terasa seperti ITSM aktif |

Opsi penting:

```bash
npm run seed -- --tickets 40 --days 21   # volume/rentang khusus
npm run seed -- --reset --yes            # hapus data demo lalu seed ulang
npm run seed -- --no-age                 # semua record bertanggal "sekarang"
npm run seed -- --seed 42                # RNG deterministik
npm run seed -- --hospitals 2            # mode vendor: 2 rumah sakit demo
npm run seed -- --help
```

- **Mode standalone** — data masuk ke rumah sakit yang sudah ada (satu-satunya
  tenant). `--reset` menghapus data transaksional rumah sakit itu, jadi
  konfirmasi akan muncul kecuali `--yes`.
- **Mode vendor** — seed membuat/memakai rumah sakit demo `DEMO01` (dan
  `DEMO02`, `DEMO03` bila `--hospitals` lebih dari 1) sehingga data rumah sakit
  lain tidak tersentuh. Rumah sakit demo muncul di Konsol Vendor.
- Akun demo memakai domain `demo.local` (rumah sakit pertama), `demo2.local`,
  dan seterusnya, password default `SeedDemo123!`. Akun utama:
  `lead.it@demo.local` (Kepala IT), `support@demo.local` (Staff IT),
  `resolver.app@demo.local` (Teknisi), `manajer.igd@demo.local` (approver unit),
  `perawat.igd@demo.local` (pemohon), `viewer@demo.local` (pengamat). Pada mode
  vendor, `vendor.seed@demo.local` adalah admin konsol.
- Seeding **idempoten untuk data referensi**: akun, aset, titik QR, problem,
  artikel, dan insiden dicocokkan lewat email/nomor/judul. Menjalankan seed
  lagi akan menambah tiket baru tanpa membuat aset/akun ganda. Gunakan `--reset`
  bila ingin dataset bersih.
- Email notifikasi demo dimatikan (`email_opt_out`) agar antrean SMTP Mailtrap
  tidak dibanjiri. Notifikasi in-app tetap dibuat.
- Superuser default mengikuti `PB_ADMIN_EMAIL`/`PB_ADMIN_PASSWORD` atau
  `admin@itsm.local` / `PasswordKuat123!`. Bila belum ada, seed berhenti dengan
  perintah `npm run pb:superuser` yang perlu dijalankan.
- Bila baru menarik perubahan yang menambah file di `backend/pb_hooks/`,
  hentikan `npm run dev` dan jalankan ulang agar route seed dimuat. Seed akan
  memberi tahu bila route-nya belum tersedia.

### 7. Cek cepat

- Login sebagai requester.
- Buat tiket Incident / Service Request / Change Request.
- Buka detail; tambahkan komentar publik.
- Login sebagai support; tugaskan tiket ke diri sendiri, mulai kerjakan, lalu
  selesaikan dengan ringkasan resolusi.
- Login sebagai lead; setujui/tolak Service Request atau Change Request.
- Sebagai requester; buka kembali tiket resolved/closed milik sendiri.
- Pastikan komentar internal tidak terlihat oleh requester.
- Upload lampiran; cek tombol unduh.
- Login sebagai lead; buka audit log lewat API/Admin UI.
- Tunggu/paksa cron `sla_breach_scan`; cek `response_breach_at` dan audit.
- Sebelum breach, paksa `POST /api/itsm/dev/sla/scan` (superuser) lalu cek
  `response_warned_at`/`resolution_warned_at` dan notifikasi
  "SLA ... hampir lewat".
- Login sebagai staff; buka `/dashboard`: kartu KPI, antrean "Tiket saya",
  "Belum di-assign", dan "Perlu perhatian" harus sesuai data tiket.
- Klik "Lihat semua" pada antrean; filter, chip, dan pagination di daftar tiket
  harus mengikuti URL.

## Testing

Tiga lapis pengujian berjalan tanpa Docker dan tanpa menyentuh `backend/pb_data`:

| Perintah | Cakupan | Butuh |
|---|---|---|
| `npm run test:unit` | Matematika SLA (jam kerja, hari libur, 24x7), konversi zona & DST (Goja dan Node memakai basis data IANA yang sama), jadwal laporan per zona, guard teks/tanggal, scope platform, mode tenancy, validasi input konsol vendor, helper antrean dashboard, agregasi laporan | Node |
| `npm test` | Unit + API: auth/RBAC, alur tiket & approval (termasuk CAB dan delegasi), jeda SLA, reopen, pengingat pra-SLA, merge tiket duplikat, validasi intake, katalog layanan + approval mode + SLA per layanan, triage, on-behalf, outcome perubahan, problem management + known error, knowledge base (visibilitas, publish, pencarian, workaround), asset/CI + service CI + riwayat tiket, CSAT satu respons per tiket, laporan SLA + CSV + laporan operasional + jadwal laporan, zona waktu tenant & laporan, lampiran terproteksi, profil & password, lupa password mandiri, tim rumah sakit, email transaksional, logo rumah sakit, konsol vendor, vendor sebagai resolver tiket, laporan & audit lintas RS, setup awal (kode setup, standalone, vendor, penutupan setelah akun pertama) | Node + binary PocketBase |
| `npm run test:e2e` | Smoke UI Playwright: login per peran, daftar, detail + isolasi komentar internal, dashboard, approval bertahap, delegasi, laporan SLA + jadwal laporan, profil, intake, katalog + intake layanan, triage prioritas, merge tiket duplikat, pengelolaan layanan di Pengaturan, problem known error dari tiket, penerbitan artikel + saran intake, lupa password, logo rumah sakit, konsol vendor (mode vendor), setup awal instalasi baru | Node + PocketBase + Chromium |
| `npm run test:all` | ketiganya | — |

Cara kerjanya:

- `tests/run-api.mjs` menyalakan PocketBase di data dir sementara dan port acak,
  membuat superuser `admin@uji.local`, menjalankan migrasi + seed dari
  `backend/pb_migrations`, lalu menjalankan `node --test` pada test API. Suite API
  berjalan pada `TENANCY_MODE=vendor`; perilaku standalone diuji dengan instance
  PocketBase terpisah di dalam test.
- Test e2e menyalakan Vite sendiri lewat `PB_TARGET`
  (`frontend/vite.config.js`), jadi tidak perlu `npm run dev` lebih dulu dan
  tidak bentrok dengan dev server di 5173/8090. File e2e konsol vendor menyalakan
  instance PocketBase sendiri dalam mode vendor.
- File e2e dijalankan maksimal dua sekaligus (`--test-concurrency=2`) karena
  setiap file menyalakan PocketBase, Vite, dan Chromium sendiri; paralelitas
  lebih tinggi membuat mesin kecil kehabisan resource dan test jadi flaky.
- Setiap file test membuat organisasinya sendiri (unit + manajer + requester +
  support + lead) sehingga file test aman berjalan paralel.
- Binary PocketBase memakai `PB_VERSION` yang sama dengan dev dan diunduh sekali
  bila belum ada.

Chromium dicari otomatis di cache Playwright
(`%LOCALAPPDATA%\ms-playwright` atau `~/.cache/ms-playwright`). Bila belum ada:

```bash
npx playwright@1.64.1 install chromium
# atau set PLAYWRIGHT_CHROMIUM_EXECUTABLE ke path chrome/chromium
```

CI di `.github/workflows/ci.yml` menjalankan build + unit + API pada setiap push
dan pull request, lalu job terpisah untuk e2e.

Menambah test: taruh `*.test.mjs` di `tests/unit/` atau `tests/api/` dan pakai
helper di `tests/lib/fixtures.mjs`. Untuk debug, `TEST_VERBOSE=1` menampilkan log
PocketBase dan `TEST_KEEP_DATA=1` mempertahankan data dir sementara.

## Alur tiket

Status: `open → assigned → in_progress → resolved → closed`, dengan `waiting`
(menunggu requester) dari `assigned`/`in_progress`, dan `reopened` dari
`resolved`/`closed`.

| Aksi | Pemohon | Staff IT | Teknisi | Manajer unit | Kepala IT | Aturan |
|---|---|---|---|---|---|---|
| Assign | — | ke diri sendiri | — | — | ke Staff IT/Teknisi mana pun / lepas | Hanya staf aktif di tenant yang sama |
| Mulai kerjakan | — | assignee atau tiket belum di-assign | assignee | — | ya | Service/Change Request harus sudah approved; tiket tanpa assignee otomatis di-claim |
| Menunggu requester | — | assignee | assignee | — | ya | Dari assigned/in_progress; jam penyelesaian dijeda, komentar tetap bisa ditambahkan |
| Lanjutkan | — | assignee | assignee | — | ya | Dari waiting; tenggat penyelesaian digeser sebesar durasi jeda |
| Selesaikan | — | assignee | assignee | — | ya | Wajib ringkasan resolusi ≥ 10 karakter + kode resolusi; approval harus approved untuk non-incident; tidak bisa dari waiting |
| Tutup | — | ya | — | — | ya | Hanya dari status resolved |
| Buka kembali | tiket sendiri | ya | — | — | ya | Dari resolved/closed; resolusi dibersihkan, `reopen_count` bertambah, dan SLA penyelesaian dihitung ulang |
| Approval | — | — | — | tahap 1 (bila ditunjuk) | tahap 2 dan CAB | Hanya sebelum pekerjaan dimulai; CAB khusus CR high risk dan harus lead berbeda |
| Delegasikan approval | — | — | — | tahap aktif miliknya | tahap mana pun | Pengganti harus aktif; tahap Kepala IT/CAB hanya ke Kepala IT; alasan wajib |

**Teknisi (`resolver`)** melihat tiket yang ditugaskan kepadanya dan antrean
timnya (`tickets.team`), lalu dapat mengambil tiket tim yang belum di-assign.
Ia boleh menulis komentar/lampiran internal setelah tiket menjadi miliknya. Ia
tidak boleh triage, meng-assign orang lain, menutup tiket, atau mengelola
aset/problem/KB.
**Pengamat (`viewer`)** hanya membaca laporan dan audit tenant; tidak membuka
tiket dan tidak menulis apa pun.

Setiap aksi ditulis ke audit log (`assign`, `transition`, `triage`, `approve`,
`reject`) dengan aktor dan perubahan status.

### Antrean tim

Tiket dapat dimiliki sebuah **tim/bidang kerja**, terpisah dari unit rumah
sakit. Nilainya: `service_desk`, `application`, `network`, `hardware`,
`database`, `biomedical`, `other`.

- `services.team` menentukan tim default layanan; tiket baru mewarisi nilai ini.
- `tickets.team` dapat dikoreksi lewat triage oleh Staff IT/Kepala IT.
- Teknisi (`resolver`) melihat tiket timnya, termasuk yang belum di-assign, lalu
  menekan **Ambil tiket** untuk menjadi assignee.
- Komentar/lampiran internal tiket tim baru terlihat setelah tiket diambil.
- Teknisi tim lain tidak melihat atau mengambil tiket tersebut.
- Staff IT dan Kepala IT tetap melihat seluruh tiket tenant.

## Merge tiket duplikat

Satu gangguan SIMRS sering dilaporkan dari beberapa unit. Staf IT dapat
menggabungkan laporan duplikat lewat tombol **Gabungkan** di detail tiket:

- Cari tiket tujuan berdasarkan nomor atau judul; tiket harus sejenis dan
  berasal dari rumah sakit yang sama.
- Komentar, lampiran, tautan aset/problem/insiden mayor, dan metadata yang
  belum ada di tujuan dipindahkan ke tiket tujuan.
- Tiket sumber ditutup dengan `resolution_code=duplicate` dan
  `resolution_summary` berisi nomor tiket tujuan; `merged_into` menyimpan
  tiket tujuan, `merged_at`/`merged_by`/`merge_reason` mencatat jejaknya.
- Approval yang masih pending di tiket sumber ditolak dengan alasan merge.
- Audit `merge` ditulis di kedua tiket; pemohon dan assignee tiket sumber
  menerima notifikasi "Tiket digabung". Pemohon sumber juga ditambahkan ke
  delegasi tiket tujuan agar tetap bisa mengikuti perkembangan.
- Tidak ada rantai merge: tiket yang sudah menjadi sumber tidak dapat digabung
  lagi, dan tiket tujuan harus masih aktif.

## Katalog layanan dan triage

Tiket bisa dikaitkan ke satu **layanan** dan satu **item permintaan**. Katalog
dikelola Kepala IT di **Pengaturan > Layanan**; pengguna memilihnya dari
`/catalog` atau langsung di form tiket.

| Konsep | Isi |
|---|---|
| `services` | nama, kode, deskripsi, service owner, unit pendukung, tim default, SLA default |
| `service_items` | nama, kode, deskripsi, `approval_mode`, SLA item, urutan |
| `tickets.service` / `service_item` | layanan dan item yang dipilih saat intake/triage |
| `tickets.requested_for` | pemohon sebenarnya bila staf mencatat atas nama pengguna lain |
| `tickets.location` | poli/ruangan/lokasi perangkat |
| `tickets.approval_mode` | snapshot mode approval saat tiket dibuat |

Mode approval per item:

| Mode | Perilaku |
|---|---|
| `none` | tanpa approval; cocok untuk reset password atau permintaan rutin |
| `manager` | manajer unit; bila tidak ada, fallback ke IT Lead |
| `lead` | IT Lead saja |
| `cab` | manajer unit → IT Lead → CAB (CAB hanya untuk CR high risk) |
| `default` | perilaku lama: manajer unit → IT Lead → CAB |

Prioritas SLA: **SLA item → SLA default layanan → policy tipe × prioritas**.
Tiket menyimpan `sla_policy` dan `sla_snapshot`, sehingga perubahan katalog
tidak mengubah tiket lama.

Triage (`POST /api/itsm/tickets/{id}/triage`) hanya untuk staf IT, hanya pada
status `open`/`assigned`, dan hanya sebelum ada approval yang diputuskan. Staf
dapat mengubah prioritas, dampak, kategori, layanan, item, dan lokasi. Bila
layanan/item berubah, alur approval yang masih pending dibangun ulang; SLA
dihitung ulang dari waktu tiket dibuat dan breach/escalation lama dibersihkan
(nilainya tetap tersimpan di audit). Triage wajib menyertakan alasan minimal 5
karakter.

Staf juga dapat mencatat tiket dari kanal non-web (`source` = `phone`,
`email`, `whatsapp`) dan mengisi `requested_for`, `reporter_name`, serta
`reporter_contact`. Requester biasa selalu tercatat sebagai dirinya sendiri.

Change Request wajib mengisi `change_outcome` (`successful`, `partial`,
`failed`, `rolled_back`) saat resolved; `actual_start` diisi saat pekerjaan
dimulai dan `actual_end` saat resolved.

## Intake QR publik

Setiap unit dapat memiliki satu titik QR. Staf memindai stiker, mengisi form
tanpa login, dan tiket langsung masuk ke antrean tim yang tepat.

- **Pengaturan > Titik QR** (Kepala IT): buat titik dengan unit, lokasi, dan
  batas tiket per jam; cetak lembar A5, salin tautan, rotasi token, atau
  nonaktifkan titik.
- **URL publik** `/i/{token}`: hanya menampilkan nama rumah sakit, logo, layanan
  aktif, item, dan pilihan dampak. Tidak ada daftar pengguna, aset, tiket, atau
  data internal lain.
- **Identitas:** pelapor mengisi nama dan email/WhatsApp. Tiket memakai
  `requester` kosong, `reporter_name`/`reporter_contact` terisi, dan unit diambil
  dari titik QR — bukan dari body request.
- **Lampiran:** maksimal 3 file, 10 MB per file (PDF, PNG, JPG, WEBP, TXT, LOG).
  Screenshot bug bisa dikirim sejak awal. Lampiran tamu disimpan tanpa akun
  pengunggah.
- **Alur tiket:** `source=web`, `intake_channel=qr`, `intake_ref` = titik QR.
  SLA, approval, dan penugasan berjalan sama seperti tiket lain.
- **Status & CSAT tamu:** setiap tiket QR mendapat `public_token` acak. Pelapor
  dapat membuka `/t/{token}` tanpa login untuk melihat status, komentar publik,
  target SLA, dan ringkasan penyelesaian. Setelah tiket `resolved`/`closed`,
  halaman yang sama menampilkan form CSAT satu kali. Komentar internal, daftar
  pengguna, aset, dan audit mentah tidak pernah dikirim ke halaman publik.
- **Email konfirmasi:** bila kontak pelapor berupa email, sistem mengantrekan
  email berisi nomor tiket dan tautan status. Kegagalan antrean tidak membatalkan
  tiket. Kontak WhatsApp/telepon tetap mendapat tautan di layar sukses.
- **Pengamanan:** rate limit per titik (default 20/jam), honeypot, token yang
  dapat dicabut, attestation data pasien wajib, serta validasi tipe/ukuran
  lampiran. Batas per IP tidak dipakai karena di produksi semua request melewati
  reverse proxy yang sama.
- **Batasan:** tautan status hanya membuka satu tiket dan tidak dapat dipakai
  untuk menulis komentar. Change Request tetap tidak dapat diajukan dari kanal
  publik.

## Lampiran saat membuat tiket

Form buat tiket menerima sampai 3 lampiran sebelum tiket dikirim. Setelah tiket
dibuat, frontend mengunggah lampiran ke endpoint lampiran yang sudah ada; bila
salah satu gagal, tiket tetap tersimpan dan detail tiket menampilkan peringatan
agar lampiran bisa diunggah ulang secara manual.

## Problem dan pengetahuan

Problem mengelompokkan beberapa insiden yang berbagi akar masalah. Artikel
pengetahuan menyimpan SOP dan known error agar tidak diselesaikan dari nol.

### Problem

- Dibuat dari detail tiket (**Buat problem**) atau dari halaman **Problem**.
- Satu problem dapat memiliki banyak tiket lewat `problem_tickets`; tiket
  menyimpan problem utama di `tickets.problem`.
- Status: `identified → investigating → known_error → resolved → closed`.
- `known_error` wajib memiliki **root cause** dan **workaround**.
- `resolved` wajib memiliki **permanent fix** dan mengisi `resolved_at`.
- `closed` hanya dari `resolved`.
- Requester tidak dapat membaca problem; hanya staf IT dan akun platform.
- Halaman problem menampilkan tiket terkait dan artikel yang ditautkan.

### Pengetahuan

- Artikel disimpan sebagai `draft`, diajukan `review` oleh staf, lalu
  `published` atau `retired` oleh IT Lead.
- Visibilitas `internal` hanya untuk staf IT; `public` dapat dibaca requester
  setelah artikel terbit.
- Artikel dapat ditautkan ke layanan, problem, dan tiket. Membuat artikel dari
  detail tiket langsung menautkannya ke tiket tersebut.
- Pencarian `GET /api/itsm/knowledge/search` hanya mengembalikan artikel terbit;
  requester dibatasi ke artikel publik, staf dapat melihat artikel internal.
- Jika artikel terkait problem berstatus `known_error`, hasil pencarian membawa
  workaround sehingga form intake dapat menampilkannya sebelum tiket dibuat.

Route:

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/itsm/problems` | Buat problem; opsional tautkan `ticket_id` |
| PATCH | `/api/itsm/problems/{id}` | Ubah status, root cause, workaround, permanent fix |
| POST | `/api/itsm/problems/{id}/tickets` | Tautkan tiket ke problem |
| POST | `/api/itsm/knowledge` | Buat artikel draft; opsional tautkan `ticket_id` |
| PATCH | `/api/itsm/knowledge/{id}` | Ubah isi/visibilitas/tag atau ajukan review |
| POST | `/api/itsm/knowledge/{id}/publish` | Terbitkan/pensiunkan; hanya IT Lead |
| GET | `/api/itsm/knowledge/search` | Cari artikel terbit + known error/workaround |

## Insiden mayor

Insiden mayor adalah satu induk untuk gangguan besar (mis. SIMRS atau jaringan
mati) sehingga puluhan tiket tidak ditangani terpisah.

- **Deklarasi**: dari halaman **Insiden mayor** atau tombol **Deklarasikan** di
  detail tiket. Nomor otomatis `INC-YYYYMMDD-XXXXXX`, severity `SEV-1/2/3`,
  komandan (default pembuat), layanan terdampak, dan tiket sumber.
- **Broadcast**: saat deklarasi dan setiap perubahan status, staf IT rumah sakit
  dan lead vendor menerima notifikasi in-app + email sesuai preferensi. Update
  `public` juga dikirim ke pemilik tiket terdampak; update `internal` tidak.
- **Status**: `declared → investigating → mitigating → monitoring → resolved →
  closed`. Insiden `resolved` dapat dibuka kembali ke `investigating`.
- **Resolusi** wajib ringkasan pemulihan. **Penutupan** hanya dari `resolved`
  dan wajib PIR lengkap: root cause + aksi perbaikan (`pir_completed_at`,
  `pir_by`).
- **Tiket terdampak**: tautkan banyak tiket dengan relasi
  `impacted/caused/related`; `tickets.major_incident` menyimpan insiden utama
  dan detail tiket menampilkan tautan ke insiden.
- **Timeline**: update berkala (update/keputusan/komunikasi) dengan visibilitas
  internal atau publik, lengkap dengan penulis dan waktu.
- **Laporan**: panel **Insiden mayor** di halaman Laporan menampilkan total,
  aktif, MTTR median, PIR selesai, dan tren bulanan.
- Requester tidak dapat membaca detail insiden; hanya staf IT dan akun platform.

Route:

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/itsm/incidents` | Deklarasikan insiden; opsional `source_ticket` |
| PATCH | `/api/itsm/incidents/{id}` | Ubah status/severity/komandan/layanan/PIR |
| POST | `/api/itsm/incidents/{id}/updates` | Update komunikasi internal/publik |
| POST | `/api/itsm/incidents/{id}/tickets` | Tautkan tiket terdampak |
| GET | `/api/itsm/incidents/stats` | Statistik MTTR/PIR untuk laporan |

## Asset/CI, CSAT, dan laporan operasional

- Aset/CI menyimpan tipe, status, criticality, lokasi, unit, layanan utama,
  penanggung jawab, garansi, dan catatan. Nomor aset dibuat otomatis bila
  kosong. `service_cis` disinkronkan dari layanan utama.
- Aset dapat ditautkan ke tiket saat intake atau dari detail tiket dengan relasi
  `affected/caused/related`; detail aset menampilkan riwayat tiket.
- Requester dapat memilih aset terdampak lewat `GET /api/itsm/assets/options`
  (data ringkas), sedangkan daftar aset penuh dan detail hanya untuk staf.
- CSAT hanya dapat dikirim requester setelah tiket `resolved`/`closed`, satu
  respons per tiket. Staf dan requester dapat melihat skor/komentar.
- Laporan operasional memakai rentang laporan yang sama: insiden per layanan,
  problem teratas, pemakaian KB, CSAT per layanan, dan ringkasan SLA, plus ekspor
  CSV.

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/itsm/assets` | Buat aset; nomor otomatis bila kosong |
| PATCH | `/api/itsm/assets/{id}` | Ubah aset dan sinkronkan service CI |
| GET | `/api/itsm/assets/{id}` | Detail aset + service CI + riwayat tiket |
| GET | `/api/itsm/assets/options` | Opsi aset ringkas untuk intake |
| GET | `/api/itsm/tickets/{id}/assets` | Aset yang tertaut ke tiket |
| POST | `/api/itsm/tickets/{id}/assets` | Tautkan aset ke tiket |
| DELETE | `/api/itsm/tickets/{id}/assets/{assetId}` | Lepas aset dari tiket |
| GET | `/api/itsm/tickets/{id}/csat` | Baca CSAT tiket |
| POST | `/api/itsm/tickets/{id}/csat` | Kirim CSAT (requester, resolved/closed) |
| GET | `/api/itsm/reports/operations` | Laporan operasional JSON |
| GET | `/api/itsm/reports/operations.csv` | Ekspor CSV operasional |

## Approval berjenjang

Secara default, Service Request dan Change Request memakai **dua sampai tiga
tahap berurutan**. Bila tiket memakai item katalog, `approval_mode` item
menggantikan alur default (termasuk `none` untuk permintaan rutin):

1. **Manajer unit pemohon** — hanya jika unit tersebut punya `manager` aktif.
   Bila belum ditunjuk, tahap ini dilewati dan alur langsung ke IT Lead.
2. **IT Lead** — siapa pun yang ber-role `it_lead` boleh memutuskan.
3. **CAB** — hanya untuk Change Request dengan `change_risk=high` **dan** tenant
   punya minimal dua IT Lead aktif. Tahap ini harus diputuskan IT Lead yang
   berbeda dari tahap 2 (empat mata). Bila hanya ada satu lead, tahap ini
   dilewati saat pembuatan agar perubahan tidak macet.

- Pekerjaan (`in_progress`) baru bisa dimulai setelah **semua** tahap approved.
- Setiap tahap disimpan di `ticket_approvals` (approver, status, catatan,
  `due_at`, `acted_by`, `acted_at`), sehingga riwayatnya jelas di stepper detail
  tiket dan audit log.
- Penolakan menghentikan alur (`approval_status=rejected`). IT Lead dapat
  menyetujui ulang sebagai override; semua tahap yang tersisa ikut ditandai
  approved dengan catatan yang sama.
- Notifikasi "menunggu persetujuan" dikirim ke approver tahap aktif; keputusan
  akhir/penolakan diberitahukan ke requester.
- Manajer unit tidak harus ber-role staf IT; rule baca tiket/komentar/lampiran
  diperluas ke `unit.manager`, jadi ia bisa membuka tiket unitnya.
- Manajer unit ditunjuk lewat **Pengaturan > Unit > Manajer unit**.

### Delegasi approver

Approver yang sedang cuti tidak perlu memblokir alur:

- Approver tahap aktif **atau IT Lead mana pun** dapat menekan **Delegasikan**
  di detail tiket, memilih pengganti, dan menulis alasan (wajib ≥ 5 karakter).
- Pengganti harus aktif di tenant yang sama. Tahap IT Lead dan CAB hanya boleh
  didelegasikan ke IT Lead; tahap manajer unit boleh ke pengguna aktif mana pun.
- CAB tidak boleh didelegasikan ke lead yang baru saja menyetujui tahap 2.
- Approver asli tetap tercatat (`delegated_from`, `delegated_by`,
  `delegated_at`, `delegation_note`) dan tampil di stepper serta timeline.
  Audit menulis aksi `delegate`.
- Penerima delegasi otomatis masuk `tickets.delegates` sehingga bisa membuka
  tiket (termasuk komentar/lampiran publik) meski bukan staf atau manajer unit.
- Delegasi hanya berlaku untuk tahap yang sedang menunggu; tidak ada delegasi
  otomatis dari kalender cuti dan belum ada pencabutan delegasi.

### SLA per tahap approval

- Setiap tahap punya `due_at` sendiri, dihitung dari kebijakan saat tahap itu
  **aktif** (bukan saat tiket dibuat). Tahap berikutnya mendapat tenggat baru.
- `tickets.approval_due_at` selalu mencerminkan tahap aktif dan dipakai scan
  breach serta `sort=due`; riwayat tenggat tiap tahap tersimpan di
  `ticket_approvals.due_at`.
- Setelah approval final, gate SLA pindah ke `resolution_due_at` (SR) atau
  `planned_end` (CR).

Belum termasuk: tahap CAB dengan peran/komite terpisah, delegasi otomatis
berdasarkan kalender cuti, dan pencabutan delegasi sebelum tahap diputuskan.

## SLA, jeda, dan eskalasi

- Jam penyelesaian memakai kalender bisnis dari `sla_snapshot`/policy aktif
  (Senin–Jumat 08:00–17:00 **waktu lokal rumah sakit**, kritis 24/7, sadar hari
  libur).
- Saat tiket masuk `waiting`, `sla_paused_at` diisi dan scan breach melewati
  tiket tersebut. Saat dilanjutkan, `resolution_due_at` dan `next_due_at`
  digeser persis selama jeda, dan totalnya dicatat di `sla_paused_minutes`.
- Reopen memulai siklus SLA penyelesaian baru dari waktu reopen memakai policy
  aktif. Breach dan level eskalasi lama dibersihkan, tetapi riwayat breach tetap
  ada di audit log dan timeline.
- **Pengingat pra-SLA**: scan 5 menit memeriksa tenggat respons, approval, dan
  penyelesaian yang tinggal ≤ 30 menit. Satu peringatan per fase dikirim ke
  assignee (atau Kepala IT bila belum ada assignee; approver aktif untuk fase
  approval), tercatat sebagai audit `sla_warn`, dan tidak berulang karena
  `*_warned_at`. Penanda direset saat triage, reopen, tahap approval berikutnya,
  atau saat pekerjaan dilanjutkan dari `waiting`.
- Eskalasi berjenjang oleh scan 5 menit:
  `1` = breach respons/approval, `2` = breach penyelesaian, `3` = breach
  penyelesaian yang belum ditangani 4 jam. Level 2+ tampil sebagai badge
  "Eskalasi Lx" di detail dan antrean dashboard, dan setiap kenaikan level
  menulis event `escalate` ke timeline. Notifikasi memakai in-app + email;
  WhatsApp belum ada.

### Zona waktu

SLA dihitung pada zona waktu rumah sakit, bukan pada offset tetap WIB:

- Zona diambil dari `sla_snapshot.timezone` (disalin dari policy saat tenggat
  dibuat). Bila policy tidak punya zona, dipakai `tenants.timezone`. Mengubah
  zona rumah sakit di Konsol Vendor ikut menyelaraskan policy SLA-nya.
- Cara mengubah zona: instalasi baru lewat wizard `/setup`; instalasi
  standalone lewat **Pengaturan → Identitas** (hanya Kepala IT, tercatat di
  audit, policy SLA dan jadwal laporan ikut disesuaikan); instalasi vendor lewat
  **Konsol Vendor** (Kepala IT rumah sakit tidak boleh mengubahnya sendiri).
  Nama zona divalidasi terhadap basis data IANA.
- Perhitungan sadar DST dan batas hari lokal. Basis data zona IANA diambil dari
  `backend/zoneinfo.zip` lewat environment `ZONEINFO`; file ini dibundel supaya
  hasilnya sama di Windows, Linux, dan container. Tanpa itu Go hanya mengenal
  UTC dan SLA menjadi salah tanpa pesan error — saat bootstrap server mencetak
  `PERINGATAN` bila zona tidak termuat.
- `holidays.date` dibaca sebagai tanggal kalender lokal, bukan instan UTC,
  sehingga hari libur tidak bergeser sehari pada zona negatif.
- Snapshot menyimpan zona yang dipakai, jadi perbaikan zona tidak mengubah
  tenggat tiket lama (tanggal tenggatnya sudah berupa instan UTC).
- Perbarui basis data zona dengan `npm run pb:zoneinfo` (memerlukan Go; menyalin
  `$GOROOT/lib/time/zoneinfo.zip`).

## Mode tenancy

Kode yang sama dipakai pada dua bentuk instalasi. Bentuk instalasi ditentukan
environment `TENANCY_MODE` (bukan setting database, dan tidak dapat dinaikkan
dari dalam aplikasi):

| Mode | Isi `tenants` | Konsol Vendor | Login akun vendor |
|---|---|---|---|
| `standalone` (default) | tepat 1 baris | tersembunyi | ditolak (403) |
| `vendor` | banyak baris | aktif | diizinkan |

Nilai tidak dikenal jatuh ke `standalone` (gagal tertutup). Isinya bisa
diletakkan di `.env` (dibaca `scripts/lib/pocketbase.mjs` dan diteruskan ke
PocketBase, sama seperti Docker) atau dari shell:

```powershell
$env:TENANCY_MODE="vendor"; npm run dev
```

Perubahan mode tidak mengubah data: instalasi standalone bisa dinaikkan ke
vendor kapan saja.

Mode ditegakkan di tiga tempat, karena API rule PocketBase statis dan tidak bisa
membaca environment:

1. `onRecordAuthRequest` menolak login **dan refresh** akun platform saat mode
   bukan vendor, sehingga sesi lama tidak bertahan.
2. Route `/api/itsm/platform/*` memanggil `tenancy.assertVendor()`.
3. Frontend menyembunyikan menu dari `GET /api/itsm/app-meta`.

### Konsol Vendor

Hanya untuk akun `is_platform_staff`. `role` tetap menentukan kewenangan:
`it_lead` = admin konsol (boleh membuat/mengubah), `it_support` = hanya baca.

| Kemampuan | Keterangan |
|---|---|
| Daftar rumah sakit | Nama, kode, zona waktu, status, jumlah pengguna, tiket aktif |
| Tambah rumah sakit | Membuat tenant + data master default + akun IT pertama dalam satu transaksi |
| Data master default | 10 unit, 9 kategori, 12 kebijakan SLA, 3 hari libur, 6 layanan + 7 item; idempoten, bisa diulang |
| Data master per RS | Kelola unit, kategori, kebijakan SLA, dan hari libur setelah RS berjalan |
| Pengguna tenant | Tambah pengguna, aktif/nonaktif, reset password |
| Audit | Setiap aksi menulis `audit_logs` dengan `actor_role` berawalan `platform_` |

Semua pembacaan lintas tenant dilakukan di server dengan filter eksplisit. Akun
platform tidak membaca koleksi lewat rule tenant biasa; cabang
`is_platform_staff` dibahas di bagian berikut.

### Vendor sebagai resolver tiket

Akun vendor tidak berhenti di konsol: mereka mengerjakan tiket rumah sakit.

| Kemampuan | Keterangan |
|---|---|
| Pemilih rumah sakit | Dropdown di top bar; pilihan tersimpan dan menjadi konteks kerja |
| Antrean tiket | `Tiket` di sidebar menampilkan tiket rumah sakit aktif, termasuk "Tiket saya" |
| Assignee | Staf vendor muncul bersama staf rumah sakit di dropdown assignee |
| Kerja tiket | Komentar (publik/internal), mulai, menunggu, selesaikan, tutup, buka kembali |
| Approval | Lead vendor bisa menyetujui tahap IT Lead/CAB dan menerima delegasi |
| Notifikasi | Penugasan, komentar, approval, dan tiket kritis ikut masuk ke akun vendor |
| Laporan lintas RS | Compliance dan median per rumah sakit, plus tabel perbandingan antar RS |
| Audit lintas RS | Jejak aktivitas semua RS: aktor, aksi, tiket/data master, perubahan, IP |

Aturan mainnya:

- Vendor **membaca** data semua rumah sakit lewat cabang rule
  `is_platform_staff = true`; penulisan tetap lewat route `/api/itsm/*`.
- Vendor **tidak bisa membuat tiket** (akun platform tidak punya tenant/unit)
  dan tidak bisa mengubah data master rumah sakit dari UI tiket.
- Gate CAB tetap menghitung IT Lead rumah sakit saja, agar jumlah akun vendor
  tidak mengubah alur approval tenant.
- Setiap aksi tercatat di `audit_logs` milik rumah sakit terkait dengan
  `actor_role` `platform_*`, jadi IT Lead rumah sakit bisa melihatnya.
- Pemilih tenant adalah filter UI, bukan batas keamanan: vendor memang boleh
  melihat semua RS.
- Pemilih mengikuti tiket yang dibuka. Membuka tiket RS lain lewat tautan atau
  notifikasi akan memindahkan pemilih ke RS pemilik tiket, dan mengganti RS
  saat halaman detail terbuka akan kembali ke daftar tiket RS yang baru
  (tidak pernah menampilkan tiket RS lain di bawah pemilih yang berbeda).

## Tenant

`tenants` adalah identitas organisasi (rumah sakit) sekaligus batas isolasi
data. Setiap akun rumah sakit memiliki tepat satu `tenant`; akun platform tidak
punya tenant sama sekali. Backend mengambil tenant dari `e.auth`, bukan dari body
request, dan seluruh API rule memfilter `tenant = @request.auth.tenant`.

- Satu baris seed: `Rumah Sakit Contoh` (`RS01`), `Asia/Jakarta`, aktif.
- Sidebar menampilkan `name` dan `code` tenant (avatar diambil dari inisial
  nama), bukan teks hardcoded.
- Menonaktifkan tenant (`is_active = false`) memblokir login baru semua
  penggunanya karena rule auth user memakai `tenant.is_active`. Sesi yang sedang
  berjalan tetap hidup sampai token akses kedaluwarsa.
- Di mode vendor, tenant dibuat dan diubah dari Konsol Vendor. Di mode
  standalone, tenant tunggal tetap dapat diubah superuser lewat Admin UI.
- `timezone` tenant disimpan dan dipakai saat membuat kebijakan SLA default
  tenant baru, tetapi perhitungan SLA tetap memakai `sla_policies.timezone`.
- Akun vendor diarahkan ke `/platform` setelah login; semua route ruang kerja
  tenant (`/tickets`, `/dashboard`, `/admin`, `/reports`) mengalihkannya kembali.

## Dashboard dan antrean kerja

Staff IT dan Kepala IT mendarat di `/dashboard` setelah login; Pemohon dan
Teknisi diarahkan ke `/tickets`, sedangkan Pengamat ke `/reports`. Menu
Ringkasan hanya tampil untuk Staff IT/Kepala IT.

| Kartu / panel | Isi |
|---|---|
| Tiket aktif | semua tiket yang belum `resolved`/`closed` |
| Kritis | prioritas `critical` pada tiket aktif |
| SLA lewat | salah satu `*_breach_at` terisi |
| Belum di-assign | tiket aktif tanpa assignee |
| Menunggu approval | `approval_status = pending` |
| Antrean saya | assignee = user, urut breach lalu tenggat terdekat |
| Perlu perhatian | breach atau jatuh tempo ≤ 24 jam |
| Beban per unit / Usia tiket | agregat tiket aktif per unit dan umur |

Daftar tiket menerima query param berikut sehingga tautan dari dashboard selalu
mereproduksi tampilan yang sama:

| Param | Nilai |
|---|---|
| `scope` | `active` (belum resolved/closed) |
| `status` | `open`, `assigned`, `in_progress`, `resolved`, `closed`, `reopened` |
| `priority` | `critical`, `high`, `normal`, `low` |
| `assignee` | `mine`, `unassigned` |
| `sla` | `breached` |
| `approval` | `pending` |
| `q` | pencarian nomor tiket / judul |
| `sort` | `created`, `created_asc`, `updated`, `due` |
| `page` | halaman (25/50/100 per halaman) |

`sort=due` memakai field `next_due_at` — SLA gate yang masih berlaku
(approval untuk SR/CR, resolution untuk incident). Tanpa field ini Change
Request akan selalu muncul di atas karena tidak punya resolution SLA.

## Laporan SLA

Menu **Laporan** (`/reports`) tersedia untuk Kepala IT dan Pengamat. Halaman ini memakai
route server-side, bukan agregasi di browser seperti dashboard, sehingga angkanya
konsisten untuk rentang tanggal berapa pun.

Akun vendor (lead) memakai halaman yang sama dengan tambahan filter **Rumah
sakit**:

- **Semua rumah sakit** — ringkasan gabungan, tabel **Perbandingan rumah sakit**,
  dan kolom tenant pada daftar breach terbaru serta ekspor CSV.
- **Satu rumah sakit** — tampilan seperti IT Lead rumah sakit tersebut (tanpa
  tabel perbandingan, header CSV lama).

Median dihitung dari gabungan seluruh tiket pada cakupan terpilih, bukan
rata-rata median per rumah sakit, jadi angka gabungan tetap benar.

| Bagian | Isi |
|---|---|
| Ringkasan | tiket dibuat, selesai, compliance, median respons, median resolusi |
| Perbandingan RS | khusus vendor: total, selesai, breach, compliance, median per rumah sakit |
| Tren | jumlah dibuat/selesai/breach dan compliance per bulan atau per minggu |
| Per unit | total, selesai, breach, compliance per unit pemohon |
| Per layanan | agregat yang sama per layanan; tiket tanpa layanan masuk "Tanpa layanan" |
| Per prioritas / jenis | agregat yang sama per prioritas dan jenis tiket |
| Breach terbaru | 20 tiket breach terakhir dengan level eskalasi dan status |
| Unduh CSV | satu baris per tiket pada rentang terpilih |
| Cetak / PDF | dialog cetak browser dengan sidebar, filter, dan tombol aksi disembunyikan |
| Laporan terjadwal | ringkasan email mingguan (Senin 07.00 waktu lokal RS) atau bulanan (tanggal 1, 07.00 waktu lokal RS) ke seluruh Kepala IT aktif |

Definisi angka:

- Basis laporan adalah tiket yang **dibuat** pada rentang tanggal (zona rumah
  sakit yang dilihat; vendor dapat mengirim `?timezone=`), bukan tiket yang
  berubah pada rentang itu.
- `Breach` = salah satu dari `response_breach_at`, `approval_breach_at`, atau
  `resolution_breach_at` terisi. Compliance = `(total − breach) / total`.
- Median respons memakai `first_response_at − created`; median resolusi memakai
  `resolved_at − created` dan hanya tiket yang sudah selesai.
- Semua selisih waktu memakai menit kalender, bukan jam kerja.

Rentang default 90 hari terakhir, maksimal 366 hari; `from`/`to` memakai format
`YYYY-MM-DD` pada zona laporan. Parameter `bucket=week` mengganti tren bulanan
menjadi mingguan (ISO week), dan `timezone=Nama/Zona` memilih zona laporan
(divalidasi terhadap basis data IANA; default zona rumah sakit yang dilihat).
CSV memakai pemisah koma, UTF-8 dengan BOM agar rapi di Excel, dan berisi kolom
tiket, unit, kategori, tanggal lokal (`created_local`, `first_response_local`,
`resolved_local`), menit respons/resolusi, status breach, level eskalasi, kode
resolusi, dan jumlah reopen.

Tombol **Cetak / PDF** membuka dialog cetak browser dengan sidebar, filter, dan
tombol aksi disembunyikan; pengguna dapat memilih "Save as PDF". Jadwal laporan
diatur oleh Kepala IT dari halaman Laporan: mingguan setiap Senin atau bulanan
setiap tanggal 1, pukul 07.00 waktu lokal rumah sakit. Cron mengirim ringkasan
ke seluruh Kepala IT aktif, dengan tautan ke halaman laporan. Tombol **Kirim
sekarang** memakai ringkasan yang sama untuk pengujian atau laporan manual.

Contoh query:

```text
GET /api/itsm/reports/sla?from=2026-08-01&to=2026-10-31&bucket=month
GET /api/itsm/reports/sla?from=2026-08-01&to=2026-10-31&timezone=Asia/Makassar
GET /api/itsm/reports/sla.csv?from=2026-08-01&to=2026-10-31
```

## Audit rumah sakit

Menu **Audit** (`/audit`) tersedia untuk **Kepala IT** dan **Pengamat**.
Pengamat hanya membaca: tidak ada tombol ubah/hapus, dan seluruh data dibatasi
ke tenant-nya sendiri.

- Route: `GET /api/itsm/audit` (filter tanggal, aktor, aksi, cakupan, nomor
  tiket).
- Rule koleksi `audit_logs` tetap hanya untuk Kepala IT; Pengamat membaca lewat
  route server yang mengambil tenant dari `e.auth`.
- Vendor tetap memakai `/api/itsm/platform/audit` untuk lintas rumah sakit.

## Riwayat aktivitas dan realtime

Halaman detail tiket punya tab **Riwayat** di samping komentar. Datanya berasal
dari `audit_logs` lewat route `GET /api/itsm/tickets/{id}/timeline`, bukan dari
list rule audit (yang tetap khusus IT Lead). Route memproyeksikan satu event per
aksi — create, assign, transition, triage, problem_link, knowledge_link,
approve/reject, comment, attachment,
sla_breach — dan menyembunyikan komentar/lampiran internal dari requester.

- Tiap event berisi aktor, aksi, perubahan yang aman ditampilkan, dan waktu.
  IP dan user-agent tidak pernah dikirim ke client.
- Riwayat dimuat ulang otomatis saat tiket berubah.
- Detail tiket berlangganan realtime untuk record tiket, komentar, dan lampiran
  (`subscribe` PocketBase). Event hanya memicu muat ulang data dengan debounce
  150 ms, jadi status, komentar, dan lampiran tampil tanpa refresh manual.
- Indikator `Live` di panel aktivitas menunjukkan koneksi SSE aktif; jika
  terputus, tampil `Offline` dan halaman tetap bisa dipakai.

Realtime tetap menghormati API rule: requester hanya menerima event komentar
publik pada tiket yang boleh dia lihat.

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

## Production

Docker **hanya** dipakai untuk production / verifikasi tingkat production.
Development tidak memerlukan Docker.

### 1. Siapkan server

- DNS `APP_DOMAIN` mengarah ke server.
- Port 80 dan 443 terbuka.
- Docker + Compose terpasang.
- Buat direktori backup dan pastikan dapat ditulis UID container:

```bash
mkdir -p backups
sudo chown -R 10001:10001 backups
```

### 2. Konfigurasi

```bash
cp .env.example .env
# edit APP_DOMAIN, ACME_EMAIL, PB_VERSION, SMTP_*, APP_URL
```

`PB_VERSION` harus versi eksplisit. Jangan gunakan `latest`. Untuk produksi,
isi `SMTP_*` dengan relay organisasi dan `APP_URL=https://$APP_DOMAIN` agar
tautan email mengarah ke domain publik.

### 3. Build dan jalankan

```bash
docker compose up -d --build
docker compose ps
curl -fsS https://$APP_DOMAIN/api/health
```

Caddy menangani TLS, static SPA, security headers, dan proxy `/api/*`.
Admin UI tidak dipublikasikan. Untuk akses darurat:

```bash
ssh -L 8090:127.0.0.1:8090 user@server
# buka http://127.0.0.1:8090/_/
```

### 4. Setup awal

Buka `https://$APP_DOMAIN`. Instalasi baru langsung dialihkan ke `/setup`.
Kode setup dibuat server dan tersimpan di volume data:

```bash
docker compose exec pocketbase cat /pb/pb_data/setup_token
```

Setelah form setup selesai (identitas rumah sakit + akun Kepala IT, atau akun
vendor pada `TENANCY_MODE=vendor`), kode dihapus dan `/setup` tertutup. Untuk
otomatisasi, setel `SETUP_TOKEN` di `.env` sebelum `docker compose up`.

### 5. Superuser PocketBase (opsional)

```bash
docker compose exec pocketbase \
  /usr/local/bin/pocketbase superuser create admin@rs.example.com 'PasswordKuat123!' \
  --dir=/pb/pb_data
```

Hanya untuk akses darurat Admin UI lewat tunnel SSH, bukan untuk operasional
harian.

### 6. Setelah deploy

- Tambah anggota tim lewat **Pengaturan → Tim** (bukan Admin UI).
- Uji login, intake QR, komentar, lampiran, audit.
- Pastikan backup berjalan.
- Batasi akses SSH dan Admin UI.

## Backup dan restore

PocketBase membuat ZIP backup harian pukul 02:00 WIB melalui hook
`backend/pb_hooks/backup.pb.js`. ZIP berisi database dan file upload lokal.
Sidecar `backup` menyalin ZIP dari named volume ke `BACKUP_HOST_DIR`
(default `./backups`) setiap jam dan menghapus salinan host yang lebih tua dari
30 hari.

Yang **belum** otomatis: salinan off-host dan enkripsi. Lakukan salah satu:

```bash
# contoh: salin ke NAS
rsync -a backups/ backup@nas:/srv/healthcare-itsm/

# atau gunakan restic ke S3/MinIO
restic -r s3:https://... backup backups/
```

Restore:

1. Buat backup baru sebelum restore.
2. Hentikan traffic ke aplikasi.
3. Gunakan Admin UI `Settings > Backups > Restore`, atau hentikan container dan
   ganti isi volume dari ZIP backup.
4. Nyalakan kembali; cek login, tiket, komentar, dan unduh lampiran lama.
5. Uji restore minimal 3 bulan sekali.

Jangan menyalin `data.db` dengan `cp` saat PocketBase hidup. Gunakan backup ZIP
bawaan atau `sqlite3 .backup`.

## Migrations

Dev memakai `--automigrate=true`; perubahan collection dari Admin UI menghasilkan
file baru di `backend/pb_migrations/`. Review dan commit file tersebut.

```bash
# snapshot seluruh collection
npm run pb:migrate -- collections

# migration kosong
npm run pb:migrate -- create "add_something"
```

Production memakai `--automigrate=false`. Jangan mengubah skema lewat Admin UI di
production; deploy perubahan lewat image baru. Jangan mengedit migration yang
sudah diterapkan.

## Environment dan CORS

Frontend memakai `window.location.origin` secara default. API dan UI same-origin
lewat Caddy. `VITE_API_BASE_URL` hanya diperlukan bila API sengaja dipisah ke
origin lain.

Dev memakai proxy Vite untuk `/api` dan `/_`. PocketBase dijalankan dengan
`--origins` eksplisit (lihat `scripts/lib/pocketbase.mjs`), bukan `*`.

Environment yang dibaca backend:

| Variabel | Default | Keterangan |
|---|---|---|
| `TENANCY_MODE` | `standalone` | `vendor` mengaktifkan Konsol Vendor dan akun platform |
| `SETUP_TOKEN` | — | Kode setup awal; bila kosong server membuat sendiri di `<dataDir>/setup_token` |
| `PB_ENCRYPTION_KEY` | — | Enkripsi setting PocketBase (opsional) |
| `TZ` | `Asia/Jakarta` | Zona proses; hanya memengaruhi jam job cron instalasi (backup 02:00), bukan SLA |
| `ZONEINFO` | `backend/zoneinfo.zip` | Basis data zona IANA yang dibaca Go; wajib agar SLA per zona benar di luar Linux |
| `GOMEMLIMIT` | `512MiB` | Batas memori Go |

`TENANCY_MODE` dibaca saat request (bukan di-cache), jadi mengubahnya cukup
dengan restart PocketBase. Saat dev, seluruh isi `.env` diteruskan ke proses
PocketBase oleh `scripts/lib/pocketbase.mjs`.

## Desain antarmuka

UI memakai bahasa desain Atlassian/Jira, bukan komponen Bootstrap:

- Top bar putih 56 px + sidebar project 240 px dengan border tipis.
- Sidebar bisa diciutkan lewat tombol di kiri top bar menjadi rail ikon 56 px;
  label menu muncul sebagai tooltip saat hover/fokus, pilihan disimpan di
  `localStorage`, dan batas lebar halaman naik dari 1320 px ke 1680 px agar area
  konten memakai ruang yang terbebas. Di bawah 1081 px sidebar tetap menjadi
  drawer dengan label penuh.
- Warna aksen Atlassian Blue `#0052CC`, teks `#172B4D`, border `#DFE1E6`.
- Panel `.panel` memakai header abu `#F4F5F7` dengan border bawah `#DFE1E6`
  supaya judul panel terpisah jelas dari isinya; KPI card tetap putih tanpa
  header.
- Status memakai lozenge kecil (uppercase, 11 px, radius 2 px), prioritas memakai
  ikon chevron, bukan badge pil.
- Action bar tiket di bawah judul: transisi status, assignment, dan approval,
  dengan modal Jira-style untuk resolusi dan approval.
- Tabel issue yang padat, sticky-free, dengan skeleton loading.
- Tabel admin/laporan: judul kolom rata kiri mengikuti isi sel, sedangkan kolom
  angka (`.col-num`) rata kanan agar judul dan nilainya sejajar. Tabel tren
  memakai `table-layout: fixed` supaya kolom periode ringkas dan bar volume
  mengambil sisa lebar.
- Panel aktivitas tiket memakai tab **Komentar / Riwayat** dan indikator `Live`
  saat koneksi realtime PocketBase aktif.
- Login: satu kartu di tengah dengan latar gradien biru lembut dan pola titik halus; teks pendamping dihilangkan agar fokus ke form.
- Token dan seluruh komponen ada di `frontend/src/styles/app.css`; tidak ada
  dependency UI framework.

## Keamanan dan data pasien

- Tiket **tidak boleh** memuat nama pasien, NIK, nomor rekam medis, alamat, atau
  data identitas pasien lain.
- Form intake mewajibkan attestation; backend menolak tiket tanpa attestation.
- Lampiran disimpan sebagai protected file dan diakses dengan file token.
- Audit log append-only; API create/update/delete ditolak.
- Jangan mengunggah screenshot yang masih menampilkan identitas pasien.
- Deteksi data pasien bersifat kebijakan + attestation, bukan DLP otomatis.

## API route yang tersedia

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/itsm/tickets` | Buat tiket (auth) |
| GET | `/api/itsm/public/intake/{token}` | Meta form QR publik (tanpa auth) |
| POST | `/api/itsm/public/intake/{token}` | Buat tiket tamu dari QR; `payload` + `files` (tanpa auth) |
| GET | `/api/itsm/public/intake/{token}/logo` | Logo tenant untuk halaman QR (tanpa auth) |
| GET | `/api/itsm/public/tickets/{token}` | Status tiket tamu + pembaruan publik (tanpa auth) |
| POST | `/api/itsm/public/tickets/{token}/csat` | CSAT tamu setelah tiket selesai/ditutup (tanpa auth) |
| GET | `/api/itsm/public/tickets/{token}/logo` | Logo tenant untuk halaman status (tanpa auth) |
| GET/POST | `/api/itsm/intake-points` | Daftar / buat titik QR; hanya IT Lead |
| PATCH | `/api/itsm/intake-points/{id}` | Ubah titik QR; hanya IT Lead |
| POST | `/api/itsm/intake-points/{id}/rotate` | Rotasi token titik QR; hanya IT Lead |
| POST | `/api/itsm/tickets/{id}/assign` | Assign / lepas assignee (staff) |
| POST | `/api/itsm/tickets/{id}/transition` | Mulai, menunggu/lanjutkan, selesaikan, tutup, buka kembali |
| POST | `/api/itsm/tickets/{id}/merge` | Gabungkan tiket duplikat ke tiket tujuan; staff IT |
| POST | `/api/itsm/tickets/{id}/triage` | Koreksi prioritas/klasifikasi/layanan sebelum pekerjaan dimulai |
| POST | `/api/itsm/problems` | Buat problem; opsional tautkan tiket |
| PATCH | `/api/itsm/problems/{id}` | Ubah status/root cause/workaround/permanent fix |
| POST | `/api/itsm/problems/{id}/tickets` | Tautkan tiket ke problem |
| POST | `/api/itsm/knowledge` | Buat artikel draft |
| PATCH | `/api/itsm/knowledge/{id}` | Ubah artikel atau ajukan review |
| POST | `/api/itsm/knowledge/{id}/publish` | Terbitkan/pensiunkan artikel; hanya IT Lead |
| GET | `/api/itsm/knowledge/search` | Cari artikel terbit + workaround known error |
| POST | `/api/itsm/assets` | Buat aset/CI |
| PATCH | `/api/itsm/assets/{id}` | Ubah aset/CI |
| GET | `/api/itsm/assets/{id}` | Detail aset + riwayat tiket |
| GET | `/api/itsm/assets/options` | Opsi aset ringkas untuk intake |
| GET/POST | `/api/itsm/tickets/{id}/assets` | Lihat / tautkan aset ke tiket |
| DELETE | `/api/itsm/tickets/{id}/assets/{assetId}` | Lepas aset dari tiket |
| GET/POST | `/api/itsm/tickets/{id}/csat` | Baca / kirim CSAT |
| GET | `/api/itsm/reports/operations` | Laporan operasional |
| GET | `/api/itsm/reports/operations.csv` | Ekspor CSV operasional |
| POST | `/api/itsm/tickets/{id}/approval` | Setujui / tolak / delegasikan tahap approval aktif |
| POST | `/api/itsm/tickets/{id}/comments` | Komentar publik/internal |
| POST | `/api/itsm/tickets/{id}/attachments` | Upload lampiran (multipart) |
| GET | `/api/itsm/tickets/{id}/timeline` | Riwayat aktivitas tiket (proyeksi audit) |
| GET | `/api/itsm/reports/sla` | Laporan SLA (JSON); Kepala IT atau Pengamat |
| GET | `/api/itsm/reports/sla.csv` | Ekspor CSV per tiket; Kepala IT atau Pengamat |
| GET/PATCH | `/api/itsm/reports/schedule` | Baca/ubah jadwal laporan; hanya Kepala IT |
| POST | `/api/itsm/reports/schedule/run` | Kirim ringkasan laporan sekarang; hanya Kepala IT |
| GET/PATCH | `/api/itsm/profile` | Baca/ubah profil sendiri |
| POST/DELETE | `/api/itsm/profile/avatar` | Unggah/hapus foto profil |
| POST | `/api/itsm/profile/password` | Ganti password (verifikasi password lama) |
| POST | `/api/itsm/auth/forgot-password` | Minta tautan reset password (guest, respons generik) |
| POST/DELETE | `/api/itsm/tenant/logo` | Unggah/hapus logo rumah sakit; hanya IT Lead |
| PATCH | `/api/itsm/tenant` | Ubah zona waktu rumah sakit; hanya IT Lead, hanya instalasi standalone |
| GET | `/api/itsm/branding/logo` | Logo publik rumah sakit aktif (standalone) |
| GET | `/api/itsm/team` | Daftar anggota tim; hanya IT Lead |
| POST | `/api/itsm/team` | Tambah anggota (password awal dari sistem); hanya IT Lead |
| PATCH | `/api/itsm/team/{userId}` | Ubah nama/role/unit/status anggota; hanya IT Lead |
| POST | `/api/itsm/team/{userId}/password` | Reset password anggota; hanya IT Lead |
| GET | `/api/itsm/mail/status` | Status SMTP dan antrean email; hanya IT Lead |
| POST | `/api/itsm/mail/dispatch` | Kirim antrean email sekarang; hanya superuser |
| GET | `/api/itsm/app-meta` | Mode tenancy aktif (publik) |
| GET | `/api/itsm/setup/status` | Status setup awal + identitas RS untuk prefill (publik) |
| POST | `/api/itsm/setup` | Buat data awal + akun pertama; wajib kode setup (publik) |
| GET | `/api/itsm/audit` | Audit tenant; Kepala IT atau Pengamat |
| GET | `/api/itsm/platform/tenants` | Daftar rumah sakit + hitungan; akun vendor |
| GET | `/api/itsm/platform/audit` | Audit lintas rumah sakit; akun vendor |
| POST | `/api/itsm/platform/tenants` | Buat rumah sakit + seed + akun IT pertama; vendor admin |
| GET | `/api/itsm/platform/tenants/{id}` | Detail rumah sakit, pengguna, unit |
| PATCH | `/api/itsm/platform/tenants/{id}` | Ubah nama/kode/zona waktu/status |
| POST | `/api/itsm/platform/tenants/{id}/seed` | Lengkapi data master default |
| POST | `/api/itsm/platform/tenants/{id}/users` | Tambah pengguna rumah sakit |
| PATCH | `/api/itsm/platform/tenants/{id}/users/{userId}` | Ubah status/role/unit/password |
| GET | `/api/itsm/platform/tenants/{id}/master` | Data master rumah sakit (unit, kategori, SLA, hari libur, pengguna) |
| POST | `/api/itsm/platform/tenants/{id}/master/{kind}` | Tambah data master; vendor admin |
| PATCH | `/api/itsm/platform/tenants/{id}/master/{kind}/{recordId}` | Ubah/nonaktifkan data master; vendor admin |
| GET | `/api/collections/tickets/records` | List tiket sesuai API rules |
| GET | `/api/collections/services/records` | Katalog layanan; baca semua pengguna tenant |
| GET | `/api/collections/service_items/records` | Item permintaan per layanan |
| GET | `/api/collections/problems/records` | Problem; hanya staf IT/akun platform |
| GET | `/api/collections/problem_tickets/records` | Tiket terkait problem |
| GET | `/api/collections/knowledge_articles/records` | Artikel; requester hanya published + public |
| GET | `/api/collections/ticket_comments/records` | List komentar sesuai rules |
| GET | `/api/collections/ticket_attachments/records` | List lampiran sesuai rules |
| GET | `/api/collections/audit_logs/records` | Audit; hanya IT Lead |
| GET | `/api/collections/notifications/records` | Notifikasi milik sendiri |
| GET | `/api/health` | Healthcheck |

## Verifikasi lokal yang sudah dilakukan

- Suite otomatis lulus lokal (Windows): 49 unit test, 254 test API, dan 52
  skenario e2e — lihat bagian Testing.
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

## Scope berikutnya

- Laporan problem aging, repeat incident rate, KB usage/deflection, dan PIR
  khusus perubahan (PIR insiden mayor sudah tersedia).
- PIR insiden mayor otomatis membuat problem/KB dengan aksi perbaikan dan
  pemiliknya.
- Dynamic form dan checklist fulfillment per item layanan; penulisan katalog
  dari konsol vendor.
- Verifikasi email saat pemilik akun ingin mengganti alamat email.
- WhatsApp untuk notifikasi kritis; email sudah tersedia lewat SMTP.
- SSO SIMRS dan provisioning akun tanpa Admin UI.
- Hardening produksi: backup off-host terenkripsi + uji restore, alerting,
  pembatasan percobaan login, dan 2FA.
- Laporan lanjutan: PDF native di server (cetak/PDF browser dan jadwal email
  sudah tersedia), filter per unit, dan template laporan khusus direksi.
