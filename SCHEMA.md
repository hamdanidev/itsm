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
TICKET_R = (requester = @request.auth.id || assignee = @request.auth.id || STAFF)
```

Semua koleksi bisnis memiliki `tenant`. Server mengambil tenant dari `e.auth`,
bukan dari body request. Frontend guard bukan otorisasi.

## Koleksi

### `tenants`

`name`, `code`, `timezone`, `is_active`, `created`, `updated`.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && id = @request.auth.tenant` |
| Create/Update/Delete | `null` |

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

`tenant`, `name`, `code`, `kind` (`clinical/support/management`), `is_active`.

Rules:

| Aksi | Rule |
|---|---|
| List/View | `AUTH && TENANT` |
| Create | `LEAD && @request.body.tenant = @request.auth.tenant` |
| Update | `LEAD && TENANT` |
| Delete | `null` (nonaktifkan dengan `is_active=false`) |

### `ticket_categories`

`tenant`, `name`, `code`, `kind` (`all/incident/service_request/change_request`),
`is_active`.

Rules sama dengan `units`.

### `sla_policies`

`tenant`, `name`, `ticket_type`, `priority`, `response_minutes`,
`approval_minutes`, `resolution_minutes`, `calendar_mode` (`24x7/business_hours`),
`business_days` JSON, `business_start`, `business_end`, `timezone`, `version`,
`is_active`.

Unique `(tenant, ticket_type, priority)`.

Rules sama dengan `units`.

### `holidays`

`tenant`, `date`, `name`, `is_active`. Unique `(tenant, date)`.

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
`resolution_breach_at`, `escalation_level`, `escalated_at`, `next_due_at`.

`next_due_at` adalah satu-satunya tenggat SLA yang masih menjadi gerbang
pekerjaan: `approval_due_at` selama SR/CR belum diputuskan, lalu
`resolution_due_at` (incident/SR) atau `planned_end` (CR) setelah disetujui.
Field ini diisi hook saat create/approval dan dipakai untuk `sort=due`.

Approval: `approval_status`, `approved_by`, `approved_at`, `approval_note`.

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

## State machine

```text
open -> assigned -> in_progress -> resolved -> closed
                                      |
                                      +-> reopened
```

Gate utama:

- `assigned`: assignee wajib; SR/CR harus approved.
- `in_progress`: assignee wajib.
- `resolved`: resolution summary + code; CR butuh outcome dan actual_end.
- `closed`: hanya dari resolved.
- `reopened`: requester dalam 7 hari atau lead.
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
Kritis memakai 24/7. Tidak ada pause/waiting state di MVP.

## Custom routes

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/itsm/tickets` | Buat tiket |
| POST | `/api/itsm/tickets/{id}/assign` | Assign / lepas assignee |
| POST | `/api/itsm/tickets/{id}/transition` | Mulai, selesaikan, tutup, buka kembali |
| POST | `/api/itsm/tickets/{id}/approval` | Setujui / tolak (IT Lead) |
| POST | `/api/itsm/tickets/{id}/comments` | Komentar publik/internal |
| POST | `/api/itsm/tickets/{id}/attachments` | Upload lampiran |

Semua route memakai `$apis.requireAuth()` dan pengecekan server-side.
Service/Change Request harus berstatus approval `approved` sebelum pekerjaan bisa
dimulai atau diselesaikan. Setiap aksi menulis audit log.

## SLA breach scan

`backend/pb_hooks/sla_job.pb.js` berjalan setiap 5 menit, menandai
`response_breach_at`, `approval_breach_at`, dan `resolution_breach_at`, lalu
menaikkan `escalation_level` dan menulis audit `sla_breach`. Job idempoten dan
memproses batch berulang sampai tidak ada tiket overdue.

## Known limitations

- SLA resolution belum dihitung ulang saat tiket dibuka kembali.
- Approval masih satu level (IT Lead), belum berjenjang.
- Dashboard belum punya tren historis atau ekspor; agregatnya dihitung di
  client dari tiket aktif per tenant (bukan seluruh riwayat).
- Belum ada notifikasi email/WhatsApp.
- Belum ada SSO.
- Deteksi data pasien bersifat kebijakan + attestation, bukan DLP.
- PocketBase berjalan sebagai satu instance; jangan scale horizontal dengan
  SQLite yang sama.
