# Model Peran & Rekomendasi Role ITSM — Digital Hospital

Status: **P0 `resolver` + `viewer` dan label Indonesia sudah diimplementasikan;
P1/P2 belum.**  
Basis: repo per 2026-11-04 (`requester / it_support / resolver / it_lead /
viewer`, scope `is_platform_staff`, duty lewat relasi)  
Pertanyaan yang dijawab: *role/peran apa yang belum masuk, terutama
"programmer" dan "resolver", dan role ITSM umum mana yang perlu ditambahkan?*

---

## 0. Versi Indonesia yang disarankan (baca ini dulu)

Daftar di bagian 3 memang panjang karena itu **inventaris ITIL/global**, bukan
daftar role yang harus langsung dibuat. Untuk aplikasi ini, mulai dari **6 role
akses** + jabatan + peran proses. Istilah ITIL tetap dipakai sebagai referensi,
tetapi label yang dilihat pengguna sebaiknya istilah yang biasa dipakai di
Indonesia.

### 0.1 Role akses (yang benar-benar dicek aplikasi)

| Value di kode | Label UI yang disarankan | Istilah global | Untuk siapa |
|---|---|---|---|
| `requester` | **Pemohon** | Requester / End User | Semua staf RS |
| `it_support` | **Staff IT** | Agent / Service Desk | Helpdesk, teknisi umum |
| `resolver` | **Teknisi** | Resolver / L2–L3 | Programmer, jaringan, hardware, DBA, admin SIMRS |
| `it_lead` | **Kepala IT** | IT Lead / Manager | Kepala/kadiv IT |
| `viewer` | **Pengamat** | Auditor / Viewer | Pimpinan, auditor, DPO |
| `is_platform_staff` | **Vendor** | Vendor resolver | Mitra/vendor |

Catatan penting: **"IT Support" yang saya sebut sebelumnya adalah label untuk
value `it_support`.** Kalau di UI Anda labelnya "Staff IT", itu role yang sama.
Kalau sama sekali tidak muncul, cek **Pengaturan > Tim** sebagai Kepala IT; di
database lokal ada 3 user dengan role `it_support` (salah satunya
`support@rs.local`). Kalau di layar Anda tetap tidak ada, kemungkinan yang
dibuka adalah build/deploy atau database yang berbeda.

### 0.2 Jabatan (job title, bukan role akses)

Jabatan yang umum di tim IT rumah sakit Indonesia:

- **Programmer**
- **Teknisi Jaringan**
- **Teknisi Hardware**
- **Admin SIMRS**
- **DBA**
- **Teknisi Alat Kesehatan (Alkes)**
- **Operator SIMRS**
- **Helpdesk**
- **Staf Akreditasi**

Jabatan ini disimpan di `users.job_title` dan **tidak** mengubah hak akses.
Semua jabatan di atas cukup memakai role `resolver` (kecuali helpdesk yang
memang agent penuh).

### 0.3 Peran proses (duty/relasi, bukan role akses)

Istilah ITIL di bawah ini lebih baik diterjemahkan dan ditempelkan ke record,
bukan dijadikan nilai role:

| Istilah ITIL | Istilah Indonesia yang disarankan | Ditempel ke |
|---|---|---|
| Service Owner | **Pemilik Layanan** | `services.owner` |
| Problem Manager | **Manajer Masalah** | `problems.owner` |
| Incident Commander | **Komandan Insiden** | `major_incidents.commander` |
| Knowledge Manager/Reviewer | **Pengelola Pengetahuan** | `knowledge_articles.reviewer` |
| Asset/CI Manager | **Petugas Aset** | `assets.owner` |
| Unit Manager | **Kepala Unit / Manajer Unit** | `units.manager` |
| Unit Admin / Super User | **Admin Unit / Super User** | `units.admin` *(baru)* |
| CAB | **Komite Perubahan** | `cab_members` *(baru)* |
| Security/Privacy Officer | **Petugas Keamanan Data (DPO)** | `viewer` + Komite Perubahan |

### 0.4 Urutan yang disarankan

**Kalau mau paling sederhana dan cepat:** tetap pakai 3 role yang sudah ada.
Cukup rapikan label dan tambah `job_title`. Programmer = **Staff IT** + jabatan
**Programmer**. Ini tidak mengubah hak akses sama sekali.

Kalau perlu membatasi akses programmer/spesialis, baru lanjut:

1. **Rapikan label** yang sudah ada: Pemohon, Staff IT, Kepala IT. Tidak perlu
   ubah nilai database; cukup label UI. **Selesai.**
2. **Tambah `resolver`** dengan label **Teknisi**. **Selesai** (P0).
3. **Tambah `viewer`** dengan label **Pengamat**. **Selesai** (P0).
4. **Tambah `job_title`** untuk jabatan seperti Programmer, Teknisi Jaringan,
   DBA, Admin SIMRS. **Selesai** (P1 awal).
5. **Fungsikan peran proses** yang sudah punya field: Kepala Unit, Pemilik
   Layanan, Manajer Masalah, Komandan Insiden, Pengelola Pengetahuan, Petugas
   Aset. **Belum.**
6. **Komite Perubahan** belakangan, setelah volume tiketnya terasa.
   **Belum.** Antrean tim sederhana sudah selesai lewat `users.team`,
   `services.team`, dan `tickets.team`.

### 0.5 Status implementasi P0

| Perubahan | Status | Bukti |
|---|---|---|
| Lima role akses + label Indonesia | Selesai | `users.role` + `frontend/src/lib/permissions.js` |
| `resolver` hanya tiket assigned | Selesai | guard + rule komentar/lampiran + test API |
| `resolver` boleh mulai/wait/resume/resolve | Selesai | `ticket_actions.pb.js` |
| `resolver` tidak boleh triage/assign/close | Selesai | guard route + test API |
| `viewer` baca laporan + audit | Selesai | `reports.pb.js`, `audit.pb.js`, route `/reports` dan `/audit` |
| Label UI Pemohon/Staff IT/Teknisi/Kepala IT/Pengamat | Selesai | Team, platform, top bar, profile |
| `job_title` | Selesai | `users.job_title`, Tim, Konsol Vendor, profil |
| Antrean tim (`team`) | Selesai | `users.team`, `services.team`, `tickets.team`, rule team + ambil tiket |
| Peran proses (service owner, problem manager, dll.) | Belum | P1 |

---

## 1. Ringkasan

1. Aplikasi ini sudah punya **tiga sumbu peran** yang sehat: `role` (boleh apa),
   `is_platform_staff` (batas tenant/vendor), dan relasi duty (manajer unit,
   assignee, approver, delegate). Jangan ratakan semuanya menjadi `role`.
2. **"Resolver" bukan nilai role di kode ini.** Yang ada adalah `it_support`,
   dan secara fungsi ia sudah menjadi resolver/agent. Yang hilang bukan
   namanya, melainkan **resolver bertingkat**: spesialis yang bisa ditugaskan
   dan mengerjakan tiket tanpa mendapat seluruh kekuatan agent.
3. **"Programmer" bukan role ITSM; itu job title.** Modelkan sebagai
   `resolver` + `job_title = Programmer` + `team = Application` + scope layanan.
   Kalau dijadikan role, berikutnya muncul `network_engineer`, `dba`,
   `biomedical_engineer`, `clinical_analyst`, dan seterusnya.
4. Role umum yang **belum ada dan berdampak** di aplikasi ini: approver
   independen, service owner yang fungsional, problem manager, incident
   commander, knowledge reviewer, asset custodian, auditor/viewer, unit
   admin/clinical super user, CAB member, dan security/privacy officer.
5. Urutan yang disarankan: **P0** `resolver` + `viewer/auditor` + approver
   independen; **P1** fungsionalkan owner/commander + problem/knowledge/asset
   duty + unit admin; **P2** CAB committee, team/group, release/capacity/
   supplier.

---

## 2. Kondisi saat ini

### 2.1 Tiga sumbu yang sudah ada

| Sumbu | Mekanisme | Contoh | Fungsi |
|---|---|---|---|
| **Access role** | `users.role` | `requester`, `it_support`, `resolver`, `it_lead`, `viewer` | Menentukan boleh apa |
| **Scope** | `users.is_platform_staff` + `tenant` | staf RS vs vendor lintas RS | Menentukan batas data |
| **Duty** | Relasi per record | `units.manager`, `tickets.assignee`, `ticket_approvals.approver`, `tickets.delegates` | Menentukan tanggung jawab/otoritas pada record tertentu |

Implikasi:

- `role` diperiksa **hardcoded** di rule PocketBase dan guard
  (`backend/pb_hooks/lib/guards.js:1`, `backend/pb_hooks/lib/constants.js:19`,
  rule di `backend/pb_migrations/*`).
- Duty diperiksa **dinamis** lewat relasi dan route (`guards.canAccessTicket`).
- Menambah satu nilai `role` berarti menyentuh rule, guard, route, UI, dan test.
  Menambah satu duty biasanya cukup migrasi + satu helper + UI.

### 2.2 Matriks kemampuan saat ini

| Kemampuan | Requester | Manajer unit (relasi) | IT Support | IT Lead | Vendor Support | Vendor Lead |
|---|---|---|---|---|---|---|
| Buat tiket sendiri | ya | ya | ya | ya | tidak (tanpa tenant) | tidak |
| Buat tiket atas nama orang lain | tidak | tidak | ya | ya | tidak | tidak |
| Baca tiket sendiri | ya | — | — | — | — | — |
| Baca semua tiket unit | tidak | ya | — | — | — | — |
| Baca semua tiket tenant | tidak | tidak | ya | ya | ya (semua RS) | ya (semua RS) |
| Triage (prioritas, layanan, kategori) | tidak | tidak | ya | ya | ya | ya |
| Assign ke diri sendiri | tidak | tidak | ya | ya | ya | ya |
| Assign ke staf lain / lepas | tidak | tidak | tidak | ya | tidak | ya |
| Komentar internal | tidak | tidak | ya | ya | ya | ya |
| Selesaikan tiket | tidak | tidak | ya (assigned) | ya | ya | ya |
| Tutup tiket | tidak | tidak | ya | ya | ya | ya |
| Buka kembali tiket | tiket sendiri | tidak | ya | ya | ya | ya |
| Approve tahap manajer unit | tidak | ya | tidak | tidak | tidak | tidak |
| Approve tahap IT Lead/CAB | tidak | tidak | tidak | ya | tidak | ya |
| CRUD aset/CI | tidak | tidak | ya | ya | tidak (tanpa tenant) | tidak (tanpa tenant) |
| Problem management | tidak | tidak | ya | ya | baca; tulis tidak | baca; tulis tidak |
| Tulis artikel KB | tidak | tidak | ya | ya | baca; tulis tidak | baca; tulis tidak |
| Publish/pensiunkan KB | tidak | tidak | tidak | ya | tidak | tidak |
| Deklarasi/ubah insiden mayor | tidak | tidak | ya | ya | ya (pilih RS) | ya (pilih RS) |
| Laporan & audit | tidak | tidak | tidak | ya | tidak | ya |
| Tim, pengaturan, branding | tidak | tidak | tidak | ya | tidak | tidak |

Catatan: pembatasan "assigned" untuk resolve/close dan "assign ke diri sendiri"
ada di `backend/pb_hooks/ticket_actions.pb.js`; assignee wajib staf
(`ticket_actions.pb.js:83`). Semua route aset/problem/KB/insiden memakai
`guards.assertStaff` (`assets.pb.js`, `problems.pb.js`, `knowledge.pb.js`,
`incidents.pb.js`), sehingga **siapa pun yang ber-role `it_support` mendapat
seluruh kemampuan itu**.

Vendor tidak punya `tenant`, sehingga route aset/problem/KB menolak penulisan
(`assets.pb.js:18`, `problems.pb.js:18`, `knowledge.pb.js:18`); mereka hanya
bisa membaca lewat cabang rule platform. Insiden mayor adalah pengecualian
karena route-nya menerima `tenant` dari body untuk akun platform.

### 2.3 Di mana "resolver" dan "programmer" berada sekarang

- Sebelum P0, kata **resolver** hanya muncul sebagai konsep di dokumentasi
  ("vendor sebagai resolver tiket") dan tidak ada nilainya di `users.role`.
  Sekarang `resolver` adalah role akses dengan label **Teknisi**.
- **Programmer** sekarang memakai role `resolver`, bukan `it_support`. Ia bisa
  ditugaskan dan mengerjakan tiket assigned tanpa mendapat seluruh kekuatan
  agent (triage, assign, close, aset, problem, KB, insiden mayor).
- `job_title` sudah ada (Programmer, Teknisi Jaringan, DBA, Admin SIMRS, dll.)
  dan tampil di tim/profil/top bar. `team` sudah ada untuk antrean
  Service Desk/Aplikasi/Jaringan/Hardware/Database/Alkes/Lainnya; `skill`
  belum ada.

---

## 3. Inventaris peran ITSM umum

Legenda: **Ada** = sudah memadai; **Sebagian** = ada mekanismenya tetapi belum
tegas/fungsional; **Belum** = belum ada.

Ini **inventaris referensi ITIL/global**, bukan daftar role yang harus langsung
dibuat. Untuk daftar yang disarankan dan istilah Indonesia, lihat bagian 0.

| Peran umum | Kategori | Inti tanggung jawab | Di aplikasi ini | Rekomendasi |
|---|---|---|---|---|
| Requester / End User | Consumer | Melaporkan gangguan, mengajukan permintaan, memberi CSAT | **Ada** (`requester`) | Pertahankan |
| Approver bisnis | Governance | Menyetujui permintaan dari sisi bisnis, biaya, akses, atau keamanan | **Sebagian**: hanya `units.manager`; tidak ada approver per layanan | Tambah approver per service item / approval policy |
| Resolver / Agent | Resolver | Mengerjakan tiket yang ditugaskan | **Sebagian**: `it_support` adalah resolver penuh | Tambah tier `resolver` terbatas |
| Service Desk Analyst (L1) | Resolver | Kontak pertama, klasifikasi, first-contact resolution, eskalasi | **Sebagian**: menyatu di `it_support` | Jadikan team/skill, bukan role |
| L2/L3 Specialist (Programmer, DBA, Network, Biomedical, Integration) | Resolver | Perbaikan teknis mendalam, deployment, integrasi | **Sebagian**: `resolver` + `job_title` + `team`; skill/routing otomatis belum | Pertahankan, tambah skill bila perlu |
| Incident Manager | Process | Koordinasi pemulihan, prioritas, eskalasi | **Belum**: semua staf bisa | Duty/capability; incident queue |
| Major Incident Manager / Commander | Process | Memimpin insiden besar, komunikasi, PIR | **Sebagian**: field `commander`, tanpa otoritas | Batasi aksi status/PIR ke commander/lead |
| Problem Manager | Process | RCA, known error, permanent fix, aging | **Sebagian**: semua staf bisa; `owner` metadata | Owner/lead authority + laporan aging |
| Change Manager | Process | Assessment risiko, jadwal, CAB, blackout, ECAB | **Sebagian**: melekat pada IT Lead | Capability + change calendar (P2) |
| CAB Member / Chair | Governance | Menilai perubahan berisiko tinggi | **Belum**: CAB = IT Lead kedua (`README.md:441`) | Komite dengan anggota bernama + quorum |
| Emergency CAB (ECAB) | Governance | Persetujuan perubahan darurat | **Belum** | Ikut desain change manager (P2) |
| Service Owner | Accountability | SLA, kualitas, improvement, escalation per layanan | **Sebagian**: `services.owner` hanya metadata | Fungsionalkan: baca/report/notify/review |
| Service Level Manager | Process | Negosiasi dan monitoring SLA/OLA | **Belum**: laporan milik lead | Service owner + report per layanan |
| Service Catalogue Manager | Process | Menjaga katalog tetap relevan | **Sebagian**: hanya IT Lead | Service owner dapat mengusulkan item |
| Knowledge Manager / Author / Reviewer | Process | Menulis, review, publish, retire artikel | **Sebagian**: staf menulis, lead publish; `reviewer` metadata | Reviewer/publisher delegation per domain |
| Asset / CI Manager & Custodian | Process | Register, verifikasi, reconciliation CI | **Sebagian**: semua staf CRUD; `owner` metadata | Asset manager/custodian + audit aset |
| Release / Deployment Manager | Process | Rilis, deployment, rollback | **Belum** | P2; change implementer + deployment checklist |
| Availability / Capacity Manager | Process | Ketersediaan, kapasitas, trend | **Belum** | P2; report + service owner |
| Supplier / Vendor Manager | Process | Kontrak, performa vendor, eskalasi | **Sebagian**: scope platform, tanpa manajemen kontrak | Vendor account manager (P2) |
| Security / Privacy Officer (DPO) | Governance | Data pasien, akses, audit, breach notification | **Belum** | `viewer` + CAB member; incident notification |
| Auditor / Compliance / Accreditation | Oversight | Bukti audit, laporan, kepatuhan | **Belum**: laporan/audit hanya lead | Role `viewer`/`auditor` read-only |
| Unit Admin / Clinical Super User / Champion | Hospital | Membantu unit, input atas nama, validasi hasil | **Sebagian**: `units.manager` | Relasi `units.admin`; on-behalf intake |
| Clinical Application Analyst / Informatics | Hospital | Jembatan klinik–SIMRS, UAT, KB klinis | **Belum** | `resolver` + service scope + KB |
| Dispatcher / Queue Coordinator | Resolver | Mengarahkan tiket ke antrean yang tepat | **Belum** | Team lead/queue role bila volume naik |
| On-call / Shift Lead | Resolver | Eskalasi di luar jam kerja | **Belum** | Jadwal/duty, bukan role |
| Continual Improvement Manager | Process | Register improvement, service review | **Belum**: PIR/laporan sudah ada | P2; owner register |

---

## 4. Temuan kunci

### 4.1 Risiko *role explosion*

ITSM memiliki banyak **process role** (incident manager, problem manager,
change manager, knowledge manager, service owner, asset manager, dst.) dan
banyak **job title** (programmer, DBA, network engineer, biomedical engineer,
clinical analyst). Jika semuanya dijadikan nilai `users.role`:

- rule PocketBase dan guard harus diubah di banyak tempat;
- kombinasi role × aksi × tenant × approval meledak;
- UI harus punya menu/queue untuk setiap role;
- test matrix bertambah untuk setiap role baru.

BMC menegaskan hal yang sama: *"Roles are often confused with job titles but it
is important to realize that they are not the same"* — satu orang bisa memegang
beberapa role, dan job title tidak sama dengan role
([BMC](https://dev.blogs.bmc.com/itil-itsm-roles-responsibilities/)).

### 4.2 "Resolver" adalah tier, bukan label

Di produk ITSM, *resolver* umumnya berarti orang yang menyelesaikan tiket
(agent). Di aplikasi ini, `it_support` sudah menjadi resolver. Yang belum ada
adalah **pemisahan tier**:

- **L1/generalist** — melihat antrean, triage, komunikasi, resolusi cepat.
- **L2/L3 specialist** — mengerjakan tiket yang ditugaskan, fokus teknis,
  tidak perlu mengelola antrean atau administrasi.
- **Vendor resolver** — scope platform, sudah ada.

Tanpa tier ini, semua spesialis harus menjadi `it_support` penuh, atau tidak
bisa ditugaskan sama sekali (karena assignee wajib staf).

### 4.3 Field owner/commander/reviewer belum menjadi otoritas

`services.owner`, `problems.owner`, `major_incidents.commander`,
`knowledge_articles.reviewer`, dan `assets.owner` sudah ada di schema, tetapi
sebagian besar hanya metadata:

- `services.owner` divalidasi satu tenant (`catalog.pb.js:24`), tetapi tidak
  memberi akses, notifikasi, atau laporan per layanan.
- `problems.owner` hanya relasi; siapa pun ber-role `it_support` bisa mengubah
  semua problem (`problems.pb.js:16`).
- `major_incidents.commander` hanya field; semua staf bisa mengubah status
  (`incidents.pb.js:40`).
- `knowledge_articles.reviewer` tidak dipakai untuk otorisasi; publish tetap
  `assertLead` (`knowledge.pb.js:283`).
- `assets.owner` hanya metadata; semua staf bisa CRUD aset
  (`assets.pb.js:16`).

Artinya, secara fungsional aplikasi ini **belum punya** service owner, problem
manager, incident commander, knowledge reviewer, atau asset custodian — baru
punya kolomnya.

### 4.4 Approval masih terkunci pada manajer unit dan IT Lead

Alur approval (`backend/pb_hooks/lib/approvals.js:43`) hanya mengenal:

- `unit_manager` — dari `units.manager`;
- `it_lead` — siapa pun ber-role `it_lead`;
- `cab` — IT Lead kedua untuk CR high risk.

Tidak ada cara memberi approval kepada:

- finance/anggaran untuk pembelian;
- pemilik akses/data untuk permintaan akses;
- security/privacy officer untuk perubahan yang menyentuh data pasien;
- service owner untuk perubahan pada layanannya.

Akibatnya, semua approval non-IT harus "dititipkan" ke IT Lead atau manajer
unit, yang tidak selalu tepat secara governance.

### 4.5 CAB belum menjadi komite

CAB saat ini = **IT Lead kedua** (`README.md:441-444`). Ini cukup untuk
four-eyes perubahan berisiko tinggi, tetapi bukan CAB yang sebenarnya, yang
biasanya melibatkan:

- change manager sebagai chair;
- perwakilan klinis (karena dampak ke layanan pasien);
- security/privacy;
- infrastruktur/jaringan;
- vendor/aplikasi;
- service owner.

Tanpa anggota bernama dan quorum, "CAB" tidak bisa menilai risiko klinis,
keamanan, dan kepatuhan secara memadai.

### 4.6 Tidak ada role read-only untuk oversight

Laporan dan audit hanya untuk `it_lead` (`reports.pb.js:17`, `team.pb.js:14`).
Padahal rumah sakit biasanya membutuhkan:

- manajemen (direktur/kabag) yang ingin melihat SLA/CSAT tanpa bisa mengubah;
- auditor internal / akreditasi (KARS/SNARS) yang butuh bukti;
- security/privacy officer yang perlu membaca audit trail.

Role `viewer`/`auditor` read-only adalah perubahan kecil dengan nilai besar.

### 4.7 Peran khas rumah sakit belum terwakili

Produk ini "digital hospital", tetapi model perannya masih generik IT:

- **Clinical Application Analyst / Informatics** — jembatan klinik dan SIMRS.
- **Unit Super User / Champion** — staf klinis yang membantu unitnya.
- **Biomedical Engineer** — resolver untuk alat medis, sekaligus custodian aset
  `medical_device`.
- **Security/Privacy Officer (DPO)** — perubahan data pasien, audit, breach.
- **Accreditation/Compliance Officer** — bukti audit dan laporan.

Ini bukan role ITIL murni, tetapi justru yang membuat produk relevan untuk
rumah sakit.

### 4.8 Team/queue (dulu tidak ada, sekarang sederhana)

Semua staf melihat semua tiket tenant. Sebelum P1 tidak ada tim Application,
Network, Hardware, Biomedical, antrean per tim, atau team lead. Sekarang
`users.team`, `services.team`, dan `tickets.team` sudah ada, sehingga tiket
bisa masuk antrean tim dan Teknisi dapat mengambil tiket timnya. Yang belum:
team lead/dispatcher dan skill/routing otomatis berdasarkan kategori.

---

## 5. Model yang direkomendasikan

### 5.1 Pisahkan dimensi berikut

| Dimensi | Field/mekanisme | Contoh | Dipakai untuk |
|---|---|---|---|
| **Access tier** | `users.role` | `requester`, `resolver`, `it_support`, `it_lead`, `viewer` | Boleh apa |
| **Job title** | `users.job_title` (baru) | `Programmer`, `DBA`, `Network Engineer`, `Biomedical Engineer`, `Clinical Analyst` | Tampilan, HR, reporting — **bukan** otorisasi |
| **Team** | `users.team` / `teams` (baru) | `Application`, `Network`, `Biomedical`, `Service Desk` | Routing, antrean, filter |
| **Duty** | Relasi | `services.owner`, `problems.owner`, `major_incidents.commander`, `assets.owner`, `knowledge_articles.reviewer`, `units.manager`, `units.admin` | Akuntabilitas per record |
| **Scope** | `tenant`, `is_platform_staff`, service/team relation | RS01, vendor, layanan SIMRS | Batas data |
| **Approval authority** | `service_items.approver`, `approval_policy`, `cab_members` | Finance, pemilik akses, CAB | Siapa yang harus menyetujui |

### 5.2 Pohon keputusan

Sebelum menambah role, tanyakan:

1. **Butuh aksi berbeda?** → tambah access tier/capability.
2. **Aksi sama, area berbeda?** → team/service scope, bukan role.
3. **Akuntabilitas sementara/per record?** → duty/relation.
4. **Hanya menyetujui?** → approver step, bukan role penuh.
5. **Hanya membaca?** → `viewer`, bukan `it_support`.
6. **Hanya label/jabatan?** → `job_title`, bukan role.

### 5.3 Usulan access tier

| Tier | Role value | Boleh | Tidak boleh | Untuk siapa |
|---|---|---|---|---|
| Consumer | `requester` | Buat tiket, lihat tiket sendiri, komentar publik, CSAT, reopen | Internal comment, triage, assign | Seluruh staf RS |
| Specialist resolver | `resolver` *(baru)* | Lihat tiket assigned + antrean tim; komentar internal; mulai/wait/resume/resolve; lihat aset terkait | Triage, assign orang lain, close, CRUD aset/problem, laporan, settings | Programmer, DBA, network, biomedical, clinical analyst, vendor engineer |
| General agent | `it_support` | Semua tiket tenant, triage, assign diri, close, aset, problem, KB draft, insiden mayor | Assign orang lain, approve, publish KB, laporan, tim, settings | Service desk L1/L2 |
| Process owner/admin | `it_lead` | Semua + assign siapa pun, approve, publish KB, laporan, tim, settings, branding | Superuser | IT Manager/Lead |
| Oversight | `viewer` | Baca laporan, audit, dan CSAT agregat; tidak membuka tiket | Semua tulis | Manajemen, auditor, akreditasi, DPO |
| Vendor support | `is_platform_staff` + `it_support` | Kerja tiket lintas RS, konsol baca | Tulis konsol, buat tiket | Vendor support |
| Vendor admin | `is_platform_staff` + `it_lead` | Lintas RS + tulis konsol + laporan/audit | Settings tenant | Vendor lead |

Catatan: `it_support` tidak perlu di-rename menjadi `agent`; cukup label UI
**"Staff IT"** agar migrasi dan test lama tetap aman. Label Indonesia yang
disarankan: `requester` = **Pemohon**, `resolver` = **Teknisi**,
`it_support` = **Staff IT**, `it_lead` = **Kepala IT**, `viewer` = **Pengamat**.

---

## 6. Rekomendasi prioritas

| Prioritas | Peran/perubahan | Tipe | Masalah yang diselesaikan | Effort | Risiko |
|---|---|---|---|---|---|
| **P0** | `resolver` | Access tier baru | Programmer/spesialis bisa ditugaskan tanpa jadi agent penuh | Sedang | Sedang (menyentuh rule, guard, UI, test) |
| **P0** | `viewer`/`auditor` | Access tier baru | Manajemen/auditor/DPO bisa membaca tanpa menulis | Kecil | Rendah |
| **P0** | Approver independen | Duty/approval step | Finance/akses/security bisa menyetujui tanpa jadi IT Lead | Sedang | Sedang |
| **P0** | `job_title` + `team` | Metadata + routing | Spesialis bisa dibedakan dan dirutekan | Kecil–sedang | Rendah |
| **P1** | Service owner fungsional | Duty | SLA/kualitas layanan punya pemilik | Sedang | Rendah–sedang |
| **P1** | Problem manager | Duty + capability | Problem tidak dikelola siapa pun secara khusus | Kecil–sedang | Rendah |
| **P1** | Incident commander | Duty + capability | Insiden besar punya otoritas jelas | Kecil–sedang | Rendah |
| **P1** | Knowledge reviewer/publisher | Duty | Review artikel tidak menumpuk di IT Lead | Kecil | Rendah |
| **P1** | Asset/CI custodian | Duty + capability | Aset punya penanggung jawab | Kecil–sedang | Rendah |
| **P1** | Unit admin/clinical super user | Duty | Unit bisa input atas nama dan memantau tiketnya | Sedang | Sedang |
| **P2** | CAB committee + change manager | Governance | Perubahan berisiko dinilai klinis/security/finance | Besar | Sedang–tinggi |
| **P2** | Team/group + dispatcher | Routing | Antrean dan assignment per tim | Besar | Sedang |
| **P2** | Security/privacy officer | Governance/oversight | Kepatuhan data pasien | Sedang | Rendah |
| **P2** | Release/capacity/supplier/CI manager | Process | Kematangan ITSM lanjutan | Besar | Rendah–sedang |

### 6.1 P0 — `resolver`

**Tujuan:** memberi jalur untuk spesialis (programmer, DBA, network, biomedical,
clinical analyst) agar bisa ditugaskan dan bekerja, tanpa memberi seluruh
kekuatan agent.

**Capability yang disarankan:**

| Aksi | `resolver` | Alasan |
|---|---|---|
| Lihat tiket assigned | ya | Fokus kerja |
| Lihat antrean tim | ya (jika `team` diisi) | Bisa mengambil pekerjaan tim |
| Lihat semua tiket tenant | tidak | Bukan agent penuh |
| Komentar publik/internal | ya (pada tiket yang bisa diakses) | Kolaborasi teknis |
| Lampiran internal | ya (pada tiket yang bisa diakses) | Bukti teknis |
| Mulai / waiting / resume | ya (tiket assigned) | Alur kerja |
| Resolve | ya (tiket assigned, wajib ringkasan + kode) | Menyelesaikan pekerjaan |
| Close | tidak | Close tetap agent/lead |
| Assign ke diri sendiri | ya (klaim dari antrean tim) | Mengambil tiket |
| Assign ke orang lain | tidak | Bukan dispatcher |
| Triage | tidak | Bukan service desk |
| CRUD aset/problem/KB | tidak (baca saja) | Bukan process owner |
| Insiden mayor | baca + komentar; deklarasi/ubah tidak | Eskalasi ke agent/lead |
| Laporan/settings/tim | tidak | Bukan admin |

**Pemetaan programmer:**

```
role      = resolver
job_title = Programmer
team      = Application
service   = SIMRS / Antrean / Bridging (scope pekerjaan)
```

Dengan model ini, "programmer" terlihat di profil dan tim, bisa ditugaskan,
tetapi tidak otomatis mendapat akses seluruh tenant.

**Jalur tercepat** jika tujuannya hanya "programmer bisa ditugaskan":

1. Tambah nilai `resolver` pada `users.role`.
2. Izinkan `resolver` sebagai assignee (`ticket_actions.pb.js:83`).
3. Beri akses baca tiket yang di-assign — rule tiket sudah punya cabang
   `assignee = @request.auth.id`, jadi tidak perlu rule baru untuk kasus dasar.
4. `job_title` dan `team` (antrean) sudah ditambahkan.
5. Triage/close/aset/problem tetap milik agent dan lead.

Alternatif arsitektur: `resolver` sebagai flag `is_resolver` orthogonal
terhadap role. Ini menghindari perubahan enum, tetapi lebih sulit untuk filter,
reporting, dan UI tim. Pilih salah satu, jangan dua-duanya.

### 6.2 P0 — `viewer`/`auditor`

**Tujuan:** memberi akses baca untuk pihak yang tidak boleh menulis.

- **Manajemen** — dashboard SLA/CSAT per layanan/unit.
- **Auditor/akreditasi** — audit trail, tiket, bukti PIR.
- **DPO/security** — audit akses dan perubahan data pasien.

**Cakupan yang sudah tersedia:**

- Laporan SLA/operasional (read-only) — **selesai**.
- Audit tenant (read-only) lewat `/api/itsm/audit` dan menu **Audit** —
  **selesai**.
- CSAT agregat melalui laporan operasional — **selesai**.
- Daftar/detail tiket read-only — **belum** (sengaja; Pengamat tidak membuka
  tiket).

**Jangan** memberi `viewer` akses tulis apa pun, termasuk komentar, agar tidak
menjadi "agent bayangan".

### 6.3 P0 — Approver independen

**Tujuan:** approval tidak selalu harus manajer unit atau IT Lead.

Opsi yang disarankan (bertahap):

1. **Satu approver per service item** — tambah `service_items.approver`
   (relasi user) dan `approval_mode = approver`. Planner membuat satu tahap
   `service_approver` dengan approver tersebut.
2. **Approver per layanan sebagai fallback** — `services.approver`, dipakai
   bila item tidak punya approver.
3. **Approval group** (P2) — untuk kasus beberapa approver (mis. Komite
   Keamanan) dengan quorum.

Contoh:

| Permintaan | Approver |
|---|---|
| Pembelian lisensi/alat | Finance/Procurement |
| Akses data pasien | Pemilik data / Security/Privacy Officer |
| Perubahan SIMRS berisiko tinggi | Service owner + CAB |
| Permintaan rutin | `none` |

### 6.4 `job_title` + `team` (enabler) — sudah diimplementasikan

- `users.job_title` — teks bebas dengan saran `Programmer`, `Teknisi Jaringan`,
  `DBA`, `Admin SIMRS`, `Teknisi Alat Kesehatan`, dll.
- `users.team` — select: `service_desk`, `application`, `network`, `hardware`,
  `database`, `biomedical`, `other`.
- `services.team` — tim default layanan; tiket baru mewarisi nilai ini.
- `tickets.team` — antrean tim tiket; dapat dikoreksi lewat triage.
- Teknisi melihat tiket timnya dan menekan **Ambil tiket** untuk menjadi
  assignee. Komentar/lampiran internal baru terlihat setelah diambil.
- Belum: koleksi `teams`, team lead/dispatcher, multi-tim per user, dan skill.

---

## 7. Detail P1

### 7.1 Service owner fungsional

`services.owner` sudah ada. Jadikan:

- penerima notifikasi SLA breach/escalation untuk layanannya;
- pembaca laporan per layanan (SLA, CSAT, insiden, problem);
- reviewer KB untuk layanan tersebut (bisa digabung dengan knowledge reviewer);
- konsultan wajib untuk perubahan berisiko pada layanan (CAB/approval);
- pemilik problem aging dan repeat incident untuk layanannya.

Batasan: service owner **bukan** otomatis approver semua tiket layanan; ia
adalah pemilik kualitas layanan. Approval tetap mengikuti `approval_mode`.

### 7.2 Problem manager

- `problems.owner` menjadi problem manager untuk problem tersebut.
- Hanya owner atau `it_lead` yang boleh:
  - mengubah status ke `known_error`, `resolved`, `closed`;
  - menetapkan permanent fix;
  - menutup problem.
- Staf lain boleh membuat problem dan menambahkan analisis.
- Notifikasi ke owner saat problem baru/aging.
- Laporan problem aging dan repeat incident rate (sudah ada di backlog
  `README.md:1294`).

### 7.3 Incident commander

- `major_incidents.commander` menjadi otoritas:
  - hanya commander atau `it_lead` yang boleh mengubah status/severity/PIR;
  - staf lain boleh menambah update dan menautkan tiket.
- Commander default = pembuat, tetapi bisa ditunjuk.
- Fase berikutnya: on-call schedule dan escalation policy.

### 7.4 Knowledge reviewer/publisher

- `knowledge_articles.reviewer` menjadi reviewer untuk artikel tersebut.
- Reviewer dapat memindahkan `review → published` untuk artikel internal pada
  domain/layanannya; `it_lead` tetap bisa publish semua.
- Artikel publik tetap butuh `it_lead` atau knowledge manager.
- Ini mengurangi bottleneck publish di IT Lead.

### 7.5 Asset/CI custodian

- `assets.owner` menjadi custodian:
  - hanya custodian, asset manager, atau `it_lead` yang boleh mengubah aset;
  - staf lain boleh membaca dan menautkan aset ke tiket.
- Tambah laporan aset tanpa owner, aset tanpa tiket, dan aset dengan insiden
  berulang.
- Biomedical engineer bisa menjadi custodian untuk `medical_device`.

### 7.6 Unit admin / clinical super user

- Relasi baru `units.admin` (atau `units.champion`) di luar `manager`.
- Boleh:
  - membuat tiket atas nama staf unitnya;
  - melihat tiket unitnya (read-only);
  - membantu requester memahami status;
  - memberi konfirmasi resolusi (bukan mengubah status IT).
- Tidak boleh: triage, assign, close, melihat tiket unit lain.
- Ini peran yang sangat khas rumah sakit dan sering lebih berguna daripada
  menambah role "programmer".

---

## 8. Detail P2

### 8.1 CAB committee + change manager

Desain yang disarankan:

- Koleksi `cab_members`: `tenant`, `user`, `role` (`chair/member`),
  `is_active`.
- Tahap approval `cab` menjadi **quorum** (mis. minimal 3 anggota, salah
  satunya chair), bukan "IT Lead kedua".
- `change_manager` (capability/role) mengelola:
  - change calendar dan blackout window (jam poli, jam visite);
  - emergency change (ECAB);
  - PIR perubahan.
- CAB member bisa berasal dari klinis, security, infrastruktur, vendor, dan
  service owner.

Ini perubahan besar karena model approval saat ini sequential dan satu
approver per step. Perlu desain vote/quorum dan UI stepper.

### 8.2 Team/group + dispatcher

- `teams` + `team_members` + `tickets.team`.
- Team lead dapat:
  - melihat antrean tim;
  - assign dalam tim;
  - menjadi dispatcher.
- Resolver melihat antrean tim + tiket assigned.
- Agent/lead tetap melihat seluruh tenant.
- Fase berikutnya: skill/routing berdasarkan layanan, kategori, atau aset.

### 8.3 Security/privacy officer

- Role `viewer` + CAB member.
- Akses audit, laporan, dan insiden yang menyentuh data pasien.
- Approver untuk perubahan yang menyentuh data pasien (via approver
  independen).
- Notifikasi untuk insiden keamanan/data breach.

### 8.4 Release/capacity/supplier/continual improvement

Belum perlu role penuh sampai volume dan prosesnya ada. Untuk sementara:

- release/deployment → change implementer + checklist di tiket change;
- capacity/availability → laporan + service owner;
- supplier → vendor account manager di scope platform;
- continual improvement → PIR + register improvement (backlog).

---

## 9. Dampak implementasi teknis (P0 `resolver`)

| Area | File | Perubahan | Risiko |
|---|---|---|---|
| Schema | migrasi baru | Tambah nilai `resolver` ke `users.role`; `job_title`; `team`; `tickets.team` | Select value harus cocok dengan rule |
| Guard | `backend/pb_hooks/lib/guards.js` | `isResolver`, `assertResolver`, update `canAccessTicket` | Jangan longgarkan akses tiket |
| Konstanta | `backend/pb_hooks/lib/constants.js` | Pisahkan `AGENT_ROLES` dan `RESOLVER_ROLES` | Banyak modul memakai `STAFF_ROLES` |
| Assignee | `backend/pb_hooks/ticket_actions.pb.js` | Assignee boleh `resolver`; gate resolve/wait/resume; close tetap agent/lead | Jangan izinkan resolver assign orang lain |
| Komentar/lampiran | `comments.pb.js`, `attachments.pb.js` | Internal comment/lampiran boleh untuk resolver pada tiket yang bisa diakses | Cek `assertTicketAccess` dulu |
| Rule | migrasi rule baru | Tiket read: assigned + team; komentar/lampiran internal: resolver; antrean tim | Rule relation `team` harus diuji |
| Frontend | `frontend/src/lib/permissions.js` | `isResolver`, `canResolve`, `canTriage`, `canAssign`, `canClose`, `canViewReports` | Ganti pengecekan ad-hoc `isStaff` |
| UI | `TeamTab.jsx`, `PlatformPage.jsx` | Opsi role `resolver`; field `job_title`/`team` | Validasi server harus sama |
| UI | `AppShell.jsx`, `TicketDetailPage.jsx`, `DashboardPage.jsx`, `TicketListPage.jsx` | Sembunyikan menu/aksi yang tidak boleh; tambah antrean "Tiket saya"/"Tim saya" | Aksi harus dicek server, bukan hanya UI |
| Test | `tests/unit/guards.test.mjs`, `tests/api/auth-rbac.test.mjs`, `ticket-flow`, `team`, `platform*` | Matriks resolver vs agent vs lead vs requester | Test lama mengasumsikan 2 role staf |
| Docs | `README.md`, `docs/DATA-MODEL.md`, `docs/ITSM-ROADMAP.md` | Update role matrix dan schema | Jangan biarkan dokumen drift |

**Prinsip migrasi:** tambah kolom/nilai dulu, backfill, baru jadikan wajib.
Jangan mengedit migrasi yang sudah diterapkan (`docs/ITSM-ROADMAP.md:181`).

Catatan: `STAFF_ROLES` saat ini diduplikasi di `lib/guards.js`,
`lib/constants.js`, `incidents.pb.js`, `ticket_actions.pb.js`, dan
`main.pb.js`. Sebelum menambah `resolver`, satukan daftar role di satu modul
agar tidak ada cabang yang tertinggal.

---

## 10. Yang sebaiknya tidak dilakukan

1. **Jangan tambah role `programmer`, `dba`, `network_engineer`, dst.**
   Itu job title. Gunakan `resolver` + `job_title` + `team`.
2. **Jangan buat `resolver` yang identik dengan `it_support`.**
   Kalau capability-nya sama, tidak ada manfaat; hanya menambah test matrix.
3. **Jangan jadikan CAB sebagai role.**
   CAB adalah komite dengan anggota, chair, dan quorum, bukan satu nilai role.
4. **Jangan campur senioritas dengan akses.**
   "Senior programmer" bukan role akses; gunakan `job_title`/grade.
5. **Jangan buat role tanpa "rumah" di UI.**
   Setiap role harus punya menu, antrean/dashboard, notifikasi, dan laporan.
   Role tanpa UI akan menjadi data graveyard.
6. **Jangan taruh otorisasi di frontend saja.**
   Semua pembatasan tetap harus ditegakkan di route/rule.
7. **Jangan beri `viewer` akses tulis.**
   Sekali diberi komentar, ia menjadi agent bayangan.

---

## 11. Keputusan yang perlu diambil

1. Apakah `resolver` hanya melihat tiket assigned, atau juga antrean tim?
   (Disarankan: assigned + tim.)
2. Apakah `resolver` boleh close, atau hanya resolve?
   (Disarankan: resolve saja; close oleh agent/lead.)
3. Satu user satu tim, atau multi-tim?
   (Disarankan: satu tim dulu; multi-tim menyusul.)
4. Siapa yang boleh menjadi service owner: staf IT saja, atau juga manajemen/
   klinisi? (Disarankan: pengguna aktif tenant mana pun, dengan scope baca
   layanan.)
5. Apakah `viewer` boleh membuka detail tiket dan komentar internal?
   (Disarankan: laporan/audit dulu; detail tiket setelah review privasi.)
6. Approver independen: per service item, per layanan, atau approval group?
   (Disarankan: per item + fallback layanan; group di P2.)
7. Komposisi dan quorum CAB?
   (Disarankan: chair + 3–5 anggota; quorum 3, termasuk chair.)
8. Apakah `it_support` perlu di-rename menjadi `agent`?
   (Disarankan: tidak; cukup label UI.)

---

## 12. Referensi

- [BMC — ITIL & ITSM Roles and Responsibilities](https://dev.blogs.bmc.com/itil-itsm-roles-responsibilities/)
  — perbedaan role vs job title, daftar process role.
- [Giva — ITIL 4 Roles and Responsibilities](https://www.givainc.com/blog/itil-roles-and-responsibilities-best-practices/)
  — incident manager, problem manager, change manager, service owner, practice
  owner/manager.
- [Freshservice — Default Agent Roles](https://support.freshservice.com/support/solutions/articles/156468/)
  — contoh pemisahan requester/agent/supervisor/admin di produk ITSM.
- Repo: [`README.md`](../README.md), [`docs/DATA-MODEL.md`](DATA-MODEL.md),
  [`docs/ITSM-ROADMAP.md`](./ITSM-ROADMAP.md).
