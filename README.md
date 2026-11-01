# Healthcare ITSM

Platform tata kelola layanan TI untuk rumah sakit: Incident, Service Request, dan
Change Request dalam satu portal yang terstruktur, memiliki SLA, RBAC, dan audit
trail.

Status saat ini: **Stage 12 — approval lengkap**. Fitur sampai approval tiga
tahap (delegasi approver, CAB untuk Change Request berisiko tinggi, SLA per
tahap), ditambah suite pengujian otomatis dan CI:

- autentikasi staff dan intake tiga jenis tiket;
- daftar tiket dengan pagination/filter/URL state dan dashboard antrean kerja;
- detail tiket dengan riwayat aktivitas + pembaruan realtime;
- assignment, transisi status termasuk `waiting` dengan jeda SLA, recompute SLA
  saat reopen, dan eskalasi berjenjang;
- approval berjenjang (manajer unit → IT Lead → CAB), delegasi approver, dan
  tenggat per tahap;
- komentar publik/internal, lampiran terproteksi, pengaturan unit/kategori/SLA/
  hari libur, notifikasi in-app, SLA awal + breach scan, dan audit log.

## Stack

- Frontend: React 19 + Vite 8 + CSS (tanpa framework UI)
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
│   ├── pb_data/               # gitignored, data lokal dev
│   └── .bin/                  # gitignored, binary PocketBase hasil unduhan
├── scripts/
│   ├── dev.mjs                # jalankan PocketBase + Vite tanpa Docker
│   ├── pocketbase.mjs         # CLI download/serve/superuser/migrate
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

### 2. Buat superuser

Jalankan sekali setelah data dev pertama kali dibuat:

```bash
npm run pb:superuser -- admin@itsm.local "PasswordKuat123!"
```

### 3. Buat akun staff

Lewat Admin UI (`Collections > users`), buat record dengan field:

| Field | Nilai |
|---|---|
| `email` | email staff |
| `password` | password awal |
| `name` | nama tampilan |
| `role` | `requester`, `it_support`, atau `it_lead` |
| `tenant` | tenant `RS01` (seed) |
| `unit` | unit yang sesuai; untuk IT gunakan unit `IT` |
| `is_active` | **true** (wajib, jika tidak login ditolak) |
| `verified` | true |

Catatan: `users.createRule` sengaja dikunci. Provisioning akun dilakukan oleh
superuser lewat Admin UI pada MVP ini. IT Lead adalah role bisnis, bukan superuser.

### 4. Perintah dev lain

```bash
npm run dev:pb       # PocketBase saja
npm run dev:web      # Vite saja (PocketBase harus sudah jalan)
npm run pb:download  # unduh/segarkan binary saja
npm run pb:serve     # PocketBase foreground dengan opsi dev
npm run pb:migrate -- collections
```

Reset data lokal: hentikan dev, hapus `backend/pb_data/`, lalu jalankan
`npm run dev` lagi dan buat superuser.

Debug query SQL PocketBase:

```bash
PB_DEBUG=1 npm run dev
```

Di PowerShell: `$env:PB_DEBUG=1; npm run dev`.

`PB_VERSION`, `PB_HTTP`, dan `DEV_ORIGINS` dapat diatur lewat environment atau
`.env` (opsional; default sudah cocok untuk dev).

### 5. Cek cepat

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
- Login sebagai staff; buka `/dashboard`: kartu KPI, antrean "Tiket saya",
  "Belum di-assign", dan "Perlu perhatian" harus sesuai data tiket.
- Klik "Lihat semua" pada antrean; filter, chip, dan pagination di daftar tiket
  harus mengikuti URL.

## Testing

Tiga lapis pengujian berjalan tanpa Docker dan tanpa menyentuh `backend/pb_data`:

| Perintah | Cakupan | Butuh |
|---|---|---|
| `npm run test:unit` | Matematika SLA (jam kerja, hari libur, 24x7), guard teks/tanggal, helper antrean dashboard | Node |
| `npm test` | Unit + API: auth/RBAC, alur tiket & approval (termasuk CAB dan delegasi), jeda SLA, reopen, validasi intake, lampiran terproteksi | Node + binary PocketBase |
| `npm run test:e2e` | Smoke UI Playwright: login per peran, daftar, detail + isolasi komentar internal, dashboard, approval bertahap, delegasi, intake | Node + PocketBase + Chromium |
| `npm run test:all` | ketiganya | — |

Cara kerjanya:

- `tests/run-api.mjs` menyalakan PocketBase di data dir sementara dan port acak,
  membuat superuser `admin@uji.local`, menjalankan migrasi + seed dari
  `backend/pb_migrations`, lalu menjalankan `node --test` pada test API.
- Test e2e menyalakan Vite sendiri lewat `PB_TARGET`
  (`frontend/vite.config.js`), jadi tidak perlu `npm run dev` lebih dulu dan
  tidak bentrok dengan dev server di 5173/8090.
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

| Aksi | Requester | IT Support | Manajer unit | IT Lead | Aturan |
|---|---|---|---|---|---|
| Assign | — | ke diri sendiri | — | ke staf IT mana pun / lepas | Hanya staf aktif di tenant yang sama |
| Mulai kerjakan | — | assignee atau tiket belum di-assign | — | ya | Service/Change Request harus sudah approved; tiket tanpa assignee otomatis di-claim |
| Menunggu requester | — | assignee | — | ya | Dari assigned/in_progress; jam penyelesaian dijeda, komentar tetap bisa ditambahkan |
| Lanjutkan | — | assignee | — | ya | Dari waiting; tenggat penyelesaian digeser sebesar durasi jeda |
| Selesaikan | — | assignee | — | ya | Wajib ringkasan resolusi ≥ 10 karakter + kode resolusi; approval harus approved untuk non-incident; tidak bisa dari waiting |
| Tutup | — | ya | — | ya | Hanya dari status resolved |
| Buka kembali | tiket sendiri | ya | — | ya | Dari resolved/closed; resolusi dibersihkan, `reopen_count` bertambah, dan SLA penyelesaian dihitung ulang |
| Approval | — | — | tahap 1 (bila ditunjuk) | tahap 2 dan CAB | Hanya sebelum pekerjaan dimulai; CAB khusus CR high risk dan harus lead berbeda |
| Delegasikan approval | — | — | tahap aktif miliknya | tahap mana pun | Pengganti harus aktif; tahap IT Lead/CAB hanya ke IT Lead; alasan wajib |

Setiap aksi ditulis ke audit log (`assign`, `transition`, `approve`, `reject`)
dengan aktor dan perubahan status.

## Approval berjenjang

Service Request dan Change Request memakai **dua sampai tiga tahap berurutan**:

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
  (Senin–Jumat 08:00–17:00 WIB, kritis 24/7, sadar hari libur).
- Saat tiket masuk `waiting`, `sla_paused_at` diisi dan scan breach melewati
  tiket tersebut. Saat dilanjutkan, `resolution_due_at` dan `next_due_at`
  digeser persis selama jeda, dan totalnya dicatat di `sla_paused_minutes`.
- Reopen memulai siklus SLA penyelesaian baru dari waktu reopen memakai policy
  aktif. Breach dan level eskalasi lama dibersihkan, tetapi riwayat breach tetap
  ada di audit log dan timeline.
- Eskalasi berjenjang oleh scan 5 menit:
  `1` = breach respons/approval, `2` = breach penyelesaian, `3` = breach
  penyelesaian yang belum ditangani 4 jam. Level 2+ tampil sebagai badge
  "Eskalasi Lx" di detail dan antrean dashboard, dan setiap kenaikan level
  menulis event `escalate` ke timeline. Notifikasi baru sebatas in-app; email
  dan WhatsApp belum ada.

## Tenant

`tenants` adalah identitas organisasi (rumah sakit) sekaligus batas isolasi
data. Setiap user memiliki tepat satu `tenant`; backend mengambil tenant dari
`e.auth`, bukan dari body request, dan seluruh API rule memfilter
`tenant = @request.auth.tenant`.

- Satu baris seed: `Rumah Sakit Contoh` (`RS01`), `Asia/Jakarta`, aktif.
- Sidebar menampilkan `name` dan `code` tenant (avatar diambil dari inisial
  nama), bukan teks hardcoded.
- Menonaktifkan tenant (`is_active = false`) memblokir login semua user tenant
  tersebut karena rule auth user memakai `tenant.is_active`.
- Membuat/mengubah tenant hanya lewat Admin UI PocketBase (superuser); belum
  ada pengelolaan tenant in-app karena satu instalasi saat ini melayani satu RS.
- `timezone` tenant disimpan tetapi belum dipakai untuk SLA; perhitungan jam
  kerja memakai `sla_policies.timezone` atau default `Asia/Jakarta`.

## Dashboard dan antrean kerja

Staff (IT Support/IT Lead) mendarat di `/dashboard` setelah login; requester
tetap diarahkan ke `/tickets` dan tidak melihat menu Ringkasan.

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

## Riwayat aktivitas dan realtime

Halaman detail tiket punya tab **Riwayat** di samping komentar. Datanya berasal
dari `audit_logs` lewat route `GET /api/itsm/tickets/{id}/timeline`, bukan dari
list rule audit (yang tetap khusus IT Lead). Route memproyeksikan satu event per
aksi — create, assign, transition, approve/reject, comment, attachment,
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
- Notifikasi bukan pengganti email/WhatsApp; keduanya belum ada.

## Pengaturan (admin in-app)

IT Lead mengelola data master lewat `/admin`; menu **Pengaturan** hanya tampil
untuk role `it_lead`, dan requester/IT Support yang membuka URL-nya dialihkan ke
daftar tiket.

| Tab | Isi | Catatan |
|---|---|---|
| Unit | nama, kode, jenis (klinis/penunjang/manajemen), manajer | dipakai pada form intake; manajer menjadi approver tahap 1 |
| Kategori | nama, kode, jenis tiket | filter pilihan kategori per tipe |
| Kebijakan SLA | tipe, prioritas, respons/approval/penyelesaian, kalender | unik per `(tipe, prioritas)` |
| Hari libur | tanggal + nama | memengaruhi SLA jam kerja |

- Semua data memakai `tenant` dari user, bukan dari body bebas.
- Tidak ada hard delete dari UI. Tombol **Nonaktifkan** mengubah `is_active`
  agar tiket lama tetap valid; `deleteRule` tetap `null` (superuser saja).
- Ada 12 kombinasi tipe × prioritas. Bila semuanya sudah punya kebijakan,
  tombol tambah SLA dinonaktifkan dan UI mengarahkan untuk mengedit yang ada.
- Perubahan kebijakan hanya berlaku untuk tiket baru; tiket lama memakai
  `sla_snapshot` saat dibuat.
- Setiap create/update data master menulis audit (`collection_name`,
  `record_id`, dan diff field yang berubah) lewat `pb_hooks/admin_audit.pb.js`.
- Provisioning akun pengguna tetap lewat Admin UI PocketBase; pengaturan ini
  tidak mengelola user.

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
# edit APP_DOMAIN, ACME_EMAIL, PB_VERSION
```

`PB_VERSION` harus versi eksplisit. Jangan gunakan `latest`.

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

### 4. Buat superuser

```bash
docker compose exec pocketbase \
  /usr/local/bin/pocketbase superuser create admin@rs.example.com 'PasswordKuat123!' \
  --dir=/pb/pb_data
```

### 5. Setelah deploy

- Buat akun staff lewat Admin UI.
- Uji login, intake, komentar, lampiran, audit.
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

## Desain antarmuka

UI memakai bahasa desain Atlassian/Jira, bukan komponen Bootstrap:

- Top bar putih 56 px + sidebar project 240 px dengan border tipis.
- Warna aksen Atlassian Blue `#0052CC`, teks `#172B4D`, border `#DFE1E6`.
- Status memakai lozenge kecil (uppercase, 11 px, radius 2 px), prioritas memakai
  ikon chevron, bukan badge pil.
- Action bar tiket di bawah judul: transisi status, assignment, dan approval,
  dengan modal Jira-style untuk resolusi dan approval.
- Tabel issue yang padat, sticky-free, dengan skeleton loading.
- Panel aktivitas tiket memakai tab **Komentar / Riwayat** dan indikator `Live`
  saat koneksi realtime PocketBase aktif.
- Login bergaya Atlassian: kartu putih di atas latar netral, tanpa gradient/hero.
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
| POST | `/api/itsm/tickets/{id}/assign` | Assign / lepas assignee (staff) |
| POST | `/api/itsm/tickets/{id}/transition` | Mulai, menunggu/lanjutkan, selesaikan, tutup, buka kembali |
| POST | `/api/itsm/tickets/{id}/approval` | Setujui / tolak tahap approval aktif (manajer unit atau IT Lead) |
| POST | `/api/itsm/tickets/{id}/comments` | Komentar publik/internal |
| POST | `/api/itsm/tickets/{id}/attachments` | Upload lampiran (multipart) |
| GET | `/api/itsm/tickets/{id}/timeline` | Riwayat aktivitas tiket (proyeksi audit) |
| GET | `/api/collections/tickets/records` | List tiket sesuai API rules |
| GET | `/api/collections/ticket_comments/records` | List komentar sesuai rules |
| GET | `/api/collections/ticket_attachments/records` | List lampiran sesuai rules |
| GET | `/api/collections/audit_logs/records` | Audit; hanya IT Lead |
| GET | `/api/collections/notifications/records` | Notifikasi milik sendiri |
| GET | `/api/health` | Healthcheck |

## Verifikasi lokal yang sudah dilakukan

- Suite otomatis lulus lokal (Windows): 22 unit test, 58 test API, dan 8
  skenario e2e smoke — lihat bagian Testing.
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

- Delegasi approval saat approver tidak tersedia dan tahap ketiga untuk Change
  Request berisiko tinggi.
- Tren SLA mingguan/bulanan dan ekspor CSV.
- Notifikasi email/WhatsApp di luar in-app.
- SSO SIMRS.
