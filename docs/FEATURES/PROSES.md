# Approval berjenjang, SLA, dan eskalasi

Rantai persetujuan per tahap, tenggat SLA per fase, jeda, dan eskalasi.

Bagian ini dipindahkan dari README (perapian dokumen 2026-11-10). Daftar route ada di [API.md](../API.md); data model di [DATA-MODEL.md](../DATA-MODEL.md).

## Approval berjenjang

Secara default, Service Request dan Change Request memakai **dua sampai tiga
tahap berurutan**. Bila tiket memakai item katalog, `approval_mode` item
menggantikan alur default (termasuk `none` untuk permintaan rutin):

1. **Manajer unit pemohon** — hanya jika unit tersebut punya `manager` aktif.
   Bila belum ditunjuk, tahap ini dilewati dan alur langsung ke IT Lead.
2. **IT Lead** — siapa pun yang ber-role `it_lead` boleh memutuskan.
3. **CAB** — hanya untuk Change Request dengan `change_risk=high` **dan** tenant
   punya minimal dua IT Lead aktif. Tahap ini harus diputuskan IT Lead yang
   berbeda dari tahap 2 (empat mata). Bila hanya ada satu lead, tahap ini
   dilewati saat pembuatan agar perubahan tidak macet.

- Pekerjaan (`in_progress`) baru bisa dimulai setelah **semua** tahap approved.
- Setiap tahap disimpan di `ticket_approvals` (approver, status, catatan,
  `due_at`, `acted_by`, `acted_at`), sehingga riwayatnya jelas di stepper detail
  tiket dan audit log.
- Penolakan menghentikan alur (`approval_status=rejected`). IT Lead dapat
  menyetujui ulang sebagai override; semua tahap yang tersisa ikut ditandai
  approved dengan catatan yang sama.
- Notifikasi "menunggu persetujuan" dikirim ke approver tahap aktif; keputusan
  akhir/penolakan diberitahukan ke requester.
- Manajer unit tidak harus ber-role staf IT; rule baca tiket/komentar/lampiran
  diperluas ke `unit.manager`, jadi ia bisa membuka tiket unitnya.
- Manajer unit ditunjuk lewat **Pengaturan > Unit > Manajer unit**.

### Delegasi approver

Approver yang sedang cuti tidak perlu memblokir alur:

- Approver tahap aktif **atau IT Lead mana pun** dapat menekan **Delegasikan**
  di detail tiket, memilih pengganti, dan menulis alasan (wajib ≥ 5 karakter).
- Pengganti harus aktif di tenant yang sama. Tahap IT Lead dan CAB hanya boleh
  didelegasikan ke IT Lead; tahap manajer unit boleh ke pengguna aktif mana pun.
- CAB tidak boleh didelegasikan ke lead yang baru saja menyetujui tahap 2.
- Approver asli tetap tercatat (`delegated_from`, `delegated_by`,
  `delegated_at`, `delegation_note`) dan tampil di stepper serta timeline.
  Audit menulis aksi `delegate`.
- Penerima delegasi otomatis masuk `tickets.delegates` sehingga bisa membuka
  tiket (termasuk komentar/lampiran publik) meski bukan staf atau manajer unit.
- Delegasi hanya berlaku untuk tahap yang sedang menunggu; tidak ada delegasi
  otomatis dari kalender cuti dan belum ada pencabutan delegasi.

### SLA per tahap approval

- Setiap tahap punya `due_at` sendiri, dihitung dari kebijakan saat tahap itu
  **aktif** (bukan saat tiket dibuat). Tahap berikutnya mendapat tenggat baru.
- `tickets.approval_due_at` selalu mencerminkan tahap aktif dan dipakai scan
  breach serta `sort=due`; riwayat tenggat tiap tahap tersimpan di
  `ticket_approvals.due_at`.
- Setelah approval final, gate SLA pindah ke `resolution_due_at` (SR) atau
  `planned_end` (CR).

Belum termasuk: tahap CAB dengan peran/komite terpisah, delegasi otomatis
berdasarkan kalender cuti, dan pencabutan delegasi sebelum tahap diputuskan.

## SLA, jeda, dan eskalasi

- Jam penyelesaian memakai kalender bisnis dari `sla_snapshot`/policy aktif
  (Senin–Jumat 08:00–17:00 **waktu lokal rumah sakit**, kritis 24/7, sadar hari
  libur).
- Saat tiket masuk `waiting`, `sla_paused_at` diisi dan scan breach melewati
  tiket tersebut. Saat dilanjutkan, `resolution_due_at` dan `next_due_at`
  digeser persis selama jeda, dan totalnya dicatat di `sla_paused_minutes`.
- Reopen memulai siklus SLA penyelesaian baru dari waktu reopen memakai policy
  aktif. Breach dan level eskalasi lama dibersihkan, tetapi riwayat breach tetap
  ada di audit log dan timeline.
- **Pengingat pra-SLA**: scan 5 menit memeriksa tenggat respons, approval, dan
  penyelesaian yang tinggal ≤ 30 menit. Satu peringatan per fase dikirim ke
  assignee (atau Kepala IT bila belum ada assignee; approver aktif untuk fase
  approval), tercatat sebagai audit `sla_warn`, dan tidak berulang karena
  `*_warned_at`. Penanda direset saat triage, reopen, tahap approval berikutnya,
  atau saat pekerjaan dilanjutkan dari `waiting`.
- Eskalasi berjenjang oleh scan 5 menit:
  `1` = breach respons/approval, `2` = breach penyelesaian, `3` = breach
  penyelesaian yang belum ditangani 4 jam. Level 2+ tampil sebagai badge
  "Eskalasi Lx" di detail dan antrean dashboard, dan setiap kenaikan level
  menulis event `escalate` ke timeline. Notifikasi memakai in-app + email;
  WhatsApp belum ada.

### Zona waktu

SLA dihitung pada zona waktu rumah sakit, bukan pada offset tetap WIB:

- Zona diambil dari `sla_snapshot.timezone` (disalin dari policy saat tenggat
  dibuat). Bila policy tidak punya zona, dipakai `tenants.timezone`. Mengubah
  zona rumah sakit di Konsol Vendor ikut menyelaraskan policy SLA-nya.
- Cara mengubah zona: instalasi baru lewat wizard `/setup`; instalasi
  standalone lewat **Pengaturan → Identitas** (hanya Kepala IT, tercatat di
  audit, policy SLA dan jadwal laporan ikut disesuaikan); instalasi vendor lewat
  **Konsol Vendor** (Kepala IT rumah sakit tidak boleh mengubahnya sendiri).
  Nama zona divalidasi terhadap basis data IANA.
- Perhitungan sadar DST dan batas hari lokal. Basis data zona IANA diambil dari
  `backend/zoneinfo.zip` lewat environment `ZONEINFO`; file ini dibundel supaya
  hasilnya sama di Windows, Linux, dan container. Tanpa itu Go hanya mengenal
  UTC dan SLA menjadi salah tanpa pesan error — saat bootstrap server mencetak
  `PERINGATAN` bila zona tidak termuat.
- `holidays.date` dibaca sebagai tanggal kalender lokal, bukan instan UTC,
  sehingga hari libur tidak bergeser sehari pada zona negatif.
- Snapshot menyimpan zona yang dipakai, jadi perbaikan zona tidak mengubah
  tenggat tiket lama (tanggal tenggatnya sudah berupa instan UTC).
- Perbarui basis data zona dengan `npm run pb:zoneinfo` (memerlukan Go; menyalin
  `$GOROOT/lib/time/zoneinfo.zip`).

## Detail teknis: zona waktu

> Pelengkap bagian di atas: kontrak level field dan detail implementasi (dipindahkan dari SCHEMA, 2026-11-10).

- `PATCH /api/itsm/tenant` — body `{ timezone }`, hanya IT Lead, hanya mode
  standalone (mode vendor 403: zona dikelola Konsol Vendor).
- Zona divalidasi terhadap basis data IANA; nama karangan ditolak (400).
- Transaksi menyimpan `tenants.timezone`, menyelaraskan `sla_policies.timezone`
  milik tenant, dan menghitung ulang `tenants.report_next_at` bila jadwal laporan
  aktif (tetap 07.00 waktu lokal).
- Perubahan menulis audit `update` dengan `changes.timezone.{from,to}` dan
  `changes.report_next_at`. Nilai yang sama tidak menulis audit.
- Tiket lama tidak berubah: tenggat sudah tersimpan sebagai instan UTC dan
  `sla_snapshot.timezone` merekam zona saat dihitung.

## Detail teknis: pemindaian SLA

> Pelengkap bagian di atas: kontrak level field dan detail implementasi (dipindahkan dari SCHEMA, 2026-11-10).

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
