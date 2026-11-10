# Healthcare ITSM — Data model

PocketBase v0.40.5. Source of truth: `backend/pb_migrations/`.

Dokumen ini memuat koleksi, state machine, prioritas/SLA, dan aturan aksesnya.
Perilaku per modul ada di [`FEATURES/`](FEATURES/), daftar route di
[`API.md`](API.md), batasan yang diketahui di
[`KNOWN-LIMITATIONS.md`](KNOWN-LIMITATIONS.md), dan penegakan tenancy di
[`FEATURES/PLATFORM.md`](FEATURES/PLATFORM.md).

- [Aturan akses](#aturan-akses)
- [Setup awal](#setup-awal-first-run)
- [Koleksi](#koleksi)
- [State machine](#state-machine)
- [Prioritas dan SLA](#prioritas-dan-sla)
- [Custom routes](#custom-routes)

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

## Setup awal (first-run)

Instalasi baru — belum ada satu pun record `users` — membuka halaman `/setup`.
Status dan pembuatan akun pertama dilayani `pb_hooks/setup.pb.js` dengan helper
di `lib/setup.js`.

Route, bentuk body, dan response-nya ada di
[`API.md`](API.md#setup-awal-dan-metadata).

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

`name`, `code`, `timezone`, `is_active`, `logo`, `report_frequency`,
`report_next_at`, `report_last_sent_at`, `created`, `updated`.

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

`timezone` adalah zona IANA rumah sakit (mis. `Asia/Jakarta`, `Asia/Makassar`,
`America/New_York`). Nilainya dipakai saat membuat kebijakan SLA default tenant
baru dan menjadi fallback perhitungan SLA bila policy tidak punya zona. Nama zona
divalidasi terhadap basis data IANA (`backend/zoneinfo.zip` lewat `ZONEINFO`),
bukan hanya pola teks.

Yang boleh mengubah: wizard setup (instalasi baru), `PATCH /api/itsm/tenant`
(Kepala IT, hanya mode standalone), dan Konsol Vendor (mode vendor). Kedua jalur
terakhir menyelaraskan `sla_policies.timezone` dan menghitung ulang
`report_next_at` agar laporan tetap 07.00 waktu lokal; perubahan lewat route
dicatat di `audit_logs`.

`report_frequency` (`off/weekly/monthly`) mengatur laporan SLA terjadwal:
`weekly` setiap Senin 07.00 **waktu lokal tenant**, `monthly` setiap tanggal 1
07.00 waktu lokal tenant.
`report_next_at` adalah jadwal berikutnya dan `report_last_sent_at` waktu kirim
terakhir. Cron `report_schedule_scan` mengirim ringkasan email ke seluruh
Kepala IT aktif lalu menghitung ulang `report_next_at`. Hanya route
`/api/itsm/reports/schedule` yang menulis field ini (Kepala IT).

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && (PLATFORM \|\| id = @request.auth.tenant)` |
| Create/Update/Delete | `null` (superuser lewat Admin UI, atau route Konsol Vendor) |

### `users` (auth)

Field sistem + `tenant`, `unit`, `name`, `role`, `job_title`, `team`, `phone`,
`employee_no`, `avatar`, `is_active`, `is_platform_staff`,
`must_change_password`, `email_opt_out`, `external_id`, `external_issuer`,
`external_groups`, `totp_enabled`, `created`, `updated`.

Field keamanan tambahan (disembunyikan dari serialisasi record `users`):
`totp_secret`, `totp_confirmed_at`, `totp_last_step`, `totp_recovery_hashes`,
`login_failed_count`, `login_locked_until`. `totp_enabled` tetap terlihat agar
halaman Profil dan tab Tim dapat menampilkan status 2FA; route tim dapat
membaca field keamanan lain langsung dari server untuk modal Keamanan.

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

#### Autentikasi dua faktor (TOTP) dan pembatasan login

- `totp_secret` menyimpan secret Base32 (160 bit) milik pengguna. Field ini,
  `totp_recovery_hashes`, `totp_last_step`, dan `totp_confirmed_at` tidak pernah
  diserialisasi; hanya route 2FA yang membaca/menulisnya di server.
- Saat `totp_enabled = true`, `POST /api/collections/users/auth-with-password`
  menolak login dengan password saja (403). Klien mengirim ulang password +
  `totp` (kode 6 digit **atau** kode pemulihan) dalam satu request. Hook
  `onRecordAuthWithPasswordRequest` memvalidasi password, kode, dan replay
  sebelum PocketBase membuat token.
- Kode TOTP: SHA-1, 6 digit, periode 30 detik, toleransi ±1 langkah. Langkah
  terakhir yang diterima disimpan agar kode tidak dapat dipakai dua kali.
- 10 kode pemulihan dibuat saat aktivasi dan hanya ditampilkan sekali; yang
  disimpan adalah hash SHA-256. Setiap kode sekali pakai.
- Percobaan password/kode yang salah dihitung per akun. Setelah
  `LOGIN_MAX_ATTEMPTS` (default 5) akun dikunci selama `LOGIN_LOCK_MINUTES`
  (default 15 menit) dan login berikutnya ditolak 429. Kunci kedaluwarsa
  dibersihkan otomatis; IT Lead dapat membukanya lewat route tim.
- Setiap kegagalan menulis `audit_logs` `action=login_failed` dengan
  `changes.reason` (`password`/`totp`/`locked`), jumlah percobaan, dan waktu
  kunci. Password/kode yang dicoba tidak pernah disimpan. Login berhasil tetap
  menulis `action=login` lewat hook yang sudah ada.
- Aktivasi/menonaktifkan 2FA menulis `mfa_enroll`/`mfa_disable`. Reset oleh IT
  Lead menulis `mfa_reset`, menghapus secret + kode pemulihan, dan
  `refreshTokenKey()` sehingga semua sesi pengguna berakhir.
- Pengguna tidak dapat mereset 2FA akunnya sendiri lewat konsol tim; gunakan
  panel Keamanan di Profil. IT Lead juga tidak dapat mereset 2FA akun sendiri
  lewat route tim.

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
`intake_channel`, `intake_ref`, `public_token`, `merged_into`, `merged_at`,
`merged_by`, `merge_reason`, `approval_mode`, `problem`, `kb_article`,
`major_incident`.

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
- `merged_into` menandai tiket sumber yang sudah digabung ke tiket tujuan.
  Tiket seperti ini ditutup dengan `resolution_code=duplicate`, dan
  `merged_at`/`merged_by`/`merge_reason` menyimpan jejak merge. `merged_into`
  tidak boleh berantai: tiket tujuan harus masih aktif dan belum menjadi sumber
  merge lain.
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
`resolution_due_at`, `response_warned_at`, `approval_warned_at`,
`resolution_warned_at`, `response_breach_at`, `approval_breach_at`,
`resolution_breach_at`, `escalation_level`, `escalated_at`, `next_due_at`,
`sla_paused_at`, `sla_paused_minutes`.

`*_warned_at` diisi cron `sla_breach_scan` saat tenggat tinggal ≤ 30 menit,
sekali per fase. Penanda direset ketika tenggat berubah (triage, reopen, tahap
approval berikutnya, atau lanjut dari `waiting`) agar siklus baru bisa
diperingatkan lagi.

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

Merge duplikat lewat `POST /api/itsm/tickets/{id}/merge`: tiket sumber harus
sejenis, masih aktif, dan belum pernah digabung; tiket tujuan harus aktif dan
belum menjadi sumber merge. Komentar, lampiran, tautan aset/problem/insiden,
serta metadata yang kosong di tujuan dipindahkan. Approval pending di sumber
ditolak dengan alasan merge. Kedua tiket mendapat audit `merge`.

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
`subject`, `html`, `text`, `template`
(`invitation/password_reset/notification/guest_receipt/report`),
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

Autentikasi menulis `action=login` saat berhasil, `login_failed` saat password
atau kode 2FA salah / akun terkunci, `mfa_enroll` + `mfa_disable` saat pengguna
mengubah 2FA, dan `mfa_reset` saat IT Lead mereset 2FA anggota. Semua baris
memakai `collection_name=users`; `changes` tidak pernah memuat password, secret
TOTP, atau kode pemulihan.

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

Daftar route lengkap (method, path, hak akses, dan keterangan) ada di
[`API.md`](API.md). Aturan yang berlaku untuk semua route:

Semua route memakai `$apis.requireAuth()` dan pengecekan server-side, kecuali
route publik `/api/itsm/public/intake/*` yang memvalidasi token titik, tenant
aktif, rate limit, honeypot, dan attestation data pasien, route
`/api/itsm/public/tickets/*` yang hanya membuka satu tiket berdasarkan
`public_token` dan tidak pernah mengirim komentar internal atau data pengguna,
route `/api/itsm/setup/*` yang hanya hidup selama instalasi belum punya akun dan
mewajibkan kode setup, serta route `/api/itsm/dev/*` yang memakai
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
