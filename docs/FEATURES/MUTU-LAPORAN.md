# Aset/CI, CSAT, laporan, dan audit

Register aset, kepuasan pelapor, laporan SLA/operasional, dan jejak audit.

Bagian ini dipindahkan dari README (perapian dokumen 2026-11-10). Daftar route ada di [API.md](../API.md); data model di [DATA-MODEL.md](../DATA-MODEL.md).

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

## Detail teknis: perhitungan laporan SLA

> Pelengkap bagian di atas: kontrak level field dan detail implementasi (dipindahkan dari SCHEMA, 2026-11-10).

`GET /api/itsm/reports/sla` mengagregasi tiket yang **dibuat** pada rentang
`from`–`to` (tanggal kalender pada zona laporan, `YYYY-MM-DD`), default 90 hari,
maksimal 366 hari. Agregasi dijalankan di server
(`pb_hooks/lib/reporting.js`), bukan di browser.

Parameter: `from`, `to`, `bucket` (`month` default, `week` memakai ISO week),
`timezone` (nama IANA, divalidasi), dan `tenant` (khusus akun vendor). Zona
laporan ditentukan `lib/report_request.js`: `timezone` eksplisit > zona tenant
yang dilihat > `Asia/Jakarta`. Batas hari, bucket bulan/minggu, dan teks tanggal
di CSV mengikuti zona itu; tanggal tenggat tiket sendiri selalu disimpan UTC.

Cakupan ditentukan `lib/platform.js#reportScope`:

| Akun | `tenant` | Cakupan |
|---|---|---|
| IT Lead rumah sakit | diabaikan | selalu `own` — tenant sendiri |
| Vendor lead | kosong | `all` — gabungan semua rumah sakit |
| Vendor lead | `<id>` | `one` — satu rumah sakit |

Akun vendor **tidak** bisa memakai `tenant` untuk keluar dari batasnya sendiri,
dan akun rumah sakit tidak bisa memperluas cakupan dengan parameter itu
(diabaikan). Vendor support (`it_support`) tetap ditolak karena laporan
memakai `assertLead`.

Respons:

- `range` — `from`, `to`, `days`, `bucket`, `timezone`.
- `scope` — `{ mode: "own"|"one"|"all", tenant }`.
- `summary` — `total`, `resolved`, `breached`, `compliance` (persen),
  `median_response_minutes`, `median_resolution_minutes`, `reopens`.
- `trend` — per bucket: `created`, `resolved`, `breached`, `compliance`.
- `units`, `services`, `priorities`, `types` — `{ name, summary }` dengan bentuk
  summary yang sama. `services` dikelompokkan dari relasi `tickets.service`;
  tiket tanpa layanan masuk ke `Tanpa layanan`.
- `breaches` — maksimal 20 tiket breach terbaru (nomor, unit, tenant,
  prioritas, status, waktu breach, level eskalasi).
- `tenants` — hanya pada mode `all`: `{ id, name, code, summary }` per rumah
  sakit, urut dari tiket terbanyak. Ini yang dipakai tabel perbandingan RS.

Definisi `breach`, compliance, median respons/resolusi, dan satuan menit
kalender mengikuti bagian **Laporan SLA** di atas.

`GET /api/itsm/reports/sla.csv` memakai filter yang sama dan mengirim satu baris
per tiket (UTF-8 + BOM, pemisah koma) untuk diolah di Excel. Kolom waktu memakai
akhiran `_local` (`created_local`, `first_response_local`, `resolved_local`) dan
berisi waktu lokal zona laporan. Saat cakupannya `all`, kolom pertama menjadi
`tenant`; ekspor satu rumah sakit memakai header tanpa kolom itu.
