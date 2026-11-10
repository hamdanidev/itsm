# Healthcare ITSM

Platform tata kelola layanan TI untuk rumah sakit: Incident, Service Request,
Change Request, Problem, dan Knowledge Base dalam satu portal yang terstruktur,
memiliki SLA, RBAC, dan audit trail.

Status: **Increment A–D selesai** — katalog layanan, problem dan knowledge base,
asset/CI, CSAT, laporan operasional, insiden mayor, multi-tenant, konsol vendor,
email transaksional, 2FA, impor tim dari CSV, dan runbook operasi.

Daftar fitur per rilis dan catatan verifikasi ada di
[`CHANGELOG.md`](CHANGELOG.md). Data model di
[`docs/DATA-MODEL.md`](docs/DATA-MODEL.md), daftar route di
[`docs/API.md`](docs/API.md), runbook operasi di
[`docs/OPERATIONS.md`](docs/OPERATIONS.md), perilaku per modul di
[`docs/FEATURES/`](docs/FEATURES/), panduan pengguna bergambar di
[`docs/USER-GUIDE/`](docs/USER-GUIDE/), dan strategi pengujian di
[`docs/TESTING.md`](docs/TESTING.md).

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
│   ├── lib/pocketbase.mjs     # resolver binary, checksum, args serve
│   └── ops/                   # ops:check + ops:restore-drill
├── docs/                      # API, roadmap, analisis, runbook operasi, catatan restore
├── tests/                     # unit, API, dan e2e
├── docker/
│   ├── Caddyfile
│   ├── entrypoint.sh
│   └── backup.sh
├── docker-compose.yml         # production (TLS + backup)
├── Dockerfile                 # production image
├── package.json               # dev tooling root
├── .env.example
├── CHANGELOG.md               # riwayat fitur + catatan verifikasi
└── README.md
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
route development khusus superuser (`/api/itsm/dev/*`, lihat [`docs/API.md`](docs/API.md));
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

## Panduan pengguna

Panduan untuk staf rumah sakit (bukan developer) ada di
[`docs/USER-GUIDE/`](docs/USER-GUIDE/): Markdown sebagai sumber, HTML dan PDF
dibangun dari file yang sama, dan **semua screenshot diambil otomatis** dari
instalasi demo. Panduan **v1.1** memuat delapan bab: pengantar ITSM ([ 0](docs/USER-GUIDE/00-pengantar.md)), masuk/akun/2FA
([`01`](docs/USER-GUIDE/01-masuk-dan-akun.md)), membuat dan memantau tiket
([`02`](docs/USER-GUIDE/02-pemohon.md)), pekerjaan service desk
([`03`](docs/USER-GUIDE/03-service-desk.md)), pengaturan/tim/laporan/audit
([`04`](docs/USER-GUIDE/04-admin.md)), konsol vendor
([`05`](docs/USER-GUIDE/05-vendor.md)), QR publik
([`06`](docs/USER-GUIDE/06-qr-publik.md)), dan lampiran
([`99`](docs/USER-GUIDE/99-lampiran.md)).

```bash
npm run guide:build    # HTML + gambar di docs/USER-GUIDE/dist/
npm run guide:pdf      # + PDF A4 dengan daftar isi dan nomor halaman
npm run guide:publish  # salin HTML ke frontend/public/panduan/ (URL /panduan/)
npm run guide:check    # validasi bab, gambar, dan manifest
```

Tautan **Bantuan** di topbar membuka `/panduan.html` (tab baru). Setel
`VITE_GUIDE_URL` untuk memakai URL lain, atau `VITE_GUIDE_URL=off` untuk
menyembunyikan tautan. Image Docker membangun panduan ini otomatis lewat stage
`frontend`, jadi `/panduan/` tersedia tanpa langkah tambahan.

Screenshot memakai instance terpisah supaya data rumah sakit tidak tersentuh:

```bash
PB_HTTP=127.0.0.1:8091 PB_DATA_DIR=.tmp/pb_data-guide node scripts/dev.mjs --pb-only
PB_TARGET=http://127.0.0.1:8091 VITE_DEV_PORT=5174 node scripts/dev.mjs --web-only
PB_DATA_DIR=.tmp/pb_data-guide npm run pb:superuser -- admin@itsm.local "PasswordKuat123!"
PB_URL=http://127.0.0.1:8091 npm run seed -- --profile busy --seed 42
GUIDE_BASE_URL=http://localhost:5174 GUIDE_PB_URL=http://127.0.0.1:8091 npm run guide:shots
```

Di PowerShell, setel tiap variabel dengan `$env:NAMA="nilai"` sebelum perintah.
Gambar didefinisikan di `docs/USER-GUIDE/shots.json`; jangan memakai tangkapan
layar manual. Aturan data pasien tetap berlaku: screenshot hanya dari tenant
demo.

## Testing

Strategi, perintah, dan cara menambah test ada di [`docs/TESTING.md`](docs/TESTING.md).
CI menjalankan build + unit + API pada setiap push/PR, lalu e2e Playwright di
job terpisah.
## Fitur

Detail perilaku tiap modul ada di [`docs/FEATURES/`](docs/FEATURES/); README
hanya ringkasan.

| Modul | Isi | Dokumen |
|---|---|---|
| Tiket | Alur status, merge duplikat, lampiran, antrean/papan, riwayat realtime | [TIKET.md](docs/FEATURES/TIKET.md) |
| Layanan | Katalog, triage, intake QR publik | [LAYANAN.md](docs/FEATURES/LAYANAN.md) |
| Problem & insiden | Problem, known error, KB, insiden mayor + PIR | [PROBLEM-INSIDEN.md](docs/FEATURES/PROBLEM-INSIDEN.md) |
| Mutu & laporan | Aset/CI, CSAT, laporan SLA & operasional, audit | [MUTU-LAPORAN.md](docs/FEATURES/MUTU-LAPORAN.md) |
| Proses | Approval berjenjang, SLA, jeda, dan eskalasi | [PROSES.md](docs/FEATURES/PROSES.md) |
| Platform | Mode tenancy, konsol vendor, tenant | [PLATFORM.md](docs/FEATURES/PLATFORM.md) |
| Akun & admin | Notifikasi, email, lupa password, logo, profil, pengaturan | [AKUN.md](docs/FEATURES/AKUN.md) |

## Production

Deploy produksi memakai Docker + Compose (Caddy menangani TLS dan proxy `/api/*`).
**Runbook lengkap — instalasi, operasi harian, upgrade/rollback, backup, restore,
insiden, dan rotasi log — ada di [`docs/OPERATIONS.md`](docs/OPERATIONS.md).**
Bagian ini hanya ringkasan cepat.

```bash
cp .env.example .env
# isi APP_DOMAIN, ACME_EMAIL, PB_VERSION (versi eksplisit, bukan latest),
# APP_URL, dan SMTP_* relay organisasi
mkdir -p backups && sudo chown -R 10001:10001 backups
docker compose up -d --build
curl -fsS https://$APP_DOMAIN/api/health
```

Instalasi baru langsung dialihkan ke `/setup`. Kode setup dibaca dengan
`docker compose exec pocketbase cat /pb/pb_data/setup_token`, atau setel
`SETUP_TOKEN` sebelum start. Setelah identitas rumah sakit dan akun Kepala IT
dibuat, kode dihapus dan `/setup` tertutup. Admin UI tidak dipublikasikan; akses
darurat hanya lewat tunnel SSH:

```bash
ssh -L 8090:127.0.0.1:8090 user@server
# buka http://127.0.0.1:8090/_/
```

Backup harian 02:00 WIB, sidecar per jam, retensi 30 hari, kewajiban salinan
off-host + enkripsi, prosedur restore, dan `npm run ops:check` dijelaskan di
[`docs/OPERATIONS.md`](docs/OPERATIONS.md) §4–§6. Catatan uji restore ada di
[`docs/restore-tests/`](docs/restore-tests/).

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

Daftar lengkap custom route `/api/itsm/*`, route publik, route PocketBase
bawaan, dan aturan aksesnya ada di [`docs/API.md`](docs/API.md). Semua penulisan
data lewat custom route; koleksi PocketBase hanya dibaca sesuai API rules.

## Catatan verifikasi

Catatan verifikasi per rilis — termasuk angka suite saat penulisan — ada di
[`CHANGELOG.md`](CHANGELOG.md).

## Scope berikutnya

Urutan eksekusi ada di
[Roadmap Bagian 10](docs/ITSM-ROADMAP.md#10-fokus-berikutnya--kesiapan-dijual-pilot-rs-swasta);
riwayat fitur yang sudah selesai ada di [`CHANGELOG.md`](CHANGELOG.md).

Berikutnya: aktivasi Uptime Kuma + uji alert
([`docs/MONITORING.md`](docs/MONITORING.md)), backup off-host + drill restore
staging ([`docs/OPERATIONS.md`](docs/OPERATIONS.md)), tenant demo
(`npm run demo:reset`), email-in/IMAP, formulir dinamis per item,
auto-assignment, SSO (OIDC/LDAP), WhatsApp, AI, serta laporan lanjutan (PDF
native di server dan filter per unit).
