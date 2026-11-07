# Desain: Form Dinamis + Penugasan Otomatis

- **Status:** desain produk & teknis. Belum ada kode yang diubah.
- **Tanggal:** 4 November 2026.
- **Konteks:** menutup gap A4 (form dinamis) dan A5 (auto-assignment) dari [analisis kompetitor lokal](GAP-KOMPETITOR-LOKAL.md).
- **Basis skema saat ini:** `services.team`, `service_items` (tenant, service, name, code, description, approval_mode, sla_policy, sort, is_active), `tickets` (service, service_item, team, location, impact, priority, category, assignee, sla_snapshot), `users.team`, role `requester / it_support / resolver / it_lead / viewer`.

---

## 0. Ringkasan

Dua fitur ini bukan dua proyek terpisah. Nilainya muncul saat keduanya tersambung:

```
Form dinamis  →  menghasilkan sinyal terstruktur
                      ↓
              Aturan penugasan  →  memilih tim + orang
                      ↓
              Tiket langsung punya pemilik yang benar
```

- **Form dinamis** menjawab: *apa yang perlu ditanya agar tiket ini bisa dikerjakan tanpa balas-balasan?*
- **Penugasan otomatis** menjawab: *siapa yang paling tepat menangani, tanpa harus triage manual?*
- Tanpa form, routing hanya bisa memakai layanan/kategori/unit. Dengan form, routing bisa memakai lokasi, aset, tingkat dampak, modul SIMRS, atau jenis gangguan.
- Tanpa routing, form hanya menambah kolom yang tetap dibaca manual oleh staf.

**Prinsip desain:**

1. Form tidak menggantikan field inti tiket. `title`, `description`, `impact`, dan `priority` tetap dikelola sistem.
2. Form terikat ke **service item**, bukan ke seluruh aplikasi. Ini menjaga katalog tetap menjadi jangkar.
3. Aturan penugasan harus **deterministik dan bisa dijelaskan**. Tidak ada "AI memilih" tanpa alasan yang bisa dibaca staf.
4. Semua keputusan otomatis harus bisa **di-override manual** dan tercatat di audit.
5. Mulai dari yang kecil: routing v1 bisa jalan **tanpa** form builder, memakai field yang sudah ada.

---

## 1. Posisi terhadap kompetitor lokal

| Kapabilitas | Integra | NISSA / Qontak / Qiscus | Kita sekarang | Target desain |
|---|---|---|---|---|
| Form per jenis layanan | Ada ("formulir dinamis") | Umumnya form tetap | Form tetap | Schema per service item |
| Auto-assignment | Ada (ke unit/PIC) | Routing berbasis aturan | Hanya `services.team` → `tickets.team` | Rule engine + round-robin |
| Penjelasan penugasan | Tidak terlihat | Tidak terlihat | Tidak ada | Alasan + audit + timeline |
| Konteks RS (aset, alkes, lokasi) | Tidak ada | Tidak ada | Ada field, belum dipakai routing | Field form → kondisi rule |
| Override manual | Ada | Ada | Ada | Ada + alasan |

Kita tidak perlu meniru luasnya form builder Integra. Cukup **parity** untuk form + routing, lalu menang di konteks RS dan explainability.

---

# Bagian A — Form Dinamis

## A.1 Definisi dan batas

Form dinamis adalah **skema pertanyaan yang berbeda untuk setiap service item**, dirender saat intake, divalidasi di server, disimpan bersama tiket, dan ditampilkan kembali dengan label aslinya.

Contoh: item "Reset password" hanya butuh 3 field; item "Gangguan jaringan IGD" butuh 6 field; item "Perubahan konfigurasi SIMRS" butuh 8 field termasuk jadwal dan rencana rollback.

**Termasuk:**

- Field teks, angka, pilihan, radio, checkbox, tanggal, lampiran, dan teks informasi.
- Wajib/tidak wajib, panjang minimum/maksimum, pola, opsi.
- Logika tampil/jika (conditional show) dan wajib/jika.
- Pemetaan ke field tiket tertentu.
- Snapshot skema di tiket, sehingga tiket lama tetap terbaca.
- Pratinjau dan validasi sebelum diterbitkan.

**Tidak termasuk (sengaja):**

- Formula/scripting bebas.
- Tabel berulang (repeater) dan relasi bebas.
- Form untuk entity baru (aset, problem, change) di fase pertama.
- Rich text di field form (pakai textarea polos; rich text tetap di deskripsi/komentar).
- Form builder drag-and-drop di fase pertama (lihat rencana bertahap).

## A.2 Model data

### A.2.1 Perubahan `service_items`

| Field | Tipe | Catatan |
|---|---|---|
| `form_schema` | json, max 64 KB | Definisi form versi aktif |
| `form_version` | number | Dinaikkan saat publish |
| `team` | select `TEAMS`, opsional | Override tim per item; fallback ke `services.team` |
| `form_published_at` | date | Waktu publish terakhir |

> `team` per item penting: satu layanan "Jaringan" bisa punya item "Gangguan IGD" (tim network) dan "Permintaan kabel" (tim hardware). Tanpa override, routing hanya bisa per layanan.

### A.2.2 Perubahan `tickets`

| Field | Tipe | Catatan |
|---|---|---|
| `form_data` | json, max 64 KB | Jawaban aktual |
| `form_schema_snapshot` | json, max 64 KB | Skema saat tiket dibuat; pola sama dengan `sla_snapshot` |
| `form_version` | number | Versi skema yang dipakai |
| `assignment_source` | select `manual/rule/claim/import/none` | Asal assignee |
| `assignment_rule` | relation `assignment_rules`, opsional | Rule yang menang |
| `assignment_reason` | text, max 500 | Alasan yang bisa dibaca manusia |
| `assigned_at` | date | Waktu penugasan otomatis/klaim |

### A.2.3 Koleksi baru `service_item_form_versions` (P1)

Untuk rollback dan audit isi form:

`tenant`, `service_item`, `version`, `schema`, `published_by`, `published_at`, `note`.

Fase pertama bisa memakai audit diff saja; koleksi ini disiapkan saat builder visual dibutuhkan.

## A.3 Bentuk skema (JSON)

```json
{
  "version": 3,
  "title": "Gangguan Jaringan",
  "description": "Isi detail agar teknisi bisa langsung menuju titik gangguan.",
  "sections": [
    { "key": "lokasi", "title": "Lokasi & dampak" },
    { "key": "detail", "title": "Detail teknis" }
  ],
  "fields": [
    {
      "key": "location",
      "type": "select",
      "label": "Lokasi gangguan",
      "section": "lokasi",
      "required": true,
      "options": [
        { "value": "IGD", "label": "IGD" },
        { "value": "ICU", "label": "ICU" },
        { "value": "Rawat Inap", "label": "Rawat Inap" },
        { "value": "Farmasi", "label": "Farmasi" }
      ],
      "mapTo": "location"
    },
    {
      "key": "impact",
      "type": "radio",
      "label": "Dampak klinis",
      "section": "lokasi",
      "required": true,
      "options": [
        { "value": "critical", "label": "Pelayanan pasien terhenti" },
        { "value": "high", "label": "Sebagian unit tidak bisa bekerja" },
        { "value": "medium", "label": "Mengganggu, ada pekerjaan lain" },
        { "value": "low", "label": "Tidak mengganggu pelayanan" }
      ],
      "mapTo": "impact"
    },
    {
      "key": "asset_no",
      "type": "text",
      "label": "Nomor aset / titik jaringan",
      "section": "detail",
      "required": false,
      "placeholder": "Contoh: SW-IGD-01",
      "help": "Lihat label pada perangkat. Kosongkan jika tidak tahu.",
      "validation": { "maxLength": 40, "pattern": "^[A-Za-z0-9._/-]*$" },
      "linkAsset": true
    },
    {
      "key": "error_code",
      "type": "text",
      "label": "Kode error di layar",
      "section": "detail",
      "required": false,
      "showIf": { "field": "impact", "op": "in", "value": ["critical", "high"] }
    },
    {
      "key": "screenshot",
      "type": "attachment",
      "label": "Tangkapan layar",
      "section": "detail",
      "required": false,
      "maxFiles": 3
    },
    {
      "key": "no_patient_data",
      "type": "checkbox",
      "label": "Saya memastikan tidak mencantumkan data pasien",
      "section": "detail",
      "required": true,
      "mustBeTrue": true
    }
  ],
  "mapping": {
    "title": "Gangguan {{location}} — {{error_code}}",
    "description": "Dilaporkan lewat form gangguan jaringan.",
    "location": "location",
    "impact": "impact"
  },
  "settings": {
    "submitLabel": "Kirim laporan",
    "maxFields": 12
  }
}
```

**Aturan skema:**

- `version` naik setiap publish; tiket baru memakai versi terbaru.
- `key` unik, `snake_case`, maks 40 karakter, tidak boleh berubah setelah publish (atau buat field baru).
- `mapTo` hanya boleh menunjuk ke field tiket yang diizinkan: `title`, `description`, `location`, `impact`, `category`, `requested_for` (khusus staf).
- `linkAsset: true` bukan `mapTo`: setelah tiket dibuat, server mencari `assets.asset_no` di tenant yang sama dan membuat relasi `asset_tickets`. Jika aset tidak ditemukan, tiket tetap dibuat dan field disimpan di `form_data` (jangan memblokir pelaporan).
- `priority` **tidak boleh** dipetakan langsung; prioritas tetap dihitung server dari `impact` + SLA policy.
- `form_data` hanya menyimpan key yang ada di snapshot; key asing ditolak.

## A.4 Tipe field

| Tipe | Dipakai untuk | Catatan |
|---|---|---|
| `text` | nomor aset, kode error, username | Validasi panjang/pola |
| `textarea` | kronologi, gejala | Maks 2.000 karakter; tanpa HTML |
| `number` | jumlah perangkat, durasi | Min/max |
| `select` | lokasi, unit, modul SIMRS | Opsi statis dulu; opsi dinamis (unit/aset) fase 2 |
| `radio` | dampak, jenis keluhan | Cocok untuk 2–5 opsi |
| `checkbox` | attestation, persetujuan | `mustBeTrue` untuk attestation |
| `date` | tanggal kejadian, jadwal | Format ISO |
| `attachment` | tangkapan layar, dokumen | Memakai pipeline lampiran terproteksi yang sudah ada |
| `info` | instruksi/peringatan | Tidak disimpan di `form_data` |

Fase 2: `user` (pemilih staf), `unit`, `location`, `asset` (pemilih aset), `datetime`.

## A.5 Logika kondisional

Batasi ke dua pola agar bisa diuji dan dijelaskan:

1. **Tampil jika** (`showIf`): field hanya muncul bila kondisi terpenuhi.
2. **Wajib jika** (`requireIf`): field wajib diisi hanya bila kondisi terpenuhi.

Kondisi memakai satu operator: `eq`, `neq`, `in`, `not_in`, `exists`. Kedalaman maksimal satu level; tidak ada `AND`/`OR` bersarang. Jika butuh logika rumit, itu tanda formnya harus dipecah menjadi item layanan berbeda.

Contoh: `error_code` hanya muncul jika `impact` = `critical` atau `high`; `asset_no` wajib jika `location` = `IGD`.

## A.6 Pemetaan ke tiket

Saat submit:

1. Server memuat snapshot skema item.
2. Validasi tipe, opsi, required, `showIf`/`requireIf`, pola, dan attestation.
3. Bentuk `form_data` yang sudah bersih.
4. Isi field tiket dari `mapping`:
   - `title` dari template (fallback: nama item).
   - `description` dari template + ringkasan jawaban (opsional).
   - `location`, `impact`, `category` bila dipetakan.
   - Jika ada field `linkAsset`, cari aset berdasarkan nomor dan buat relasi `asset_tickets` (jangan gagalkan tiket bila aset tidak ditemukan).
5. Hitung prioritas dan SLA seperti sekarang (`service_item.sla_policy` → `service.default_sla` → policy tipe×prioritas).
6. Simpan `form_data` + `form_schema_snapshot` + `form_version`.
7. Jalankan penugasan otomatis (Bagian B).

**Yang tidak berubah:** approval flow, SLA, dan nomor tiket. Form hanya menambah konteks, bukan alur baru.

## A.7 UX builder

Fase 1 (JSON + pratinjau, tanpa drag-and-drop):

- **Pengaturan > Layanan > pilih item > tab Formulir.**
- Editor JSON dengan validasi langsung (skema, key unik, `mapTo` valid).
- Tombol **Pratinjau sebagai Pemohon** dan **Pratinjau sebagai Staf**.
- Tombol **Terbitkan** (naikkan versi) dan **Riwayat versi**.
- Tombol **Uji routing**: isi form contoh, lihat rule mana yang cocok dan siapa kandidatnya.

Fase 2 (builder visual):

- Palet field di kiri, kanvas di tengah, properti di kanan.
- Drag untuk urutkan, tambah section, duplikat field.
- Peringatan otomatis: lebih dari 8 field, lebih dari 3 section, label mengandung kata terlarang (pasien, NIK, rekam medis).
- Template: Reset password, Akses SIMRS, Perangkat rusak, Gangguan jaringan, Permintaan perubahan.

**Batas keras:**

| Batas | Nilai | Alasan |
|---|---|---|
| Field per item | 12 | Form panjang menurunkan completion rate |
| Section | 3 | Di atas itu, pecah item |
| Opsi per field | 50 | Select yang tidak bisa dipindai |
| Aturan kondisional per field | 2 | Menjaga explainability |
| Ukuran skema | 64 KB | Batas PocketBase JSON yang aman |
| Kata terlarang di label | pasien, NIK, rekam medis, diagnosis, alamat | Kebijakan data pasien |

## A.8 UX pemohon dan staf

**Pemohon:**

- Dari katalog: pilih layanan → item → form.
- Jika lebih dari 6 field, tampil sebagai 2 langkah dengan progress.
- Saran artikel KB muncul setelah 2 field terisi (memakai pencarian yang sudah ada).
- Simpan draf di localStorage (opsional, fase 2).
- Setelah submit: nomor tiket, ringkasan jawaban, dan tenggat SLA.

**Staf (intake atas nama):**

- Form yang sama + field khusus staf (`visibility: staff`) seperti "nomor tiket SIMRS" atau "kronologi teknis".
- Tidak bisa mengubah `priority` dari form; triage tetap jalur resmi.

**Detail tiket:**

- Panel **Detail permintaan** merender snapshot: label, nilai, urutan section.
- Field `visibility: staff` tidak dirender untuk requester.
- Raw JSON tidak pernah ditampilkan ke pengguna.

## A.9 Versioning dan snapshot

- Publish menaikkan `form_version`; tiket baru memakai versi itu.
- Tiket lama menyimpan `form_schema_snapshot`; perubahan form tidak mengubah tampilan tiket lama.
- Jika field dihapus dari versi baru, data lama tetap ada di `form_data` dan tetap dirender dari snapshot.
- Rollback: publish ulang schema lama sebagai versi baru (bukan mengubah histori).

## A.10 Keamanan dan data pasien

- Label, help, dan opsi adalah **teks polos**; render memakai escaping, bukan HTML.
- `textarea` maks 2.000 karakter; tidak ada rich text di form.
- Attestation `mustBeTrue` wajib untuk item yang menyentuh pasien/SIMRS.
- Kata terlarang di label menghasilkan peringatan di builder; bukan pemblokiran otomatis (bisa false positive).
- Lampiran memakai pipeline proteksi yang sudah ada (token file).
- `form_data` ikut aturan baca tiket: requester hanya melihat tiketnya; staf melihat sesuai tenant/team.

---

# Bagian B — Penugasan Otomatis

## B.1 Definisi dan batas

Penugasan otomatis adalah **evaluasi aturan berurutan** saat tiket dibuat (dan saat triage mengubah klasifikasi), yang menghasilkan:

- tim tujuan (`tickets.team`), dan/atau
- assignee (`tickets.assignee`), atau
- tetap di antrean tim tanpa assignee.

**Termasuk:**

- Rule berurutan dengan kondisi dari field tiket + `form_data`.
- Target: antrean tim, user tetap, round-robin, least-load, skill (bertahap).
- Fallback ke antrean + notifikasi lead.
- Alasan penugasan yang bisa dibaca dan diaudit.
- Override manual yang tidak ditimpa otomatis.

**Tidak termasuk:**

- AI/LLM untuk memilih orang.
- Optimasi jadwal shift penuh (fase 3).
- Load balancing lintas tenant.
- Penugasan otomatis untuk problem/change/insiden mayor (bisa menyusul).

## B.2 Pipeline

Dipanggil di dalam transaksi pembuatan tiket, setelah SLA dihitung dan sebelum notifikasi:

```
1. Tentukan tim
   explicit rule target team
   → service_item.team
   → service.team
   → "service_desk"

2. Evaluasi rule (urut `order`, hanya is_active)
   cocok? → pilih target sesuai strategi
   tidak cocok? → lanjut rule berikutnya
   stop=true dan target ketemu? → berhenti

3. Pilih assignee
   team_queue     → null (antrean tim)
   fixed_user     → user tertentu (jika eligible)
   round_robin    → kandidat dengan assigned_at terlama
   least_load     → kandidat dengan tiket aktif paling sedikit
   skill          → filter skill lalu round-robin/least-load

4. Eligibility
   aktif, tenant sama, role sesuai, tim sesuai,
   tidak cuti, beban < max_open, bukan approver-only,
   vendor hanya jika rule mengizinkan

5. Simpan
   assignee, team, assignment_source=rule,
   assignment_rule, assignment_reason, assigned_at

6. Efek samping
   audit `auto_assign`, timeline, notifikasi assignee + requester

7. Fallback
   tidak ada kandidat → tetap di antrean tim,
   assignment_source=none, notifikasi lead
```

**Idempotensi:** jika tiket sudah punya assignee, pipeline tidak menimpa kecuali `assignment_source=rule` dan tiket masih `open`/`assigned` serta klasifikasi berubah.

## B.3 Model data

### B.3.1 Koleksi baru `assignment_rules`

| Field | Tipe | Catatan |
|---|---|---|
| `tenant` | relation tenants, required | Isolasi |
| `name` | text, max 120 | "Jaringan IGD" |
| `order` | number | Urutan evaluasi; kecil lebih dulu |
| `is_active` | bool | Kill switch per rule |
| `conditions` | json, max 8 KB | Lihat B.3.2 |
| `target_type` | select `team_queue/fixed_user/round_robin/least_load/skill` | Strategi |
| `target_team` | select `TEAMS`, opsional | Tim tujuan |
| `target_user` | relation users, opsional | Untuk `fixed_user` |
| `required_skill` | text, opsional | Untuk `skill` |
| `max_open` | number, opsional | Override kapasitas |
| `allow_platform` | bool | Izinkan vendor jadi assignee |
| `stop` | bool, default true | Hentikan evaluasi jika cocok |
| `created/updated` | autodate | |

Index: `(tenant, is_active, order)`.

### B.3.2 Bentuk kondisi

```json
{
  "all": [
    { "source": "ticket", "field": "service", "op": "eq", "value": "svc_jaringan" },
    { "source": "form", "field": "location", "op": "in", "value": ["IGD", "ICU"] },
    { "source": "ticket", "field": "impact", "op": "eq", "value": "critical" }
  ]
}
```

Operator: `eq`, `neq`, `in`, `not_in`, `contains`, `exists`, `gt`, `lt`.

Batas: 6 kondisi per rule, 30 rule per tenant, satu level `all`/`any`.

### B.3.3 Perubahan `users`

| Field | Tipe | Catatan |
|---|---|---|
| `skills` | json array, opsional | `["simrs","jaringan","alkes"]` |
| `max_open_tickets` | number, default 10 | Kapasitas |
| `on_leave_until` | date, opsional | Tidak di-assign sampai tanggal ini |

`users.team` sudah ada; tidak perlu koleksi tim baru untuk fase 1–2.

### B.3.4 Audit dan timeline

- Audit action baru: `auto_assign`.
- Payload: `rule`, `order`, `candidates`, `chosen`, `reason`, `team`.
- Timeline event: "Ditugaskan otomatis ke Budi oleh aturan Jaringan IGD (round-robin, beban 3/10)".
- Manual override menulis audit `assign` seperti sekarang + `assignment_source=manual`.

## B.4 Strategi pemilihan

| Strategi | Kapan dipakai | Perilaku | Risiko |
|---|---|---|---|
| `team_queue` | Default aman | Tidak ada assignee; tim melihat di antrean | Tiket bisa menganggur |
| `fixed_user` | Pemilik layanan/perubahan | Selalu ke orang yang sama | Bottleneck; cuti |
| `round_robin` | Tim homogen | Kandidat dengan `assigned_at` terlama | Tidak sadar beban |
| `least_load` | Tim dengan beban timpang | Tiket aktif paling sedikit | Butuh query beban; bisa starvation |
| `skill` | Spesialis (SIMRS, alkes) | Filter skill lalu round-robin | Data skill harus dirawat |

**Rekomendasi fase 1:** `team_queue`, `fixed_user`, `round_robin`. `least_load` dan `skill` setelah ada data beban dan skill yang terisi.

**Fairness round-robin:** urutkan kandidat berdasarkan `assigned_at` terakhir (null paling awal), lalu `id` untuk tie-break. Simpan `assigned_at` di tiket; tidak perlu tabel kursor terpisah untuk fase 1.

**Beban (`least_load`):** hitung tiket aktif per user (`status not in resolved, closed`) dalam satu query agregat; bobot prioritas bisa ditambahkan fase 2 (critical ×2).

## B.5 Eligibility dan kapasitas

Kandidat valid jika:

1. `is_active = true` dan `tenant` sama.
2. Role termasuk `it_support` atau `resolver`; `it_lead` hanya jika rule mengizinkan (mis. eskalasi).
3. `users.team` = `target_team` (kecuali `fixed_user`).
4. `on_leave_until` kosong atau sudah lewat.
5. Jumlah tiket aktif < `max_open_tickets` (default 10).
6. Bukan akun platform, kecuali `allow_platform = true`.
7. Bukan approver-only (manajer unit tidak masuk kandidat).

**Jika semua kandidat penuh:**

- Tetap di antrean tim; `assignment_source=none`.
- Notifikasi lead: "3 tiket menunggu di tim Network; semua teknisi di atas kapasitas."
- Tidak memblokir pembuatan tiket.

## B.6 Explainability

Setiap penugasan otomatis harus menjawab "kenapa saya?" dalam satu kalimat:

> "Aturan #2 'Jaringan IGD' cocok (lokasi=IGD, dampak=critical). Round-robin memilih Budi: 3 kandidat, beban 3/10, terakhir ditugaskan 2 hari lalu."

Tempat tampil:

- Badge di detail tiket: `Auto-assign · Jaringan IGD`.
- Tooltip/panel "Kenapa?" dengan kondisi yang cocok dan kandidat.
- Timeline dan audit.
- Halaman Pengaturan > Routing: statistik hit per rule.

Tanpa explainability, staf akan mematikan fitur setelah penugasan pertama yang salah.

## B.7 Interaksi dengan fitur lain

| Fitur | Perilaku |
|---|---|
| **Approval** | Assignment tetap terjadi saat create; `in_progress` tetap digerbang approval. Untuk CR, assign ke **change owner**, bukan eksekutor. |
| **SLA** | Assignment tidak menghentikan jam respons. First response tetap dihitung dari komentar publik pertama. |
| **Triage** | Jika layanan/item/team berubah dan belum ada pekerjaan, evaluasi ulang rule; jika assignee berubah, catat audit. |
| **Reopen** | Assignee dipertahankan; jika assignee nonaktif, kembalikan ke antrean + notifikasi lead. |
| **Manual assign** | Override selalu menang; `assignment_source=manual`; rule tidak menimpa. |
| **Delegasi approval** | Tidak terkait; delegasi tetap hanya untuk approval. |
| **Vendor** | Tidak masuk kandidat kecuali rule `allow_platform`. |
| **Team queue** | Fallback alami; teknisi tetap bisa "Ambil tiket". |

## B.8 Edge case

| Kasus | Penanganan |
|---|---|
| Tidak ada rule cocok | Tim dari layanan; antrean; `assignment_source=none` |
| Rule cocok, target user nonaktif | Jatuh ke kandidat berikutnya; jika kosong, antrean |
| Semua kandidat cuti | Antrean + notifikasi lead |
| Dua rule cocok | Rule dengan `order` terkecil menang; `stop=true` menghentikan evaluasi |
| Tiket kritis tanpa assignee | Notifikasi lead segera; eskalasi yang ada tetap berjalan |
| Assignee dinonaktifkan | Cron/aksi admin: lepas assignee, kembalikan ke antrean, audit |
| Tiket dibuat oleh staf untuk dirinya | Rule tetap berjalan; jika assignee = requester, tetap valid (tidak ada notifikasi diri sendiri) |
| Form diubah setelah tiket dibuat | Tiket lama memakai snapshot; routing tidak dihitung ulang |
| Rule dihapus | Tiket lama menyimpan `assignment_rule`; tampilkan "rule sudah dihapus" |

---

# Bagian C — Contoh rumah sakit

| # | Skenario | Field form | Kondisi rule | Target | Hasil |
|---|---|---|---|---|---|
| 1 | Reset password SIMRS | username, unit, alasan | item = Reset password | team application, round-robin, skill `simrs` | 3 admin SIMRS kebagian rata; SLA 1 jam |
| 2 | Jaringan IGD putus | lokasi, dampak, kode error | lokasi in [IGD, ICU] **dan** dampak = critical | team network, least-load | Prioritas critical; lead dinotifikasi; teknisi paling ringan |
| 3 | Printer farmasi macet | nomor aset, lokasi | item = Printer | team hardware, round-robin | Aset tertaut; teknisi hardware |
| 4 | Alkes rusak | nomor aset, ruang, gejala | layanan = Alat Kesehatan | team biomedical, skill `alkes` | Teknisi alkes; jika criticality tinggi, lead |
| 5 | Akses SIMRS baru | unit, role, alasan | item = Tambah akses | team application, fixed owner | Approval manajer → lead; pekerjaan digerbang |
| 6 | Perubahan konfigurasi SIMRS | rencana, risiko, jadwal, rollback | layanan = SIMRS, tipe = change | fixed user (SIMRS lead) | Change owner untuk perencanaan; CAB tetap |

Catatan: skenario 4 membutuhkan tambahan layanan "Alat Kesehatan" + 2 item di seed. Skenario 6 membutuhkan field form yang lebih panjang; tetap di bawah 12 field.

---

# Bagian D — Rencana bertahap dan estimasi

Asumsi: 1 developer berpengalaman, stack yang ada (PocketBase + React), tanpa infrastruktur baru, tanpa desain visual besar.

| Fase | Isi | Estimasi | Risiko |
|---|---|---|---|
| **1. Routing v1** | Rule engine memakai field yang sudah ada (service, item, kategori, lokasi, impact, team); target `team_queue`, `fixed_user`, `round_robin`; audit + explainability; UI Pengaturan sederhana | 6–8 hari + 2 hari test | Rendah; tidak mengubah skema tiket secara besar |
| **2. Form v1** | `form_schema` + `form_data` + snapshot; renderer; validasi server; JSON editor + pratinjau; 5 form contoh | 8–10 hari + 2 hari test | Sedang; menyentuh intake dan detail tiket |
| **3. Builder + kondisi** | Builder visual, `showIf`/`requireIf`, template, uji routing, riwayat versi | 10–14 hari + 3 hari test | Sedang–tinggi; scope creep |
| **4. Kapasitas + skill** | `least_load`, `users.skills`, `max_open_tickets`, cuti, dashboard beban | 6–8 hari + 2 hari test | Sedang; data skill harus dirawat |
| **5. Shift/on-call** | Jadwal shift, on-call, routing di luar jam | 6–8 hari + 2 hari test | Tinggi; butuh keputusan operasional |

**Total MVP (fase 1–2): ~4–5 minggu.** Sampai fase 4: ~2,5–3 bulan. Fase 5 setelah ada kebutuhan nyata.

**Urutan yang disarankan:** fase 1 dulu, karena memberi nilai tanpa menunggu form. Setelah routing stabil, form v1 untuk 5 item yang paling sering, lalu builder.

---

# Bagian E — Metrik keberhasilan

| Metrik | Definisi | Target awal |
|---|---|---|
| Form completion rate | tiket dengan `form_data` lengkap / tiket yang dibuka | > 80% |
| Field drop-off | field yang paling sering ditinggalkan | < 10% per field |
| Auto-assign coverage | tiket dengan `assignment_source=rule` / total tiket baru | > 60% |
| Reassignment rate | tiket yang di-assign ulang dalam 24 jam | < 20% |
| Time-to-first-assign | median create → `assigned_at` | < 5 menit |
| Unassigned aging | tiket tanpa assignee > 1 jam | < 10% |
| Load balance | std dev tiket aktif per teknisi | turun 30% |
| Triage correction | tiket yang priority-nya diubah | < 25% |
| SLA compliance | sesuai laporan yang ada | naik |

**Guardrail:** jika reassignment rate sebuah rule > 20% selama 2 minggu, nonaktifkan rule dan review kondisinya.

---

# Bagian F — Keputusan yang perlu diambil

1. **Skema form disimpan di `service_items` atau koleksi `form_templates` terpisah?**
   Rekomendasi: di `service_items` dulu; ekstrak ke `form_templates` hanya jika satu form dipakai banyak item.
2. **Builder visual sekarang atau JSON + pratinjau dulu?**
   Rekomendasi: JSON dulu; builder setelah 5 form terbukti dipakai.
3. **Default routing: antrean tim atau individu?**
   Rekomendasi: antrean tim; individu hanya untuk pemilik layanan/perubahan.
4. **Round-robin atau least-load dulu?**
   Rekomendasi: round-robin; least-load setelah data beban bersih.
5. **Vendor boleh jadi kandidat otomatis?**
   Rekomendasi: tidak, kecuali rule `allow_platform=true`.
6. **Form bisa diedit pemohon setelah submit?**
   Rekomendasi: tidak; perubahan lewat komentar/triage.
7. **Field khusus staf boleh ada di form yang sama?**
   Rekomendasi: ya, dengan `visibility: staff`.
8. **Prioritas boleh dipetakan dari form?**
   Rekomendasi: tidak; prioritas dari `impact` + SLA.
9. **Batas rule per tenant?**
   Rekomendasi: 30; cukup untuk RS, mencegah rule spaghetti.
10. **Apakah form_data boleh menyimpan data pasien?**
    Rekomendasi: tidak; attestation + kata terlarang + audit.

---

# Bagian G — Risiko dan anti-pattern

| Risiko | Mitigasi |
|---|---|
| Form terlalu panjang | Batas 12 field; wizard; template; ukur drop-off |
| Setiap RS minta field sendiri | Template + batas; varian per item, bukan per tiket |
| Builder menjadi bahasa pemrograman | Hanya `showIf`/`requireIf`, satu level |
| Validasi client/server berbeda | Satu modul validasi dipakai bersama |
| Rule saling bertabrakan | Urutan eksplisit, `stop`, uji routing, statistik hit |
| Penugasan tidak adil | Round-robin deterministik; explainability; audit |
| Rule memilih orang yang cuti | `on_leave_until` + fallback |
| Semua teknisi penuh | Antrean + notifikasi lead; jangan blokir tiket |
| Assignee dinonaktifkan | Cron pelepasan + requeue |
| Form menyimpan data pasien | Attestation, kata terlarang, audit |
| Tiket lama rusak setelah form berubah | Snapshot skema |
| Scope creep ke ESM | Form hanya untuk service item; ESM fase terpisah |

**Anti-pattern yang harus dihindari:**

- Menjadikan form sebagai database (entity baru di dalam JSON).
- Membiarkan pemohon menetapkan prioritas.
- Auto-assign tiket kritis tanpa notifikasi lead.
- Reassign setiap kali tiket diedit.
- Menyembunyikan alasan penugasan dari staf.
- 20 field wajib karena "biar lengkap".
- Formula/scripting di skema.
- Field yang meminta nama pasien, NIK, atau nomor rekam medis.

---

# Lampiran — Matriks field

| Kebutuhan | Tipe | Wajib | Map ke tiket |
|---|---|---|---|
| Lokasi kejadian | `select` | Ya | `location` |
| Dampak klinis | `radio` | Ya | `impact` |
| Kategori | `select` | Tidak | `category` |
| Nomor aset | `text` | Kondisional | relasi `asset_tickets` via `linkAsset` (fase 2) |
| Kode error | `text` | Kondisional | — |
| Kronologi | `textarea` | Ya | `description` (opsional) |
| Lampiran | `attachment` | Tidak | lampiran tiket |
| Attestation | `checkbox` `mustBeTrue` | Ya | — |
| Unit pemohon | `select`/`unit` | Ya (staf) | `unit` |
| Atas nama | `user` | Tidak (staf) | `requested_for` |

---

## Penutup

Form dinamis tanpa routing hanya memindahkan pekerjaan mengetik. Routing tanpa form hanya menebak dari layanan. Keduanya harus dibangun sebagai **satu alur**: pertanyaan yang tepat menghasilkan sinyal yang tepat, dan sinyal yang tepat menghasilkan pemilik yang tepat.

Langkah paling murah untuk membuktikan nilai: **routing v1 dengan field yang sudah ada**, di dua layanan (Jaringan dan Akun & Akses), selama dua minggu. Jika reassignment rate turun dan time-to-first-assign membaik, form v1 layak dilanjutkan.
