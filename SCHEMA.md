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
`avatar`, `is_active`, `is_platform_staff`, `must_change_password`,
`email_opt_out`, `external_id`, `external_issuer`, `external_groups`, `created`,
`updated`.

`role`: `requester | it_support | it_lead`.

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
| GET | `/api/itsm/team` | Daftar anggota tim rumah sakit; hanya IT Lead |
| POST | `/api/itsm/team` | Tambah anggota (password awal dibuat sistem); hanya IT Lead |
| PATCH | `/api/itsm/team/{userId}` | Ubah nama/role/unit/status anggota; hanya IT Lead |
| POST | `/api/itsm/team/{userId}/password` | Reset password anggota; hanya IT Lead |
| GET | `/api/itsm/mail/status` | Status SMTP + hitungan antrean tenant; hanya IT Lead |
| POST | `/api/itsm/mail/dispatch` | Kirim antrean email sekarang; hanya superuser |
| GET | `/api/itsm/app-meta` | Mode tenancy aktif (publik, tanpa auth) |
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
| GET | `/api/itsm/platform/audit` | Audit lintas tenant (filter RS, aktor, aksi, cakupan, tanggal, nomor tiket) |

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
- `units`, `priorities`, `types` — `{ name, summary }` dengan bentuk summary yang
  sama.
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

## Tim rumah sakit

IT Lead mengelola staf di tenant-nya sendiri lewat `/api/itsm/team`. Penulisan
memakai `$app.save`, sehingga `users.createRule` tetap `null` (superuser saja).

- Cakupan: `tenant = e.auth.tenant`; akun platform dan pengguna tenant lain
  selalu menghasilkan 404.
- Role yang boleh dibuat: `requester`, `it_support`, `it_lead`.
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
  superuser. Belum ada lupa password mandiri dan verifikasi perubahan email.
- Email: password sementara dikirim sebagai teks biasa di isi email, jadi SMTP
  wajib memakai TLS di produksi. Email notifikasi bisa dimatikan per pengguna;
  undangan dan reset password tetap dikirim. `MAIL_TRANSPORT=capture` menyimpan
  salinan email (termasuk password) hanya untuk test/development.
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
