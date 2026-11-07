# Desain: Intake Web + QR dan Email-in

- **Status:** QR v1 sudah diimplementasikan 7 November 2026 (form publik, titik QR, lampiran); email-in belum.
- **Tanggal:** 6 November 2026.
- **Konteks:** kanal masuk dengan hambatan terendah sebelum WhatsApp API. Melengkapi [analisis gap](GAP-KOMPETITOR-LOKAL.md) dan [desain form/routing](DESIGN-FORM-DINAMIS-AUTO-ASSIGN.md).
- **Basis skema:** `tickets.requester` **tidak wajib**, `tickets.unit` **wajib**, `reporter_name`/`reporter_contact` sudah ada, `source` saat ini `web/whatsapp/email/phone`, lampiran sudah terproteksi, SMTP keluar sudah ada.

---

## 0. Ringkasan

Dua kanal, satu pintu:

```
QR di unit ─┐
            ├──► Pintu masuk publik ──► validasi ──► tiket ──► routing ──► SLA
Email masuk ┘
```

- **QR** menghilangkan dua hambatan sekaligus: tidak perlu login dan tidak perlu mencari menu. Lokasi/unit sudah terisi dari QR yang ditempel di ruangan.
- **Email-in** memakai kebiasaan yang sudah ada: kepala unit mengirim email seperti biasa, tiket terbentuk otomatis, balasan email menjadi komentar.
- Keduanya **tidak** memerlukan WhatsApp, verifikasi Meta, atau aplikasi baru.

**Keputusan arsitektur utama:** jangan menulis logika pembuatan tiket dua kali. Ekstrak satu fungsi `intake.create()` yang dipakai route login, route publik QR, dan worker email. Setiap kanal hanya bertugas menormalkan payload dan mengidentifikasi pengirim.

---

# Bagian A — Web + QR

## A.1 Pengalaman pengguna

Perawat di IGD melihat stiker QR di dinding:

```
┌──────────────────────────────────┐
│  [Logo RS]                       │
│  LAPOR IT                        │
│  Scan untuk membuat tiket        │
│                                  │
│        ██████████████            │
│        ██  QR CODE  ██           │
│        ██████████████            │
│                                  │
│  IGD — Nurse Station             │
│  itsm.rs.id/i/7f3k9x2a           │
└──────────────────────────────────┘
```

Alur:

1. Scan → form terbuka di ponsel. **Lokasi IGD sudah terisi.**
2. Pilih layanan dan item (mis. Jaringan → Gangguan jaringan).
3. Pilih dampak (pelayanan terhenti / terganggu / biasa).
4. Tulis deskripsi, lampirkan foto, centang attestation data pasien.
5. Kirim → dapat nomor tiket + tim tujuan + tenggat SLA.
6. Tidak perlu login, tidak perlu install aplikasi.

Target: **di bawah 60 detik** dari scan sampai tiket terkirim.

## A.2 Dua mode identitas

| Mode | Cara | Kelebihan | Kekurangan | Kapan dipakai |
|---|---|---|---|---|
| **Tamu (QR token)** | Tanpa login; nama + kontak diisi manual | Hambatan nol; semua staf bisa | Tidak ada akun; rawan spam; tidak bisa CSAT | Pilot, unit dengan staf banyak |
| **Login** | Sesi staf yang sudah ada | Identitas pasti; notifikasi & CSAT jalan | Harus login dulu | Staf IT, pengguna rutin |

**Rekomendasi:** mulai dengan **mode tamu** untuk QR, tetapi jika pengguna sudah punya sesi login, form otomatis mengisi identitas. Satu halaman, dua jalur.

Konsekuensi mode tamu:

- `tickets.requester` kosong; `reporter_name` dan `reporter_contact` diisi.
- Notifikasi ke pemohon memakai email/kontak, bukan akun.
- CSAT belum bisa; fase berikutnya memakai tautan bertoken.
- Laporan tetap bisa memisahkan kanal lewat `intake_channel`.

## A.3 Token QR

### Koleksi `intake_points`

| Field | Tipe | Catatan |
|---|---|---|
| `tenant` | relation tenants, required | Isolasi |
| `name` | text, max 120 | "IGD — Nurse Station" |
| `unit` | relation units, required | Unit pemohon untuk tiket tamu |
| `location` | text, max 120 | Teks lokasi yang diprefill |
| `token` | text, unique, 32 char | Random, tanpa pola yang bisa ditebak |
| `is_active` | bool | Kill switch |
| `expires_at` | date, opsional | QR musiman |
| `max_per_hour` | number, default 20 | Batas per titik |
| `last_used_at` | date | Monitoring |
| `created_by` | relation users | IT Lead |

Index: `UNIQUE (token)`, `(tenant, is_active)`.

### Aturan token

- 32 karakter acak (bukan berurutan, bukan ID record).
- Disimpan apa adanya (bukan password); token bersifat seperti tautan undangan.
- Bisa dicabut kapan saja dengan menonaktifkan titik.
- Jika beredar luas, buat titik baru dan cetak ulang; token lama dinonaktifkan.
- URL: `https://itsm.rs.id/i/{token}` (pendek, mudah diketik jika QR rusak).

### Pembuatan dan pencetakan

- Halaman **Pengaturan > Titik QR**: buat titik, pilih unit/lokasi, cetak.
- Lembar cetak A5 berisi logo RS, judul "Lapor IT", QR, nama unit, URL cadangan, dan 3 langkah singkat.
- Bisa cetak massal per unit.
- Simpan inventaris: QR mana terpasang di ruangan mana.

## A.4 API publik

### `GET /api/itsm/public/intake/{token}`

Mengembalikan data minimum untuk merender form:

```json
{
  "tenant": { "name": "RS Contoh", "logo": true },
  "point": { "name": "IGD — Nurse Station", "location": "IGD" },
  "services": [
    { "id": "...", "name": "Jaringan & Infrastruktur", "items": [
      { "id": "...", "name": "Gangguan jaringan" }
    ]}
  ],
  "impacts": [
    { "value": "patient_safety", "label": "Mengancam keselamatan pasien" },
    { "value": "clinical_workflow", "label": "Pelayanan terganggu" }
  ],
  "attestation": "Saya memastikan tidak mencantumkan data pasien"
}
```

Tidak boleh membocorkan: daftar pengguna, aset, SLA policy, harga, audit, atau data tiket lain.

### `POST /api/itsm/public/intake/{token}`

Body:

```json
{
  "type": "incident",
  "service": "svc_...",
  "service_item": "itm_...",
  "impact": "clinical_workflow",
  "title": "SIMRS tidak bisa dibuka di triage",
  "description": "Sejak 08.10, layar putih setelah login.",
  "reporter_name": "Rina",
  "reporter_contact": "rina@rs.id",
  "patient_data_confirmed": true,
  "honeypot": "",
  "form_started_at": 1762400000
}
```

Lampiran dikirim multipart (maks 3 file, 5 MB/file).

**Yang dilakukan server:**

1. Validasi token: ada, aktif, belum kedaluwarsa, tenant aktif.
2. Rate limit per token/titik. Batas per IP tidak dipakai di v1: di produksi
   semua request melewati reverse proxy yang sama, sehingga IP pengguna bisa
   tampak identik.
3. Validasi layanan/item milik tenant dan aktif.
4. Ambil `unit` dan `location` dari titik QR (bukan dari body, agar tidak bisa dipalsukan).
5. Buat tiket dengan `requester` kosong, `created_by` kosong, `reporter_name/contact` terisi, `source=web`, `intake_channel=qr`.
6. Jalankan SLA, approval, dan penugasan otomatis seperti biasa.
7. Audit `create` dengan `channel=qr` dan `intake_point`.
8. Kembalikan **hanya** nomor tiket, tim tujuan, dan tenggat SLA.

**Yang tidak boleh:** mengembalikan ID internal, daftar kandidat assignee, atau isi audit.

## A.5 Anti-penyalahgunaan

| Kontrol | Nilai awal | Catatan |
|---|---|---|
| Rate limit per titik | 20 tiket/jam | Cukup untuk unit sibuk |
| Rate limit per IP | Tidak dipakai di v1 | Menghindari blokir massal saat semua request melewati reverse proxy |
| Honeypot | field tersembunyi | Bot mengisi, manusia tidak |
| Waktu isi form | < 3 detik ditolak | Bot terlalu cepat |
| Attestation | wajib dicentang | Konsisten dengan intake login |
| Lampiran | 3 file, 5 MB, tipe tertentu | Foto/screenshot/PDF |
| Token | bisa dicabut | Jika stiker difoto dan disebar |
| Captcha | opsional setelah 5 kiriman/jam | Jangan ganggu pilot |

**Yang tidak dilakukan di fase 1:** verifikasi nomor telepon/OTP. Itu menambah friksi dan biaya; cukup untuk pilot internal RS.

## A.6 Setelah tiket dibuat

- **Pemohon tamu:** menerima email ucapan terima kasih berisi nomor tiket dan tautan status bertoken (fase 2) atau cukup nomor tiket di layar.
- **Staf login:** menerima notifikasi in-app seperti biasa; CSAT berjalan.
- **Tiket:** tetap masuk alur yang sama — triage, assignment, SLA, komentar, resolusi.
- **Tindak lanjut:** jika butuh informasi, staf membalas ke `reporter_contact` (email) atau mencatat di komentar.

## A.7 UX form

- Mobile-first, satu kolom, target sentuh 44 px.
- Maksimal 3 langkah:
  1. **Apa masalahnya** — layanan, item, dampak.
  2. **Detail** — lokasi (terisi), deskripsi, foto, attestation.
  3. **Kontak & kirim** — nama, email/telepon, tombol kirim.
- Tombol kembali, progres, dan pesan error yang jelas.
- Setelah kirim: layar sukses dengan nomor tiket, tombol "salin nomor", dan "buat tiket lain".
- Tanpa login, tanpa cookie pelacak, tanpa JavaScript berat.

## A.8 Data model

| Koleksi/field | Isi |
|---|---|
| `intake_points` | Titik QR (baru) |
| `tickets.intake_channel` | `web/qr/email/telegram/whatsapp/manual` (baru) |
| `tickets.intake_ref` | ID titik QR / Message-ID email (baru) |
| `tickets.reporter_name` | Sudah ada |
| `tickets.reporter_contact` | Sudah ada |
| `tickets.requester` | Kosong untuk tamu (sudah opsional) |
| `tickets.unit` | Dari titik QR (sudah wajib) |

`source` tetap `web` untuk kompatibilitas; `intake_channel` yang membedakan QR.

## A.9 Estimasi

| Pekerjaan | Estimasi |
|---|---|
| Migrasi `intake_points` + `intake_channel` + index | 1 hari |
| Route publik GET/POST + validasi + rate limit | 3–4 hari |
| Form mobile 3 langkah + lampiran | 3–4 hari |
| Halaman admin titik QR + cetak | 1–2 hari |
| Test API + e2e | 2 hari |
| **Total** | **10–13 hari** |

---

# Bagian B — Email-in

## B.1 Pengalaman pengguna

Kepala Farmasi mengirim email seperti biasa:

```
To: it-support@rs.id
Subject: Printer farmasi macet

Lokasi: Farmasi Lt. 2
Dampak: operasional
Printer tidak mengeluarkan label resep sejak pagi.
```

Dalam ±60 detik, ia menerima balasan:

```
Tiket INC-20261106-AB12CD sudah dibuat.
Tim: Hardware
SLA respons: 30 menit
Balas email ini untuk menambah informasi.
```

Staf IT membalas email itu → balasan masuk sebagai komentar tiket. Saat tiket selesai, pemohon menerima email resolusi.

Tidak ada aplikasi baru. Tidak ada login. Tidak ada pelatihan.

## B.2 Arsitektur

PocketBase (Goja) **tidak punya klien IMAP**. Jadi jangan memaksakan semuanya di dalam hook.

```
Mailbox IMAP
     │  (poll 60 detik)
     ▼
Worker Node  ──►  POST /api/itsm/channels/email/inbound
     │                     │
     │                     ├─ validasi token internal
     │                     ├─ dedupe Message-ID
     │                     ├─ buat tiket / komentar
     │                     └─ antre balasan
     ▼
Tandai seen / pindahkan ke folder
```

**Komponen:**

1. **Worker** `scripts/mail-ingest.mjs` (atau `services/mail-ingest/`).
   - Koneksi IMAP (`imapflow`), parse (`mailparser`).
   - Poll tiap 60 detik; bisa juga IDLE.
   - Kirim payload ternormalisasi ke endpoint internal.
2. **Endpoint internal** `POST /api/itsm/channels/email/inbound`.
   - Dilindungi header `X-Ingest-Token` dari environment.
   - Tidak bisa diakses pengguna biasa.
   - Memanggil `intake.create()` yang sama dengan QR.
3. **Balasan** memakai `email_outbox` dan SMTP yang sudah ada.

**Deployment:** systemd service (Linux), Task Scheduler (Windows), atau sidecar Docker. Untuk dev: `npm run mail:ingest`. Jangan dijalankan di dalam proses PocketBase.

## B.3 Konfigurasi

Fase 1 (satu instalasi, satu mailbox):

```env
IMAP_HOST=mail.rs.id
IMAP_PORT=993
IMAP_USER=it-support@rs.id
IMAP_PASSWORD=...
IMAP_FOLDER=INBOX
IMAP_POLL_SECONDS=60
INGEST_TOKEN=...
DEFAULT_UNIT_ID=...
MAIL_ALLOWED_DOMAINS=rs.id
MAIL_MAX_ATTACHMENT_MB=10
```

Fase 2 (vendor/multi-tenant): koleksi `email_channels` per tenant dengan password terenkripsi (`PB_ENCRYPTION_KEY`), worker meloop semua kanal aktif.

## B.4 Aturan parsing

| Bagian email | Menjadi | Aturan |
|---|---|---|
| Subject | `title` | Buang `Re:`, `Fwd:`, `[IT]`; maks 160; fallback "Laporan via email" |
| Body teks | `description` | Buang kutipan balasan dan signature; maks 10.000 |
| Body HTML | `description` | Konversi ke teks; sanitasi |
| Pengirim dikenal | `requester` + `unit` | Cocokkan email ke `users.email` (case-insensitive, tenant sama) |
| Pengirim tidak dikenal | `reporter_name/contact` + `unit` default | Tidak membuat akun baru |
| Lampiran | Lampiran tiket | Maks 5, 10 MB, tipe aman, simpan terproteksi |
| `In-Reply-To`/`References` | Komentar tiket | Jika cocok dengan thread yang ada |
| Nomor tiket di subject | Komentar tiket | Pola `INC-YYYYMMDD-XXXXXX` |
| Selain itu | Tiket baru | Default layanan "Lainnya", kategori Email |

**Klasifikasi otomatis di fase 1:** tidak ada. Jangan menebak layanan dari kata kunci — rapuh dan sulit dijelaskan. Staff triage tetap yang menentukan. Yang otomatis hanya pembuatan tiket dan threading.

**Dampak default:** `operational` (prioritas normal). Jika email memakai baris `Dampak: patient_safety`, server boleh memakainya; jika tidak, triage yang mengoreksi.

## B.5 Threading dan anti-loop

### Threading

- Simpan `email_message_id` (unik), `email_in_reply_to`, `email_references`, `email_thread_key`.
- `email_thread_key` = Message-ID pertama dari thread, atau nomor tiket jika ada di subject.
- Balasan dengan `In-Reply-To`/`References` yang cocok → **komentar**, bukan tiket baru.
- Balasan dari staf (dikenali dari email staf) → komentar internal atau publik sesuai pilihan; default publik jika pengirim adalah requester.

### Anti-loop

Tolak/abaikan email dengan:

- `Auto-Submitted: auto-replied` atau `auto-generated`
- `X-Autoreply`, `X-Autorespond`
- `Precedence: bulk`, `junk`, `list`
- `List-Id` (mailing list)
- `Return-Path: <>` (bounce)
- `Content-Type: multipart/report` (laporan pengiriman)

Tambahan:

- Jangan pernah memproses email dari alamat sendiri.
- Set header `Auto-Submitted: auto-generated` pada balasan keluar.
- Maksimal 1 balasan otomatis per thread per 5 menit.
- Jika terdeteksi loop (3 balasan otomatis dalam 10 menit), hentikan dan alert.

## B.6 Keamanan dan data pasien

| Risiko | Kontrol |
|---|---|
| Data pasien masuk email | Pindai pola NIK 16 digit, "No. RM", "rekam medis", "nama pasien"; tolak dengan balasan edukasi |
| Spoofing | Cek `Authentication-Results` (SPF/DKIM/DMARC) bila tersedia; log, jangan langsung blokir di pilot |
| Lampiran berbahaya | Allowlist tipe; tolak executable/arsip; simpan terproteksi |
| Spam | Manfaatkan filter mail server; folder Junk tidak diproses |
| Password IMAP | Environment/secret; enkripsi jika disimpan di database |
| Akses data | Hanya worker + IT Lead; audit `email_inbound`/`email_reject` |
| Retensi | Simpan metadata secukupnya; isi email sudah menjadi deskripsi tiket |

**Kebijakan penting:** email bukan tempat data pasien. Jika terdeteksi, tiket **tidak dibuat**, pengirim diberi balasan bahwa kanal ini tidak boleh memuat data pasien, dan kejadian dicatat.

## B.7 Balasan dan notifikasi

- **Saat tiket dibuat:** balasan berisi nomor tiket, tim, SLA, dan instruksi "balas email ini untuk menambah informasi".
- **Saat komentar publik/status berubah:** email ke `reporter_contact` jika berisi email.
- **Saat selesai:** ringkasan resolusi + tautan CSAT bertoken (fase 2).
- **Header:** `In-Reply-To` dan `References` diisi agar email thread rapi di Gmail/Outlook.
- **From:** `it-support@rs.id` dengan nama tampilan RS; `Reply-To` sama.
- **Rate limit balasan:** 1 per tiket per 5 menit; jangan membalas auto-reply.

## B.8 Data model

| Koleksi/field | Isi |
|---|---|
| `email_channels` | tenant, address, imap_host/port/user/password, folder, default_unit, is_active, last_uid, last_sync_at, last_error |
| `channel_messages` | tenant, channel, direction, external_id (Message-ID), ticket, from, subject, status, error, received_at |
| `tickets.intake_channel` | `email` |
| `tickets.intake_ref` | Message-ID |
| `tickets.email_thread_key` | Kunci thread |
| `tickets.reporter_name/contact` | Untuk pengirim tidak dikenal |
| `tickets.requester` | Kosong jika pengirim tidak dikenal |

Index:

- `UNIQUE (tenant, external_id)` — anti-dobel.
- `(tenant, email_thread_key)` — threading.
- `(tenant, is_active)` — worker.

## B.9 Penanganan kegagalan

| Kasus | Tindakan |
|---|---|
| IMAP tidak bisa dihubungi | Retry backoff; alert setelah 15 menit |
| Email gagal diparse | Pindahkan ke folder `INBOX.Error`, catat, jangan tandai seen |
| Tiket gagal dibuat | Retry 3×; setelah itu folder error + alert |
| Duplikat | Tandai seen, catat `duplicate`, jangan buat tiket |
| Worker restart | Mulai dari `last_uid`/UIDVALIDITY; aman karena dedupe |
| Banjir email | Batas 50 email/menit; antrekan sisanya |

**Prinsip:** jangan pernah menandai email `seen` sebelum tiket/komentar berhasil dibuat. Kalau ragu, lebih baik diproses dua kali (tertolak oleh dedupe) daripada hilang.

## B.10 Estimasi

| Pekerjaan | Estimasi |
|---|---|
| Worker IMAP + parser + dedupe | 5–7 hari |
| Endpoint internal + pembuatan tiket + lampiran | 3–4 hari |
| Threading + komentar + balasan email | 3–4 hari |
| Keamanan/PHI scan + test | 3–4 hari |
| **Total** | **14–19 hari** |

---

# Bagian C — Fondasi bersama

## C.1 Satu fungsi intake

Ekstrak logika dari route login ke `lib/intake.js`:

```
intake.create({
  tenant, actor, channel, externalId,
  payload, unitId, location, reporter
})
```

Yang ditangani bersama:

- Validasi tipe, impact, attestation, layanan/item.
- Nomor tiket, SLA, approval.
- Penugasan otomatis.
- Audit dan notifikasi.
- Lampiran.

Setiap kanal hanya menyiapkan payload dan identitas. Ini mencegah tiga versi logika yang berbeda.

## C.2 Identitas kanal

Koleksi `channel_identities`:

| Field | Isi |
|---|---|
| `tenant` | Isolasi |
| `channel` | `email/telegram/whatsapp` |
| `external_id` | Email, chat ID, nomor |
| `user` | Relation users |
| `verified_at` | Kapan ditautkan |

Untuk email, pencocokan bisa langsung ke `users.email`. Untuk Telegram, perlu kode tautan. Untuk WhatsApp, nomor telepon.

## C.3 Idempotensi

Koleksi `channel_messages` menyimpan `external_id` unik per tenant. Satu email/pesan hanya menghasilkan satu tiket/komentar, meskipun worker restart atau retry.

## C.4 Kanal mana dulu?

| Kanal | Hambatan pengguna | Hambatan teknis | Waktu | Rekomendasi |
|---|---|---|---|---|
| QR | Sangat rendah | Rendah | 10–13 hari | **Pilot pertama** |
| Email-in | Rendah | Sedang | 14–19 hari | **Pilot kedua** |
| Telegram | Sedang (install) | Rendah | 4–6 hari | Eksperimen tim IT |
| WhatsApp | Sangat rendah | Tinggi (Meta/BSP) | 2–4 minggu | Setelah volume terbukti |

---

# Bagian D — Rollout dan metrik

## D.1 Rencana 4 minggu

| Minggu | Kegiatan |
|---|---|
| 1 | QR untuk 2 unit (IGD, Farmasi); form tamu; ukur submit vs scan |
| 2 | Email-in `it-support@`; pilot 3 kepala unit |
| 3 | Perbaiki default unit/layanan, spam, duplikat; tambah QR 3 unit |
| 4 | Review: kanal mana yang dipakai; putuskan Telegram/WhatsApp |

## D.2 Metrik

| Metrik | Target awal |
|---|---|
| Scan → submit | > 40% |
| Waktu isi form | median < 90 detik |
| Tiket dari QR + email | > 30% tiket baru dalam sebulan |
| Email → tiket | < 2 menit (P95) |
| Duplikat email | < 2% |
| Email ditolak karena data pasien | 0 (harus nol) |
| Spam/abuse QR | < 5% |
| Kepuasan pengirim | kualitatif, 5 wawancara |

## D.3 Sinyal berhenti

- QR tidak dipakai (< 5 tiket/minggu setelah 2 minggu) → hentikan ekspansi, wawancara ulang.
- Email lebih banyak dipakai → prioritaskan email, bukan WhatsApp.
- Banyak tiket tamu tanpa kontak → wajibkan email di form QR.

---

# Bagian E — Keputusan yang perlu diambil

1. **QR tamu atau wajib login?**
   Rekomendasi: tamu dulu, login otomatis jika sesi ada.
2. **Unit untuk tiket tamu dari mana?**
   Rekomendasi: dari titik QR (tidak bisa dipalsukan pengguna).
3. **Layanan default email?**
   Rekomendasi: "Lainnya" + kategori "Email"; staff triage.
4. **Email pengirim tidak dikenal diterima?**
   Rekomendasi: ya, sebagai tamu, dengan batas dan pemindaian data pasien.
5. **Data pasien terdeteksi?**
   Rekomendasi: tolak, balas edukasi, catat.
6. **CSAT untuk tamu?**
   Rekomendasi: fase 2, tautan bertoken.
7. **Worker email di mana?**
   Rekomendasi: proses Node terpisah (systemd/Task Scheduler), bukan di dalam PocketBase.
8. **Multi-tenant email?**
   Rekomendasi: env dulu untuk pilot; koleksi `email_channels` saat mode vendor.

---

# Bagian F — Risiko

| Risiko | Mitigasi |
|---|---|
| QR difoto dan disebar | Token bisa dicabut; rate limit; audit |
| Spam tiket tamu | Honeypot, batas per token/titik |
| Tiket tamu tanpa identitas | Wajibkan nama + kontak; unit dari QR |
| Email loop | Header auto-submitted, dedupe, batas balasan |
| Email hilang | Jangan tandai seen sebelum tiket dibuat |
| Data pasien di email | Pemindaian pola + tolak + edukasi |
| IMAP tidak stabil | Retry, alert, folder error |
| Dua tiket untuk satu masalah | Email + QR duplikat; merge tiket fase berikutnya |
| Beban support baru | Satu halaman panduan; auto-reply jelas |

---

# Bagian G — Yang jangan dilakukan

- Jangan membangun portal publik dengan registrasi akun. Itu menambah friksi dan beban admin.
- Jangan mengklasifikasikan email dengan AI di fase 1. Rapuh dan sulit dijelaskan.
- Jangan memakai library WhatsApp tidak resmi.
- Jangan mengizinkan lampiran tanpa batas atau tipe berbahaya.
- Jangan menyimpan password IMAP di teks biasa.
- Jangan menjadikan email sebagai tempat data pasien.
- Jangan menulis logika tiket terpisah untuk setiap kanal.

---

## Penutup

QR adalah kanal dengan hambatan terendah: **tidak perlu login, tidak perlu aplikasi, lokasi sudah terisi**. Email-in adalah kanal dengan hambatan terendah berikutnya: **staf sudah terbiasa mengirim email**, dan balasan email terasa seperti percakapan biasa.

Keduanya bisa dibangun tanpa WhatsApp, tanpa Meta, dan tanpa biaya per pesan. Jika salah satu terbukti dipakai, barulah WhatsApp layak dipertimbangkan — dengan data, bukan asumsi.
