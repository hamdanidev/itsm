# Analisis Gap — Healthcare ITSM vs Kompetitor Lokal Indonesia

- **Status:** analisis produk & pasar, bukan rencana implementasi. Tidak ada kode yang diubah.
- **Tanggal:** 4 November 2026.
- **Ruang lingkup:** hanya produk dan penyedia **Indonesia**. Platform global (dan resellernya di Indonesia) sengaja dikeluarkan sesuai arahan.
- **Basis produk kita:** `README.md`, `docs/ITSM-ROADMAP.md`, `docs/ITSM-ROLES.md`, dan pembacaan kode `backend/pb_hooks`, `backend/pb_migrations`, `frontend/src/app/router.jsx`.
- **Basis kompetitor:** halaman produk/harga publik, artikel vendor, dan satu paper akademik. Tidak ada demo account, RFP, atau wawancara pembeli. Skor di dokumen ini **penilaian kualitatif**, bukan benchmark.

---

## 1. Kesimpulan (baca 60 detik)

1. **Tidak ada kompetitor lokal yang benar-benar "ITSM rumah sakit".** Yang ada empat jenis: helpdesk/ESM generik (Integra, NISSA), omnichannel customer service (Qontak, Qiscus), ALM/ticketing (Oprex), dan proyek custom/SI.
2. **Kita menang di kedalaman proses.** Problem/known error, change + CAB empat mata, major incident + PIR, audit append-only, approval berjenjang + delegasi, dan konsol vendor lintas RS tidak dimiliki pemain lokal yang saya temukan.
3. **Kita kalah di lapisan adopsi.** Kanal masuk WhatsApp/email/Telegram, SSO/LDAP, formulir dinamis, auto-assignment, pengingat pra-SLA, PDF, API/webhook, mobile, dan AI/chatbot — semuanya sudah dipasarkan kompetitor lokal, semuanya belum ada di kita.
4. **Hasil dua ujian berbeda.** Dengan bobot "adopsi", kita peringkat 3 (skor 2,94) di bawah Qontak/Qiscus (3,53) dan Integra (3,17), hanya unggul tipis dari NISSA (2,93). Dengan bobot "ITIL-first", kita peringkat 1 (3,62) di atas Integra (3,03). **Pembeli RS umumnya memberi ujian adopsi, bukan ujian ITIL.**
5. **Deal-breaker-nya bukan fitur ITIL.** Tiga hal: **WhatsApp-first intake**, **SSO + bulk import**, dan **AI/self-service**. Dua silent killer: **paket implementasi** dan **bukti/referensi/harga**.
6. **Rekomendasi arah:** menangkan ceruk RS tipe B/C dengan positioning "ITSM yang siap audit + WhatsApp-first", bangun lapisan adopsi sebelum menambah modul ITIL, dan jual lewat kanal SI/SIMRS partner. Jangan mengejar Qontak/Qiscus di omnichannel CX.

**Satu kalimat:** kita punya mesin ITIL yang dalam, tetapi belum punya pintu masuk yang dipakai orang Indonesia (WhatsApp), kunci identitas yang dipakai RS (AD/SSO), dan otak AI yang sudah dijanjikan kompetitor.

---

## 2. Metode dan batasan

Yang dinilai: kapabilitas yang terlihat di materi publik, positioning, dan kelengkapan "jalur adopsi" (kanal masuk, identitas, implementasi, bukti).

Yang **tidak** dinilai: harga riil setelah diskon, kualitas implementasi, retensi pelanggan, arsitektur internal, dan keamanan sebenarnya. Catatan: hampir semua pemain lokal tidak mempublikasikan harga; angka harga di dokumen ini hanya untuk Oprex yang memang publik.

Skor memakai skala 1–5 per dimensi dengan dua pembobotan berbeda (Bagian 7) untuk menunjukkan bahwa hasilnya sangat bergantung pada kriteria evaluasi pembeli.

---

## 3. Peta kompetitor Indonesia

| Pemain | Kategori | Kekuatan utama (publik) | Kelemahan untuk pasar ITSM RS | Ancaman bagi kita |
|---|---|---|---|---|
| **Integra Help Desk** (PT Integra Indonesia) | Platform layanan internal / ESM | Katalog + **formulir dinamis per layanan**, workflow & approval dapat dikonfigurasi, SLA jam kerja + **pengingat sebelum breach** + eskalasi, KB + self-service, **WhatsApp/Telegram**, **SSO/LDAP**, API, RBAC + audit trail, CSAT, **ekspor Excel/PDF**, multi-unit (IT, GA, HR, Finance, Procurement) | Tidak terlihat problem management, change/CAB, CMDB, major incident/PIR; bukan multi-tenant RS; tidak ada konsol vendor | **Tinggi.** Fitur adopsinya paling lengkap di antara pemain lokal, dan positioning "satu platform semua unit" bisa masuk lewat GA/HR lalu mengambil IT. |
| **NISSA** (PT Neuronworks Indonesia) | Helpdesk/ticketing + chatbot | **Chatbot 24/7** yang bisa membuat tiket, **integrasi Telegram & email**, SLA, workflow, analitik, otomatisasi, demo/trial | Dangkal untuk ITIL; bukan khusus RS; tidak ada aset/change/CMDB | **Sedang.** Menang di harga, kecepatan, dan kemudahan; sering jadi opsi "murah dan cepat". |
| **Mekari Qontak** | Omnichannel CRM + helpdesk | WhatsApp API, banyak kanal, ticketing, otomatisasi, brand lokal dan integrasi CRM | Berorientasi customer service, bukan operasi IT; tidak ada change/aset/audit IT | **Sedang–tinggi** untuk anggaran "helpdesk"; rendah untuk evaluasi ITIL. |
| **Qiscus Helpdesk** | Omnichannel + helpdesk + AI | 20+ kanal, **AI Agent & Agent Copilot**, KB dengan **pencarian AI**, otomatisasi assignment/eskalasi/follow-up, **API & webhook**, CSAT, skala enterprise, badge sertifikasi BSI/Meta, klien besar (Indosat, Halodoc, Bank Raya, SeaBank) | Customer experience, bukan ITSM; biaya WhatsApp per pesan; implementasi channel butuh setup | **Tinggi** untuk narasi "AI + WhatsApp"; rendah untuk kedalaman ITIL. |
| **Oprex** (Kinexa) | ALM/SDLC + helpdesk | AI native, **harga rupiah transparan + free tier**, server di Indonesia + narasi UU PDP, REST/OAuth, MCP, tiket + KB + issue + test + release | Bukan ITSM RS; tidak ada SLA ITIL/aset/change; masih public beta | **Rendah–sedang.** Lebih relevan untuk tim developer, bukan IT RS. Tapi ia menetapkan ekspektasi harga & AI di pasar lokal. |
| **SI / custom build** (mis. Mandiri Bahari Teknologi) | Proyek pengembangan | Disesuaikan, bisa integrasi SIMRS, harga proyek, hubungan lokal | Tidak ada produk matang; maintenance, audit, SLA, dan keberlanjutan bergantung vendor | **Tinggi.** "Buat sendiri" sering dianggap lebih murah dan fleksibel, terutama jika ada programmer internal. |
| **Status quo** | WhatsApp grup + Excel + support vendor SIMRS | Familiar, gratis, cepat | Tidak ada SLA, audit, riwayat, eskalasi, atau metrik | **Paling tinggi.** Mayoritas calon pembeli ada di sini; ini perlu divalidasi, bukan diasumsikan. |

**Temuan penting:** tidak ada pemain lokal yang memposisikan diri sebagai **ITSM khusus rumah sakit**. Integra paling dekat, tetapi generik. Artinya, kompetitor langsung kita bukan produk, melainkan **kebiasaan** dan **proyek custom**.

---

## 4. Di mana kita sudah menang

| Kapabilitas | Kita | Kompetitor lokal terdekat | Arti bagi pembeli RS |
|---|---|---|---|
| Problem management + known error/workaround | Ada, terhubung ke tiket dan KB | Tidak ditemukan | Mencegah insiden berulang, bahan audit mutu |
| Change + CAB empat mata + delegasi approver | Ada, dengan tenggat per tahap | Tidak ditemukan (Integra hanya approval umum) | Perubahan SIMRS/jaringan punya jejak dan persetujuan |
| Major incident + komandan + PIR wajib | Ada | Tidak ditemukan | Gangguan besar tidak ditangani sebagai puluhan tiket lepas |
| Audit append-only + timeline proyeksi | Ada, API tulis ditolak | Integra punya audit trail; kita lebih dalam | Siap audit internal/akreditasi |
| Multi-tenant + konsol vendor lintas RS | Ada | Tidak ditemukan | Model bisnis vendor/SI, bukan hanya satu RS |
| SLA jam kerja, hari libur, pause, reopen, eskalasi berjenjang | Ada | Integra punya SLA + eskalasi; kita punya pause/reopen | Klaim SLA bisa dipertahankan saat rapat |
| Kepatuhan data pasien (attestation, lampiran terproteksi) | Ada | Tidak ditemukan | Mengurangi risiko UU PDP |
| On-prem / data di RS | Ada (SQLite satu file) | Integra/Qontak/Qiscus SaaS; Oprex SaaS + on-prem enterprise | Argumen data residency yang kuat |
| Katalog layanan + approval mode per item | Ada | Integra punya katalog + form dinamis | Permintaan rutin tidak birokratis |

Kekuatan ini nyata, tetapi **belum menjadi kriteria pembelian** di sebagian besar RS. Itu masalah positioning, bukan masalah fitur.

---

## 5. Gap table (inti analisis)

Severity: **P0** = menghambat kemenangan deal/ adopsi; **P1** = mempersempit gap dalam 2–4 kuartal; **P2** = diferensiasi/pertahanan 4–12 bulan.

### A. Kanal masuk dan adopsi

| # | Kapabilitas | Kita | Bukti kompetitor lokal | Dampak | Severity |
|---|---|---|---|---|---|
| A1 | Intake WhatsApp | Hanya **mencatat label** sumber `whatsapp`; pesan tetap masuk lewat portal | Integra (WhatsApp), NISSA (Telegram/email), Qiscus/Qontak (WhatsApp API) | Staf RS hidup di WhatsApp; jika harus buka portal, tiket tidak dibuat | **P0** |
| A2 | Email-in (IMAP/forwarding) | Email hanya keluar (notifikasi) | NISSA: integrasi email; Integra: pengajuan multi-kanal | Keluhan dari unit sering lewat email grup | **P0** |
| A3 | Telegram/chat channel | Tidak ada | NISSA, Integra | Kanal murah yang sudah dipakai tim IT | P1 |
| A4 | Formulir dinamis per layanan/item | Form tetap; katalog hanya dropdown | Integra: "formulir dinamis tiap jenis layanan" | Permintaan akses, perangkat, dan aplikasi butuh field berbeda | **P0** |
| A5 | Auto-assignment berbasis kategori/unit/beban | Manual assign / teknisi "ambil tiket" | Integra: auto-assignment ke unit/PIC | Tiket menumpuk di antrean tanpa pemilik | P1 |
| A6 | Merge tiket duplikat | Hanya tautkan ke problem | Integra: penggabungan tiket duplikat | Satu gangguan SIMRS menjadi 30 tiket | P1 |
| A7 | Pengingat sebelum SLA breach | Hanya scan saat sudah breach | Integra: pengingat sebelum SLA terlampaui | Tim baru bereaksi setelah terlambat | P1 |
| A8 | Bulk import pengguna (CSV/AD sync) | Tambah anggota satu per satu | Umumnya onboarding dibantu vendor/SSO | RS 500–2.000 staf tidak akan input manual | **P0** |
| A9 | Mobile app / PWA + push | Web responsif, tanpa manifest/PWA | Qontak punya mobile app; Qiscus menyediakan SDK in-app chat | Perawat/dokter butuh 2 klik dari ponsel | P1 |

### B. Identitas, integrasi, dan otomasi

| # | Kapabilitas | Kita | Bukti kompetitor lokal | Dampak | Severity |
|---|---|---|---|---|---|
| B1 | SSO SAML/OIDC + LDAP/AD | Tidak ada | Integra: SSO & LDAP | Kebijakan keamanan RS dan offboarding staf | **P0** |
| B2 | 2FA / kebijakan sesi / IP allowlist | Tidak ada | Tidak terlihat di materi publik lokal; umumnya jadi syarat procurement | Akun IT memegang akses SIMRS | P1 |
| B3 | API key + webhook publik | Hanya REST internal/PocketBase | Integra API; Qiscus API & webhook | Integrasi SIMRS, monitoring, HRIS | P1 |
| B4 | Integrasi monitoring/SIMRS (auto-ticket) | Tidak ada | Tidak ada juga di kompetitor lokal; SI custom bisa | Diferensiasi besar jika SIMRS down otomatis jadi tiket | P1 |
| B5 | AI chatbot/deflection | Tidak ada | NISSA chatbot 24/7; Qiscus AI Agent | Beban helpdesk turun; ekspektasi RFP 2026 | **P0** |
| B6 | Pencarian KB semantik/AI | Pencarian kata kunci | Qiscus: KB dengan pencarian AI | Artikel tidak ditemukan saat dibutuhkan | P1 |
| B7 | Ringkasan/triage tiket dengan AI | Tidak ada | Qiscus Agent Copilot; Oprex AI assistant | Waktu agen habis untuk membaca riwayat | P2 |
| B8 | Workflow builder yang dapat dikonfigurasi | Alur hardcoded (status, approval mode) | Integra: workflow dapat dikonfigurasi | Setiap RS punya SOP berbeda | P1 |

### C. Kelengkapan proses dan operasi RS

| # | Kapabilitas | Kita | Bukti kompetitor lokal | Dampak | Severity |
|---|---|---|---|---|---|
| C1 | Change calendar, blackout window, emergency change | Belum ada (backlog) | Tidak ditemukan di kompetitor lokal | Perubahan saat jam poli berisiko | P1 |
| C2 | OLA/UC (target antar tim & vendor) | Belum ada | Tidak ditemukan | SLA internal tidak terukur | P2 |
| C3 | CMDB dependency/impact graph | `service_cis` datar, tanpa relasi | Tidak ditemukan | Tidak bisa menjawab "kalau server ini mati, layanan apa terdampak" | P1 |
| C4 | Lifecycle aset: QR/barcode, stok, lisensi, maintenance/kalibrasi alkes | Register datar + warranty_end | Tidak ditemukan di produk lokal yang disurvei | Alkes/IPSRS adalah kebutuhan RS yang belum dilayani siapa pun | P1 |
| C5 | KB versioning + review multi-approver | Belum ada | Tidak ditemukan | SOP berubah, versi lama tetap beredar | P2 |
| C6 | Survei CSAT/NPS yang dapat dikonfigurasi | CSAT 1 respons per tiket | Integra CSAT; Qiscus Survey | Umpan balik unit terbatas | P2 |
| C7 | Public status page | Tidak ada | Oprex: statuspage sebagai bagian platform | Komunikasi downtime ke unit/pasien | P2 |
| C8 | ESM multi-unit (GA, HR, Finance, Biomed) | Katalog, unit, dan approval bisa dipakai umum, tetapi peran, laporan, dan positioning diarahkan ke IT | Integra: multi-unit eksplisit | Bisa memperbesar anggaran, tetapi juga mengaburkan fokus | P1 |

### D. Enterprise, laporan, dan UX

| # | Kapabilitas | Kita | Bukti kompetitor lokal | Dampak | Severity |
|---|---|---|---|---|---|
| D1 | HA/scalability (bukan SQLite satu instance) | Satu instance, SQLite, tanpa replika/queue | SaaS terkelola (Qontak/Qiscus) dan arsitektur vendor | RS besar/multi-cabang berisiko | P1 |
| D2 | Backup off-host terenkripsi + uji restore | Backup harian lokal, off-host manual | SaaS: tanggung jawab vendor | Syarat audit dan UU PDP | P1 |
| D3 | ISO 27001 / paket UU PDP (DPA, retensi, breach notice) | Belum ada | Qiscus menampilkan badge sertifikasi; Oprex menarasikan UU PDP + server Indonesia | Gate procurement enterprise | **P0 (komersial)** |
| D4 | Ekspor PDF + laporan terjadwal | CSV saja | Integra: Excel/PDF | Laporan ke direksi/Komite Mutu butuh PDF | P1 |
| D5 | Dashboard/report builder kustom | Halaman laporan tetap | Integra dashboard per unit; Qiscus analytics | Pertanyaan "bisa tambah kolom ini?" | P2 |
| D6 | Internasionalisasi/aksesibilitas | Bahasa Indonesia saja | ID/EN (Qiscus, Oprex) | RS dengan staf asing/ekspatriat | P2 |

---

## 6. Tiga deal-breaker dan dua silent killer

### Deal-breaker

**1. WhatsApp-first intake.** Ini bukan fitur kanal; ini faktor apakah tiket dibuat atau tidak. Kompetitor lokal sudah membuktikan bahwa WhatsApp/Telegram/email adalah kanal utama. Kita hanya menyimpan label "whatsapp" — secara operasional tetap meminta pelapor membuka portal. Untuk perawat di jam sibuk, itu berarti tidak ada tiket.

**2. SSO + bulk import.** RS dengan 500–2.000 staf tidak akan membuat akun satu per satu. AD/LDAP juga syarat keamanan dan offboarding. Tanpa ini, implementasi berhenti di tahap provisioning, apa pun kualitas fitur ITIL kita.

**3. AI/self-service.** Di 2026, NISSA memasarkan chatbot 24/7, Qiscus AI Agent + Copilot, Oprex AI assistant. Pembeli akan bertanya "AI-nya di mana?". Tanpa AI, kita terlihat seperti aplikasi 2020 — meskipun proses kita lebih benar. AI juga satu-satunya cara tim IT 3–8 orang bertahan terhadap volume tiket.

### Silent killer

**4. Paket implementasi dan migrasi data.** Kompetitor menawarkan demo, trial, onboarding, dan (untuk SaaS) setup channel. Kita belum punya paket implementasi: seed data master, migrasi pengguna, pelatihan, dan pendampingan 30 hari. Pembeli RS tidak membeli lisensi; mereka membeli "beres".

**5. Bukti, harga, dan referensi.** Tidak ada halaman harga, trial, studi kasus, atau logo pelanggan. Integra punya testimoni; Qiscus punya logo perusahaan besar; Oprex punya free tier dan harga rupiah. Tanpa bukti, pembeli memilih merek yang dikenal atau tetap dengan WhatsApp + Excel.

---

## 7. Dua ujian yang berbeda

Penilaian 1–5 (judgment analis). Dua pembobotan menunjukkan kesimpulan yang berlawanan — dan itu inti masalahnya.

### 7.1 Bobot "adopsi" (yang biasanya dipakai pembeli RS)

| Dimensi | Bobot | Kita | Integra | NISSA | Qontak/Qiscus | Oprex | Build/SI |
|---|---:|---:|---:|---:|---:|---:|---:|
| Kedalaman proses ITIL | 20 | 4,5 | 2,5 | 2,0 | 1,5 | 1,5 | 2,0 |
| SLA & approval | 12 | 4,5 | 3,5 | 3,0 | 2,5 | 2,0 | 2,5 |
| Kanal masuk & notifikasi | 15 | 1,5 | 4,5 | 4,5 | 5,0 | 2,0 | 2,0 |
| Integrasi & identitas | 13 | 1,5 | 4,0 | 3,0 | 4,5 | 4,0 | 2,0 |
| AI & self-service | 12 | 0,5 | 1,0 | 3,0 | 4,5 | 4,0 | 1,0 |
| Laporan & analitik | 8 | 4,0 | 3,5 | 3,0 | 3,5 | 3,0 | 2,0 |
| Kesiapan enterprise | 10 | 3,0 | 4,0 | 3,0 | 4,5 | 3,5 | 2,0 |
| UX & mobile | 5 | 3,5 | 3,5 | 3,0 | 4,5 | 3,5 | 2,0 |
| Kesesuaian RS | 5 | 4,5 | 1,5 | 1,0 | 2,0 | 1,0 | 3,0 |
| **Skor tertimbang (/5)** | **100** | **2,94** | **3,17** | **2,93** | **3,53** | **2,66** | **1,99** |

Status quo (WhatsApp + Excel + vendor SIMRS): **1,33**.

### 7.2 Bobot "ITIL-first" (yang dipakai auditor/komite mutu)

| Dimensi | Bobot | Kita | Integra | NISSA | Qontak/Qiscus | Oprex | Build/SI |
|---|---:|---:|---:|---:|---:|---:|---:|
| Kedalaman proses ITIL | 35 | 4,5 | 2,5 | 2,0 | 1,5 | 1,5 | 2,0 |
| SLA & approval | 15 | 4,5 | 3,5 | 3,0 | 2,5 | 2,0 | 2,5 |
| Kanal masuk & notifikasi | 8 | 1,5 | 4,5 | 4,5 | 5,0 | 2,0 | 2,0 |
| Integrasi & identitas | 8 | 1,5 | 4,0 | 3,0 | 4,5 | 4,0 | 2,0 |
| AI & self-service | 5 | 0,5 | 1,0 | 3,0 | 4,5 | 4,0 | 1,0 |
| Laporan & analitik | 10 | 4,0 | 3,5 | 3,0 | 3,5 | 3,0 | 2,0 |
| Kesiapan enterprise | 8 | 3,0 | 4,0 | 3,0 | 4,5 | 3,5 | 2,0 |
| UX & mobile | 3 | 3,5 | 3,5 | 3,0 | 4,5 | 3,5 | 2,0 |
| Kesesuaian RS | 8 | 4,5 | 1,5 | 1,0 | 2,0 | 1,0 | 3,0 |
| **Skor tertimbang (/5)** | **100** | **3,62** | **3,03** | **2,61** | **2,89** | **2,27** | **2,11** |

Status quo: **1,05**.

### 7.3 Cara membaca

- Di ujian adopsi, kita **kalah dari Integra dan Qontak/Qiscus**, dan **seri dengan NISSA** (2,94 vs 2,93). Itu posisi yang berbahaya: kita lebih dalam, tetapi tidak lebih dipilih.
- Di ujian ITIL, kita **menang jelas** (3,62 vs 3,03).
- Artinya, strategi "tambah modul ITIL" tidak akan mengubah posisi kompetitif. Yang mengubah posisi adalah **menaikkan skor adopsi** atau **mengubah kriteria evaluasi** agar kedalaman ITIL menjadi syarat (lewat audit, akreditasi, dan risiko).

---

## 8. Gap komersial dan go-to-market

| Aspek | Kita (publik) | Integra | NISSA | Qontak/Qiscus | Oprex |
|---|---|---|---|---|---|
| Harga publik | Tidak ada | Tidak ada | Tidak ada (dimuat dinamis) | Tidak ada (minta penawaran) | **Ada, dalam rupiah + free tier** |
| Trial/demo | Tidak ada | "Jadwalkan demo" | **"Coba gratis"** | Demo | **Free tier** |
| Testimoni/referensi | Tidak ada | Ada (6 testimoni) | Ada | **Logo klien besar** | Showcase |
| Sertifikasi/UU PDP | Belum ada | Tidak terlihat | Tidak terlihat | Qiscus: badge sertifikasi BSI/Meta | Narasi UU PDP + server Indonesia |
| Paket implementasi | Belum ada | Demo → kontak | Demo | Onboarding SaaS | Self-serve |
| SLA support | Belum ada | Tidak publik | "Dukungan profesional" | Enterprise | Community/email/dedicated |
| Kanal penjualan | Repo/website | Website + WhatsApp | Website + WhatsApp | Brand + sales | Komunitas + self-serve |
| Pembayaran lokal | Belum jelas | Tidak terlihat | Tidak terlihat | Tidak terlihat | **QRIS/VA/transfer (publik)** |
| Partner/SI | Belum ada | Tidak terlihat | Tidak terlihat | Tidak terlihat | Tidak terlihat |

**Gap terbesar bukan fitur, tetapi "kesiapan dijual":** harga, trial, bukti, paket implementasi, dan SLA support. Kompetitor lokal tidak selalu lebih baik produknya, tetapi mereka lebih siap dibeli.

---

## 9. Posisi kompetitif

|  | **Adopsi tinggi** (kanal, SSO, AI, implementasi) | **Adopsi rendah** |
|---|---|---|
| **ITIL dalam** (problem, change, CMDB, PIR, audit) | **Integra** — seimbang, tetapi generik dan tidak punya change/problem/CAB | **KITA** — dalam, tetapi sulit diadopsi |
| **ITIL dangkal** | **Qontak / Qiscus / NISSA** — siap pakai, cepat, murah, tetapi bukan ITSM | **Status quo** (WA + Excel + vendor SIMRS) dan **build sendiri** |

- **Kita di kuadran "dalam tetapi sulit"**: menang di demo ITIL, kalah di uji coba 30 hari.
- **Integra di kuadran "seimbang"**: paling berbahaya karena bisa masuk lewat unit lain dan cukup dalam untuk IT.
- **Qontak/Qiscus/NISSA di kuadran "siap pakai"**: menang di kemudahan, bukan di proses.
- **Status quo** adalah kompetitor terbesar; kita harus mengalahkan kebiasaan, bukan aplikasi.

---

## 10. Prioritas menutup gap

Bahan keputusan, belum dieksekusi. Urutan berdasarkan "menutup deal-breaker lebih dulu".

| Prioritas | Inisiatif | Gap yang ditutup | Alasan urutan |
|---|---|---|---|
| **P0** | Intake WhatsApp + email-in | A1, A2 | Tanpa ini, tiket tidak masuk |
| **P0** | SSO (OIDC/SAML/LDAP) + bulk import CSV | B1, A8 | Tanpa ini, implementasi berhenti |
| **P0** | AI knowledge search + chatbot deflection | B5, B6 | Ekspektasi pasar 2026 + beban helpdesk |
| **P0** | Formulir dinamis + auto-assignment | A4, A5 | Katalog baru berguna jika form dan routing mengikuti |
| **P0 (komersial)** | Paket UU PDP/ISO + DPA + security pack | D3 | Gate procurement |
| **P1** | Pengingat pra-SLA, merge tiket, PDF, laporan terjadwal | A6, A7, D4 | Cepat, murah, langsung terasa |
| **P1** | API key + webhook + integrasi monitoring/SIMRS | B3, B4 | Diferensiasi yang tidak dimiliki helpdesk lokal |
| **P1** | PWA/mobile + push | A9 | Adopsi lapangan |
| **P1** | Aset: QR, maintenance/kalibrasi alkes, CMDB impact | C3, C4 | Ceruk RS yang belum digarap siapa pun |
| **P1** | Change calendar/blackout/emergency change | C1 | Melengkapi change management yang sudah kuat |
| **P2** | OLA/UC, KB versioning, ESM multi-unit, report builder | C2, C5, C8, D5 | Setelah ada pelanggan yang menuntut |
| **P2** | HA, 2FA, observability | D1, B2 | Setelah 20 RS berbayar, bukan sebelumnya |

**Aturan:** jangan menambah modul ITIL baru sebelum P0 adopsi selesai. Setiap modul baru menambah kedalaman yang sudah menang, tetapi tidak mengubah keputusan pembelian.

---

## 11. Yang jangan dibangun

1. **Omnichannel CX penuh** (Instagram, TikTok, CRM, sales pipeline). Itu arena Qontak/Qiscus, bukan pembeli Kepala IT RS.
2. **ALM penuh** (requirements, test management, release). Itu arena Oprex.
3. **ESM generik untuk HR/Finance/GA** sebelum ada 10 RS yang minta. Fokus RS adalah diferensiasi; ESM adalah ekspansi.
4. **Marketplace/app store** dan **AI agent framework** sendiri. Terlalu mahal untuk tahap ini.
5. **HA multi-region** sebelum ada tekanan kontrak. Cukup backup + restore teruji dulu.
6. **Fitur ITIL tambahan** (release, capacity, availability, financial) yang tidak diminta pembeli.

---

## 12. Rekomendasi strategi

### Opsi

| Opsi | Isi | Risiko | Rekomendasi |
|---|---|---|---|
| A. **Vertical "ITSM RS"** | Perdalam ceruk: alkes, SIMRS, unit, akreditasi, vendor multi-RS; tambah lapisan adopsi | Pasar lebih kecil, tetapi kompetisi lokal hampir nol | **Pilih** |
| B. Horizontal helpdesk | Kejar Qontak/Qiscus di kanal & AI | Kalah skala, kehilangan diferensiasi | Jangan |
| C. **Platform untuk SI/SIMRS partner** | White-label/konsol vendor; SI yang implementasi, kita yang sediakan kedalaman | Bergantung partner, margin lebih tipis | **Pilih sebagai kanal** |
| D. Compliance-first | Audit-ready ITSM untuk akreditasi/UU PDP | Butuh bukti & sertifikasi | **Pakai sebagai narasi** |

**Kombinasi yang disarankan: A + C + D.**
Positioning: *"ITSM rumah sakit yang siap audit, masuk lewat WhatsApp, dan bisa dijalankan bersama vendor SIMRS Anda."*

### Tiga langkah validasi 30 hari (tanpa development)

1. **10 wawancara Kepala IT RS tipe B/C** (45 menit) memakai pertanyaan di Bagian 13. Target: tahu kanal dominan, proses approval, sistem identitas, dan definisi "berhasil".
2. **3 demo kompetitor sebagai calon pembeli** (Integra, NISSA, Qiscus). Catat skrip sales, harga yang disampaikan, dan fitur yang paling ditonjolkan. Ini memvalidasi bobot di Bagian 7.
3. **Uji penawaran**: susun 3 paket harga rupiah (per RS/per agen), lalu tanyakan willingness-to-pay ke 5 RS. Tanpa ini, kita tidak tahu apakah masalahnya produk atau harga.

### Sinyal yang harus didengar

- Jika 7 dari 10 RS mengatakan "WhatsApp wajib", P0 kanal adalah harga mati.
- Jika 7 dari 10 mengatakan "kami sudah punya AD", SSO adalah harga mati.
- Jika 7 dari 10 mengatakan "kami tidak butuh problem/change", maka kedalaman ITIL bukan diferensiasi untuk segmen itu — pilih segmen RS yang lebih besar atau ubah narasi ke audit.

---

## 13. Sepuluh pertanyaan validasi

1. Berapa tiket per bulan, dan dari kanal apa mayoritas datang?
2. Siapa yang boleh mengubah prioritas, dan apakah perubahan itu harus diaudit?
3. Apakah RS memakai Active Directory/LDAP? Berapa jumlah staf yang butuh akun?
4. Apakah WhatsApp boleh dipakai untuk melaporkan insiden? Apakah ada kebijakan data pasien?
5. Bukti apa yang diminta auditor/akreditasi dari tim IT?
6. Apakah change management sudah berjalan? Siapa yang duduk di CAB?
7. Siapa yang mengelola aset alkes: IT, IPSRS, atau vendor? Apakah butuh kalibrasi/maintenance?
8. Bagaimana vendor SIMRS menangani insiden hari ini? Apakah RS ingin mencatatnya?
9. Berapa anggaran tahunan untuk tools IT, dan bagaimana proses pengadaannya?
10. Siapa yang akan mengimplementasikan: tim IT RS, vendor, atau konsultan?

---

## 14. Sumber

Diakses 4 November 2026.

- Integra Help Desk — fitur dan positioning: [integraindonesia.co.id/produk/helpdesk](https://integraindonesia.co.id/produk/helpdesk/)
- Integra E-Helpdesk: [integraindonesia.co.id/e-helpdesk](https://www.integraindonesia.co.id/e-helpdesk/)
- NISSA — produk dan fitur: [nissa.co.id](https://nissa.co.id/)
- NISSA — chatbot, Telegram/email, otomatisasi: [neuronworks.co.id](https://www.neuronworks.co.id/tiket-layanan-menumpuk-saatnya-automasi-dengan-nissa/)
- Mekari Qontak — helpdesk/ticketing: [qontak.com](https://qontak.com/fitur/aplikasi-helpdesk-ticketing-system/)
- Mekari Qontak — harga: [qontak.com/harga](https://qontak.com/harga/)
- Qiscus Helpdesk — fitur: [qiscus.com/id/helpdesk-suite](https://www.qiscus.com/id/helpdesk-suite)
- Qiscus — AI & agent tools: [qiscus.com/id/qiscus-ai](https://www.qiscus.com/id/qiscus-ai)
- Qiscus — harga: [qiscus.com/id/pricing](https://www.qiscus.com/id/pricing)
- Oprex — tentang produk: [support.oprex.id](https://support.oprex.id/help/a/apa-itu-oprex?lang=id)
- Oprex — harga & UU PDP: [oprex.id/pricing](https://oprex.id/pricing)
- Oprex — use case healthcare: [oprex.id/use-cases/healthcare](https://oprex.id/use-cases/healthcare)
- Contoh proyek custom service desk: [Mandiri Bahari Teknologi](https://mandiribahariteknologi.com/insights/2026/05/25/mandiri-bahari-teknologi-uat-service-desk-askrindo-syariah)
- Paper helpdesk IT RS (konteks build-sendiri): [Jurnal FKPT — RSUD Gambiran](https://www.journal.fkpt.org/index.php/mis/article/view/2974)
- Basis produk kita: [README](../README.md), [Roadmap](ITSM-ROADMAP.md), [Role](ITSM-ROLES.md)
