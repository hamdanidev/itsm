# Healthcare ITSM — Schema

PocketBase v0.40.5. Source of truth: `backend/pb_migrations/`.

## Aturan akses

- `null` = hanya superuser.
- `""` = publik.
- Filter non-empty = hanya request yang memenuhi filter.

Alias:

```text
AUTH     = @request.auth.id != "" && @request.auth.is_active = true
TENANT   = tenant = @request.auth.tenant
STAFF    = (@request.auth.role = "it_support" || @request.auth.role = "it_lead")
LEAD     = @request.auth.role = "it_lead"
TICKET_R = (requester = @request.auth.id || assignee = @request.auth.id || unit.manager = @request.auth.id || delegates.id ?= @request.auth.id || STAFF)
```

Semua koleksi bisnis memiliki `tenant`. Server mengambil tenant dari `e.auth`,
bukan dari body request. Frontend guard bukan otorisasi.

## Koleksi

### `tenants`

`name`, `code`, `timezone`, `is_active`, `created`, `updated`.

Satu baris = satu organisasi/rumah sakit; menjadi batas isolasi seluruh data
bisnis. Setiap user memiliki tepat satu `tenant`, dan backend mengambil tenant
dari `e.auth` (bukan body request). `is_active = false` membuat semua user
tenant tersebut tidak bisa login (rule auth user memakai `tenant.is_active`).
Sidebar menampilkan `name` dan `code` dari record ini.

`timezone` saat ini hanya disimpan; perhitungan SLA memakai `sla_policies.timezone`
atau default `Asia/Jakarta` dan cron di-hardcode ke `Asia/Jakarta`.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && id = @request.auth.tenant` |
| Create/Update/Delete | `null` (superuser lewat Admin UI) |

### `users` (auth)

Field sistem + `tenant`, `unit`, `name`, `role`, `phone`, `employee_no`,
`is_active`, `external_id`, `external_issuer`, `external_groups`, `created`,
`updated`.

`role`: `requester | it_support | it_lead`.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && TENANT` |
| Create/Update/Delete | `null` |
| Manage | `null` |
| Auth | `is_active = true && tenant.is_active = true` |

Provisioning akun hanya superuser. `onRecordEnrich` menyembunyikan `phone`,
`employee_no`, dan field SSO dari user selain diri sendiri/IT Lead.

### `units`

`tenant`, `name`, `code`, `kind` (`clinical/support/management`), `manager`
(relasi user, opsional), `is_active`.

`manager` adalah approver tahap pertama untuk tiket unit tersebut. Boleh user
ber-role apa pun (manajer unit tidak harus staf IT); rule baca tiket, komentar,
dan lampiran diperluas ke `unit.manager`.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && TENANT` |
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
| List/View | `AUTH && TENANT && TICKET_R` |
| Create/Update/Delete | `null` |

Semua penulisan lewat custom route `/api/itsm/*`. Route memeriksa role, tenant,
akses record, field yang diizinkan, transisi status, dan menulis audit.

### `ticket_comments`

`ticket`, `author`, `body`, `visibility` (`public/internal`).

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && ticket.tenant = @request.auth.tenant && TICKET_R && (visibility = "public" || STAFF)` |
| Create/Update/Delete | `null` |

Append-only. Komentar internal tidak terlihat requester. First response diisi
saat staff memberi komentar publik pertama.

### `ticket_attachments`

`ticket`, `comment`, `uploader`, `file` (protected, max 10 MB), `original_name`,
`mime`, `size`, `visibility`.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && ticket.tenant = @request.auth.tenant && TICKET_R && (visibility = "public" || STAFF)` |
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
| List/View | `AUTH && TENANT && TICKET_R` |
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
| List/View | `AUTH && user = @request.auth.id && tenant = @request.auth.tenant` |
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

Semua route memakai `$apis.requireAuth()` dan pengecekan server-side.
Service/Change Request harus berstatus approval `approved` sebelum pekerjaan bisa
dimulai, dijeda, atau diselesaikan. Setiap aksi menulis audit log.

Route approval menerima `decision` `approved` / `rejected` / `delegated`. Untuk
delegasi, sertakan `delegate` (id user) dan `note` sebagai alasan (wajib ≥ 5
karakter).

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

- CAB memakai IT Lead kedua (belum ada peran/komite CAB terpisah). Bila tenant
  hanya punya satu IT Lead aktif, tahap CAB dilewati saat tiket dibuat.
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
- Pengaturan tidak mengelola user; provisioning akun tetap lewat Admin UI
  PocketBase.
- Belum ada SSO.
- `tenants.timezone` belum dipakai untuk perhitungan SLA; jam kerja masih
  mengikuti policy atau default `Asia/Jakarta`.
- Deteksi data pasien bersifat kebijakan + attestation, bukan DLP.
- PocketBase berjalan sebagai satu instance; jangan scale horizontal dengan
  SQLite yang sama.
