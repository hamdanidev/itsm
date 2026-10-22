# Healthcare ITSM

Platform tata kelola layanan TI untuk rumah sakit: Incident, Service Request, dan
Change Request dalam satu portal yang terstruktur, memiliki SLA, RBAC, dan audit
trail.

Status saat ini: **Stage 3 vertical slice** — autentikasi staff, intake tiga jenis
tiket, daftar tiket, detail tiket, komentar publik/internal, lampiran terproteksi,
SLA awal + breach scan, dan audit log.

## Stack

- Frontend: React 19 + Vite + Bootstrap 5 (JavaScript)
- Backend: PocketBase v0.40.5 (API, auth, realtime, file storage, Admin UI)
- Container: Docker + Docker Compose + Caddy
- Data: SQLite di named volume `healthcare_itsm_pb_data`

## Struktur

```text
healthcare-itsm/
├── frontend/                  # React + Vite
├── backend/
│   ├── pb_migrations/         # schema + seed (committed)
│   ├── pb_hooks/              # Goja hooks/routes (committed)
│   └── pb_data/               # gitignored, named volume in Docker
├── docker/
│   ├── Caddyfile
│   ├── entrypoint.sh
│   └── backup.sh
├── docker-compose.yml         # production
├── docker-compose.dev.yml     # PocketBase only; Vite on host
├── Dockerfile
├── .env.example
├── README.md
└── SCHEMA.md
```

## Prasyarat

- Docker Engine + Docker Compose v2
- Node.js 20.19+ (disarankan 22/24) untuk frontend dev
- Domain yang mengarah ke server (production) dan port 80/443 terbuka

## Development

### 1. Jalankan PocketBase

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d --build
```

PocketBase: <http://127.0.0.1:8090>  
Admin UI: <http://127.0.0.1:8090/_/>

Data dev memakai named volume terpisah: `healthcare_itsm_pb_data_dev`.

### 2. Buat superuser

```bash
docker compose -f docker-compose.dev.yml exec pocketbase \
  /usr/local/bin/pocketbase superuser create admin@itsm.local 'PasswordKuat123!' \
  --dir=/pb/pb_data
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

### 4. Jalankan frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: <http://127.0.0.1:5173>  
Vite mem-proxy `/api` ke PocketBase, jadi tidak ada CORS terbuka.

### 5. Cek cepat

- Login sebagai requester.
- Buat tiket Incident / Service Request / Change Request.
- Buka detail; tambahkan komentar publik.
- Login sebagai support; tambahkan komentar internal.
- Login sebagai requester; pastikan komentar internal tidak terlihat.
- Upload lampiran; cek tombol unduh.
- Login sebagai lead; buka audit log lewat API/Admin UI.
- Tunggu/paksa cron `sla_breach_scan`; cek `response_breach_at` dan audit.

## Production

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
docker compose -f docker-compose.dev.yml exec pocketbase \
  /usr/local/bin/pocketbase migrate collections \
  --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks

# migration kosong
docker compose -f docker-compose.dev.yml exec pocketbase \
  /usr/local/bin/pocketbase migrate create "add_something" \
  --dir=/pb/pb_data --migrationsDir=/pb/pb_migrations --hooksDir=/pb/pb_hooks
```

Production memakai `--automigrate=false`. Jangan mengubah skema lewat Admin UI di
production; deploy perubahan lewat image baru. Jangan mengedit migration yang
sudah diterapkan.

## Environment dan CORS

Frontend memakai `window.location.origin` secara default. API dan UI same-origin
lewat Caddy. `VITE_API_BASE_URL` hanya diperlukan bila API sengaja dipisah ke
origin lain.

Dev memakai proxy Vite untuk `/api` dan `/_`. PocketBase dijalankan dengan
`--origins` eksplisit (lihat `docker/entrypoint.sh`), bukan `*`.

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
| POST | `/api/itsm/tickets/{id}/comments` | Komentar publik/internal |
| POST | `/api/itsm/tickets/{id}/attachments` | Upload lampiran (multipart) |
| GET | `/api/collections/tickets/records` | List tiket sesuai API rules |
| GET | `/api/collections/ticket_comments/records` | List komentar sesuai rules |
| GET | `/api/collections/ticket_attachments/records` | List lampiran sesuai rules |
| GET | `/api/collections/audit_logs/records` | Audit; hanya IT Lead |
| GET | `/api/health` | Healthcheck |

## Verifikasi lokal yang sudah dilakukan

- Migrasi schema + seed diterapkan pada PocketBase v0.40.5.
- Login requester/support/lead.
- Create Incident, Service Request, dan Change Request via custom route.
- SLA due date dihitung; cron `sla_breach_scan` menandai breach + audit.
- Komentar publik/internal; requester tidak melihat komentar internal.
- First response terisi saat staff memberi komentar publik.
- Upload lampiran dan download protected file dengan token.
- Audit log hanya terlihat IT Lead; create audit ditolak.
- `npm run build` sukses.
- Docker image backend/web/backup berhasil dibangun; stack HTTPS berjalan;
  SPA fallback, healthcheck, dan backup ZIP (DB + storage) terverifikasi.

## Scope berikutnya

- Assignment dan state transition UI/route.
- Approval Service Request / Change Request.
- Dashboard per unit, SLA breach, critical open.
- Admin unit/kategori/SLA/holiday.
- Notifikasi email/WhatsApp.
- SSO SIMRS.
