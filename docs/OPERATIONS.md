# Operasi & Pemulihan — Healthcare ITSM

Dokumen ini adalah runbook operasi untuk instalasi produksi/pilot. Isinya
menjawab pertanyaan operasional standar rumah sakit: siapa yang melakukan apa,
di mana datanya, bagaimana memulihkan, dan bagaimana membuktikannya.

- **Versi aplikasi acuan:** PocketBase `0.40.5` (lihat `PB_VERSION` di `.env`).
- **Pemilik runbook:** IT Lead implementasi (vendor) + IT rumah sakit.
- **Status:** berlaku untuk pilot; ditinjau setiap 3 bulan atau setelah
  perubahan arsitektur besar.

> Prinsip: **satu VM, satu instance PocketBase, SQLite, tanpa HA.** Jangan
> menjanjikan uptime 99,9% atau RPO nol pada arsitektur ini. Target yang
> realistis ada di bawah dan harus diukur lewat uji restore.

| Target | Nilai awal | Catatan |
|---|---|---|
| RPO (data hilang maksimal) | ≤ 24 jam | Backup harian 02:00 WIB; perketat bila RS menuntut |
| RTO (waktu pulih) | ≤ 2 jam | Diverifikasi di staging, bukan dari drill lokal |
| Retensi backup lokal | 30 hari | Sidecar menghapus ZIP host > 30 hari |
| Retensi log | 14–30 hari | Dibatasi ukuran container; lihat §9 |

---

## 1. Arsitektur dan data

```text
Internet
  │ 80/443
  ▼
Caddy (web) ── static SPA + /healthz
  │ /api/*
  ▼
PocketBase (127.0.0.1:8090)
  │
  ├── volume  healthcare_itsm_pb_data  → /pb/pb_data
  │     ├── data.db          (SQLite utama)
  │     ├── auxiliary.db     (log/auxiliary)
  │     ├── storage/         (logo, avatar, lampiran)
  │     └── backups/         (ZIP backup lokal PocketBase)
  │
  └── sidecar backup → host ${BACKUP_HOST_DIR:-./backups} (salinan tiap jam)

Admin UI PocketBase tidak diekspos publik; akses hanya lewat SSH tunnel.
```

Konsekuensi yang harus disampaikan ke RS:

- Server mati = aplikasi mati sampai host/container pulih.
- SQLite tidak mendukung replika multi-node; jangan menjalankan dua instance
  terhadap volume yang sama.
- File yang **tidak** ikut backup ZIP: `.env`, kredensial SMTP, kunci
  enkripsi PocketBase, konfigurasi host/Caddy, dan salinan off-host. Semua itu
  harus disimpan/diamankan terpisah.
- ZIP backup PocketBase berisi database + file upload lokal. File yang disimpan
  di S3 eksternal (jika suatu saat diaktifkan) tidak otomatis ikut.

---

## 2. Prasyarat dan instalasi

### 2.1 Server

- Linux x86_64/arm64, Docker + Compose v2.
- DNS `APP_DOMAIN` mengarah ke server; port 80/443 terbuka.
- Disk minimal 50 GB (data + backup 30 hari + ruang restore 2× ukuran data).
- Jam server sinkron NTP (penting untuk TOTP 2FA dan SLA).
- Akses SSH dengan kunci; password SSH dimatikan.

### 2.2 Konfigurasi

```bash
cp .env.example .env
# Wajib diisi: APP_DOMAIN, ACME_EMAIL, PB_VERSION, APP_URL
# Produksi: SMTP_* relay organisasi, bukan Mailtrap.
```

Jangan gunakan `latest` untuk `PB_VERSION`. Simpan `.env` di pengelola
password/kredensial, bukan hanya di server.

### 2.3 Build dan jalankan

```bash
mkdir -p backups
sudo chown -R 10001:10001 backups
docker compose up -d --build
docker compose ps
curl -fsS https://$APP_DOMAIN/api/health
```

### 2.4 Setup awal

1. Buka `https://$APP_DOMAIN` → dialihkan ke `/setup`.
2. Ambil kode setup:
   ```bash
   docker compose exec pocketbase cat /pb/pb_data/setup_token
   ```
   atau set `SETUP_TOKEN` di `.env` sebelum start.
3. Isi identitas RS + akun Kepala IT. Kode setup terhapus dan `/setup` tertutup.
4. Tambah anggota tim lewat **Pengaturan → Tim** (bukan Admin UI).

### 2.5 Superuser PocketBase (darurat)

```bash
docker compose exec pocketbase \
  /usr/local/bin/pocketbase superuser create admin@rs.example.com 'PasswordKuat123!' \
  --dir=/pb/pb_data
```

Akses Admin UI hanya lewat tunnel:

```bash
ssh -L 8090:127.0.0.1:8090 user@server
# buka http://127.0.0.1:8090/_/
```

### 2.6 Checklist setelah deploy

- [ ] Health 200 dan login Kepala IT berhasil.
- [ ] Tambah satu anggota, login, ganti password awal.
- [ ] Buat tiket + komentar + lampiran; buka sebagai requester.
- [ ] QR intake berfungsi (jika dipakai).
- [ ] `npm run ops:check` (atau probe health) lulus.
- [ ] Backup pertama terlihat di `backups/` dan ukurannya wajar.
- [ ] SMTP terkirim (undangan/reset) atau sengaja dinonaktifkan.
- [ ] Admin UI tidak dapat diakses dari internet.
- [ ] TZ server dan zona RS sama.

---

## 3. Operasi harian

```bash
# status container
docker compose ps

# log terakhir (maksimum 200 baris agar aman)
docker compose logs --tail=200 pocketbase
docker compose logs --tail=100 web

# restart satu layanan
docker compose restart pocketbase

# health
curl -fsS https://$APP_DOMAIN/api/health
curl -fsS https://$APP_DOMAIN/healthz

# disk dan ukuran data/backup
df -h
du -sh backups 2>/dev/null || true
ls -lh backups | tail

# pemeriksaan operasional gabungan (health, backup, disk)
npm run ops:check -- --url https://$APP_DOMAIN --backup-dir ./backups
```

Interpretasi:

- `/api/health` 200 = proses PocketBase hidup dan database dapat dibuka.
- `/healthz` 200 = Caddy hidup; bukan pengganti health PocketBase.
- Log PocketBase membawa error hook/route; log Caddy membawa error TLS/proxy.

Akses rutin: hanya lewat UI aplikasi. Admin UI/superuser untuk darurat dan
pekerjaan teknis; setiap perubahan skema manual di production dilarang.

---

## 4. Backup

### 4.1 Mekanisme yang ada

1. **PocketBase membuat ZIP harian pukul 02:00 WIB** lewat
   [`backend/pb_hooks/backup.pb.js`](../backend/pb_hooks/backup.pb.js).
   ZIP berisi database dan file upload; direktori `backups/` sendiri tidak ikut.
2. **Sidecar `backup`** menyalin ZIP dari volume ke host setiap jam dan
   menghapus salinan host yang lebih tua dari 30 hari
   ([`docker/backup.sh`](../docker/backup.sh)).
3. **Host backup** ada di `${BACKUP_HOST_DIR:-./backups}` — masih satu mesin
   dengan aplikasi sampai langkah off-host dilakukan.

RPO default ≤ 24 jam. Bila RS tidak menerima kehilangan satu hari data,
tambahkan backup lebih sering (mis. tiap 6 jam) atau replikasi/off-site.

### 4.2 Verifikasi backup

```bash
# cek backup terbaru < 26 jam, ukuran > 0, health, dan disk
npm run ops:check -- \
  --url https://$APP_DOMAIN \
  --backup-dir /path/ke/backups \
  --data-dir /path/ke/pb_data

# lihat isi ZIP (harus ada data.db, auxiliary.db, storage/)
unzip -l backups/pb_backup_*.zip | head -30

# checksum untuk arsip
sha256sum backups/pb_backup_*.zip
```

Jangan menyalin `data.db` dengan `cp` saat PocketBase hidup. Gunakan ZIP
backup bawaan atau `sqlite3 .backup`.

### 4.3 Off-host dan enkripsi (wajib sebelum pilot)

Satu-satunya salinan di mesin yang sama bukan backup yang memadai. Lakukan
salah satu, dan simpan kunci enkripsi terpisah dari backup:

```bash
# NAS/rsync
rsync -a --delete backups/ backup@nas:/srv/healthcare-itsm/

# S3/MinIO dengan restic
restic -r s3:https://... backup backups/
restic snapshots
```

Catat jadwal off-host dan uji restore **dari salinan off-host**, bukan hanya
dari file lokal.

---

## 5. Restore

### 5.1 Kapan restore dipakai

| Situasi | Tindakan |
|---|---|
| Host hilang/rusak total | Restore ke host baru dari ZIP terbaru + `.env` |
| Database korup | Hentikan aplikasi, restore ZIP terakhir yang lolos verifikasi |
| Salah hapus data | Restore ke **volume baru** dulu, verifikasi, baru ganti |
| Upgrade gagal | Kembalikan image lama; jika skema berubah, restore backup pra-upgrade |

### 5.2 Sebelum restore

1. Umumkan maintenance window; hentikan traffic tulis.
2. Ambil backup kondisi sekarang (walau rusak) untuk forensik.
3. Pastikan ruang disk ≥ 2× ukuran ZIP.
4. Pastikan versi PocketBase image sama dengan versi saat backup dibuat; jika
   berbeda, uji di staging dan baca changelog migrasi.
5. Jangan biarkan email/cron mengirim notifikasi saat uji restore.

### 5.3 Restore lewat Admin UI (disarankan)

1. Salin ZIP dari host ke direktori backup di volume (pastikan terbaca UID
   `10001`):
   ```bash
   docker compose cp backups/pb_backup_YYYYMMDDHHMMSS.zip \
     pocketbase:/pb/pb_data/backups/
   docker compose exec -u 0 pocketbase \
     chown 10001:10001 /pb/pb_data/backups/pb_backup_YYYYMMDDHHMMSS.zip
   ```
2. Buka Admin UI lewat SSH tunnel.
3. **Settings → Backups → Restore** pada ZIP tersebut.
4. PocketBase memproses restore dan me-restart proses. Tunggu health 200.
5. Lanjut ke checklist verifikasi §5.5.

### 5.4 Restore dengan mengganti volume (host baru)

```bash
# 1. hentikan aplikasi
docker compose down

# 2. siapkan volume baru (jangan menimpa volume lama sebelum verifikasi)
docker volume create itsm_restore_check

# 3. ekstrak ZIP ke volume baru.
#    Image helper membutuhkan akses registry saat pertama kali; siapkan lebih
#    awal bila restore dilakukan saat jaringan bermasalah.
docker run --rm \
  -v itsm_restore_check:/data \
  -v "$PWD/backups":/backup:ro \
  alpine:3.22 \
  sh -c 'apk add --no-cache unzip >/dev/null; \
         find /data -mindepth 1 -maxdepth 1 -exec rm -rf {} +; \
         unzip -q /backup/pb_backup_YYYYMMDDHHMMSS.zip -d /data; \
         chown -R 10001:10001 /data'

# 4. arahkan sementara PB_VOLUME_NAME ke volume baru, jalankan di port berbeda
#    (atau host staging), lalu verifikasi §5.5 sebelum mengganti produksi.
```

Untuk produksi, cara paling aman: uji volume baru di host staging/port lain,
verifikasi, baru ganti `PB_VOLUME_NAME` / volume produksi. Simpan volume lama
sampai verifikasi selesai.

### 5.5 Checklist verifikasi setelah restore

- [ ] `/api/health` 200 dan container tidak restart berulang.
- [ ] Login Kepala IT berhasil; 2FA (jika aktif) meminta kode.
- [ ] Jumlah user, tiket, dan audit sesuai perkiraan (bandingkan dengan catatan
      sebelum insiden).
- [ ] Tiket terbaru ada dan nomornya benar.
- [ ] Lampiran lama dapat diunduh.
- [ ] Laporan SLA/operasional terbuka dan CSV terunduh.
- [ ] QR intake menghasilkan tiket (jika dipakai).
- [ ] Antrean email tidak membanjiri pengguna; periksa `email_outbox`.
- [ ] Audit mencatat login/aktivitas setelah restore.
- [ ] Tidak ada migrasi gagal di log.

### 5.6 Jika restore gagal

- Jangan hapus volume/backup asli.
- Kembalikan volume lama, nyalakan image versi sebelumnya.
- Catat error, ZIP yang dicoba, dan langkah yang sudah dilakukan.
- Eskalasi ke pemilik teknis; coba ZIP lain yang lebih lama **di staging**,
  bukan langsung di produksi.

---

## 6. Uji restore

Uji restore adalah bukti, bukan formalitas. Minimal:

- sekali sebelum pilot;
- setiap 3 bulan;
- setelah upgrade PocketBase besar atau perubahan volume/backup.

### 6.1 Drill lokal (mekanisme)

```bash
npm run ops:restore-drill
```

Skrip membuat dataset sintetis (tenant, user, tiket, lampiran), membuat ZIP,
mengekstrak ke direktori data baru, menyalakan PocketBase hasil restore, lalu
memverifikasi health, login, tiket, lampiran, dan jumlah record. Hasilnya
dicetak sebagai JSON. Ini menguji **mekanisme** restore, bukan data produksi.

### 6.2 Drill staging (wajib sebelum pilot)

- Gunakan backup produksi terbaru.
- Jalankan di host/volume terpisah, tanpa mengarahkan DNS produksi.
- Set `MAIL_TRANSPORT=capture`/SMTP kosong dan hentikan pengiriman email.
- Ikuti §5.3–§5.5, ukur waktu mulai–selesai.
- Simpan bukti: nama ZIP + checksum, jumlah record sebelum/sesudah, screenshot
  health/login, dan catatan masalah.

### 6.3 Pencatatan

Setiap drill dicatat di [`docs/restore-tests/`](./restore-tests/) memakai
[template](./restore-tests/TEMPLATE.md). Catatan minimal berisi tanggal,
pelaksana, lingkungan, backup, hasil pemeriksaan, RTO/RPO terukur, dan
tindak lanjut. Contoh hasil drill lokal: [2026-11-10](./restore-tests/2026-11-10-local.md).

---

## 7. Upgrade dan rollback

### 7.1 Prosedur upgrade

1. Baca changelog PocketBase untuk versi target; cek breaking change migrasi.
2. Backup + verifikasi (`ops:check`), salin off-host.
3. Uji image baru di staging dengan salinan data produksi.
4. Ubah `PB_VERSION` di `.env` (pin eksplisit), lalu:
   ```bash
   docker compose build
   docker compose up -d
   docker compose logs --tail=200 pocketbase
   curl -fsS https://$APP_DOMAIN/api/health
   ```
5. Smoke test: login, buat tiket, komentar, lampiran, laporan, audit, 2FA.
6. Catat versi baru dan tanggal di changelog operasional.

### 7.2 Rollback

- Kembalikan `PB_VERSION`/image lama, `docker compose up -d`.
- Jika migrasi sudah mengubah skema dan tidak kompatibel, restore ZIP
  pra-upgrade ke volume baru; jangan menimpa volume produksi sebelum verifikasi.
- Jangan mengedit migration yang sudah diterapkan.

---

## 8. Insiden umum

| Gejala | Tindakan pertama | Eskalasi |
|---|---|---|
| `/api/health` timeout/5xx | `docker compose ps`, log PB, disk/memori; restart PB | Host/VM, database |
| Semua halaman 502 | Cek Caddy + PB; `docker compose logs web pocketbase` | Jaringan/TLS |
| Disk > 90% | Hapus backup/log lama yang aman, pindahkan off-host, tambah disk | Infra |
| DB korup/locked | Stop PB, simpan file lama, restore ZIP terverifikasi | Pemilik teknis |
| Backup tidak muncul | Cek log hook 02:00, ruang disk, izin volume; buat backup manual via Admin UI | Infra |
| ZIP backup 0 byte/rusak | Jangan hapus; coba ZIP sebelumnya; selidiki disk/IO | Infra |
| TLS kedaluwarsa | Cek DNS/port 80/443, log Caddy, perpanjang/renew | Infra |
| SMTP down | Aplikasi tetap jalan; antrean email menumpuk; perbaiki relay lalu dispatch | Email admin |
| Semua Kepala IT terkunci | Superuser reset password / buka akses lewat Admin UI | Superuser |
| Restore gagal | Pertahankan volume/backup, rollback image, ulangi di staging | Pemilik teknis |

Prinsip komunikasi: beri tahu RS lebih dulu untuk downtime terencana; untuk
insiden, kirim update status berkala sampai pulih.

---

## 9. Monitoring dan rotasi log (baseline)

### 9.1 Yang sudah ada

- Healthcheck Docker untuk PocketBase (`/api/health`) dan web (`/healthz`).
- Log Docker `json-file` dibatasi:
  - PocketBase/web: 10 MB × 3 file;
  - backup: 5 MB × 2 file.
- `npm run ops:check` memeriksa health, kesegaran backup, dan disk; dengan
  `--push-url`/`OPS_PUSH_URL` hasilnya dikirim sebagai heartbeat ke Uptime Kuma
  (status `down` bila gagal).
- Template systemd timer di `scripts/ops/systemd/`.

### 9.2 Yang wajib diaktifkan sebelum pilot (S0-6)

Setup lengkap monitor, ambang, notifikasi, dan uji alert ada di
[MONITORING.md](./MONITORING.md). Ringkasnya:

| Sinyal | Ambang awal | Aksi |
|---|---|---|
| Uptime eksternal | 2 gagal berturut-turut (interval 1–5 menit) | Alert ke email/Telegram/WA |
| Disk | warning 80%, critical 90% | Bersihkan/off-host/tambah disk |
| Backup terbaru | > 26 jam atau 0 byte | Periksa cron/sidecar, buat backup manual |
| TLS | < 14 hari | Renew/perbaiki DNS |
| Heartbeat `ops:check` | hilang > 15 menit | Cek timer/cron dan host |
| Memori | mendekati `GOMEMLIMIT`/OOM restart | Restart/analisis |
| 5xx / error rate | lonjakan 5 menit | Lihat log, rollback bila perlu |
| Antrean email | gagal > 10 atau tertua > 15 menit | Perbaiki SMTP, dispatch |

Monitoring harus **dari luar host** (Uptime Kuma di host lain, BetterStack,
UptimeRobot). Healthcheck Docker tidak akan memberi tahu bila host mati.

### 9.3 Contoh cron `ops:check`

```cron
*/10 * * * * cd /opt/healthcare-itsm && \
  /usr/bin/node scripts/ops/check.mjs \
    --url https://itsm.rs.example.com \
    --backup-dir /srv/backups \
    --data-dir /var/lib/docker/volumes/healthcare_itsm_pb_data/_data \
    --json >> /var/log/itsm-ops-check.log 2>&1 || \
  /usr/local/bin/notify-ops "ITSM check gagal"
```

Sesuaikan path Node/volume. Bila host tidak punya Node, jalankan lewat container
kecil atau gunakan probe HTTP + shell `find` untuk backup. Tambahkan
`--push-url` (atau `OPS_PUSH_URL`) agar kegagalan juga dikirim ke Uptime Kuma;
detailnya ada di [MONITORING.md](./MONITORING.md).

### 9.4 Retensi log

- Log container dibatasi ukuran (di atas); ini mencegah disk penuh karena log.
- Untuk audit jangka panjang, kirim log ke sistem log terpusat (Loki/ELK) bila
  RS membutuhkannya. `audit_logs` aplikasi **bukan** log server dan ikut backup.
- Jangan menyimpan log berisi data pasien/rahasia lebih lama dari kebijakan RS.

---

## 10. Akses, rahasia, dan offboarding

- Akses server: SSH key, least privilege, MFA di penyedia cloud bila ada.
- Admin UI: hanya lewat tunnel; superuser bukan akun harian.
- `.env` berisi kredensial SMTP dan kunci enkripsi; simpan di pengelola
  password, rotasi bila ada pergantian staf.
- Offboarding staf:
  1. Nonaktifkan akun di **Pengaturan → Tim** (sesi putus).
  2. Reset password dan reset 2FA bila perangkat hilang.
  3. Buka kunci akun bila perlu.
  4. Catat di audit dan serahkan tanggung jawab ke pengganti.
- Hapus akses server/NAS/backup milik staf yang keluar.

---

## 11. Jadwal perawatan

| Frekuensi | Tugas |
|---|---|
| Harian | Cek alert, health, backup terbaru, antrean email |
| Mingguan | Cek disk, log error, akun baru/nonaktif, update status |
| Bulanan | Verifikasi off-host backup, rotasi kredensial bila perlu, review akses |
| 3 bulanan | Uji restore (§6), review RTO/RPO, patch PocketBase |
| Tahunan | Review DPA/retensi/UU PDP bersama RS |

---

## 12. Lampiran — perintah cepat

```bash
# health & status
curl -fsS https://$APP_DOMAIN/api/health
docker compose ps
docker compose logs --tail=200 pocketbase

# backup
ls -lh backups | tail
npm run ops:check -- --backup-dir ./backups
tar -tf backups/pb_backup_*.zip | head

# restore (Admin UI)
docker compose cp backups/<file>.zip pocketbase:/pb/pb_data/backups/
ssh -L 8090:127.0.0.1:8090 user@server

# drill lokal
npm run ops:restore-drill

# versi & migrasi
docker compose exec pocketbase /usr/local/bin/pocketbase --version
```

Checklist restore ringkas:

- [ ] Traffic dihentikan dan maintenance diumumkan.
- [ ] Backup kondisi sekarang + ZIP target terverifikasi.
- [ ] Restore ke volume/staging, bukan langsung menimpa produksi.
- [ ] Health, login, 2FA, tiket, lampiran, laporan, audit, QR.
- [ ] Catat RTO/RPO dan hasil di `docs/restore-tests/`.
- [ ] Simpan volume/backup lama sampai verifikasi selesai.

---

## 13. Riwayat perubahan dokumen

| Tanggal | Perubahan | Oleh |
|---|---|---|
| 2026-11-10 | Runbook awal, prosedur backup/restore/upgrade, drill lokal | Implementasi S0-3 |
