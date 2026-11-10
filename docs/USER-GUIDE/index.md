# Panduan Pengguna Healthcare ITSM

Dokumen untuk **pengguna rumah sakit** — perawat, staf unit, kepala unit, dan
staf IT — bukan dokumentasi teknis. Isinya menjawab "klik apa, di mana, lalu apa
yang terjadi", dengan gambar dari aplikasi yang benar-benar berjalan.

Status: **v1.1 lengkap** — delapan bab, dari pengantar ITSM sampai vendor.

| Bab | Untuk | Status |
|---|---|---|
| [00 — Apa itu ITSM dan manfaatnya](00-pengantar.md) | Semua pembaca | ✅ |
| [01 — Masuk, akun, dan keamanan](01-masuk-dan-akun.md) | Semua pengguna | ✅ |
| [02 — Membuat dan memantau tiket](02-pemohon.md) | Perawat, staf unit, kepala unit (approver) | ✅ |
| [03 — Antrean dan pekerjaan service desk](03-service-desk.md) | Staf IT, teknisi, resolver | ✅ |
| [04 — Pengaturan, tim, laporan, audit](04-admin.md) | Kepala IT / admin | ✅ |
| [05 — Konsol vendor (mode multi-RS)](05-vendor.md) | Staf platform/vendor | ✅ |
| [06 — Lapor lewat QR tanpa login](06-qr-publik.md) | Pelapor tamu | ✅ |
| [99 — Lampiran: peran, status, glosarium, FAQ](99-lampiran.md) | Semua pengguna | ✅ |

## Jalur baca yang disarankan

- **Pengguna baru (10 menit):** bab 01 (masuk + ganti password), lalu bab 02
  bagian 1–5.
- **Perawat / staf unit (10 menit):** bab 02 bagian 1–5, lalu bagian 6 dan 9.
- **Kepala unit:** bab 01 bagian 6 (2FA), lalu bab 02 bagian 7 (approval).
- **Staf IT / teknisi (25 menit):** bab 02 untuk sisi pelapor, lalu bab 03
  bagian 1–10.
- **Kepala IT (40 menit):** bab 03 bagian 11–14, lalu bab 04.
- **Pelapor tamu:** bab 06 saja.
- **Tim vendor:** bab 05, lalu bab 04 untuk data master per rumah sakit.

## Versi 1.0

Versi 1.0 mencakup seluruh alur yang sudah berjalan di aplikasi. Bab 05
(konsol vendor) hanya relevan untuk instalasi `TENANCY_MODE=vendor`; pada mode
standalone, bab itu boleh dilewati.

## Sumber dan versi

- Sumber tunggal: file Markdown di folder ini. PDF dan HTML dibangun dari file
  yang sama, jadi tidak ada dua versi yang berbeda isi.
- Gambar diambil otomatis dari instalasi demo (`RS Sehat Digital`, tenant
  `DEMO01`) memakai akun fiktif. Tidak ada data rumah sakit nyata dan tidak ada
  data pasien.
- Versi dan tanggal rilis ada di [`book.json`](book.json); perubahan isi dicatat
  di `CHANGELOG.md` repositori.

## Menghasilkan ulang gambar

Jalankan instance terpisah supaya data rumah sakit di `backend/pb_data` tidak
tersentuh:

```bash
# 1. PocketBase khusus panduan (port 8091, data di .tmp)
PB_HTTP=127.0.0.1:8091 PB_DATA_DIR=.tmp/pb_data-guide node scripts/dev.mjs --pb-only

# 2. Vite yang menunjuk instance itu (port 5174)
PB_TARGET=http://127.0.0.1:8091 VITE_DEV_PORT=5174 node scripts/dev.mjs --web-only

# 3. Superuser + data demo
PB_DATA_DIR=.tmp/pb_data-guide npm run pb:superuser -- admin@itsm.local "PasswordKuat123!"
PB_URL=http://127.0.0.1:8091 npm run seed -- --profile busy --seed 42

# 4. Ambil gambar (semua, atau satu bab)
GUIDE_BASE_URL=http://localhost:5174 GUIDE_PB_URL=http://127.0.0.1:8091 npm run guide:shots
GUIDE_BASE_URL=http://localhost:5174 GUIDE_PB_URL=http://127.0.0.1:8091 npm run guide:shots -- --only 02-pemohon
```

Di PowerShell, setel environment satu per satu dengan `$env:NAMA="nilai"` sebelum
perintah.

Gambar didefinisikan di [`shots.json`](shots.json): setiap entri menyebut peran,
halaman, aksi, dan elemen yang diberi nomor panggil. Menambah gambar berarti
menambah entri di manifest dan menautkannya dari bab — bukan mengambil tangkapan
layar manual.

## Membangun HTML dan PDF

```bash
npm run guide:build   # docs/USER-GUIDE/dist/panduan-pengguna.html + gambar
npm run guide:pdf     # + PDF A4 dengan daftar isi, nomor halaman, dan versi
```

Hasil build masuk `dist/` dan tidak di-commit.

## Aturan menulis

1. Bahasa Indonesia, mengikuti label di layar. Istilah ITIL dijelaskan di
   glosarium.
2. Satu langkah = satu gambar; sebut nomor panggilnya di teks.
3. Alt text wajib dan deskriptif.
4. Jangan menulis nama, NIK, nomor rekam medis, atau alamat pasien — di teks
   maupun di gambar.
5. Bab baru mengikuti [`template.md`](template.md) dan didaftarkan di
   `book.json`, lalu `npm run guide:check` harus hijau.
6. Setiap perubahan label atau alur di UI wajib disertai gambar baru di PR yang
   sama (`npm run guide:shots -- --only <bab>`).

> **Data pasien.** Aturan di `README.md` berlaku penuh di sini: tiket dan
> screenshot tidak boleh memuat identitas pasien. Screenshot panduan hanya boleh
> berasal dari tenant demo.
