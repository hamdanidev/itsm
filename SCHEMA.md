# Healthcare ITSM — Schema

PocketBase v0.40.5. Source of truth: `backend/pb_migrations/`.

## Aturan akses

- `null` = hanya superuser.
- `""` = publik.
- Filter non-empty = hanya request yang memenuhi filter.

Alias:

```text
AUTH     = @request.auth.id != "" && @request.auth.is_active = true
PLATFORM = @request.auth.is_platform_staff = true
TENANT   = tenant = @request.auth.tenant
STAFF    = (@request.auth.role = "it_support" || @request.auth.role = "it_lead")
LEAD     = @request.auth.role = "it_lead"
TEAM_R   = (team != "" && team = @request.auth.team && @request.auth.role = "resolver")
TICKET_R = (requester = @request.auth.id || assignee = @request.auth.id || unit.manager = @request.auth.id || delegates.id ?= @request.auth.id || STAFF || TEAM_R)
```

Setiap rule baca ber-`TENANT` pada koleksi bisnis berbentuk
`AUTH && (PLATFORM || (<rule tenant>))`; lihat *Akses vendor ke data rumah
sakit* di bawah.

Semua koleksi bisnis memiliki `tenant`. Server mengambil tenant dari `e.auth`,
bukan dari body request. Frontend guard bukan otorisasi.

## Mode tenancy

Instalasi yang sama melayani dua bentuk deployment, ditentukan environment
`TENANCY_MODE` (dibaca `lib/tenancy.js` saat request, bukan dari database):

| Mode | `tenants` | Konsol Vendor | Login akun platform |
|---|---|---|---|
| `standalone` (default) | 1 baris | 403 | 403 |
| `vendor` | N baris | aktif | diizinkan |

Nilai tidak dikenal → `standalone` (gagal tertutup). Mode tidak mengubah schema
maupun data; instalasi standalone bisa naik ke vendor tanpa migrasi.

Karena API rule statis, mode ditegakkan di luar rule:

1. `onRecordAuthRequest` (main.pb.js) menolak login **dan** refresh akun
   platform saat mode bukan vendor.
2. Semua route `/api/itsm/platform/*` memanggil `tenancy.assertVendor()`.
3. `GET /api/itsm/app-meta` memberi tahu frontend mode aktif.

Akun platform (`is_platform_staff = true`) bertindak sebagai resolver: mereka
boleh **membaca** tiket semua rumah sakit, tetapi penulisan tetap lewat route
`/api/itsm/*` yang memeriksa role dan kepemilikan tiket per record.

### Akses vendor ke data rumah sakit

Rule baca yang diberi cabang `@request.auth.is_platform_staff = true`:
`tickets`, `ticket_comments`, `ticket_attachments`, `ticket_approvals`,
`notifications`, `users`, `units`, `ticket_categories`, `services`,
`service_items`, `problems`, `problem_tickets`, `knowledge_articles`, `assets`,
`asset_tickets`, `service_cis`, `sla_policies`, `holidays`, `tenants`. Cabang
tenant lama tidak diubah, sehingga akun rumah sakit tetap terisolasi.
`ticket_csat` sengaja tidak punya rule baca/tulis langsung; akses hanya lewat
route `/api/itsm/tickets/{id}/csat`.

`users` juga membuka `is_platform_staff = true` untuk pembaca tenant, supaya nama
assignee/approver vendor bisa di-expand di tiket rumah sakit. Field sensitif
tetap disembunyikan `onRecordEnrich` (hanya diri sendiri / IT Lead /
superuser).

Konsekuensi lain yang disengaja:

- `guards.findTicket` menerima akun platform untuk tiket tenant mana pun;
  `assertSameTenant` dan `canAccessTicket` punya cabang platform.
- Assignee boleh staf rumah sakit pemilik tiket **atau** staf vendor aktif.
  Staf vendor bisa menugaskan tiket ke dirinya sendiri; staf rumah sakit yang
  bisa melihat akun vendor juga bisa mengescalate ke vendor.
- Delegasi approval boleh ditujukan ke staf vendor.
- Notifikasi approval dikirim ke lead rumah sakit + lead vendor
  (`notify.approvalAlerts`), termasuk notifikasi tiket kritis.
- **Gate CAB tetap menghitung lead rumah sakit saja** (`notify.activeLeads`),
  agar jumlah akun vendor tidak mengubah alur approval tenant mana pun.
- Audit mencatat aktor vendor dengan `actor_role` berawalan `platform_`
  (mis. `platform_it_lead`), pada tenant tiket yang bersangkutan.
- Vendor tidak bisa membuat tiket: route create membutuhkan `tenant` dan `unit`
  milik akun, yang tidak dimiliki akun platform.

### Layar audit vendor

`GET /api/itsm/platform/audit` membaca `audit_logs` lintas tenant tanpa
melonggarkan rule koleksi (rule baca audit tetap milik IT Lead per tenant).

Parameter: `tenant`, `actor` (id user), `scope` (`platform` / `tenant` /
`superuser`), `action`, `collection`, `q` (nomor tiket), `from`, `to`, `page`,
`perPage` (maks 100; default 25). Rentang tanggal memakai parser laporan
(default 90 hari, maks 366).

Respons memuat `items` yang sudah dilengkapi `tenant_name`, `tenant_code`,
`actor_name`, `actor_role`, `actor_scope`, `ticket_no`, `changes`, `ip`, dan
`user_agent`, plus `totalItems`, `totalPages`, dan `actors` (pilihan filter
aktor: staf vendor + staf tenant terpilih).

### Layar audit rumah sakit

`GET /api/itsm/audit` dipakai Kepala IT dan Pengamat. Tenant selalu diambil
dari `e.auth`; parameter `tenant` diabaikan. Parameter lain sama dengan audit
vendor. Pengamat tidak membuka koleksi `audit_logs`; route ini yang membaca
untuknya. Rule koleksi tetap hanya untuk Kepala IT.

Catatan semantik:

- `scope=tenant` berarti staf rumah sakit saja; baris `superuser` tidak ikut.
- Aksi vendor tercatat dengan `actor_role` `platform_*` dan `actor_scope`
  `platform`.
- Perubahan data master lewat Admin UI (superuser) tercatat dengan
  `actor_role = "superuser"` dan **tanpa** relasi `actor`, karena superuser
  bukan record `users`. Sebelumnya baris ini tidak tersimpan sama sekali.

### Data master per rumah sakit

`GET`/`POST`/`PATCH` pada `/api/itsm/platform/tenants/{id}/master...` memberi
vendor akses kelola unit, kategori, kebijakan SLA, dan hari libur tanpa
melonggarkan rule tulis `LEAD && TENANT` milik rumah sakit.

- `kind`: `units` | `categories` | `policies` | `holidays`.
- Baca untuk semua akun platform; tulis hanya `role = it_lead` (vendor admin).
- Setiap record dipaksa `tenant = {id}` dari URL. Record milik tenant lain
  menghasilkan 404, termasuk saat `recordId` valid tetapi beda rumah sakit.
- Validasi di `lib/master_data.js`: kode huruf besar 1–20 karakter, jenis
  unit/kategori dikenal, jam `HH:MM` dengan mulai < selesai, hari kerja 1–7,
  respons ≥ 1 menit, tanggal `YYYY-MM-DD`.
- Keunikan dijaga manual: `(tenant, code)` untuk unit/kategori,
  `(tenant, ticket_type, priority)` untuk kebijakan SLA, `(tenant, date)` untuk
  hari libur. Pelanggaran → 400.
- Manajer unit harus pengguna aktif pada rumah sakit yang sama.
- Tidak ada hard delete; gunakan `is_active = false` agar riwayat tiket lama
  tetap valid.
- Setiap create/update menulis `audit_logs` pada tenant terkait dengan
  `collection_name` yang diubah dan `actor_role` platform.

Di UI, vendor memilih satu rumah sakit aktif lewat pemilih tenant di top bar.
Pilihan disimpan di `localStorage` dan menjadi filter daftar tiket; ia **bukan**
batas keamanan (vendor memang boleh melihat semua), melainkan konteks kerja.

Halaman detail tiket menyelaraskan pemilih ke tenant tiket saat dibuka (sekali
per tiket), sehingga membuka tautan/notifikasi tiket RS lain tidak
meninggalkan pemilih di RS yang salah. Mengganti rumah sakit dari halaman
detail mengalihkan ke daftar tiket rumah sakit yang baru, bukan menampilkan
tiket RS lain di bawah pemilih tersebut.

## Setup awal (first-run)

Instalasi baru — belum ada satu pun record `users` — membuka halaman `/setup`.
Status dan pembuatan akun pertama dilayani `pb_hooks/setup.pb.js` dengan helper
di `lib/setup.js`.

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/itsm/setup/status` | `required`, `mode`, `hospital` (prefill standalone), `token_required`, `min_password` |
| POST | `/api/itsm/setup` | Buat data awal + akun pertama; body `token` + `hospital`/`account` |

- **Penanda selesai**: `countRecords("users") === 0`. Begitu akun pertama ada,
  kedua route menolak (409) dan `/setup` dialihkan ke `/login`; tidak ada flag
  terpisah yang bisa lupa di-set.
- **Kode setup**: `SETUP_TOKEN` dari environment, atau kode acak 16 karakter
  (`XXXX-XXXX-XXXX-XXXX`) yang disimpan di `<dataDir>/setup_token` dan dicetak
  di log server. Berkas dihapus setelah setup sukses. Perbandingan mengabaikan
  huruf besar/kecil dan pemisah; kode salah → 403, kode kosong → 403.
- **Standalone**: tenant seed `RS01` diperbarui (nama/kode/zona waktu), data
  master dilengkapi lewat `tenant_seed.seed` (idempoten), lalu akun
  `role=it_lead` dengan unit IT dibuat — semuanya dalam satu transaksi
  `runInTransaction`.
- **Vendor**: hanya akun platform (`is_platform_staff=true`, `tenant` kosong,
  `role=it_lead`) yang dibuat; rumah sakit dibuat dari Konsol Vendor.
- `users.createRule = null` tetap berlaku: route setup memakai `txApp` di server,
  bukan collection API.
- Audit menulis `action=setup` dengan aktor akun pertama (`tenant` kosong pada
  mode vendor; `changes` memuat nama/kode/zona waktu dan email admin).
- Superuser PocketBase (Admin UI) tidak dibuat oleh setup; tetap lewat CLI.

## Koleksi

### `tenants`

`name`, `code`, `timezone`, `is_active`, `logo`, `created`, `updated`.

Satu baris = satu organisasi/rumah sakit; menjadi batas isolasi seluruh data
bisnis. Setiap akun rumah sakit memiliki tepat satu `tenant`, akun platform tidak
punya tenant, dan backend mengambil tenant dari `e.auth` (bukan body request).
`is_active = false` membuat pengguna tenant tersebut tidak bisa login baru (rule
auth user memakai `tenant.is_active`); sesi berjalan tetap hidup sampai token
akses kedaluwarsa. Sidebar menampilkan `name`, `code`, dan `logo` dari record
ini.

`logo` adalah file gambar (PNG/JPG/WEBP, maks 2 MB) dengan thumbnail `96x96`,
diunggah IT Lead lewat `POST /api/itsm/tenant/logo`. File diakses pengguna login
lewat file API; halaman login standalone memakai route publik
`/api/itsm/branding/logo` yang dinonaktifkan pada mode vendor.

`timezone` dipakai saat membuat kebijakan SLA default tenant baru, tetapi
perhitungan SLA tetap memakai `sla_policies.timezone` atau default `Asia/Jakarta`
dan cron di-hardcode ke `Asia/Jakarta`.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && (PLATFORM \|\| id = @request.auth.tenant)` |
| Create/Update/Delete | `null` (superuser lewat Admin UI, atau route Konsol Vendor) |

### `users` (auth)

Field sistem + `tenant`, `unit`, `name`, `role`, `job_title`, `team`, `phone`,
`employee_no`, `avatar`, `is_active`, `is_platform_staff`,
`must_change_password`, `email_opt_out`, `external_id`, `external_issuer`,
`external_groups`, `created`, `updated`.

`job_title` adalah jabatan (mis. Programmer, Teknisi Jaringan, DBA, Admin
SIMRS) dan **tidak** mengubah hak akses. Role akses tetap ditentukan `role`.

`role`: `requester | it_support | resolver | it_lead | viewer`.

- `requester` (Pemohon) — pengguna biasa.
- `it_support` (Staff IT) — agent penuh untuk tiket tenant.
- `resolver` (Teknisi) — programmer/jaringan/hardware/DBA/admin SIMRS; hanya
  tiket yang di-assign kepadanya, tidak boleh triage/assign/close.
- `it_lead` (Kepala IT) — admin tenant, approver, laporan, tim.
- `viewer` (Pengamat) — baca laporan tenant, tanpa akses tulis.

`must_change_password` menandai akun yang dibuat IT Lead dengan password awal
buatan sistem. Selama flag ini `true`, `guards.requireAuth` menolak semua route
`/api/itsm/*` kecuali `POST /profile/password`; UI mengalihkan ke
`/change-password`. Flag turun otomatis setelah password berhasil diubah.

`is_platform_staff` memisahkan **scope** dari **role**: role menentukan boleh
apa, flag ini menentukan bahwa akun bekerja lintas tenant (vendor) dan karenanya
**tidak punya `tenant`**. `tenant` karena itu opsional di skema, tetapi invariant
berikut ditegakkan hook `onRecordValidate`:
- `is_platform_staff = false` → `tenant` wajib terisi.
- `is_platform_staff = true` → `tenant` wajib kosong.

Akun platform hanya bisa login pada instalasi `TENANCY_MODE=vendor`
(`onRecordAuthRequest`). Admin konsol = `is_platform_staff + role = it_lead`;
`it_support` hanya baca.

`avatar` adalah file gambar (PNG/JPG/WEBP, maks 2 MB, thumbnail `96x96`) yang
tidak diproteksi agar bisa dirender di top bar dan komentar. Pengguna hanya
dapat mengubah `name`, `phone`, `employee_no`, `email_opt_out` (lewat payload
profil `email_notifications`), `avatar`, dan password miliknya lewat route
profil; field lain tetap superuser.

`email_opt_out = false` (default) berarti notifikasi tiket juga dikirim lewat
email. Nilai `true` hanya mematikan email notifikasi; email undangan dan reset
password tetap dikirim.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && (PLATFORM \|\| TENANT \|\| is_platform_staff = true)` |
| Create/Update/Delete | `null` |
| Manage | `null` |
| Auth | `is_active = true && (is_platform_staff = true \|\| tenant.is_active = true)` |

Provisioning akun hanya superuser (Admin UI) atau route Konsol Vendor.
`onRecordEnrich` menyembunyikan `phone`, `employee_no`, dan field SSO dari user
selain diri sendiri/IT Lead. Cabang `is_platform_staff = true` membuat staf
vendor dapat di-expand sebagai assignee/approver di tiket rumah sakit; tanpa
cabang itu nama mereka tampil kosong bagi pengguna tenant.

### `units`

`tenant`, `name`, `code`, `kind` (`clinical/support/management`), `manager`
(relasi user, opsional), `is_active`.

`manager` adalah approver tahap pertama untuk tiket unit tersebut. Boleh user
ber-role apa pun (manajer unit tidak harus staf IT); rule baca tiket, komentar,
dan lampiran diperluas ke `unit.manager`.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && (PLATFORM \|\| TENANT)` |
| Create | `LEAD && @request.body.tenant = @request.auth.tenant` |
| Update | `LEAD && TENANT` |
| Delete | `null` (nonaktifkan dengan `is_active=false`) |

Dikelola dari `/admin` (tab Unit). Hard delete tidak tersedia dari UI.

### `ticket_categories`

`tenant`, `name`, `code`, `kind` (`all/incident/service_request/change_request`),
`is_active`.

Rules sama dengan `units`. Dikelola dari `/admin` (tab Kategori).

### `services`

`tenant`, `name`, `code`, `description`, `owner` (relasi user), `support_unit`
(relasi unit), `team` (select: `service_desk/application/network/hardware/
database/biomedical/other`), `default_sla` (relasi `sla_policies`), `is_active`.

Satu layanan adalah jangkar tiket, SLA, dan laporan. Unique `(tenant, code)`.
Dikelola IT Lead dari `/admin` (tab Layanan) atau collection API; vendor hanya
baca pada Increment A.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && (PLATFORM \|\| TENANT)` |
| Create | `LEAD && @request.body.tenant = @request.auth.tenant` |
| Update | `LEAD && TENANT` |
| Delete | `null` (nonaktifkan dengan `is_active=false`) |

### `service_items`

`tenant`, `service` (relasi `services`), `name`, `code`, `description`,
`approval_mode` (`none/manager/lead/cab`), `sla_policy` (relasi
`sla_policies`), `sort`, `is_active`.

Unique `(tenant, service, code)`. Mode approval item menentukan apakah tiket
perlu approval dan siapa approver-nya; `none` untuk permintaan rutin.

Rules sama dengan `services`.

### `problems`

`tenant`, `problem_no`, `title`, `description`, `status`
(`identified/investigating/known_error/resolved/closed`), `root_cause`,
`workaround`, `permanent_fix`, `service` (relasi `services`), `owner` (relasi
user), `resolved_at`.

Unique `(tenant, problem_no)`. Problem hanya dapat dibaca staf IT/akun platform;
penulisan lewat route `/api/itsm/problems`. `known_error` wajib punya root cause
dan workaround; `resolved` wajib punya permanent fix; `closed` hanya dari
`resolved`.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && (PLATFORM \|\| (TENANT && STAFF))` |
| Create/Update/Delete | `null` (route khusus) |

### `problem_tickets`

`tenant`, `problem` (relasi `problems`), `ticket` (relasi `tickets`),
`relation` (`caused_by/duplicate/related`).

Unique `(problem, ticket)`. Satu tiket dapat ditautkan ke beberapa problem,
tetapi `tickets.problem` menyimpan problem utama. Rules sama dengan `problems`.

### `major_incidents`

`tenant`, `incident_no` (`INC-YYYYMMDD-XXXXXX`), `title`, `description`,
`severity` (`sev1/sev2/sev3`), `status`
(`declared/investigating/mitigating/monitoring/resolved/closed`),
`commander` (relasi user), `declared_by`, `impact_summary`, `affected_services`
(relasi multi `services`), `source_ticket`, `resolution_summary`, `root_cause`,
`pir_actions`, `pir_completed_at`, `pir_by`, `started_at`, `resolved_at`,
`closed_at`.

Unique `(tenant, incident_no)`. Satu insiden induk untuk gangguan besar;
deklarasi, perubahan status, tautan tiket, dan PIR lewat route
`/api/itsm/incidents`. `resolved` wajib `resolution_summary`; `closed` hanya
dari `resolved` dan wajib PIR lengkap (`root_cause`, `pir_actions`,
`pir_completed_at`). Hanya staf IT dan akun platform yang dapat membaca.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && (PLATFORM \|\| (TENANT && STAFF))` |
| Create/Update/Delete | `null` (route khusus) |

### `incident_updates`

`tenant`, `incident` (relasi `major_incidents`), `kind`
(`update/decision/communication`), `visibility` (`internal/public`), `body`,
`author`. Timeline komunikasi; update `public` juga mengirim notifikasi ke
pemilik tiket terdampak. Rules sama dengan `major_incidents`.

### `major_incident_tickets`

`tenant`, `incident`, `ticket`, `relation` (`impacted/caused/related`).
Unique `(incident, ticket)`; `tickets.major_incident` menyimpan insiden utama.
Rules sama dengan `major_incidents`.

### `knowledge_articles`

`tenant`, `title`, `slug`, `body`, `status`
(`draft/review/published/retired`), `visibility` (`internal/public`), `service`,
`problem`, `tags`, `author`, `reviewer`, `published_at`.

Unique `(tenant, slug)`. Requester hanya dapat membaca artikel
`published` + `public`; staf IT dapat membaca semua. Penulisan, publish, dan
retire lewat route `/api/itsm/knowledge`.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && (PLATFORM \|\| (TENANT && ((status="published" && visibility="public") \|\| STAFF)))` |
| Create/Update/Delete | `null` (route khusus) |

### `assets`

Register aset/CI: `tenant`, `asset_no`, `name`, `type`
(`workstation/printer/server/network/medical_device/license`), `status`
(`active/maintenance/retired`), `criticality` (`low/medium/high/critical`),
`location`, `unit`, `service`, `owner`, `warranty_end`, `notes`.

Unique `(tenant, asset_no)`; nomor dibuat otomatis `AST-YYYYMMDD-XXXXXX` bila
kosong. Requester boleh membaca katalog aset untuk memilih aset terdampak saat
intake; create/update hanya lewat route staf `/api/itsm/assets`.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && (PLATFORM \|\| TENANT)` |
| Create/Update/Delete | `null` (route khusus) |

### `asset_tickets`

`tenant`, `asset`, `ticket`, `relation` (`affected/caused/related`).
Unique `(asset, ticket)`. Menyimpan riwayat tiket per aset. Detail aset
menampilkan riwayat ini lewat route staf; requester hanya melihat aset ringkas
pada tiketnya lewat `GET /api/itsm/tickets/{id}/assets`.

Rules sama dengan `problems`.

### `service_cis`

`tenant`, `service`, `asset`, `criticality`. Unique `(service, asset)`.
Disinkronkan otomatis dari layanan utama aset saat create/update sehingga
hubungan aset–layanan selalu konsisten.

Rules sama dengan `problems`.

### `ticket_csat`

`tenant`, `ticket`, `score` (1–5), `comment`, `submitted_by`, `source`
(`portal`/`guest`), `submitted_by_name`. Unique `ticket` — satu respons per
tiket. CSAT portal hanya dapat dikirim requester tiket saat `resolved`/`closed`;
CSAT tamu dikirim lewat tautan status bertoken dan tidak memakai akun
(`submitted_by` kosong). List/View/Create/Update/Delete `null`; semua akses
lewat route `/api/itsm/tickets/{id}/csat` atau
`/api/itsm/public/tickets/{token}/csat`.

### `sla_policies`

`tenant`, `name`, `ticket_type`, `priority`, `response_minutes`,
`approval_minutes`, `resolution_minutes`, `calendar_mode` (`24x7/business_hours`),
`business_days` JSON, `business_start`, `business_end`, `timezone`, `version`,
`is_active`.

Unique `(tenant, ticket_type, priority)` — satu kebijakan per kombinasi.
Dikelola dari `/admin` (tab Kebijakan SLA). Perubahan hanya untuk tiket baru.

Rules sama dengan `units`.

### `holidays`

`tenant`, `date`, `name`, `is_active`. Unique `(tenant, date)`.
Dikelola dari `/admin` (tab Hari libur); memengaruhi perhitungan SLA jam kerja.

Rules sama dengan `units`.

### `intake_points`

Titik QR publik: `tenant`, `name`, `unit`, `location`, `token` (32 karakter,
unik), `is_active`, `expires_at`, `max_per_hour`, `last_used_at`, `created_by`.

- Satu titik mewakili satu unit/lokasi. Tiket tamu memakai `unit` dari titik,
  bukan dari body request, sehingga pelapor tidak bisa memalsukan unit.
- Token dapat dicabut (`is_active=false`) atau dirotasi lewat route
  `/api/itsm/intake-points/{id}/rotate`; QR lama langsung tidak berlaku.
- Koleksi ini **tidak punya API rule** (create/update/delete `null`); semua
  akses lewat route Kepala IT atau route publik berbasis token.
- `max_per_hour` membatasi jumlah tiket per titik per jam (default 20).

### `tickets`

Identitas: `ticket_no`, `tenant`, `type`, `title`, `description`, `status`,
`source`, `impact`, `priority`, `priority_reason`, `requester`, `created_by`,
`unit`, `category`, `service`, `service_item`, `requested_for`, `location`,
`team`, `reporter_name`, `reporter_contact`, `patient_data_confirmed`,
`intake_channel`, `intake_ref`, `public_token`, `approval_mode`, `problem`,
`kb_article`, `major_incident`.

- `service`/`service_item` menghubungkan tiket ke katalog. Boleh kosong untuk
  tiket lama atau tiket yang belum ditriage.
- `requested_for` adalah pemohon sebenarnya; untuk tiket biasa sama dengan
  `requester`. Staf dapat membuat tiket atas nama pengguna lain.
- `location` menyimpan poli/ruangan/lokasi perangkat.
- `intake_channel` mencatat kanal masuk (`web/qr/email/telegram/whatsapp/manual`);
  `intake_ref` menyimpan ID titik QR atau referensi pesan kanal. Tiket dari QR
  publik punya `requester` kosong, `source=web`, dan `unit` dari titik QR.
- `public_token` adalah rahasia 32 karakter untuk tautan status tamu
  (`/t/{token}`), unik dan hanya diberikan kepada pelapor. Token ini tidak
  memberi akses tulis ke tiket; CSAT tamu memakai route publik terpisah yang
  tetap memvalidasi status tiket.
- `team` adalah antrean tim pemilik tiket (select yang sama dengan
  `users.team` dan `services.team`). Tiket baru mewarisi `services.team`;
  triage dapat mengoreksinya. Teknisi melihat tiket timnya, termasuk yang
  belum di-assign, dan dapat mengambil tiket tersebut.
- `approval_mode` adalah snapshot mode saat create/triage
  (`default/none/manager/lead/cab`).
- `problem` adalah problem utama tiket; relasi many-to-many lengkap ada di
  `problem_tickets`.
- `major_incident` adalah insiden mayor yang menaungi tiket ini; relasi
  many-to-many lengkap ada di `major_incident_tickets`.
- `kb_article` adalah artikel pengetahuan yang ditautkan ke tiket.
- Aset/CI terdampak disimpan di `asset_tickets` (many-to-many), bukan sebagai
  field tunggal di tiket. Satu tiket dapat memiliki beberapa aset.
- CSAT disimpan di `ticket_csat`, satu respons per tiket, diisi requester
  (portal) atau pelapor tamu lewat tautan status setelah tiket selesai/ditutup.

Workflow: `assignee`, `assigned_at`, `assigned_by`, `first_response_at`,
`first_response_by`, `resolved_at`, `resolved_by`, `resolution_summary`,
`resolution_code`, `closed_at`, `closed_by`, `reopened_at`, `reopen_count`,
`last_activity_at`.

SLA: `sla_policy`, `sla_snapshot`, `response_due_at`, `approval_due_at`,
`resolution_due_at`, `response_breach_at`, `approval_breach_at`,
`resolution_breach_at`, `escalation_level`, `escalated_at`, `next_due_at`,
`sla_paused_at`, `sla_paused_minutes`.

`next_due_at` adalah satu-satunya tenggat SLA yang masih menjadi gerbang
pekerjaan: `approval_due_at` selama SR/CR belum diputuskan, lalu
`resolution_due_at` (incident/SR) atau `planned_end` (CR) setelah disetujui.
Field ini diisi hook saat create/approval dan dipakai untuk `sort=due`.

Approval: `approval_status`, `approved_by`, `approved_at`, `approval_note`.
Rincian per tahap ada di collection `ticket_approvals`; `approval_status`
menjadi ringkasan (`pending` selama masih ada tahap menunggu, `approved` setelah
semua tahap setuju, `rejected` bila satu tahap menolak).

Delegasi: `delegates` (relasi multi ke `users`). Minimal berisi requester agar
filter relasi tidak kosong (relasi kosong membuat evaluasi rule error), dan
setiap penerima delegasi approval ditambahkan ke sini supaya bisa membuka tiket
meski bukan staf/manajer unit.

Change: `change_risk`, `implementation_plan`, `rollback_plan`, `planned_start`,
`planned_end`, `actual_start`, `actual_end`, `change_outcome`.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && (PLATFORM \|\| (TENANT && TICKET_R))` |
| Create/Update/Delete | `null` |

Semua penulisan lewat custom route `/api/itsm/*`. Route memeriksa role, tenant,
akses record, field yang diizinkan, transisi status, dan menulis audit.

### `ticket_comments`

`ticket`, `author`, `body`, `visibility` (`public/internal`).

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && (PLATFORM \|\| (ticket.tenant = @request.auth.tenant && TICKET_R && (visibility = "public" \|\| STAFF)))` |
| Create/Update/Delete | `null` |

Append-only. Komentar internal tidak terlihat requester. First response diisi
saat staff memberi komentar publik pertama. Teknisi dapat membaca komentar
publik tiket timnya; komentar internal tiket tim baru terlihat setelah tiket
di-assign kepadanya.

### `ticket_attachments`

`ticket`, `comment`, `uploader` (opsional untuk lampiran tamu QR), `file`
(protected, max 10 MB), `original_name`, `mime`, `size`, `visibility`.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && (PLATFORM \|\| (ticket.tenant = @request.auth.tenant && TICKET_R && (visibility = "public" \|\| STAFF)))` |
| Create/Update/Delete | `null` |

Maksimal 3 lampiran per tiket. File diakses dengan file token. Aturan
visibilitas sama dengan komentar: Teknisi hanya melihat lampiran internal
setelah tiket di-assign kepadanya.

### `ticket_approvals`

`tenant`, `ticket`, `step` (number), `kind` (`unit_manager/it_lead/cab`),
`approver` (relasi user; kosong untuk tahap IT Lead/CAB), `status`
(`pending/approved/rejected`), `note`, `due_at`, `acted_by`, `acted_at`,
`delegated_from`, `delegated_by`, `delegated_at`, `delegation_note`, `created`,
`updated`.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && (PLATFORM \|\| (TENANT && TICKET_R))` |
| Create/Update/Delete | `null` (hanya route approval) |

Dibuat otomatis saat Service/Change Request dibuat:

- tahap 1 = manajer unit pemohon (bila `units.manager` aktif);
- tahap 2 = IT Lead;
- tahap 3 `cab` = khusus Change Request `change_risk=high` dan tenant punya
  minimal dua IT Lead aktif. Harus diputuskan IT Lead yang berbeda dari tahap 2.

`due_at` dihitung saat tahap itu aktif memakai `tickets.sla_snapshot`;
`tickets.approval_due_at` selalu menunjuk tenggat tahap aktif. Pekerjaan baru
boleh dimulai setelah semua tahap `approved`. Penolakan menghentikan alur; IT
Lead dapat override dengan menyetujui semua tahap yang tersisa.

Delegasi mengubah `approver` tahap aktif, mencatat `delegated_from`/`delegated_by`/
`delegated_at`/`delegation_note`, menambah penerima ke `tickets.delegates`, dan
menulis audit `delegate`. Approver asli atau IT Lead dapat mendelegasikan; tahap
IT Lead/CAB hanya ke IT Lead, dan CAB tidak boleh ke lead yang menyetujui tahap 2.

Backfill migrasi membuat satu tahap `it_lead` untuk tiket lama dan menyalin
`tickets.approval_due_at` ke `due_at` tahap yang masih pending.

### `notifications`

`tenant`, `user`, `ticket`, `type` (`assigned/comment/status/approval/sla/escalation`),
`title`, `body`, `is_read`, `created`, `updated`.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && user = @request.auth.id && (PLATFORM \|\| tenant = @request.auth.tenant)` |
| Update | rule yang sama (menandai `is_read`) |
| Create/Delete | `null` (hanya hook server) |

Dibuat oleh `lib/notify.js` dari route aksi tiket, komentar, approval, dan SLA
scan. Setiap notifikasi juga memanggil `lib/mail.js` untuk mengantrekan salinan
email (kecuali penerima mematikan preferensi). Notifikasi untuk diri sendiri
tidak dibuat. Komentar/lampiran internal hanya dikirim ke assignee, tidak pernah
ke requester. `ticket` boleh kosong untuk notifikasi non-tiket, tetapi saat ini
semua notifikasi terkait tiket. Realtime subscribe memakai list rule yang sama
sehingga user hanya menerima event miliknya.

### `email_outbox`

Antrean email notifikasi: `tenant`, `user`, `ticket`, `to`, `recipient_name`,
`subject`, `html`, `text`, `template` (`invitation/password_reset/notification`),
`event` (tipe notifikasi asal), `status` (`queued/sent/failed`), `attempts`,
`next_attempt_at`, `sent_at`, `last_error`, `created`, `updated`.

Rules: seluruh operasi `null` — hanya hook server dan superuser (Admin UI) yang
bisa membaca. Isinya dapat memuat tautan tiket internal.

- `lib/mail.js` menulis baris `queued` di dalam transaksi aksi tiket.
- Cron `email_dispatch` mengirim maksimal 20 email per menit, dengan retry
  1/5/15/60/240 menit; setelah 5 percobaan status menjadi `failed`.
- Email `sent` lebih tua dari 30 hari dibersihkan best-effort.
- Undangan akun dan reset password **tidak** lewat antrean: dikirim langsung
  agar password sementara tidak tersimpan di database. Mode test
  `MAIL_TRANSPORT=capture` menyimpan salinannya sebagai `sent` untuk verifikasi.
- Konfigurasi SMTP diambil dari environment (`SMTP_*`, `APP_URL`, `APP_NAME`)
  saat boot dan ditulis ke settings PocketBase; env menang atas Admin UI.

### `audit_logs`

`tenant`, `ticket`, `actor`, `actor_role`, `action`, `collection_name`,
`record_id`, `changes`, `ip`, `user_agent`, `created`.

`tenant` **tidak wajib** hanya untuk baris milik akun platform. Baris seperti
itu tidak terlihat tenant mana pun karena rule baca mewajibkan
`tenant = @request.auth.tenant` (hanya superuser yang bisa membacanya). Aksi
akun platform memakai `actor_role` berawalan `platform_` (mis.
`platform_it_lead`) agar asal kewenangan jelas. Perubahan data master oleh
superuser lewat Admin UI memakai `actor_role = "superuser"` tanpa relasi
`actor` (superuser bukan record `users`).

Rules:

| Aksi | Rule |
|---|---|
| List/View | `LEAD && TENANT` |
| Create/Update/Delete | `null` |

Request hooks juga menolak create/update/delete audit dari API. Hanya
`txApp.save` internal yang menulis. `changes` tidak memuat deskripsi, body
komentar, isi lampiran, atau data pasien.

Perubahan data master dari `/admin` (units, ticket_categories, services,
service_items, sla_policies, holidays) dicatat lewat
`pb_hooks/admin_audit.pb.js` dengan `action` `create` atau `update`,
`collection_name`/`record_id` record yang diubah, dan `changes` berupa diff
field (`{from, to}`). Baris ini tidak punya `ticket` karena bukan aktivitas
tiket.

Triage tiket menulis `action=triage` dengan diff prioritas, dampak, kategori,
layanan, item, lokasi, mode approval, dan alasan. Event ini muncul di timeline
tiket sebagai perubahan triage.

Setup awal instalasi menulis `action=setup` (aktor akun pertama; `tenant` kosong
untuk mode vendor) dengan `collection_name=tenants` atau `users`.

Penautan problem dan artikel menulis `action=problem_link` /
`action=knowledge_link` pada tiket terkait. Perubahan problem dan artikel
menulis `action=create/update` dengan `collection_name=problems` atau
`knowledge_articles`. Semua event ini muncul di timeline tiket bila terkait
tiket.

Halaman detail tiket membaca riwayat lewat route `/api/itsm/tickets/{id}/timeline`,
bukan lewat list rule di atas. Route memproyeksikan audit menjadi event yang aman
untuk requester: komentar/lampiran `internal` disembunyikan dan `ip`/`user_agent`
tidak pernah dikirim. Realtime `subscribe` pada tiket/komentar/lampiran tetap
tunduk pada list rule tiap collection.

## State machine

```text
open -> assigned -> in_progress -> resolved -> closed
           |             |                         |
           |             +-> waiting -> in_progress
           |                                       +-> reopened
           +-------------------------------------------+
```

Gate utama:

- `assigned`: assignee wajib; SR/CR harus approved.
- `in_progress`: assignee wajib; dari `waiting` berarti melanjutkan pekerjaan
  dan menggeser tenggat SLA sebesar durasi jeda; SR/CR harus semua tahap
  approval approved.
- `waiting`: hanya dari assigned/in_progress oleh assignee atau IT Lead;
  `sla_paused_at` diisi dan jam penyelesaian dijeda. Resolve tidak diizinkan
  langsung dari waiting.
- `resolved`: resolution summary + code; CR butuh outcome dan actual_end.
- `closed`: hanya dari resolved.
- `reopened`: requester dalam 7 hari atau lead; memulai siklus SLA penyelesaian
  baru (lihat di bawah).
- Tidak ada hard delete. Duplikat ditutup dengan `resolution_code=duplicate`.

## State machine insiden mayor

```
declared -> investigating <-> mitigating <-> monitoring
   \_____________\______________\____________-> resolved -> closed
                                                 ^   |
                                                 |   +-> investigating (reopen)
                                                 +-------+
```

- `declared` dibuat oleh staf IT; komandan default pembuat, dapat diganti.
- `resolved` wajib `resolution_summary` dan mengisi `resolved_at`.
- `closed` hanya dari `resolved` dan wajib PIR lengkap
  (`root_cause`, `pir_actions`, `pir_completed_at`, `pir_by`).
- Reopen (`resolved → investigating`) mengosongkan `resolved_at` dan mencatat
  audit `incident_update`.
- Setiap perubahan status mengirim broadcast in-app/email ke staf dan lead.

## Prioritas dan SLA

| Impact | Priority |
|---|---|
| `patient_safety` | `critical` |
| `clinical_workflow` | `high` |
| `operational` | `normal` |
| `convenience` | `low` |

Clock SLA:

- Incident: response + resolution.
- Service Request: response + approval + resolution.
- Change Request: response + approval; implementasi diukur dari jadwal.

Jam kerja default: Senin–Jumat 08:00–17:00 Asia/Jakarta, dengan `holidays`.
Kritis memakai 24/7.

Jeda dan recompute:

- `waiting` mengisi `sla_paused_at`; scan breach melewatkan tiket waiting.
- Saat dilanjutkan, `resolution_due_at` dan `next_due_at` digeser sebesar
  `now - sla_paused_at`, lalu durasi itu ditambahkan ke `sla_paused_minutes`.
- Reopen menghitung ulang `resolution_due_at` dari waktu reopen memakai policy
  aktif (fallback policy bila tidak ada), membersihkan `resolution_breach_at`,
  `escalation_level`, dan `escalated_at`. Riwayat breach tetap di audit log.

## Custom routes

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/itsm/tickets` | Buat tiket |
| POST | `/api/itsm/tickets/{id}/assign` | Assign / lepas assignee |
| POST | `/api/itsm/tickets/{id}/transition` | Mulai, menunggu/lanjutkan, selesaikan, tutup, buka kembali |
| POST | `/api/itsm/tickets/{id}/triage` | Koreksi prioritas/dampak/kategori/layanan/lokasi sebelum pekerjaan dimulai |
| POST | `/api/itsm/problems` | Buat problem; opsional tautkan `ticket_id` |
| PATCH | `/api/itsm/problems/{id}` | Ubah status/root cause/workaround/permanent fix |
| POST | `/api/itsm/problems/{id}/tickets` | Tautkan tiket ke problem |
| POST | `/api/itsm/incidents` | Deklarasikan insiden mayor; opsional `source_ticket` |
| PATCH | `/api/itsm/incidents/{id}` | Ubah status/severity/komandan/layanan/PIR |
| POST | `/api/itsm/incidents/{id}/updates` | Update komunikasi internal/publik |
| POST | `/api/itsm/incidents/{id}/tickets` | Tautkan tiket terdampak |
| GET | `/api/itsm/incidents/stats` | MTTR, jumlah insiden, tren, dan PIR (hanya IT Lead) |
| POST | `/api/itsm/knowledge` | Buat artikel draft; opsional tautkan tiket |
| PATCH | `/api/itsm/knowledge/{id}` | Ubah artikel atau ajukan review |
| POST | `/api/itsm/knowledge/{id}/publish` | Terbitkan/pensiunkan; hanya IT Lead |
| GET | `/api/itsm/knowledge/search` | Cari artikel terbit + workaround known error |
| POST | `/api/itsm/tickets/{id}/approval` | Setujui/tolak/delegasikan tahap approval aktif |
| POST | `/api/itsm/tickets/{id}/comments` | Komentar publik/internal |
| POST | `/api/itsm/tickets/{id}/attachments` | Upload lampiran |
| GET | `/api/itsm/tickets/{id}/timeline` | Riwayat aktivitas tiket (proyeksi audit) |
| GET | `/api/itsm/reports/sla` | Laporan SLA (JSON), Kepala IT atau Pengamat |
| GET | `/api/itsm/reports/sla.csv` | Ekspor CSV per tiket, Kepala IT atau Pengamat |
| GET/PATCH | `/api/itsm/profile` | Baca/ubah profil sendiri (nama, telepon, nomor pegawai) |
| POST/DELETE | `/api/itsm/profile/avatar` | Unggah/hapus avatar |
| POST | `/api/itsm/profile/password` | Ganti password dengan verifikasi password lama |
| POST | `/api/itsm/auth/forgot-password` | Minta tautan reset password (guest; respons generik) |
| POST/DELETE | `/api/itsm/tenant/logo` | Unggah/hapus logo rumah sakit; hanya IT Lead |
| GET | `/api/itsm/branding/logo` | Logo publik rumah sakit aktif (standalone) |
| GET | `/api/itsm/public/intake/{token}` | Meta form QR publik: tenant, titik, layanan/item, dampak (tanpa auth) |
| POST | `/api/itsm/public/intake/{token}` | Buat tiket tamu dari QR (multipart: `payload` + `files`, tanpa auth) |
| GET | `/api/itsm/public/intake/{token}/logo` | Logo tenant untuk halaman QR (tanpa auth, berbasis token) |
| GET | `/api/itsm/public/tickets/{token}` | Status satu tiket tamu + pembaruan publik (tanpa auth) |
| POST | `/api/itsm/public/tickets/{token}/csat` | CSAT tamu setelah tiket selesai/ditutup (tanpa auth) |
| GET | `/api/itsm/public/tickets/{token}/logo` | Logo tenant untuk halaman status (tanpa auth) |
| GET | `/api/itsm/intake-points` | Daftar titik QR tenant; hanya IT Lead |
| POST | `/api/itsm/intake-points` | Buat titik QR + token; hanya IT Lead |
| PATCH | `/api/itsm/intake-points/{id}` | Ubah nama/unit/lokasi/batas/status titik; hanya IT Lead |
| POST | `/api/itsm/intake-points/{id}/rotate` | Rotasi token titik; hanya IT Lead |
| GET | `/api/itsm/team` | Daftar anggota tim rumah sakit; hanya IT Lead |
| POST | `/api/itsm/team` | Tambah anggota (password awal dibuat sistem); hanya IT Lead |
| PATCH | `/api/itsm/team/{userId}` | Ubah nama/role/unit/status anggota; hanya IT Lead |
| POST | `/api/itsm/team/{userId}/password` | Reset password anggota; hanya IT Lead |
| GET | `/api/itsm/mail/status` | Status SMTP + hitungan antrean tenant; hanya IT Lead |
| POST | `/api/itsm/mail/dispatch` | Kirim antrean email sekarang; hanya superuser |
| GET | `/api/itsm/app-meta` | Mode tenancy aktif + `setup_required` (publik, tanpa auth) |
| GET | `/api/itsm/setup/status` | Status setup awal + identitas RS untuk prefill (publik) |
| POST | `/api/itsm/setup` | Buat data awal + akun pertama; wajib kode setup (publik) |
| GET | `/api/itsm/platform/tenants` | Daftar tenant + hitungan; akun platform |
| POST | `/api/itsm/platform/tenants` | Buat tenant + seed + akun IT pertama; platform admin |
| GET | `/api/itsm/platform/tenants/{id}` | Detail tenant, hitungan, pengguna, unit |
| PATCH | `/api/itsm/platform/tenants/{id}` | Ubah nama/kode/zona waktu/status; platform admin |
| POST | `/api/itsm/platform/tenants/{id}/seed` | Lengkapi data master default (idempoten) |
| POST | `/api/itsm/platform/tenants/{id}/users` | Tambah pengguna tenant; platform admin |
| PATCH | `/api/itsm/platform/tenants/{id}/users/{userId}` | Ubah status/role/unit/password |
| GET | `/api/itsm/platform/tenants/{id}/master` | Data master RS: unit, kategori, kebijakan SLA, hari libur, pengguna |
| POST | `/api/itsm/platform/tenants/{id}/master/{kind}` | Tambah data master; vendor admin |
| PATCH | `/api/itsm/platform/tenants/{id}/master/{kind}/{recordId}` | Ubah/nonaktifkan data master; vendor admin |
| GET | `/api/itsm/audit` | Audit tenant; Kepala IT atau Pengamat (filter aktor, aksi, cakupan, tanggal, nomor tiket) |
| GET | `/api/itsm/platform/audit` | Audit lintas tenant (filter RS, aktor, aksi, cakupan, tanggal, nomor tiket) |
| POST | `/api/itsm/dev/seed/age` | **Development**: mundurkan/sebar waktu record untuk seed manual; superuser |
| POST | `/api/itsm/dev/seed/reset` | **Development**: hapus data transaksional satu tenant untuk seed manual; superuser |

Semua route memakai `$apis.requireAuth()` dan pengecekan server-side, kecuali
route publik `/api/itsm/public/intake/*` yang memvalidasi token titik, tenant
aktif, rate limit, honeypot, dan attestation data pasien, route
`/api/itsm/public/tickets/*` yang hanya membuka satu tiket berdasarkan
`public_token` dan tidak pernah mengirim komentar internal atau data pengguna,
route `/api/itsm/setup/*` yang hanya hidup selama instalasi belum punya akun dan
mewajibkan kode setup, serta route `/api/itsm/dev/seed/*` yang memakai
`$apis.requireSuperuserAuth()`.
Service/Change Request harus berstatus approval `approved` sebelum pekerjaan bisa
dimulai, dijeda, atau diselesaikan; item katalog dengan `approval_mode = none`
memakai `approval_status = not_required` dan boleh langsung dikerjakan. Setiap
aksi menulis audit log.

Route `/api/itsm/dev/seed/*` adalah alat bantu `scripts/seed.mjs`, bukan API
bisnis. Keduanya hanya menerima superuser PocketBase karena sengaja memakai
akses database langsung untuk menulis `created`/`updated` dan untuk menghapus
data demo beserta berkas lampirannya. Frontend tidak pernah memanggil route ini
dan tidak ada menu untuk membukanya; pada instalasi produksi route tetap
tersedia tetapi selalu 403 tanpa sesi superuser. Seed memakainya untuk
memundurkan tiket beserta komentar, approval, notifikasi, dan audit log agar
laporan riwayat terlihat wajar, serta untuk mereset data demo sebelum seeding
ulang.


Route approval menerima `decision` `approved` / `rejected` / `delegated`. Untuk
delegasi, sertakan `delegate` (id user) dan `note` sebagai alasan (wajib ≥ 5
karakter).

Route `/api/itsm/platform/*` hanya menerima `users.is_platform_staff`; aksi
tulis menuntut `role = it_lead`. Route ini juga memanggil `tenancy.assertVendor()`
sehingga selalu 403 pada instalasi standalone. Pembacaan lintas tenant dilakukan
dengan `findRecordsByFilter` ber-`tenant` eksplisit — bukan dengan melonggarkan
API rule.

## Laporan SLA

`GET /api/itsm/reports/sla` mengagregasi tiket yang **dibuat** pada rentang
`from`–`to` (WIB, `YYYY-MM-DD`), default 90 hari, maksimal 366 hari. Agregasi
dijalankan di server (`pb_hooks/lib/reporting.js`), bukan di browser.

Parameter: `from`, `to`, `bucket` (`month` default, `week` memakai ISO week),
dan `tenant` (khusus akun vendor).

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

- `range` — `from`, `to`, `days`, `bucket`.
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

Median dihitung dari gabungan seluruh baris (bukan rata-rata median per
tenant), sehingga angka laporan lintas RS tetap benar.

`breached` dihitung dari field `response_breach_at`, `approval_breach_at`, atau
`resolution_breach_at`. Median respons memakai `first_response_at − created`;
median resolusi memakai `resolved_at − created` untuk tiket yang sudah selesai.
Semua durasi memakai menit kalender.

`GET /api/itsm/reports/sla.csv` memakai filter yang sama dan mengirim satu baris
per tiket (UTF-8 + BOM, pemisah koma) untuk diolah di Excel. Saat cakupannya
`all`, kolom pertama menjadi `tenant`; ekspor satu rumah sakit memakai header
lama tanpa kolom itu.

## Profil pengguna

Route profil hanya menyentuh record `e.auth`; tidak ada parameter id, sehingga
pengguna tidak bisa mengubah profil orang lain.

- `GET /api/itsm/profile` — data sendiri + `unit_name`/`tenant_name`.
- `PATCH /api/itsm/profile` — `name` (2–120 karakter), `phone` (angka dan
  `+ - ( )`), `employee_no` (huruf/angka/titik/garis miring/strip), dan
  `email_notifications` (boolean, disimpan terbalik di `email_opt_out`). Field
  `role`, `tenant`, `unit`, `is_active`, dan email diabaikan walau dikirim.
- `POST /api/itsm/profile/avatar` — multipart `avatar`; PocketBase memvalidasi
  tipe dan ukuran (maks 2 MB). `DELETE` menghapus avatar.
- `POST /api/itsm/profile/password` — `current_password`, `new_password`,
  `new_password_confirm`. Password lama diverifikasi dengan
  `record.validatePassword()`, minimal 8 karakter, lalu `refreshTokenKey()`
  membuat semua sesi lama tidak berlaku.

Setiap perubahan menulis `audit_logs` dengan `action=update`,
`collection_name=users`, `record_id` pengguna, dan `changes` tanpa nilai
password. Notifikasi tidak dibuat untuk perubahan profil.

## Lupa password mandiri

`POST /api/itsm/auth/forgot-password` adalah endpoint guest (`requireGuestOnly`)
dengan body `{email}` dan selalu membalas `200 {ok:true}` agar tidak bisa
dipakai menebak akun.

1. Cari user aktif dengan email tersebut. Bila tidak ada, akun nonaktif, atau
   tenant nonaktif, tidak ada email yang dikirim.
2. Batasi satu permintaan per menit per pengguna. Penanda dibaca dari
   `audit_logs` (`action=password_reset_request`, `actor=user`) agar tidak perlu
   field/tabel tambahan.
3. Buat token dengan `record.newPasswordResetToken()` (JWT bertanda tangan,
   memakai `tokenKey` + secret collection; tidak disimpan di database).
4. Kirim tautan `${APP_URL}/reset-password?token=...` lewat `lib/mail.js`.
   Mode capture menyimpan salinannya di `email_outbox` (`template=password_reset`,
   `event=link`) untuk test.
5. Halaman `/reset-password` memanggil endpoint bawaan PocketBase
   `POST /api/collections/users/confirm-password-reset`.

Hook `onRecordConfirmPasswordResetRequest` setelah konfirmasi berhasil:
menurunkan `must_change_password`, memanggil `refreshTokenKey()` (token reset
tidak bisa dipakai ulang dan sesi lama keluar), lalu menulis audit
`password_reset` dengan `changes.sessions_revoked=true`.

## Logo rumah sakit

- `POST /api/itsm/tenant/logo` — multipart `logo`, hanya IT Lead; field
  `tenants.logo` memvalidasi tipe (PNG/JPG/WEBP) dan ukuran (maks 2 MB).
- `DELETE /api/itsm/tenant/logo` — menghapus logo.
- `GET /api/itsm/branding/logo` — publik, hanya mode standalone, menyajikan file
  logo rumah sakit aktif lewat `e.fileFS($os.dirFS(...))`. Mode vendor selalu
  404.
- Setiap unggah/hapus menulis audit `update` pada `collection_name=tenants`.
- Frontend memakai `tenantLogoUrl()` (`/api/files/tenants/{id}/{logo}`) untuk
  pengguna login, dan route publik di atas untuk halaman login.

## Tim rumah sakit

IT Lead mengelola staf di tenant-nya sendiri lewat `/api/itsm/team`. Penulisan
memakai `$app.save`, sehingga `users.createRule` tetap `null` (superuser saja).

- Cakupan: `tenant = e.auth.tenant`; akun platform dan pengguna tenant lain
  selalu menghasilkan 404.
- Role yang boleh dibuat: `requester`, `it_support`, `resolver`, `it_lead`, `viewer`.
- Email wajib unik global dan tidak dapat diubah setelah akun dibuat.
- Password awal dibuat server: 16 karakter dari alfabet tanpa karakter ambigu.
  Password hanya dikembalikan sekali pada respons `POST` (create) dan
  `POST .../password` (reset); `audit_logs` tidak menyimpannya.
- Bila SMTP aktif, respons yang sama diikuti email undangan/reset berisi
  password sementara. Kegagalan email tidak membatalkan akun; UI menampilkan
  password dan pesan kegagalan agar bisa diserahkan manual.
- `POST` membuat akun dengan `must_change_password = true`; reset password juga
  menaikkan flag itu dan memanggil `refreshTokenKey()` (sesi lama berakhir).
- Lead tidak dapat menonaktifkan akun sendiri atau mengubah role sendiri.
- IT Lead aktif terakhir tidak dapat dinonaktifkan atau diturunkan; bila
  perubahan itu dicoba, server menolak 400.
- Unit yang dipasang harus milik tenant yang sama.
- Setiap create/update/reset menulis `audit_logs` (`collection_name=users`).

Halaman `/change-password` dipakai untuk memaksa penggantian password awal:
selama `must_change_password = true`, `guards.requireAuth` menolak route ITSM
lain dan router mengalihkan pengguna ke halaman itu.

## SLA breach scan

`backend/pb_hooks/sla_job.pb.js` berjalan setiap 5 menit, menandai
`response_breach_at`, `approval_breach_at`, dan `resolution_breach_at`, lalu
menaikkan `escalation_level` dan menulis audit `sla_breach`. Job idempoten dan
memproses batch berulang sampai tidak ada tiket overdue.

Tiket `waiting` dilewati pada scan penyelesaian. Eskalasi berjenjang:

| Level | Pemicu |
|---|---|
| 1 | `response_breach_at` atau `approval_breach_at` terisi |
| 2 | `resolution_breach_at` terisi |
| 3 | breach penyelesaian > 4 jam dan belum ditangani; audit `escalate` |

## Known limitations

- Problem belum punya laporan aging/repeat incident rate khusus di halaman
  Laporan; ringkasan operasional ada di halaman Problem dan Knowledge.
- Knowledge base belum punya editor rich text, versi artikel, atau workflow
  review multi-approver; lifecycle draft → review → published → retired dijaga
  route.
- Katalog layanan (Increment A) belum punya dynamic form builder atau checklist
  fulfillment; item hanya membawa deskripsi, approval mode, dan SLA. Vendor
  hanya baca katalog; penulisan lewat konsol vendor belum dibuka.
- Triage hanya boleh sebelum pekerjaan dimulai; setelah `in_progress`, koreksi
  prioritas/layanan harus lewat alur perubahan atau penanganan manual.
- CAB memakai IT Lead kedua (belum ada peran/komite CAB terpisah). Yang dihitung
  hanya IT Lead **rumah sakit**; lead vendor tidak menambah kursi CAB, sehingga
  jumlah akun vendor tidak mengubah alur approval tenant.
- Delegasi tidak otomatis dari kalender cuti dan belum dapat dicabut sebelum
  tahap diputuskan; penerima delegasi tetap punya akses baca tiket.
- SLA approval per tahap memakai `sla_snapshot` tiket, bukan policy terbaru.
- Eskalasi Level 3 terlihat in-app (badge + timeline + notifikasi) dan dikirim
  lewat email bila penerima mengaktifkan preferensi; WhatsApp belum ada.
- Dashboard belum punya tren historis atau ekspor; agregatnya dihitung di
  client dari tiket aktif per tenant (bukan seluruh riwayat). Gunakan halaman
  Laporan untuk tren dan ekspor.
- Laporan menghitung ulang dari field tiket saat ini (tidak ada snapshot
  laporan), belum bisa difilter per unit dari UI, dan belum dikirim otomatis
  lewat email/PDF. Rentang dibatasi 366 hari dan agregasi berjalan di server
  (JS) atas tiket pada rentang tersebut.
- Profil belum punya 2FA/OTP dan avatar tidak dimoderasi; kebijakan password
  hanya panjang minimal 8 karakter. File avatar disajikan tanpa token (nama file
  acak), jadi jangan dipakai untuk data sensitif.
- Provisioning akun: IT Lead rumah sakit mengelola timnya lewat tab **Tim** di
  `/admin`; undangan berisi password sementara dikirim lewat SMTP bila aktif,
  atau diserahkan manual bila SMTP mati. Akun platform tetap hanya bisa dibuat
  superuser. Belum ada verifikasi email saat pemilik akun ingin mengganti
  alamat email.
- Lupa password: tautan memakai token bertanda tangan dengan masa berlaku dari
  setelan collection `users`; pembatasan satu permintaan per menit per pengguna.
  Bila SMTP belum aktif, pengguna tidak menerima tautan dan harus meminta IT
  Lead mereset dari tab Tim.
- Email: password sementara dikirim sebagai teks biasa di isi email, jadi SMTP
  wajib memakai TLS di produksi. Email notifikasi bisa dimatikan per pengguna;
  undangan dan reset password tetap dikirim. `MAIL_TRANSPORT=capture` menyimpan
  salinan email (termasuk password) hanya untuk test/development.
- Logo: route `/api/itsm/branding/logo` bersifat publik pada mode standalone
  (hanya mengembalikan logo rumah sakit aktif), jadi jangan unggah gambar yang
  memuat data sensitif. Pada mode vendor route ini 404.
- Konsol Vendor: akun vendor sudah bisa menjadi assignee, approver, dan penerima
  notifikasi tiket lintas tenant (Fase 2), serta mengelola data master rumah
  sakit dari konsol. Yang belum: membuat tiket (akun platform tidak punya
  tenant/unit) dan mengubah data master dari UI tiket (hanya lewat konsol).
- Gate CAB hanya menghitung IT Lead rumah sakit. Rumah sakit yang sepenuhnya
  dioperasikan vendor (tanpa lead sendiri) tidak akan pernah membentuk tahap
  CAB, meski vendor punya beberapa lead. Vendor tetap bisa menyetujui tahap
  IT Lead dan bisa didelegasikan.
- Pemilih tenant menyaring daftar tiket/notifikasi di UI, bukan batas keamanan:
  akun vendor memang boleh membaca semua tenant. Dashboard gabungan semua RS
  belum ada; laporan dan audit lintas RS sudah tersedia.
- Reset password oleh vendor tidak mencabut token akses yang masih berlaku;
  pengguna lama tetap aktif sampai token kedaluwarsa.
- Mode tenancy hanya bisa diubah lewat environment; tidak ada tombol ubah mode
  di aplikasi (disengaja agar mode tidak bisa dinaikkan dari dalam).
- Belum ada SSO.
- `tenants.timezone` belum dipakai untuk perhitungan SLA; jam kerja masih
  mengikuti policy atau default `Asia/Jakarta`.
- Deteksi data pasien bersifat kebijakan + attestation, bukan DLP.
- PocketBase berjalan sebagai satu instance; jangan scale horizontal dengan
  SQLite yang sama.
