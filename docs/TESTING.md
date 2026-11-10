# Pengujian

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

## Penjaga dokumentasi

`tests/unit/docs.test.mjs` ikut berjalan di `npm run test:unit`. Test ini gagal bila:

- ada route di `backend/pb_hooks/*.pb.js` yang belum tercatat di [`API.md`](API.md);
- `API.md` mencantumkan route `/api/itsm/*` yang sudah tidak ada di kode;
- ada tautan markdown lokal yang menunjuk berkas atau anchor yang tidak ada.

Jalankan sendiri dengan `node --test tests/unit/docs.test.mjs`.
