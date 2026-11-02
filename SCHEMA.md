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
TICKET_R = (requester = @request.auth.id || assignee = @request.auth.id || unit.manager = @request.auth.id || delegates.id ?= @request.auth.id || STAFF)
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
`notifications`, `users`, `units`, `ticket_categories`, `sla_policies`,
`holidays`, `tenants`. Cabang tenant lama tidak diubah, sehingga akun rumah
sakit tetap terisolasi.

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

Di UI, vendor memilih satu rumah sakit aktif lewat pemilih tenant di top bar.
Pilihan disimpan di `localStorage` dan menjadi filter daftar tiket; ia **bukan**
batas keamanan (vendor memang boleh melihat semua), melainkan konteks kerja.

Halaman detail tiket menyelaraskan pemilih ke tenant tiket saat dibuka (sekali
per tiket), sehingga membuka tautan/notifikasi tiket RS lain tidak
meninggalkan pemilih di RS yang salah. Mengganti rumah sakit dari halaman
detail mengalihkan ke daftar tiket rumah sakit yang baru, bukan menampilkan
tiket RS lain di bawah pemilih tersebut.

## Koleksi

### `tenants`

`name`, `code`, `timezone`, `is_active`, `created`, `updated`.

Satu baris = satu organisasi/rumah sakit; menjadi batas isolasi seluruh data
bisnis. Setiap akun rumah sakit memiliki tepat satu `tenant`, akun platform tidak
punya tenant, dan backend mengambil tenant dari `e.auth` (bukan body request).
`is_active = false` membuat pengguna tenant tersebut tidak bisa login baru (rule
auth user memakai `tenant.is_active`); sesi berjalan tetap hidup sampai token
akses kedaluwarsa. Sidebar menampilkan `name` dan `code` dari record ini.

`timezone` dipakai saat membuat kebijakan SLA default tenant baru, tetapi
perhitungan SLA tetap memakai `sla_policies.timezone` atau default `Asia/Jakarta`
dan cron di-hardcode ke `Asia/Jakarta`.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && (PLATFORM \|\| id = @request.auth.tenant)` |
| Create/Update/Delete | `null` (superuser lewat Admin UI, atau route Konsol Vendor) |

### `users` (auth)

Field sistem + `tenant`, `unit`, `name`, `role`, `phone`, `employee_no`,
`avatar`, `is_active`, `is_platform_staff`, `external_id`, `external_issuer`,
`external_groups`, `created`, `updated`.

`role`: `requester | it_support | it_lead`.

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
dapat mengubah `name`, `phone`, `employee_no`, `avatar`, dan password miliknya
lewat route profil; field lain tetap superuser.

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

### `tickets`

Identitas: `ticket_no`, `tenant`, `type`, `title`, `description`, `status`,
`source`, `impact`, `priority`, `priority_reason`, `requester`, `created_by`,
`unit`, `category`, `reporter_name`, `reporter_contact`,
`patient_data_confirmed`.

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
saat staff memberi komentar publik pertama.

### `ticket_attachments`

`ticket`, `comment`, `uploader`, `file` (protected, max 10 MB), `original_name`,
`mime`, `size`, `visibility`.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && (PLATFORM \|\| (ticket.tenant = @request.auth.tenant && TICKET_R && (visibility = "public" \|\| STAFF)))` |
| Create/Update/Delete | `null` |

Maksimal 3 lampiran per tiket. File diakses dengan file token.

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
scan. Notifikasi untuk diri sendiri tidak dibuat. Komentar/lampiran internal
hanya dikirim ke assignee, tidak pernah ke requester. `ticket` boleh kosong
untuk notifikasi non-tiket, tetapi saat ini semua notifikasi terkait tiket.
Realtime subscribe memakai list rule yang sama sehingga user hanya menerima
event miliknya.

### `audit_logs`

`tenant`, `ticket`, `actor`, `actor_role`, `action`, `collection_name`,
`record_id`, `changes`, `ip`, `user_agent`, `created`.

`tenant` **tidak wajib** hanya untuk baris milik akun platform. Baris seperti
itu tidak terlihat tenant mana pun karena rule baca mewajibkan
`tenant = @request.auth.tenant` (hanya superuser yang bisa membacanya). Aksi
akun platform memakai `actor_role` berawalan `platform_` (mis.
`platform_it_lead`) agar asal kewenangan jelas.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `LEAD && TENANT` |
| Create/Update/Delete | `null` |

Request hooks juga menolak create/update/delete audit dari API. Hanya
`txApp.save` internal yang menulis. `changes` tidak memuat deskripsi, body
komentar, isi lampiran, atau data pasien.

Perubahan data master dari `/admin` (units, ticket_categories, sla_policies,
holidays) dicatat lewat `pb_hooks/admin_audit.pb.js` dengan `action` `create`
atau `update`, `collection_name`/`record_id` record yang diubah, dan `changes`
berupa diff field (`{from, to}`). Baris ini tidak punya `ticket` karena bukan
aktivitas tiket.

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
| POST | `/api/itsm/tickets/{id}/approval` | Setujui/tolak/delegasikan tahap approval aktif |
| POST | `/api/itsm/tickets/{id}/comments` | Komentar publik/internal |
| POST | `/api/itsm/tickets/{id}/attachments` | Upload lampiran |
| GET | `/api/itsm/tickets/{id}/timeline` | Riwayat aktivitas tiket (proyeksi audit) |
| GET | `/api/itsm/reports/sla` | Laporan SLA (JSON), hanya IT Lead |
| GET | `/api/itsm/reports/sla.csv` | Ekspor CSV per tiket, hanya IT Lead |
| GET/PATCH | `/api/itsm/profile` | Baca/ubah profil sendiri (nama, telepon, nomor pegawai) |
| POST/DELETE | `/api/itsm/profile/avatar` | Unggah/hapus avatar |
| POST | `/api/itsm/profile/password` | Ganti password dengan verifikasi password lama |
| GET | `/api/itsm/app-meta` | Mode tenancy aktif (publik, tanpa auth) |
| GET | `/api/itsm/platform/tenants` | Daftar tenant + hitungan; akun platform |
| POST | `/api/itsm/platform/tenants` | Buat tenant + seed + akun IT pertama; platform admin |
| GET | `/api/itsm/platform/tenants/{id}` | Detail tenant, hitungan, pengguna, unit |
| PATCH | `/api/itsm/platform/tenants/{id}` | Ubah nama/kode/zona waktu/status; platform admin |
| POST | `/api/itsm/platform/tenants/{id}/seed` | Lengkapi data master default (idempoten) |
| POST | `/api/itsm/platform/tenants/{id}/users` | Tambah pengguna tenant; platform admin |
| PATCH | `/api/itsm/platform/tenants/{id}/users/{userId}` | Ubah status/role/unit/password |

Semua route memakai `$apis.requireAuth()` dan pengecekan server-side.
Service/Change Request harus berstatus approval `approved` sebelum pekerjaan bisa
dimulai, dijeda, atau diselesaikan. Setiap aksi menulis audit log.

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

Parameter: `from`, `to`, `bucket` (`month` default, `week` memakai ISO week).

Respons:

- `range` — `from`, `to`, `days`, `bucket`.
- `summary` — `total`, `resolved`, `breached`, `compliance` (persen),
  `median_response_minutes`, `median_resolution_minutes`, `reopens`.
- `trend` — per bucket: `created`, `resolved`, `breached`, `compliance`.
- `units`, `priorities`, `types` — `{ name, summary }` dengan bentuk summary yang
  sama.
- `breaches` — maksimal 20 tiket breach terbaru (nomor, unit, prioritas, status,
  waktu breach, level eskalasi).

`breached` dihitung dari field `response_breach_at`, `approval_breach_at`, atau
`resolution_breach_at`. Median respons memakai `first_response_at − created`;
median resolusi memakai `resolved_at − created` untuk tiket yang sudah selesai.
Semua durasi memakai menit kalender.

`GET /api/itsm/reports/sla.csv` memakai filter yang sama dan mengirim satu baris
per tiket (UTF-8 + BOM, pemisah koma) untuk diolah di Excel.

## Profil pengguna

Route profil hanya menyentuh record `e.auth`; tidak ada parameter id, sehingga
pengguna tidak bisa mengubah profil orang lain.

- `GET /api/itsm/profile` — data sendiri + `unit_name`/`tenant_name`.
- `PATCH /api/itsm/profile` — `name` (2–120 karakter), `phone` (angka dan
  `+ - ( )`), `employee_no` (huruf/angka/titik/garis miring/strip). Field
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

- CAB memakai IT Lead kedua (belum ada peran/komite CAB terpisah). Yang dihitung
  hanya IT Lead **rumah sakit**; lead vendor tidak menambah kursi CAB, sehingga
  jumlah akun vendor tidak mengubah alur approval tenant.
- Delegasi tidak otomatis dari kalender cuti dan belum dapat dicabut sebelum
  tahap diputuskan; penerima delegasi tetap punya akses baca tiket.
- SLA approval per tahap memakai `sla_snapshot` tiket, bukan policy terbaru.
- Eskalasi Level 3 terlihat in-app (badge + timeline + notifikasi); belum ada
  email/WhatsApp.
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
- Pengaturan tidak mengelola user tenant. Provisioning akun rumah sakit lewat
  Admin UI (superuser) atau Konsol Vendor; akun platform sendiri tetap hanya
  bisa dibuat superuser.
- Konsol Vendor: akun vendor sudah bisa menjadi assignee, approver, dan penerima
  notifikasi tiket lintas tenant (Fase 2), tetapi **belum** bisa membuat tiket
  atau mengubah data master rumah sakit lewat UI tiket — keduanya lewat Konsol
  Vendor/tenant sendiri.
- Gate CAB hanya menghitung IT Lead rumah sakit. Rumah sakit yang sepenuhnya
  dioperasikan vendor (tanpa lead sendiri) tidak akan pernah membentuk tahap
  CAB, meski vendor punya beberapa lead. Vendor tetap bisa menyetujui tahap
  IT Lead dan bisa didelegasikan.
- Pemilih tenant menyaring daftar tiket/notifikasi di UI, bukan batas keamanan:
  akun vendor memang boleh membaca semua tenant. Belum ada tampilan gabungan
  semua RS (dashboard/laporan lintas tenant).
- Laporan SLA (`/reports`) belum bisa dipakai akun vendor; agregasi masih per
  tenant dan route-nya memakai `auth.tenant`.
- Audit aksi akun platform dicatat dengan `tenant` tiket yang bersangkutan,
  sehingga terlihat oleh IT Lead rumah sakit itu, tetapi belum ada layar audit
  khusus platform untuk vendor.
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
