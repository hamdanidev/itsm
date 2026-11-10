# Template catatan uji restore

Salin file ini menjadi `YYYY-MM-DD-lingkungan.md` (contoh:
`2026-11-10-local.md`, `2026-12-01-staging.md`) dan isi semua bagian. Jangan
menghapus bagian yang tidak lulus; tulis apa adanya beserta tindak lanjutnya.

- **Status:** LULUS / LULUS DENGAN CATATAN / GAGAL
- **Jenis:** drill lokal / staging / produksi
- **Tanggal/jam:**
- **Pelaksana:**
- **PocketBase:**
- **Lingkungan:** (OS, host, versi image, ukuran data, TLS/SMTP aktif?)
- **Backup:** nama file, ukuran, checksum SHA-256, sumber (lokal/off-host)
- **Password/kredensial uji:** JANGAN tulis password; cukup cara memperolehnya

## Tujuan

Jelaskan skenario yang diuji: host hilang, database korup, salah hapus, atau
upgrade gagal.

## Data uji

| Item | Sebelum restore | Setelah restore |
|---|---|---|
| Tenant | | |
| User | | |
| Tiket | | |
| Lampiran | | |
| Audit log | | |
| Tiket terbaru | | |
| Login + 2FA | | |

## Langkah

1.
2.
3.

## Hasil pemeriksaan

- [ ] Health `/api/health` 200
- [ ] Login Kepala IT berhasil
- [ ] 2FA (jika aktif) berfungsi
- [ ] Jumlah user/tiket/audit sesuai
- [ ] Tiket terbaru dan nomornya sesuai
- [ ] Lampiran lama dapat diunduh
- [ ] Laporan/CSV terbuka
- [ ] QR intake (jika dipakai)
- [ ] Antrean email tidak membanjiri pengguna
- [ ] Audit mencatat aktivitas setelah restore
- [ ] Tidak ada migrasi gagal

Catat waktu:

| Tahap | Durasi |
|---|---|
| Hentikan aplikasi | |
| Restore/ekstrak | |
| Nyalakan + health | |
| Verifikasi | |
| **Total (RTO terukur)** | |

## Masalah dan tindak lanjut

| Masalah | Dampak | Tindakan | Pemilik | Tenggat |
|---|---|---|---|---|
| | | | | |

## Kesimpulan

- Apakah prosedur dapat diikuti orang lain tanpa bertanya? …
- Apakah RTO/RPO target tercapai? …
- Perubahan runbook yang diperlukan: …
