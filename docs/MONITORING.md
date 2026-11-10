# Monitoring & Alerting — Healthcare ITSM

Dokumen ini melengkapi [runbook operasi](./OPERATIONS.md). Fokusnya: memastikan
kegagalan diketahui **sebelum** rumah sakit menelepon, tanpa menambah aplikasi
monitoring berat di server yang sama.

- **Status:** konfigurasi repo siap; instance Uptime Kuma dan uji alert diisi
  operator.
- **Alat eksternal:** Uptime Kuma (disarankan di host/VPS terpisah).
- **Sinyal host/aplikasi:** `npm run ops:check` + push heartbeat.
- **Pemilik alert:** IT Lead implementasi + IT RS.

> Prinsip: monitor harus berada **di luar host aplikasi**. Kalau Uptime Kuma
> dijalankan di server yang sama, matinya server ikut mematikan monitor.

---

## 1. Topologi

```text
Uptime Kuma (host terpisah / layanan hosted)
  ├── HTTP(s)  → https://itsm.rs.example.com/api/health   (PocketBase)
  ├── HTTP(s)  → https://itsm.rs.example.com/healthz      (Caddy)
  ├── TLS      → itsm.rs.example.com                       (expiry)
  └── Push     ← cron/systemd ops:check (health + backup + disk)
          │
          └── notifikasi: email / Telegram / WhatsApp / SMS

Server aplikasi
  └── ops:check --push-url https://uptime.../api/push/<TOKEN>
```

Uptime Kuma memberi tahu bila HTTP mati, sertifikat hampir kedaluwarsa, atau
heartbeat `ops:check` tidak masuk. `ops:check` menangkap kondisi yang tidak
terlihat dari HTTP: backup basi dan disk hampir penuh.

---

## 2. Monitor yang dibuat di Uptime Kuma

| # | Nama | Tipe | Target | Interval | Retry | Alert |
|---|---|---|---|---|---|---|
| 1 | ITSM API | HTTP(s) | `https://itsm.rs.example.com/api/health` | 60 s | 2 | status ≠ 200 |
| 2 | ITSM Web | HTTP(s) keyword | `https://itsm.rs.example.com/healthz` | 60 s | 2 | bukan `ok` |
| 3 | Sertifikat TLS | TLS/Expiry | `itsm.rs.example.com` | 12 jam | — | < 14 hari |
| 4 | ITSM Ops Check | Push | token dari Uptime Kuma | 10 menit | grace 15 menit | heartbeat hilang / status down |
| 5 | Halaman login (opsional) | HTTP(s) | `https://itsm.rs.example.com/login` | 5 menit | 2 | status ≠ 200 |

Catatan:

- Monitor #1 adalah health PocketBase; #2 memastikan Caddy/static tetap hidup.
- Gunakan **status code** untuk #1; jangan bergantung pada isi JSON yang bisa
  berubah antar versi.
- Monitor #4 menerima `status=down` saat `ops:check` menemukan masalah, dan
  akan berstatus down sendiri bila cron berhenti mengirim heartbeat.

### 2.1 Notifikasi

- Minimal **dua kanal** (mis. email IT + Telegram/WhatsApp on-call) agar satu
  kanal gagal tidak mematikan alert.
- Uji tombol **Test Notification** di Uptime Kuma sebelum pilot.
- Atur maintenance window saat upgrade/restore agar tidak memicu alarm palsu.
- Tautkan pesan alert ke [`docs/OPERATIONS.md`](./OPERATIONS.md) (atau URL
  internal runbook) supaya penerima langsung tahu langkah pertama.

---

## 3. Pemeriksaan host: `ops:check`

```bash
npm run ops:check -- \
  --url https://itsm.rs.example.com \
  --backup-dir /srv/backups \
  --data-dir /var/lib/docker/volumes/healthcare_itsm_pb_data/_data \
  --push-url https://uptime.example.com/api/push/<TOKEN>
```

Yang diperiksa:

| Pemeriksaan | Gagal bila | Default |
|---|---|---|
| Health | `/api/health` bukan 200 / timeout | 5 detik |
| Backup | tidak ada ZIP, ZIP 0 byte, atau termuda > 26 jam | 26 jam |
| Disk | terpakai ≥ 90% (critical) | warning 80% |
| Push | heartbeat tidak terkirim | 5 detik |

Perilaku:

- **fail** → exit code 1 dan push `status=down`.
- **warn** → exit code 0, push `status=up` dengan pesan warning.
- Tanpa `--push-url`/`OPS_PUSH_URL`, script hanya mencetak hasil (cocok untuk
  pengecekan manual).
- Output `--json` cocok untuk log/cron; token push tidak pernah dicetak.

Ambang dapat diubah lewat flag atau environment:

```bash
OPS_URL=https://itsm.rs.example.com
OPS_BACKUP_DIR=/srv/backups
OPS_DATA_DIR=/var/lib/docker/volumes/healthcare_itsm_pb_data/_data
OPS_PUSH_URL=https://uptime.example.com/api/push/<TOKEN>
OPS_MAX_BACKUP_AGE_HOURS=26
OPS_DISK_WARN=80
OPS_DISK_CRITICAL=90
```

### 3.1 Cron

```cron
*/10 * * * * cd /opt/healthcare-itsm && \
  /usr/bin/node scripts/ops/check.mjs \
    --json >> /var/log/itsm-ops-check.log 2>&1
```

Dengan `OPS_*` di `/etc/healthcare-itsm/ops.env`, gunakan `env $(cat ...)`
atau systemd (lebih rapi, lihat §3.2). Pastikan user cron dapat membaca
direktori backup dan `data-dir` (statfs).

### 3.2 Systemd timer (disarankan)

Template ada di [`scripts/ops/systemd/`](../scripts/ops/systemd/):

```bash
sudo mkdir -p /etc/healthcare-itsm
sudo cp scripts/ops/systemd/itsm-ops-check.service /etc/systemd/system/
sudo cp scripts/ops/systemd/itsm-ops-check.timer /etc/systemd/system/
sudo cp scripts/ops/systemd/ops.env.example /etc/healthcare-itsm/ops.env
sudo chmod 600 /etc/healthcare-itsm/ops.env
sudo editor /etc/healthcare-itsm/ops.env   # isi URL, path, token push
sudo systemctl daemon-reload
sudo systemctl enable --now itsm-ops-check.timer
systemctl list-timers itsm-ops-check.timer
journalctl -u itsm-ops-check.service -n 50
```

Sesuaikan `User=`, `WorkingDirectory=`, dan path Node di unit. Token push
adalah rahasia; jangan commit `ops.env`.

---

## 4. Ambang dan respons

| Sinyal | Warning | Critical | Tindakan pertama |
|---|---|---|---|
| Health API | 1 gagal | 2 gagal / 5 menit | Cek container, log, disk, memori |
| Health web | 1 gagal | 2 gagal | Cek Caddy, TLS, proxy |
| Disk | 80% | 90% | Bersihkan backup/log lama, off-host, tambah disk |
| Backup | > 26 jam | > 48 jam / 0 byte | Cek cron 02:00, sidecar, izin volume; backup manual |
| TLS | < 14 hari | < 3 hari | Cek DNS/port 80/443, renew Caddy |
| Memori | 80% limit | OOM/restart | Restart/analisis; naikkan limit bila perlu |
| 5xx | lonjakan 5 menit | > 5% selama 10 menit | Lihat log, rollback bila terkait deploy |
| Antrean email | gagal > 10 | menumpuk > 1 jam | Perbaiki SMTP, dispatch manual |

Semua tindakan mengacu ke §8 [OPERATIONS.md](./OPERATIONS.md).

---

## 5. Rotasi dan retensi log

Konfigurasi saat ini (Docker Compose):

| Container | Driver | Batas |
|---|---|---|
| pocketbase | json-file | 10 MB × 3 file |
| web (Caddy) | json-file | 10 MB × 3 file |
| backup | json-file | 5 MB × 2 file |

Verifikasi:

```bash
docker inspect --format '{{json .HostConfig.LogConfig}}' \
  $(docker compose ps -q pocketbase)
docker system df
du -sh /var/lib/docker/containers/* 2>/dev/null | sort -h | tail
```

Kebijakan:

- Log container dibatasi ukuran agar disk tidak penuh; retensi efektif
  bergantung volume trafik. Untuk audit jangka panjang, kirim ke Loki/ELK.
- Jangan menyimpan log berisi data pasien/rahasia melebihi kebijakan RS.
- `audit_logs` aplikasi ikut backup; jangan disamakan dengan log server.
- Pantau disk karena backup 30 hari + log + data bertambah.

---

## 6. Uji alert (wajib sebelum pilot)

Lakukan di luar jam kerja; beri tahu RS. Catat bukti di tabel §6.1.

1. **API down:** `docker compose stop pocketbase` selama 2–3 menit. Pastikan
   monitor #1 dan #4 memberi alert; nyalakan kembali.
2. **Web down:** `docker compose stop web`; monitor #2 memberi alert.
3. **Cron/heartbeat mati:** `sudo systemctl stop itsm-ops-check.timer` lebih
   dari grace period; monitor #4 menjadi down. Nyalakan kembali.
4. **Backup basi:** jalankan manual dengan
   `--max-backup-age-hours 0 --push-url ...` pada data uji; pastikan pesan
   “backup terbaru …” dan status down.
5. **Disk critical:** **jangan** memenuhi disk produksi. Uji
   `--disk-warn 1 --disk-critical 2` pada `--data-dir` uji untuk memastikan
   jalur alert, atau uji di VM staging.
6. **Notifikasi:** kirim test dari Uptime Kuma ke semua kanal.
7. **TLS:** gunakan fitur test/expiry Uptime Kuma; jangan menunggu sertifikat
   benar-benar kedaluwarsa.

### 6.1 Bukti uji

| Tanggal | Skenario | Hasil | Penerima alert | Catatan |
|---|---|---|---|---|
| — | Belum dijalankan | — | — | Isi setelah Uptime Kuma tersedia |

---

## 7. Cakupan dan batas

Sudah tercakup oleh kombinasi Uptime Kuma + `ops:check`:

- uptime API/web dari luar, TLS, heartbeat, backup basi, disk.

Belum otomatis (periksa manual/berkala sampai ada kebutuhan):

- rate 5xx per endpoint (butuh log/metrics),
- pemakaian memori/CPU per proses (bisa ditambah Netdata/Beszel),
- panjang antrean `email_outbox`,
- latency database/query,
- error hook tertentu di log.

Untuk pilot, cakupan di atas sudah memadai; tambahkan metrik aplikasi bila
volume tiket naik atau RS meminta dashboard operasional.

---

## 8. Hubungan dengan dokumen lain

- [OPERATIONS.md](./OPERATIONS.md) — prosedur restore, upgrade, insiden.
- [restore-tests/](./restore-tests/) — bukti uji restore.
- [`scripts/ops/check.mjs`](../scripts/ops/check.mjs) — implementasi probe.
- [`docker-compose.yml`](../docker-compose.yml) — healthcheck dan rotasi log.
