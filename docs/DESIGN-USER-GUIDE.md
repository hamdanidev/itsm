# Rencana User Guide Bergambar — Healthcare ITSM

Status: **fase 0–4 selesai** — panduan v1.0 (tujuh bab) ada di
[`USER-GUIDE/`](USER-GUIDE/), disajikan di `/panduan.html` dengan tautan Bantuan,
dan PDF dirilis bersama repo. Hanya GitHub Pages yang belum dipakai. Dokumen
ini menjawab dua pertanyaan: bentuk user guide-nya seperti apa, dan di mana ia
diletakkan di repo serta di distribusi ke rumah sakit.

Konteks: aplikasi sudah punya dokumentasi teknis yang rapat — perilaku modul di
[`FEATURES/`](FEATURES/), route di [`API.md`](API.md), data model di
[`DATA-MODEL.md`](DATA-MODEL.md), operasi di [`OPERATIONS.md`](OPERATIONS.md).
Yang belum ada adalah dokumen untuk **pengguna akhir rumah sakit** (perawat,
kepala unit, staf IT, Kepala IT) yang menjelaskan "klik apa, di mana, lalu apa
yang terjadi" dengan gambar.

---

## 1. Ringkasan keputusan

| Aspek | Rekomendasi |
|---|---|
| Bentuk | **Satu buku**, bab per peran + bab referensi. Bukan satu file per menu. |
| Gaya | Task-based: satu tugas = satu bab kecil, langkah bernomor, 1 langkah = 1 gambar. |
| Sumber | Markdown di `docs/USER-GUIDE/` (satu sumber kebenaran, ikut versi kode). |
| Gambar | JPEG 1440×900, dibuat **otomatis** oleh skrip Playwright dari data seed demo. |
| Artefak | HTML satu halaman (navigasi + Ctrl+F + bisa offline) dan **PDF** untuk pelatihan/akreditasi. |
| Publikasi | PDF ke rumah sakit pilot; HTML opsional di `/panduan.html` atau GitHub Pages. |
| Tooling | `playwright-core` (sudah ada) + `marked` (satu dependency kecil, tanpa transitive dep). |
| Penjaga | Test baru `tests/unit/guide.test.mjs` + test link/gambar yang sudah ada. |
| Ukuran | ±55–70 gambar, ±45–60 halaman PDF, total gambar ≤ 12 MB. |

Alasan utama memilih Markdown + build ringan (bukan VitePress/Docusaurus):
dokumentasi ini harus hidup berdampingan dengan kode dan di-review di PR yang
sama, sementara pembacanya butuh PDF, bukan situs dengan search engine. Build
HTML/PDF dari Markdown yang sama menutup keduanya tanpa menambah server,
database, atau pipeline baru di produksi.

---

## 2. Siapa pembacanya

Peran diambil dari [`ITSM-ROLES.md`](ITSM-ROLES.md) dan akun demo dari
`scripts/lib/seed/content.mjs` (semua akun fiktif, domain `demo.local`).

| Pembaca | Akun demo | Yang dicari | Bab |
|---|---|---|---|
| Perawat / staf unit (pemohon) | `perawat.igd@demo.local` | Cara lapor gangguan & minta layanan, pantau tiket | 2, 6 |
| Kepala unit (approver) | `manajer.igd@demo.local` | Menyetujui/menolak permintaan unitnya | 2 |
| Staf IT / service desk | `support@demo.local` | Antrean, ambil tiket, jawab, eskalasi | 3 |
| Teknisi / resolver | `resolver.app@demo.local` | Mengerjakan tiket, resolve, problem, aset | 3 |
| Kepala IT / admin | `lead.it@demo.local` | Setup layanan, tim, SLA, laporan, audit | 4 |
| Pengamat manajemen | `viewer@demo.local` | Hanya membaca laporan | 4 (subbab laporan) |
| Staf vendor / platform | `vendor.seed@demo.local` | Mengelola banyak rumah sakit | 5 |
| Pelapor tanpa akun | — (QR) | Melapor lewat QR tanpa login, cek status | 6 |

Implikasi bentuk: **satu buku dengan penanda peran**, bukan tiga dokumen
terpisah. Satu PDF lebih mudah didistribusikan saat pelatihan, dan setiap bab
dibuka dengan label "Untuk: …" sehingga pembaca bisa melompat. Jalur baca cepat
disediakan di depan: 10 menit untuk perawat, 25 menit untuk service desk, 40
menit untuk Kepala IT.

---

## 3. Bentuk buku

### 3.1 Prinsip

1. **Tugas, bukan menu.** Judul bab memakai kalimat kerja ("Membuat tiket
   gangguan"), bukan nama menu ("Halaman Tiket"). Menu bisa berubah; tugas
   pengguna tidak.
2. **Satu langkah, satu gambar.** Pembaca membandingkan layar mereka dengan
   gambar langkah saat itu, bukan menebak dari satu tangkapan layar penuh.
3. **Gambar diberi nomor panggil.** Area penting ditandai outline biru + badge
   angka; teks langkah menyebut angka itu ("klik **(2) Buat tiket**"). Tidak ada
   panah gambar tangan, jadi gambar bisa diregenerasi otomatis tanpa diedit
   ulang.
4. **Selalu ada "hasil yang diharapkan".** Setelah langkah terakhir, pembaca
   tahu layar/status apa yang seharusnya muncul, supaya bisa mendeteksi sendiri
   kalau ada yang salah.
5. **Bahasa mengikuti UI.** Istilah di panduan = label di layar (Indonesia),
   istilah ITIL dijelaskan sekali di glosarium.

### 3.2 Template bab (dipakai semua bab)

```markdown
# Membuat tiket gangguan

| | |
|---|---|
| **Untuk** | Perawat, staf unit, siapa pun yang menemukan gangguan |
| **Prasyarat** | Sudah punya akun dan bisa masuk |
| **Waktu** | ± 3 menit |
| **Hasil** | Tiket bernomor `INC-…` masuk antrean service desk |

## Langkah

1. Buka menu **Tiket**, lalu klik **Buat tiket**.

   ![Tombol Buat tiket di kanan atas](img/02-pemohon/01-tombol-buat-tiket.jpg)

2. Pilih jenis **Incident**, lalu layanan yang terganggu.

   ![Langkah 1 wizard: pilih jenis dan layanan](img/02-pemohon/02-pilih-jenis.jpg)

…

## Yang perlu diperhatikan

> **Jangan menuliskan data pasien.** Tiket tidak boleh memuat nama pasien, NIK,
> nomor rekam medis, atau alamat. Sistem menolak tiket tanpa pernyataan
> (attestation) ini.

## Kalau macet

| Gejala | Penyebab umum | Yang dilakukan |
|---|---|---|
| Tombol **Buat tiket** tidak ada | Akun pengamat hanya bisa membaca | Minta Kepala IT menaikkan peran |
```

Setiap gambar diberi alt text deskriptif (wajib — dipakai pembaca layar dan
jadi pengganti saat PDF dicetak hitam-putih).

### 3.3 Daftar bab, isi, dan perkiraan gambar

| Bab | Isi | Gambar | Halaman |
|---|---|---|---|
| `00-pengantar.md` | Apa itu ITSM di RS ini, peta peran, alur tiket dari lapor sampai tutup, konvensi ikon | 3 | 4 |
| `01-masuk-dan-akun.md` | Login pertama + ganti password wajib, lupa/reset password, 2FA, profil, notifikasi, keluar | 8 | 6 |
| `02-pemohon.md` | Ringkasan, buat tiket (wizard 3 langkah), katalog layanan, pantau & komentar, lampiran, approval unit, CSAT, buka kembali tiket | 16 | 12 |
| `03-service-desk.md` | Antrean & papan, ambil/assign, ubah status & prioritas, komentar internal vs publik, resolusi, merge duplikat, SLA & eskalasi, problem/KB, insiden mayor, aset | 20 | 14 |
| `04-admin.md` | Pengaturan: identitas, unit, kategori, layanan, titik QR, kebijakan SLA, hari libur, tim (undang + impor CSV), logo; laporan & jadwal laporan; audit | 18 | 12 |
| `05-vendor.md` | Konsol vendor: daftar rumah sakit, status, data master lintas tenant, tiket lintas tenant | 6 | 4 |
| `06-qr-publik.md` | Intake QR tanpa login, nomor tiket, cek status lewat link, CSAT tamu | 6 | 4 |
| `99-lampiran.md` | Matriks peran × izin, daftar status & artinya, glosarium ITIL ↔ istilah RS, FAQ, keamanan data pasien | 2 | 5 |

Total ± 79 gambar; target realistis 60–70 setelah beberapa langkah
digabung. Estimasi 45–60 halaman A4.

---

## 4. Opsi yang dibandingkan

| Opsi | Kelebihan | Kekurangan | Putusan |
|---|---|---|---|
| **Markdown saja di repo** | Nol dependency; ikut review PR; link dicek test | Staf RS tidak membuka GitHub; tidak ada navigasi/PDF rapi | Dipakai sebagai **sumber**, bukan produk akhir |
| **VitePress / Docusaurus** | Search, sidebar, i18n, tema matang | Dependency + build + hosting baru; konten internal lain berisiko ikut terpublikasi; overkill untuk 1 buku | Tunda; bisa ditambahkan nanti tanpa mengubah sumber |
| **Halaman `/bantuan` di dalam aplikasi** | Kontekstual, selalu ada saat login | Menambah bundle, sulit dicetak, ikut dirilis tiap perubahan UI, tidak bisa dipakai sebelum login | Fase 4: cukup **tautan** ke panduan, bukan kontennya |
| **DOCX/PDF yang diedit manual (Word)** | Familiar untuk tim RS | Tidak ada versi terkontrol; gambar & nomor halaman cepat basi; tidak bisa di-review di PR | Tidak |
| **Video / Loom** | Cepat menangkap alur | Cepat basi, tidak bisa dicari, ukuran besar, tidak bisa dilampirkan ke dokumen akreditasi | Tidak; PDF + gambar sudah cukup |

Catatan: banyak rumah sakit meminta dokumen yang bisa mereka beri kop dan
lampirkan ke berkas akreditasi. PDF dari sumber Markdown memenuhi itu; bila
suatu saat perlu DOCX, konversi dari HTML yang sudah dibangun (pandoc) tetap
satu arah dan tidak mengubah sumber.

---

## 5. Di mana user guide diletakkan

### 5.1 Di repo

```text
docs/USER-GUIDE/
├── index.md                  # sampul, daftar isi, jalur baca per peran
├── 00-pengantar.md
├── 01-masuk-dan-akun.md
├── 02-pemohon.md
├── 03-service-desk.md
├── 04-admin.md
├── 05-vendor.md
├── 06-qr-publik.md
├── 99-lampiran.md
├── template.md               # template bab (lihat §3.2)
├── img/                      # hasil capture, di-commit
│   ├── 02-pemohon/
│   └── 03-service-desk/
├── shots.json                # manifest screenshot (lihat §7)
└── dist/                     # hasil build, gitignored
    ├── panduan-pengguna.html
    ├── img/
    └── Panduan-Pengguna-Healthcare-ITSM-v0.1.pdf
```

| Artefak | Lokasi | Status |
|---|---|---|
| Isi panduan | `docs/USER-GUIDE/*.md` | di-commit |
| Gambar | `docs/USER-GUIDE/img/<bab>/*.jpg` | di-commit |
| Manifest capture | `docs/USER-GUIDE/shots.json` | di-commit |
| Skrip capture & build | `scripts/guide/` | di-commit |
| Test | `tests/unit/guide.test.mjs` | di-commit |
| HTML + PDF | `docs/USER-GUIDE/dist/` | gitignored, dibuat saat rilis |
| PDF rilis | lampiran GitHub Release + kirim ke RS | tidak di repo |

Alasan `docs/USER-GUIDE/` dan bukan `docs/FEATURES/`: `FEATURES/` adalah
dokumentasi perilaku untuk developer/implementer, sedangkan panduan ini untuk
pengguna. Menaruhnya di `docs/` (bukan folder baru di root) membuatnya otomatis
masuk pengecekan tautan `tests/unit/docs.test.mjs` — setiap gambar (`![]` dengan
path relatif `img/…`) juga
diperiksa keberadaannya oleh test itu, jadi tautan gambar rusak akan gagal di CI
tanpa test tambahan.

**Yang sengaja tidak dilakukan:** menyimpan sumber panduan di
`frontend/public/`. Kalau ditaruh di sana, Vite akan menyalinnya ke bundle
aplikasi, tidak ikut pengecekan tautan, dan ikut terhapus saat `dist/`
dibersihkan.

### 5.2 Di distribusi

| Saluran | Isi | Kapan |
|---|---|---|
| PDF | `Panduan-Pengguna-Healthcare-ITSM-vX.Y.pdf` | Setiap rilis; dipakai pelatihan, onboarding, lampiran akreditasi |
| HTML statis | `dist/panduan-pengguna.html` + `img/` (satu folder, bisa di-ZIP) | Untuk RS yang ingin intranet/offline; tanpa server |
| `/panduan.html` di domain aplikasi | Hasil build disalin ke `frontend/public/panduan.html` sebelum build image | Opsional, fase 4; Caddy yang sudah ada menyajikannya (`try_files` ke `index.html` tidak mengganggu karena `/panduan.html` punya `index.html` sendiri) |
| GitHub Pages | Workflow baru meng-upload `dist/` | Opsional; berguna untuk calon pelanggan, bukan syarat |
| Tautan dalam aplikasi | Item **Bantuan** di sidebar/topbar → `/panduan.html` atau `VITE_GUIDE_URL`, buka tab baru | Fase 4, perubahan kecil di `AppShell.jsx` |

Catatan keamanan: panduan memakai tenant demo (`DEMO01`) dan akun fiktif,
sehingga tidak membocorkan data rumah sakit maupun data pasien. Jangan pernah
mengambil gambar dari instalasi produksi.

---

## 6. Standar screenshot

| Butir | Aturan |
|---|---|
| Sumber data | Instalasi lokal hasil `npm run seed -- --profile busy --seed 42 --reset --yes`; tenant demo `DEMO01` |
| Akun | Satu akun demo per peran (§2); password seed `SeedDemo123!` |
| Viewport | 1440×900 CSS px, `deviceScaleFactor: 1` (≈215 dpi saat dicetak selebar A4) |
| Tema | Terang; sidebar terbuka penuh (bukan rail ikon) agar konteks navigasi terlihat |
| Waktu | Animasi & transisi dimatikan sebelum capture; tunggu skeleton hilang dan `networkidle` |
| Anotasi | Outline `#0052CC` 3 px + badge angka di pojok kiri atas elemen target, disuntik lewat CSS/DOM saat capture |
| Format | JPEG kualitas 85; target ≤ 250 KB/gambar; total ≤ 12 MB |
| Nama file | `NN-kata-kerja.jpg`, ASCII, huruf kecil, dalam folder per bab |
| Alt text | Wajib, kalimat deskriptif bahasa Indonesia |
| Larangan | Data pasien (nama, NIK, No. RM, alamat), email/nama staf nyata, token/URL internal, angka biaya nyata |
| Kebersihan | Kursor disembunyikan; toast/notifikasi sementara ditutup; tidak ada tab browser lain |

Kalau kualitas teks JPEG terasa kurang saat diperbesar, naikkan ke
`deviceScaleFactor: 2` (ukuran ±3–4×) atau konversi ke WebP lewat `sharp`
(dependency tambahan). Default tetap JPEG 1× supaya repo tidak membengkak.

Gambar yang menampilkan nama orang akan memakai nama akun demo (`Andi Pratama`,
`Bayu Setiawan`, dst.) — fiktif dan sudah dipakai di `README`. Ini juga membuat
tangkapan layar konsisten dengan data seed, sehingga pembaca yang menjalankan
`npm run seed` melihat layar yang sama.

---

## 7. Otomasi screenshot

### 7.1 Manifest `docs/USER-GUIDE/shots.json`

```json
{
  "version": 1,
  "baseUrl": "http://localhost:5173",
  "viewport": { "width": 1440, "height": 900, "deviceScaleFactor": 1 },
  "theme": "light",
  "sidebar": "expanded",
  "shots": [
    {
      "id": "02-pemohon/01-tombol-buat-tiket",
      "chapter": "02-pemohon.md",
      "role": "perawat.igd@demo.local",
      "path": "/tickets",
      "waitFor": "table.issue-table, .empty-state",
      "highlight": [{ "selector": "a.btn-primary", "label": "1" }],
      "note": "Tombol Buat tiket di kanan atas"
    },
    {
      "id": "02-pemohon/02-pilih-jenis",
      "chapter": "02-pemohon.md",
      "role": "perawat.igd@demo.local",
      "path": "/tickets/new",
      "actions": [{ "type": "click", "selector": "text=Incident" }],
      "highlight": [
        { "selector": ".wizard-step", "label": "1" },
        { "selector": "button:has-text('Lanjut')", "label": "2" }
      ],
      "note": "Langkah 1 wizard: pilih jenis tiket"
    }
  ]
}
```

Manifest adalah **daftar tugas capture**, bukan skrip bebas. Alasannya: bisa
dicek test (setiap `id` punya file gambar, setiap `path` ada di router, setiap
gambar dipakai di bab), dan penulis panduan tidak perlu menyentuh kode
Playwright untuk menambah gambar.

### 7.2 Perilaku skrip `scripts/guide/screenshots.mjs`

1. Login sekali per peran lewat form, simpan `storageState`; pakai ulang untuk
   semua shot peran itu (cepat dan tidak mengulang 2FA).
2. Untuk setiap shot: buka `path`, jalankan `actions`, tunggu `waitFor`, matikan
   animasi (`* { animation: none !important; transition: none !important }`),
   sembunyikan kursor, suntik outline + badge, lalu `page.screenshot({ type:
   "jpeg", quality: 85, path: "docs/USER-GUIDE/img/<id>.jpg" })`.
3. Gagal keras bila: login peran gagal, selector `highlight`/`waitFor` tidak
   ketemu, atau halaman menampilkan error boundary — jangan menghasilkan gambar
   setengah jadi.
4. Mode `--only <prefix>` untuk mengulang satu bab; mode `--list` untuk melihat
   daftar shot tanpa menjalankan browser.
5. Menulis `docs/USER-GUIDE/img/<id>.jpg` dan ringkasan (jumlah, ukuran total,
   shot yang dilewati) ke stdout.

Prasyarat lokal: `npm run dev` (PocketBase + Vite), superuser, lalu seed.
Chromium sudah tersedia lewat `tests/lib/chromium.mjs`; skrip memakai resolver
yang sama sehingga tidak mengunduh browser baru.

### 7.3 Batasan determinisme

Nomor tiket dan waktu relatif ("2 hari lalu") berubah setiap seed dijalankan
ulang. Yang dijamin stabil: tata letak, label, pilihan data (jenis tiket,
status, layanan), dan nama akun demo. Karena itu review gambar tetap manual
(lihat diff gambar di PR), bukan uji piksel. Bila kelak butuh identik,
tambahkan dukungan `--now` di seed dan bekukan jam browser dengan `page.clock`.

---

## 8. Build HTML dan PDF

`scripts/guide/build.mjs`:

1. Baca `index.md` + semua bab sesuai urutan di `index.md`.
2. Render Markdown → HTML dengan `marked` (GFM: tabel, daftar, blok kode).
3. Bungkus dengan template: `<title>`, daftar isi otomatis dari heading,
   navigasi bab sebelumnya/berikutnya, CSS cetak.
4. Tulis `docs/USER-GUIDE/dist/panduan-pengguna.html` dan salin `img/`.
5. PDF: buka HTML hasil build di Chromium (`tests/lib/chromium.mjs`), panggil
   `page.pdf({ format: "A4", printBackground: true, displayHeaderFooter: true,
   headerTemplate, footerTemplate })`. Footer berisi
   `Panduan Pengguna Healthcare ITSM · v0.1 · Halaman X dari Y`.
6. CSS cetak: `h1 { page-break-before: always }` (kecuali sampul),
   `figure { break-inside: avoid }`, gambar `max-width: 100%`, tabel tidak
   terpotong di tengah baris.
7. Sampul: judul, versi, tanggal, "Untuk instalasi rumah sakit", tanpa logo
   rumah sakit nyata.

Tanpa JavaScript di HTML hasil build: bisa dibuka dari `file://`, dari intranet,
dan dari ZIP yang dikirim lewat email. Pencarian memakai Ctrl+F browser.

Satu dependency baru: `marked` (devDependency root, ±40 KB, tanpa transitive
dependency). Alternatif nol-dependency adalah membiarkan panduan hanya Markdown
dan mencetak PDF manual dari browser — tidak bisa direproduksi dan nomor
halaman tidak konsisten, jadi tidak direkomendasikan.

---

## 9. Penjaga mutu dan CI

### 9.1 Test `tests/unit/guide.test.mjs`

1. Setiap `shots[].id` punya file `img/<id>.jpg`, dan tidak ada file di `img/`
   yang tidak tercatat di manifest (tidak ada gambar yatim).
2. Setiap `shots[].path` ada sebagai route di `frontend/src/app/router.jsx`
   (atau dikenal sebagai route publik `/i/:token`, `/t/:token`) — mencegah
   panduan menunjuk halaman yang sudah dihapus.
3. Setiap bab yang terdaftar di `index.md` ada filenya, dan sebaliknya.
4. Setiap bab punya blok metadata `| **Untuk** |`, `| **Prasyarat** |`, dan
   minimal satu gambar.
5. Setiap gambar ≤ 300 KB; total `img/` ≤ 12 MB.
6. Setiap alt text gambar tidak kosong.

Test link/gambar yang sudah ada (`docs.test.mjs`) otomatis menangkap gambar
hilang dan tautan bab yang salah.

### 9.2 CI

- **Setiap PR:** `npm test` (unit termasuk `guide.test.mjs`) dan build HTML +
  PDF dari gambar yang sudah di-commit. Gagal kalau link/gambar putus atau PDF
  tidak bisa dibuat.
- **Manual (`workflow_dispatch`) "Refresh panduan":** jalankan seed + capture di
  runner, unggah diff gambar sebagai artifact (bukan commit otomatis), supaya
  perubahan UI yang tidak diikuti panduan terlihat.
- **Aturan kontribusi** (ditulis di `docs/USER-GUIDE/index.md` dan
  `docs/TESTING.md`): setiap perubahan label/alur di UI wajib menjalankan
  `npm run guide:shots -- --only <bab>` dan menyertakan gambar baru di PR yang
  sama.

### 9.3 Perintah npm yang diusulkan

```bash
npm run guide:shots                 # capture semua gambar
npm run guide:shots -- --only 02-pemohon
npm run guide:build                 # HTML (+ salin gambar)
npm run guide:pdf                   # PDF dari HTML
npm run guide:check                 # test khusus panduan, tanpa API
```

---

## 10. Alur kerja penulis

1. `npm run dev`, buat superuser, lalu
   `npm run seed -- --profile busy --seed 42 --reset --yes`.
2. Tulis/ubah bab dari `template.md`; tambahkan entri `shots.json` untuk gambar
   baru.
3. `npm run guide:shots -- --only <bab>` lalu periksa hasilnya.
4. `npm run guide:build && npm run guide:pdf`; periksa PDF (halaman, nomor,
   tabel tidak terpotong).
5. `npm test` — pastikan `guide.test.mjs` dan `docs.test.mjs` hijau.
6. Commit: `.md`, `img/*.jpg`, `shots.json`. **Jangan** commit `dist/`.
7. Saat rilis: naikkan versi di `index.md`, bangun ulang PDF, lampirkan ke
   GitHub Release, perbarui `CHANGELOG.md`.

---

## 11. Fase kerja dan estimasi

| Fase | Output | Estimasi |
|---|---|---|
| 0. Fondasi | `template.md`, `index.md` kerangka, `shots.json` skema, `guide.test.mjs` (boleh gagal dulu), `.gitignore` untuk `dist/` | 0,5 hari |
| 1. Pilot satu bab | Skrip capture + build + PDF jalan; bab `02-pemohon.md` lengkap 16 gambar sebagai contoh gaya; review internal | 1,5 hari |
| 2. Isi lengkap | Bab 00, 01, 03, 04, 06 + lampiran; ±50 gambar; PDF pertama | 3 hari |
| 3. Rilis & penjaga | Versi, sampul, footer, CI build PDF, aturan kontribusi, tautan di README | 1 hari |
| 4. Integrasi (opsional) | Bab 05 vendor; `/panduan.html` di image; tautan **Bantuan** di `AppShell.jsx`; GitHub Pages | 1 hari |

Untuk pilot berbayar 30 hari (satu unit, 10–25 pengguna), **fase 0–2 sudah
cukup** dan bisa dipersempit ke bab 01, 02, 06 plus ringkasan admin — sekitar 2
hari — lalu dilengkapi setelah pilot. Ini sejalan dengan Sprint 1 di
[`ITSM-ROADMAP.md`](ITSM-ROADMAP.md); panduan pengguna sebaiknya ditambahkan ke
tabel Sprint 1 sebagai item adopsi.

---

## 12. Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| UI berubah, gambar basi | Panduan menyesatkan, kepercayaan turun | Capture otomatis + aturan PR + job refresh manual |
| Gambar memuat data pasien | Pelanggaran privasi, fatal untuk RS | Hanya tenant demo; checklist review; seed tidak pernah memuat data pasien |
| Repo membengkak | Clone/CI melambat | JPEG 1×, batas 300 KB/gambar, total ≤ 12 MB, `dist/` gitignored |
| Panduan terlalu panjang | Tidak dibaca | Jalur baca per peran, bab pendek, PDF dengan daftar isi + nomor halaman |
| Istilah ITIL asing | Pengguna bingung | Glosarium + label UI sebagai acuan |
| Satu sumber untuk dua audiens | Developer dan pengguna bercampur | `FEATURES/` tetap untuk developer; panduan tidak memuat detail API |
| PDF tidak bisa dicari | Sulit dipakai saat menelepon service desk | HTML dengan Ctrl+F dan tautan `/panduan.html` (fase 4) |

---

## 13. Keputusan yang perlu dikonfirmasi

1. **Bahasa:** Indonesia saja (rekomendasi), atau perlu versi Inggris untuk
   grup/rumah sakit dengan staf asing?
2. **Cakupan rilis pertama:** pilot MVP (bab 01, 02, 06 + ringkasan admin, ±2
   hari) atau langsung lengkap tanpa bab vendor (±4,5 hari)?
3. **Distribusi:** PDF saja dulu (rekomendasi), atau sekaligus `/panduan.html` di
   dalam aplikasi sejak rilis pertama?
4. **Dependency `marked`:** setuju menambah satu devDependency untuk build
   HTML/PDF, atau panduan tetap Markdown dan PDF dicetak manual?

---

## 14. Definisi selesai

- [ ] Bab 00–06 + lampiran ada, tiap langkah bergambar, alt text terisi.
- [ ] `npm run guide:shots` mereproduksi seluruh gambar dari seed tanpa error.
- [ ] `npm run guide:build` menghasilkan HTML yang bisa dibuka offline.
- [ ] `npm run guide:pdf` menghasilkan PDF A4 dengan daftar isi, nomor halaman,
      dan footer versi; ukuran ≤ 10 MB.
- [ ] `npm test` hijau, termasuk `tests/unit/guide.test.mjs`.
- [ ] Tidak ada satu pun data pasien atau akun non-demo di gambar.
- [ ] README menautkan panduan; `CHANGELOG.md` mencatat rilis panduan; roadmap
      Sprint 1 memuat item ini.
- [ ] Satu rumah sakit pilot bisa menyelesaikan "lapor gangguan → tiket selesai"
      hanya dengan membaca panduan, tanpa dibantu.
