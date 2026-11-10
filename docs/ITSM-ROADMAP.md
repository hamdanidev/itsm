# Healthcare ITSM — Roadmap Produk & Rencana Migrasi

Dokumen acuan untuk mengubah produk dari **service desk yang matang** menjadi
**ITSM yang mengerti rumah sakit**. Dokumen ini sengaja memisahkan keputusan
produk dari implementasi, sehingga schema dan UI bisa dibangun bertahap tanpa
mengubah arah.

- Status: Increment A, B, C, dan D selesai; P0 zona waktu per rumah sakit
  selesai (2026-11-09). Fokus berikutnya bukan modul baru, melainkan
  **kesiapan dijual untuk pilot RS swasta** (Bagian 10).
- Basis: audit repo per 2026-11-02 (13 koleksi, 15 migrasi, 44 unit test + 163
  API test lulus); setelah Increment A+B+C menjadi 22 koleksi, 20 migrasi, 44
  unit test + 191 API test + 31 e2e lulus; setelah Increment D menjadi 25
  koleksi, 21 migrasi, 44 unit + 199 API + 33 e2e lulus (termasuk uji pagination
  daftar Tim dan Konsol Vendor dan uji tema gelap). Per 2026-11-09: 30 migrasi,
  70 unit test + 268 API test + 54 e2e lulus (zona waktu, jadwal laporan per
  zona, pengaturan zona oleh Kepala IT, dan perbaikan sesi).
- Prinsip: satu alur nilai yang tuntas lebih baik daripada delapan modul
  setengah jadi.

## Status implementasi

Increment A sudah diimplementasikan pada 2026-11-02:

- [x] Koleksi `services` dan `service_items` + seed 6 layanan/7 item.
- [x] Field tiket `service`, `service_item`, `requested_for`, `location`,
  `approval_mode` + backfill tiket lama.
- [x] Intake berbasis layanan, approval mode per item, SLA item → layanan →
  policy tipe×prioritas.
- [x] Triage `POST /api/itsm/tickets/{id}/triage` + recompute SLA + audit.
- [x] Sumber tiket telepon/email/WhatsApp dan pembuatan atas nama (on-behalf).
- [x] CR wajib `change_outcome`; `actual_start`/`actual_end` terisi.
- [x] UI katalog, intake, Pengaturan > Layanan, triage di detail tiket, laporan
  per layanan.
- [x] Test: 44 unit + 176 API + 27 e2e lulus.

Belum termasuk A: dynamic form builder, checklist fulfillment multi-langkah,
penulisan katalog dari konsol vendor, dan filter laporan per layanan di UI
(agregat per layanan sudah ada di JSON/UI).

Increment B sudah diimplementasikan pada 2026-11-02:

- [x] Koleksi `problems`, `problem_tickets`, `knowledge_articles` + field tiket
  `problem`/`kb_article`.
- [x] Problem dari tiket, tautan banyak tiket, root cause, workaround, known
  error, permanent fix, dan status.
- [x] Knowledge base draft → review → published → retired, visibilitas
  internal/publik, pencarian, publish khusus IT Lead.
- [x] Artikel dan workaround muncul sebagai saran saat intake; tiket menampilkan
  problem/known error dan artikel terkait.
- [x] Halaman Problem, detail Problem, halaman Pengetahuan, detail artikel, dan
  integrasi detail tiket.
- [x] Test: 44 unit + 185 API + 29 e2e lulus.

Belum termasuk B: laporan problem aging/repeat incident rate/KB usage di halaman
Laporan, versioning artikel, dan review multi-approver.

### Fondasi form

- [x] Seluruh 27 form data-entry dimigrasikan ke Formik: auth, profil, tiket,
  komentar/lampiran, problem, pengetahuan, pengaturan, tim, dan konsol vendor.
- [x] Validasi submit-only (`validateOnBlur: false`) agar klik tombol submit
  tidak hilang akibat re-render blur; error server tampil lewat `status`.
- [x] Rich editor selesai: komponen `RichTextEditor` + `RichText` dengan
  toolbar tebal/miring/daftar/judul/kutipan/kode/tautan, dipakai pada artikel,
  deskripsi tiket, komentar, resolusi, problem, dan change plan.
- [x] Sanitasi HTML berbasis allowlist; `script`, `style`, `iframe`, event
  handler, dan URL non-http dibuang sebelum simpan/render.
- [x] Verifikasi Playwright: format toolbar bekerja dan HTML berbahaya tidak
  dieksekusi.

### Fondasi UI

- [x] Layout detail bersama (`.detail-grid`/`.detail-side`) untuk tiket, problem,
  insiden, pengetahuan, dan aset; filter bar bersama (`.filter-bar`), skeleton
  daftar bersama (`Skeleton`/`TableSkeleton`), dan pagination bersama
  (`Pagination` + `usePagedList`/`usePagedEndpoint`).
- [x] Semua daftar operasional berhalaman di server: Tiket, Audit, Aset, Problem,
  Insiden, Pengetahuan, Tim (`/api/itsm/team`), Konsol Vendor
  (`/api/itsm/platform/tenants`). Data konfigurasi kecil tetap satu daftar.
- [x] Tema terang/gelap lewat token CSS (`--surface*`, `--n10..--n60`,
  `--shadow-rgb`, status) + `ThemeProvider`: pilihan Sistem/Terang/Gelap
  tersimpan di localStorage, tombol cepat di top bar, dan pemilih di menu
  pengguna serta footer halaman masuk.

Increment C sudah diimplementasikan pada 2026-11-03:

- [x] Koleksi `assets`, `asset_tickets`, `service_cis`, dan `ticket_csat`.
- [x] Register aset + detail aset + riwayat tiket + service CI.
- [x] Tautan aset ke tiket saat intake dan dari detail tiket, dengan audit.
- [x] CSAT satu respons per tiket, hanya requester, setelah resolved/closed.
- [x] Laporan operasional bulanan: insiden per layanan, problem teratas, KB
  usage, CSAT, dan SLA, dengan ekspor CSV.
- [x] Test: 44 unit + 191 API + 31 e2e lulus.

Belum termasuk C: CSAT per komentar, laporan PDF, dan otomatisasi pengiriman
laporan lewat email.

Increment D sudah diimplementasikan pada 2026-11-03:

- [x] Koleksi `major_incidents`, `incident_updates`, dan
  `major_incident_tickets` + field `tickets.major_incident`.
- [x] Deklarasi insiden dengan nomor otomatis, severity, komandan, layanan
  terdampak, dan tiket sumber.
- [x] Timeline komunikasi internal/publik + broadcast notifikasi dan email ke
  staf, lead, dan pemilik tiket terdampak.
- [x] Transisi status, resolusi wajib ringkasan, penutupan wajib PIR lengkap.
- [x] Halaman Insiden mayor, detail dengan PIR, banner di Ringkasan, panel di
  detail tiket, dan statistik MTTR/PIR di Laporan.
- [x] Audit `incident_declare/update/resolve/close/link/pir` dan tipe notifikasi
  `incident`.
- [x] Test: 44 unit + 199 API + 33 e2e lulus.

Belum termasuk D: PIR otomatis membuat problem/KB, template PIR per layanan,
dan broadcast WhatsApp untuk insiden kritis.

### P0 zona waktu per rumah sakit (2026-11-09)

Sebelumnya seluruh perhitungan memakai offset tetap +07:00, sehingga RS di
WITA/WIT dan luar negeri mendapat tenggat SLA yang salah tanpa error.

- [x] `lib/timezone.js`: konversi sadar DST (backend Goja `Timezone`/`DateTime`
      dan `Intl` untuk test), batas hari lokal, dan validasi nama zona IANA.
- [x] SLA, approval, dan reopen memakai zona policy atau tenant; hari libur
      dibaca sebagai tanggal kalender.
- [x] Laporan (rentang, bucket, CSV `*_local`) dan jadwal laporan mengikuti zona
      tenant; `?timezone=` divalidasi.
- [x] Basis data IANA dibundel (`backend/zoneinfo.zip`, `ZONEINFO`) agar hasil
      sama di Windows, Linux, dan Docker; bootstrap memperingatkan bila zona
      tidak termuat.
- [x] Zona bisa diubah Kepala IT di Pengaturan (standalone) atau vendor lewat
      Konsol Vendor; policy SLA dan jadwal laporan ikut diselaraskan, ber-audit.
- [x] Frontend memakai zona tenant untuk semua format tanggal.
- [x] Test: 70 unit + 268 API + 54 e2e lulus.

Catatan: bahasa UI dan email masih `id-ID` hardcoded, dan seed tenant baru masih
memakai unit BPJS/SIMRS + hari libur RI. Itu bagian dari P1 internasionalisasi,
bukan penghambat pilot RS Indonesia.

---

## 1. Ringkasan eksekutif

Produk saat ini sudah jauh di atas aplikasi ticketing: ada incident, service
request, change request, SLA dengan jam kerja dan hari libur, approval
berjenjang termasuk CAB, delegasi, audit append-only, isolasi tenant, dan konsol
vendor lintas rumah sakit. Yang belum ada adalah praktik yang membuatnya disebut
ITSM: **service catalog, problem management, knowledge base, dan asset/CI**.

Peta singkat:

- **3 area kuat**: service desk, incident, SLA & reporting.
- **3 area setengah**: service request, change, continual improvement.
- **3 area kosong**: problem, knowledge, asset/CI.
- **Service catalog** belum ada, padahal ia adalah tulang punggung yang
  menghubungkan incident, request, change, SLA, dan aset.

Keputusan arah:

1. **Increment A — Service-centric foundation.** Bangun service catalog, triage,
   SLA/approval per layanan, dan rapikan intake. Ini fondasi untuk semuanya.
2. **Increment B — Problem & Knowledge.** Ubah insiden berulang menjadi known
   error dan artikel pengetahuan. Ini bukti paling kuat bahwa produk bukan
   sekadar ticketing.
3. **Increment C — Asset/CI + CSAT + operational review.** Lengkapi dampak aset
   dan suara pengguna.

Jangan membangun tiga increment sekaligus. A adalah syarat B; B adalah syarat
agar C punya konteks.

---

## 2. Posisi saat ini

| Area | Status | Bukti | Gap utama |
|---|---|---|---|
| Service desk / SPOC | Kuat, single-channel | Portal tiket, komentar publik/internal, lampiran terproteksi, notifikasi in-app + email, timeline + realtime | Baru kanal web; email/WhatsApp masuk belum ada |
| Incident | Kuat + major incident | Siklus penuh, triage, SLA, major incident dengan komandan, broadcast, tiket terdampak, dan PIR | Duplicate/parent linking eksplisit dan PIR otomatis menjadi problem/KB |
| Service request | Kuat | Katalog layanan/item, approval per item, SLA per layanan, diskusi + lampiran | Checklist fulfillment dan dynamic form per layanan |
| Problem | Kuat | Problem, known error/workaround, tautan banyak tiket, integrasi tiket dan KB | Laporan problem aging/repeat incident, PIR otomatis membuat problem |
| Change | Inti kuat, belum tuntas | Risk, CAB, plan/rollback, jadwal, approval, empat mata, actual start/end, outcome | Belum ada change calendar/blackout, emergency change, PIR perubahan |
| Knowledge | Kuat | Artikel draft→review→publish→retired, pencarian, saran intake/known error, resolution→KB | Versioning artikel dan review multi-approver |
| Asset/CI | Kuat | Register aset, lokasi, service CI, tautan tiket, riwayat tiket per aset | Dampak otomatis ke tiket dari CI yang sama |
| SLA & reporting | Kuat, ticket-level | SLA per layanan/tipe×prioritas, jam kerja + hari libur, pause/reopen, breach, eskalasi, laporan + CSV, lintas RS, CSAT, aset, insiden mayor | Belum ada OLA/UC; median menit kalender |
| Continual improvement | Loop dimulai | Laporan SLA/operasional, CSAT, PIR insiden mayor, audit | PIR otomatis menjadi problem/KB, improvement register, service review |

Kekuatan yang harus dipertahankan:

- Approval berjenjang dengan CAB dan delegasi, bukan sekadar status.
- SLA yang sadar jam kerja, hari libur, jeda, reopen, dan eskalasi.
- Audit append-only dan RBAC tenant yang konsisten.
- Konsol vendor multi-rumah-sakit sebagai diferensiasi komersial.
- UI yang konsisten dan test suite yang menjaga regresi.

---

## 3. Prinsip desain

1. **Layanan adalah jangkar.** Setiap tiket, SLA, approval, problem, dan aset
   harus bisa dikaitkan ke satu layanan. Tanpa ini, domain baru akan menjadi
   modul terpisah yang tidak menyentuh alur kerja.
2. **Satu alur nilai yang tuntas.** Jangan menambah modul tanpa menghubungkannya
   ke tiket. Fitur yang tidak muncul di alur tiket akan menjadi data graveyard.
3. **Proses harus menegakkan, bukan menghambat.** Tidak semua permintaanbutuh
   approval. Gunakan `approval_mode` per service item: `none`, `manager`,
   `lead`, `cab`.
4. **Additive migration.** Tambah kolom/koleksi dulu, backfill, baru jadikan
   wajib. Jangan mengedit migrasi yang sudah diterapkan.
5. **Tenant-first dan audit-first.** Semua koleksi baru wajib punya `tenant`,
   rule baca `AUTH && (PLATFORM || TENANT)`, dan audit untuk aksi tulis.
6. **Hemat secara operasional.** PocketBase + SQLite tetap satu instance; jangan
   menambah infrastruktur baru untuk fitur yang belum terbukti dipakai.

---

## 4. Target model domain

```
Tenant
  ├── Services ──< Service Items
  │       │
  │       └──< Tickets >── Assets (C)
  │                │
  │                ├──< Problems (B) ──< Knowledge Articles (B)
  │                └──< Changes (B)
  └── Users / Units / SLA Policies / Holidays
```

Yang sudah ada: `Tickets`, `Users`, `Units`, `SLA Policies`, `Holidays`,
`Audit Logs`.
Yang ditambahkan: `Services`, `Service Items` (A), `Problems`, `Knowledge
Articles` (B), `Assets`, `CSAT` (C).

---

## 5. Increment A — Service-centric foundation

**Tujuan:** permintaan tidak lagi generik; setiap tiket punya layanan, SLA, dan
alur approval yang sesuai. Triage menjadi aksi nyata, bukan janji di UI.

**Non-goals A:** dynamic form builder, checklist fulfillment multi-langkah,
problem/KB, asset, CSAT, change calendar.

### A.1 Schema

Koleksi baru:

#### `services`

| Field | Tipe | Catatan |
|---|---|---|
| `tenant` | relation tenants, required | isolasi |
| `name` | text, required, max 120 | nama layanan |
| `code` | text, required, max 20 | unik per tenant, uppercase |
| `description` | text, max 2000 | penjelasan singkat |
| `owner` | relation users, optional | service owner (bukan approver) |
| `support_unit` | relation units, optional | unit yang mengeksekusi |
| `default_sla` | relation sla_policies, optional | fallback SLA layanan |
| `is_active` | bool | nonaktifkan, jangan hapus |
| `created`, `updated` | autodate | |

Index: `UNIQUE (tenant, code)`, `(tenant, is_active)`.

#### `service_items`

| Field | Tipe | Catatan |
|---|---|---|
| `tenant` | relation tenants, required | isolasi |
| `service` | relation services, required | item milik layanan |
| `name` | text, required, max 120 | mis. "Tambah akses radiologi" |
| `code` | text, required, max 40 | unik per service |
| `description` | text, max 2000 | instruksi singkat |
| `approval_mode` | select `none/manager/lead/cab`, required | default `lead` |
| `sla_policy` | relation sla_policies, optional | override SLA layanan |
| `sort` | number | urutan katalog |
| `is_active` | bool | |

Index: `UNIQUE (tenant, service, code)`.

#### Perubahan `tickets`

| Field | Tipe | Catatan |
|---|---|---|
| `service` | relation services, optional | diisi saat intake/triage |
| `service_item` | relation service_items, optional | hanya untuk request |
| `requested_for` | relation users, optional | pemohon sebenarnya (on-behalf) |
| `location` | text, max 120 | ruang/poli/lokasi |
| `approval_mode` | select `default/none/manager/lead/cab`, optional | snapshot mode saat create |

Index: `(tenant, service, status)`.

Backfill:

- `requested_for = requester` untuk tiket lama.
- `approval_mode = "default"` untuk tiket lama.
- `service`/`service_item`/`location` kosong.

#### Audit

Tambahkan nilai `triage` ke `audit_logs.action`.

### A.2 API dan aturan

#### Intake `POST /api/itsm/tickets`

- Menerima `service`, `service_item`, `source`, `requested_for`, `location`,
  `reporter_name`, `reporter_contact`.
- Validasi service/item aktif dan satu tenant; item harus milik service.
- `source` salah satu `web/phone/email/whatsapp`, default `web`.
- `requested_for` hanya boleh diisi staf; target harus aktif dan satu tenant.
  Jika diisi, `requester` = target, `unit` = unit target, `created_by` = staf.
- Prioritas tetap dari `impact`; triage dapat mengoreksi setelahnya.
- SLA: `service_item.sla_policy` → `service.default_sla` → policy
  `(ticket_type, priority)`. Simpan `sla_policy` dan `sla_snapshot`.
- Approval:
  - Incident selalu `none`.
  - Service/Change memakai `service_item.approval_mode`; tanpa item memakai
    `default` (perilaku lama: manajer unit → IT Lead → CAB).
  - `none` → `approval_status = not_required`, tidak ada `ticket_approvals`.
  - `manager` → manajer unit; bila tidak ada, fallback IT Lead.
  - `lead` → IT Lead saja.
  - `cab` → manajer unit (bila ada) → IT Lead → CAB (hanya CR high risk dan
    minimal dua lead).

#### Triage `POST /api/itsm/tickets/{id}/triage`

- Hanya staf IT (`it_support`/`it_lead`).
- Hanya status `open`/`assigned` dan belum ada approval yang diputuskan.
- Field yang dapat diubah: `priority`, `impact`, `category`, `service`,
  `service_item`, `location`.
- Jika service/item berubah, alur approval yang masih pending dibangun ulang
  dengan `approval_mode` baru; jika sudah ada keputusan, tolak.
- SLA dihitung ulang dari `created` memakai policy baru. Breach/escalation
  dibersihkan dan perubahan lama dicatat di audit.
- Tulis audit `triage` dengan diff `from`/`to`.
- Tidak mengirim notifikasi baru pada A; timeline dan audit sudah cukup.

#### Change outcome

- Saat CR masuk `in_progress`, isi `actual_start` bila kosong.
- Saat CR `resolved`, wajib `change_outcome` (`successful/failed/rolled_back/
  partial`), isi `actual_end` bila kosong, dan simpan.
- UI modal resolusi menampilkan pilihan outcome untuk CR.

#### Aturan koleksi

| Koleksi | List/View | Create | Update | Delete |
|---|---|---|---|---|
| `services` | `AUTH && (PLATFORM \|\| TENANT)` | `LEAD && body.tenant = auth.tenant` | `LEAD && TENANT` | `null` |
| `service_items` | sama | sama | sama | `null` |

Vendor hanya baca pada A. Penulisan lewat konsol vendor ditunda ke A.2 agar
scope tidak melebar.

### A.3 UI

- **Katalog Layanan** (`/catalog`) untuk pengguna rumah sakit: daftar layanan,
  item, deskripsi, approval mode, dan tombol **Ajukan** / **Laporkan gangguan**.
- **Buat tiket**: pilih layanan dan item; deskripsi item tampil sebagai
  panduan; `type` default `service_request` saat item dipilih. Staf melihat
  pilihan `source` dan **atas nama**; requester tidak.
- **Pengaturan > Layanan**: CRUD layanan + item, termasuk approval mode, SLA
  policy, owner, support unit, dan status aktif.
- **Detail tiket**: tampilkan layanan/item, dan tombol **Triage** untuk staf
  dengan modal priority/impact/category/service/item/location.
- **Laporan**: tambahkan tabel per layanan (JSON report; CSV tetap kompatibel
  sampai ada keputusan format baru).

### A.4 Acceptance criteria

1. Requester dapat memilih layanan dan item dari katalog; tiket menyimpan
   keduanya.
2. Service item dengan `approval_mode=none` tidak membuat langkah approval;
   item dengan `manager`/`lead`/`cab` membuat langkah sesuai mode.
3. SLA per layanan dipakai bila policy layanan/item diisi; jika tidak, fallback
   ke policy tipe×prioritas.
4. Staf dapat mengubah prioritas lewat triage, dengan alasan tercatat di audit
   dan timeline, dan SLA dihitung ulang.
5. Tiket lama tetap valid; `requested_for` terisi requester.
6. CR tidak bisa resolved tanpa `change_outcome`; `actual_start`/`actual_end`
   terisi.
7. Semua test lama tetap lulus; test baru mencakup service CRUD, intake, mode
   approval, triage, on-behalf, dan CR outcome.

### A.5 Rencana migrasi

| File migrasi | Isi |
|---|---|
| `1794200000_service_catalog.js` | buat `services` + `service_items`; tambah field tiket; tambah audit `triage`; seed layanan default per tenant |
| `1794200001_backfill_ticket_service.js` | backfill `requested_for`, `approval_mode`; biarkan `service` kosong |
| `1794200002_service_catalog_seed_tenant.js` (opsional) | seed untuk tenant yang dibuat setelah migrasi, atau pindahkan ke `tenant_seed.js` |

Keputusan: seed untuk tenant baru diletakkan di `backend/pb_hooks/lib/tenant_seed.js`
agar konsol vendor ikut membuat katalog. Migrasi hanya menyentuh tenant yang
sudah ada.

Langkah:

1. Jalankan migrasi di data dev; cek `services`/`service_items` dan field tiket.
2. Jalankan `npm test` (unit + API) pada data sementara.
3. Verifikasi UI katalog, intake, triage, dan laporan.
4. Baru deploy; production memakai `--automigrate=false`.

Rollback:

- `1794200001`: kosongkan `requested_for`/`approval_mode` (opsional).
- `1794200000`: hapus field tiket, lalu `app.delete` `service_items` dan
  `services`. Jangan hapus `audit_logs`; nilai `triage` boleh tetap ada.

### A.6 Risiko dan mitigasi

| Risiko | Mitigasi |
|---|---|
| Katalog kosong membuat fitur tidak terpakai | Seed 6 layanan default + item contoh; admin dapat menambah |
| Service item terlalu banyak | Mulai 1–3 item per layanan; katalog adalah daftar pendek, bukan taksonomi penuh |
| Triage mengubah SLA dan membingungkan | Hanya sebelum pekerjaan dimulai; diff dicatat di audit |
| Approval jadi makin birokratis | `approval_mode` per item; default `none` untuk reset password/akses rutin |
| Vendor tidak bisa menulis katalog | A.2; untuk sekarang vendor baca lewat cabang platform |
| Laporan CSV berubah dan merusak pelanggan | Jangan ubah header CSV di A; tambah dimensi layanan di JSON/UI |

---

## 6. Increment B — Problem & Knowledge

**Tujuan:** menutup masalah, bukan hanya tiket. Insiden berulang menjadi problem,
problem menjadi known error, dan solusinya menjadi artikel.

### B.1 Schema

#### `problems`

`tenant`, `problem_no`, `title`, `description`, `status`
(`identified/investigating/known_error/resolved/closed`), `root_cause`,
`workaround`, `permanent_fix`, `service`, `owner`, `resolved_at`, timestamps.

#### `problem_tickets`

`tenant`, `problem`, `ticket`, `relation` (`caused_by/duplicate/related`).

#### `knowledge_articles`

`tenant`, `title`, `slug`, `body`, `status`
(`draft/review/published/retired`), `visibility` (`internal/public`), `service`,
`problem`, `tags`, `author`, `reviewer`, `published_at`, timestamps.

#### Perubahan `tickets`

`problem` (relation problems), `kb_article` (relation knowledge_articles).

### B.2 API dan UI

- `POST /api/itsm/problems`, `PATCH /api/itsm/problems/{id}`,
  `POST /api/itsm/problems/{id}/tickets`.
- `POST /api/itsm/knowledge`, `PATCH /api/itsm/knowledge/{id}`,
  `POST /api/itsm/knowledge/{id}/publish`.
- Dari detail tiket: **Buat problem**, **Tautkan ke problem**, **Buat artikel
  dari resolusi**.
- Saat intake: cari artikel berdasarkan judul/kategori/layanan; tampilkan
  known error dan workaround.
- Problem detail: daftar insiden terkait, perubahan terkait, artikel terkait.
- Laporan: problem aging, repeat incident rate, KB usage.

### B.3 Acceptance

1. Tiga insiden dapat ditautkan ke satu problem.
2. Problem dapat menjadi `known_error` dengan workaround yang tampil saat tiket
   baru dibuat.
3. Perubahan dapat ditautkan ke problem dan menutup problem saat berhasil.
4. Resolusi tiket dapat dipublikasikan menjadi artikel KB.
5. Artikel punya lifecycle review; artikel `retired` tidak muncul di saran.
6. Semua aksi menulis audit dan menghormati tenant.

---

## 7. Increment C — Asset/CI + CSAT + operational review

**Tujuan:** menjawab "komponen mana yang terdampak" dan "apakah pengguna puas".

### C.1 Schema

- `assets`: `tenant`, `asset_no`, `name`, `type`
  (`workstation/printer/server/network/medical_device/license`), `location`,
  `unit`, `service`, `status`, `owner`, `warranty_end`, `notes`.
- `asset_tickets`: `tenant`, `asset`, `ticket`, `relation`.
- `service_cis`: `tenant`, `service`, `asset`, `criticality`.
- `ticket_csat`: `tenant`, `ticket`, `score` (1–5), `comment`, `created`.

### C.2 UI dan API

- Register aset + detail aset + riwayat tiket.
- Tautkan aset ke tiket dan layanan.
- CSAT dikirim saat tiket `resolved`/`closed`; satu respons per tiket.
- Laporan operasional bulanan: insiden per layanan, problem teratas, KB usage,
  CSAT, SLA.

### C.3 Acceptance

1. Tiket menampilkan aset/layanan terdampak.
2. Detail aset menampilkan riwayat tiket.
3. CSAT tersimpan dan muncul di laporan.
4. Laporan bulanan dapat diunduh/dibagikan.

---

## 8. Increment D — Major incident + PIR

**Tujuan:** menangani gangguan besar (SIMRS/jaringan mati) sebagai satu insiden
induk, bukan puluhan tiket lepas: deklarasi, komandan, layanan terdampak,
broadcast, timeline komunikasi, resolusi, dan post-incident review yang menjadi
masukan problem/KB.

### D.1 Schema

#### `major_incidents`

`tenant`, `incident_no` (`INC-YYYYMMDD-XXXXXX`), `title`, `description`,
`severity` (`sev1/sev2/sev3`), `status`
(`declared/investigating/mitigating/monitoring/resolved/closed`),
`commander` (relasi user), `declared_by`, `impact_summary`, `affected_services`
(relasi multi `services`), `source_ticket`, `resolution_summary`, `root_cause`,
`pir_actions`, `pir_completed_at`, `pir_by`, `resolved_at`, `closed_at`.

#### `incident_updates`

`tenant`, `incident`, `kind` (`update/decision/communication`), `visibility`
(`internal/public`), `body`, `author`.

#### `major_incident_tickets`

`tenant`, `incident`, `ticket`, `relation` (`impacted/caused/related`).
Unique `(incident, ticket)`; `tickets.major_incident` menyimpan insiden utama.

### D.2 Aturan dan route

- Semua akses staf IT: list/view `PLATFORM || (TENANT && STAFF)`; requester
  tidak melihat detail insiden. Penulisan hanya lewat route.
- `POST /api/itsm/incidents` — deklarasi (nomor otomatis, komandan, layanan
  terdampak, tiket sumber opsional) + broadcast ke staf dan lead.
- `PATCH /api/itsm/incidents/{id}` — status, severity, komandan, layanan, PIR.
- `POST /api/itsm/incidents/{id}/updates` — update komunikasi; update `public`
  ikut memberi notifikasi ke pemilik tiket terdampak, `internal` tidak.
- `POST /api/itsm/incidents/{id}/tickets` — tautkan tiket terdampak.
- `GET /api/itsm/incidents/stats` — MTTR, jumlah insiden, dan PIR untuk laporan.
- Resolve wajib `resolution_summary`; close wajib PIR lengkap (root cause +
  aksi + `pir_completed_at`) dan hanya dari `resolved`.
- Audit: `incident_declare`, `incident_update`, `incident_resolve`,
  `incident_close`, `incident_link`, `incident_pir`.

### D.3 UI

- `/incidents` — daftar aktif/riwayat, deklarasi insiden baru.
- `/incidents/{id}` — detail: status, severity, komandan, layanan dan tiket
  terdampak, timeline update (publik/internal), aksi status, form PIR, tutup.
- Banner insiden aktif di Ringkasan; tautan dari detail tiket; panel statistik
  insiden di Laporan.

### D.4 Acceptance

1. Staf dapat mendeklarasikan insiden mayor dengan nomor, severity, komandan,
   dan layanan terdampak; staf lain menerima notifikasi broadcast.
2. Tiga tiket dapat ditautkan; tiket menampilkan insidennya.
3. Update publik muncul di timeline dan mengirim notifikasi ke staf serta
   pemilik tiket terdampak; update internal tidak.
4. Resolve tanpa ringkasan ditolak; close tanpa PIR ditolak; PIR menyimpan
   root cause, aksi, dan waktu.
5. Daftar memisahkan insiden aktif dan riwayat; statistik MTTR dan PIR muncul
   di laporan.
6. Requester dan tenant lain tidak dapat membaca/menulis; semua aksi ber-audit.

### D.5 Risiko

| Risiko | Mitigasi |
|---|---|
| Broadcast terlalu ramai | Update internal tidak dikirim; email mengikuti preferensi pengguna |
| Insiden menumpuk tanpa PIR | Close ditolak sampai PIR lengkap; laporan menampilkan PIR belum selesai |
| Tiket terlewat ditautkan | Pencarian tiket di detail insiden dan tautan dari detail tiket |

---

## 9. Backlog P2

Daftar ini adalah kandidat jangka menengah, **bukan urutan eksekusi**. Urutan
yang berlaku untuk tahap komersial ada di Bagian 10 (kesiapan jual → pilot →
P0 adopsi); beberapa butir di bawah sudah naik/turun prioritas di sana.

- Major incident: deklarasi, incident commander, layanan terdampak, broadcast,
  downtime SOP, PIR. *(sudah selesai — Increment D)*
- Change calendar, blackout window (jam poli), emergency change, PIR.
- OLA/UC: target antar tim internal dan kontrak vendor.
- Email-in dan WhatsApp intake. *(menjadi P0 adopsi, Bagian 10.3)*
- SSO/AD, 2FA, scoping vendor per rumah sakit. *(2FA masuk Sprint 0, SSO menunggu RS dengan AD)*
- Monitoring/event intake (Zabbix/Prometheus/SIMRS health).
- Release, availability, capacity management.
- AI assistant setelah KB punya artikel yang cukup.

---

## 10. Fokus berikutnya — kesiapan dijual (pilot RS swasta)

**Keputusan arah (2026-11-09).** Target penjualan pertama adalah **rumah sakit
swasta tipe B/C**: 1–5 lokasi, tim IT 3–15 orang, sudah memakai SIMRS, dan
sedang atau akan akreditasi. RS pemerintah/tender dan multi-negara **tidak**
dikejar pada tahap ini.

Alasannya ada di [`GAP-KOMPETITOR-LOKAL.md`](./GAP-KOMPETITOR-LOKAL.md):
kedalaman ITIL sudah memadai, tetapi "kesiapan dijual" belum. Penghambat deal RS
swasta bukan modul baru — melainkan implementasi, kepercayaan operasional, dan
kelengkapan komersial. Karena itu urutan kerja di bawah **bukan** penambahan
fitur ITIL.

### 10.1 Sprint 0 — kesiapan jual (target ±1 minggu)

| # | Pekerjaan | Menghambat apa | Ukuran selesai |
|---|---|---|---|
| S0-1 | **Bulk import pengguna (CSV)** di Pengaturan → Tim | Onboarding RS 300–800 staf berhenti; input manual tidak realistis | Unggah CSV (nama, email, role, unit, tim); validasi per baris; ringkasan sukses/gagal; duplikat ditolak; audit `import`; test API + e2e |
| S0-2 | **2FA (TOTP) + pembatasan percobaan login** | Kuesioner keamanan RS dan syarat offboarding | Enroll/nonaktifkan 2FA, kode pemulihan, reset oleh IT Lead; lockout setelah N percobaan; audit login gagal |
| S0-3 | **Runbook operasi + uji restore** | Pertanyaan "kalau server mati, siapa yang bantu?" | `docs/OPERATIONS.md`: install, upgrade, backup, restore, monitoring, rotasi log; catatan uji restore bertanggal |
| S0-4 | **Tenant demo + reset** | Demo memakai data uji acak, bukan data realistis | `npm run demo:reset` idempoten: 1 tenant demo, 8 unit, katalog, ±60 tiket beragam status, 3 insiden mayor, CSAT |
| S0-5 | **Paket dokumen jual** | Penawaran terlihat amatir tanpa ini | One-pager, skrip demo 20 menit, proposal pilot, daftar harga, security & data pack, SLA support, template NDA/DPA |
| S0-6 | **Monitoring & alert dasar** | Uptime tidak terpantau selama pilot | Healthcheck eksternal, alert down/disk penuh, rotasi dan retensi log terdokumentasi |

**Status per 2026-11-10:** S0-1, S0-2, dan S0-3 selesai.

- S0-1: `POST /api/itsm/team/import` (multipart CSV), modal "Impor CSV" di
  Pengaturan → Tim, validasi per baris, ringkasan berhasil/gagal, duplikat
  ditolak, audit `import`, serta test API, unit parser, dan e2e.
- S0-2: 2FA TOTP (aktivasi QR/kunci manual, 10 kode pemulihan sekali pakai,
  nonaktifkan dengan password + kode), reset 2FA dan buka kunci oleh IT Lead
  dari tab Tim, lockout setelah 5 percobaan (15 menit), audit `login_failed`
  tanpa menyimpan password/kode, serta test unit TOTP, API, dan e2e.
- S0-3: `docs/OPERATIONS.md` (install, operasi harian, upgrade/rollback, backup,
  restore, insiden, monitoring, rotasi log), `docs/restore-tests/` dengan
  catatan drill lokal bertanggal, `npm run ops:check`, dan
  `npm run ops:restore-drill`. Drill staging dengan backup produksi dan backup
  off-host tetap wajib sebelum pilot (lihat GAP D2).

Butir Sprint 0 lain belum dikerjakan.

**Definisi selesai Sprint 0:** satu RS bisa di-onboard tanpa menyentuh database,
satu demo berjalan dari data bersih dalam < 5 menit, dan semua pertanyaan standar
keamanan/operasional punya jawaban tertulis.

### 10.2 Sprint 1 — pilot berbayar 30 hari

- Cakupan: satu unit (biasanya IGD, rawat inap, atau SIMRS), 10–25 pengguna.
- Harga: Rp 2–5 juta, dikreditkan ke kontrak tahunan bila lanjut.
- Metrik yang disepakati di awal (ambil dari laporan aplikasi, bukan klaim):

| Metrik | Target pilot |
|---|---|
| Tiket unit masuk lewat sistem | ≥ 70% dari gangguan yang tercatat |
| Median respons | turun ≥ 30% dari baseline RS |
| SLA compliance | ≥ 85% |
| CSAT | ≥ 4,0 dari 5 |
| Laporan SLA pertama terkirim otomatis | ada (mingguan/bulanan) |

- Keluaran: laporan pilot 1 halaman + testimoni tertulis + keputusan lanjut/tidak.
- **Jangan janjikan** WhatsApp API, SSO/AD, atau AI selama pilot. Untuk keberatan
  kanal, tawarkan intake QR tanpa login yang sudah ada.

### 10.3 Setelah pilot — P0 adopsi (urutan eksekusi)

Urutan ini sengaja berbeda dari daftar gap: yang paling murah dan paling sering
diminta dikerjakan lebih dulu.

| Urutan | Inisiatif | Alasan urutan |
|---|---|---|
| 1 | **Email-in (IMAP/forwarding) → tiket** | Paling murah, tanpa biaya per pesan, dan banyak keluhan unit datang lewat email grup |
| 2 | **Formulir dinamis per layanan/item** | Katalog baru berguna bila field permintaan mengikuti layanan |
| 3 | **Auto-assignment** berbasis kategori/unit/beban | Tiket menumpuk tanpa pemilik; dibutuhkan saat volume pilot naik |
| 4 | **SSO (OIDC/LDAP) + sinkronisasi AD** | Baru wajib saat ada RS dengan AD dan 500+ staf; bulk import (S0-1) menutup kebutuhan mendesak |
| 5 | **WhatsApp gateway resmi** | Butuh provider berbayar dan kebijakan data; tunda sampai ada RS yang mau membiayainya |
| 6 | **AI KB search / deflection** | Baru berguna setelah KB terisi; jangan dijanjikan sebelum ada artikel nyata |

### 10.4 Yang sengaja tidak dikerjakan sekarang

Multi-negara (i18n, residensi data, billing), HA/multi-region, ESM multi-unit,
ALM, omnichannel CX (Instagram/TikTok/CRM), dan modul ITIL tambahan (release,
capacity, availability, financial). Alasan dan urutannya ada di
[`GAP-KOMPETITOR-LOKAL.md`](./GAP-KOMPETITOR-LOKAL.md) Bagian 11.

### 10.5 Gate keputusan

1. Jangan ikut tender pemerintah sebelum SSO, paket DPA/UU PDP, dan minimal dua
   referensi pelanggan ada.
2. Jangan menandatangani kontrak yang menjanjikan WhatsApp/SSO/AI sebelum
   fiturnya ada.
3. Jangan menambah modul ITIL baru sebelum Sprint 0 selesai.
4. Jangan buka pilot kedua sebelum laporan pilot pertama selesai — dua pilot
   serentak oleh satu orang adalah cara tercepat kehilangan keduanya.

### 10.6 Mulai dari mana (untuk sesi berikutnya)

1. ~~**S0-1 bulk import pengguna** — satu route + modal di tab Tim + test
   API/e2e.~~ *(selesai 2026-11-10; lihat status di 10.1)* Ini item dengan
   rasio "membuka deal / usaha" tertinggi.
2. ~~**S0-2 2FA + pembatasan login** — migrasi kolom, route enroll/verifikasi,
   layar keamanan di profil.~~ *(selesai 2026-11-10; lihat status di 10.1)*
3. ~~**S0-3 runbook + S0-6 monitoring** — dokumen dan konfigurasi, tanpa UI.~~
   *(S0-3 selesai 2026-11-10; S0-6 belum)*
4. **S0-4 tenant demo + `npm run demo:reset`** — skrip di `scripts/`, memakai
   seed dev yang sudah ada.
5. **S0-5 dokumen jual** — berkas di `docs/` (one-pager, skrip demo, proposal
   pilot, harga, security pack).

Aturan per item: satu commit, test menyertai, dan perbarui README/SCHEMA bila
route atau perilaku berubah. Jangan mengerjakan S0-5 lebih dulu: tanpa bulk
import dan 2FA, pilot akan gagal saat implementasi.

---

## 11. Metrik keberhasilan

| Metrik | Definisi | Target awal |
|---|---|---|
| Ticket berlayanan | % tiket baru dengan `service` terisi | > 80% |
| Request via katalog | % SR yang memakai `service_item` | > 60% |
| Approval cycle time | median waktu dari create ke approval final | turun 30% |
| SLA compliance per layanan | compliance per service | terlihat per layanan |
| Triage correction | % tiket yang priority-nya berubah | < 25% |
| Problem link rate (B) | % insiden tertaut ke problem | > 40% untuk insiden berulang |
| KB coverage (B) | % resolusi yang punya artikel | > 30% |
| CSAT (C) | rata-rata skor 1–5 | > 4,0 |

---

## 12. Keputusan terbuka

1. Apakah vendor boleh menulis katalog layanan dari konsol vendor? (A: belum;
   B: evaluasi bersama kebutuhan operasional vendor.)
2. Apakah service item boleh dipakai untuk incident, atau hanya request?
   (A: boleh dipilih untuk konteks, tetapi approval incident selalu `none`.)
3. Apakah SLA harus dihitung ulang saat triage setelah respons pertama?
   (A: hanya sebelum pekerjaan dimulai; setelah itu histori dipertahankan.)
4. Apakah CSV laporan perlu kolom `service`? (A: belum, agar kompatibel; ubah
   bersama versi laporan berikutnya.)
5. Apakah `service owner` cukup satu user, atau perlu tim? (A: satu user.)
6. **Model harga:** per RS per tahun dengan paket implementasi (hipotesis awal
   Rp 18–48 juta/tahun + implementasi Rp 5–15 juta). Wajib divalidasi ke 5 RS
   sebelum dipakai di penawaran resmi.
7. **Kanal WhatsApp:** gateway resmi berbayar vs bertahan dengan QR/email-in.
   Diputuskan setelah ada RS yang bersedia membiayai kanal tersebut.
8. **Hosting:** on-prem di server RS (kekuatan data residency) vs SaaS terkelola
   di Indonesia. Pilot pertama disarankan on-prem agar tidak menambah beban
   operasional satu orang.
9. **Badan usaha & faktur:** perlu PT/CV, faktur/PPN, dan kontrak standar sebelum
   RS swasta dapat membayar. Ini pekerjaan administratif, bukan teknis.

---

## 13. Referensi

- [README.md](../README.md) — fitur dan operasi saat ini.
- [SCHEMA.md](../SCHEMA.md) — schema dan custom route.
- `backend/pb_migrations/` — source of truth schema.
- `backend/pb_hooks/` — route, guard, SLA, approval, audit.
- `frontend/src/features/` — UI per domain.
- `tests/` — unit, API, e2e.


