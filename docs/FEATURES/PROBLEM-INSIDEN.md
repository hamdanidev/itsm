# Problem, pengetahuan, dan insiden mayor

Problem management, knowledge base, dan penanganan gangguan besar sebagai satu insiden induk.

Bagian ini dipindahkan dari README (perapian dokumen 2026-11-10). Daftar route ada di [API.md](../API.md); data model di [DATA-MODEL.md](../DATA-MODEL.md).

## Problem dan pengetahuan

Problem mengelompokkan beberapa insiden yang berbagi akar masalah. Artikel
pengetahuan menyimpan SOP dan known error agar tidak diselesaikan dari nol.

### Problem

- Dibuat dari detail tiket (**Buat problem**) atau dari halaman **Problem**.
- Satu problem dapat memiliki banyak tiket lewat `problem_tickets`; tiket
  menyimpan problem utama di `tickets.problem`.
- Status: `identified → investigating → known_error → resolved → closed`.
- `known_error` wajib memiliki **root cause** dan **workaround**.
- `resolved` wajib memiliki **permanent fix** dan mengisi `resolved_at`.
- `closed` hanya dari `resolved`.
- Requester tidak dapat membaca problem; hanya staf IT dan akun platform.
- Halaman problem menampilkan tiket terkait dan artikel yang ditautkan.

### Pengetahuan

- Artikel disimpan sebagai `draft`, diajukan `review` oleh staf, lalu
  `published` atau `retired` oleh IT Lead.
- Visibilitas `internal` hanya untuk staf IT; `public` dapat dibaca requester
  setelah artikel terbit.
- Artikel dapat ditautkan ke layanan, problem, dan tiket. Membuat artikel dari
  detail tiket langsung menautkannya ke tiket tersebut.
- Pencarian `GET /api/itsm/knowledge/search` hanya mengembalikan artikel terbit;
  requester dibatasi ke artikel publik, staf dapat melihat artikel internal.
- Jika artikel terkait problem berstatus `known_error`, hasil pencarian membawa
  workaround sehingga form intake dapat menampilkannya sebelum tiket dibuat.

## Insiden mayor

Insiden mayor adalah satu induk untuk gangguan besar (mis. SIMRS atau jaringan
mati) sehingga puluhan tiket tidak ditangani terpisah.

- **Deklarasi**: dari halaman **Insiden mayor** atau tombol **Deklarasikan** di
  detail tiket. Nomor otomatis `INC-YYYYMMDD-XXXXXX`, severity `SEV-1/2/3`,
  komandan (default pembuat), layanan terdampak, dan tiket sumber.
- **Broadcast**: saat deklarasi dan setiap perubahan status, staf IT rumah sakit
  dan lead vendor menerima notifikasi in-app + email sesuai preferensi. Update
  `public` juga dikirim ke pemilik tiket terdampak; update `internal` tidak.
- **Status**: `declared → investigating → mitigating → monitoring → resolved →
  closed`. Insiden `resolved` dapat dibuka kembali ke `investigating`.
- **Resolusi** wajib ringkasan pemulihan. **Penutupan** hanya dari `resolved`
  dan wajib PIR lengkap: root cause + aksi perbaikan (`pir_completed_at`,
  `pir_by`).
- **Tiket terdampak**: tautkan banyak tiket dengan relasi
  `impacted/caused/related`; `tickets.major_incident` menyimpan insiden utama
  dan detail tiket menampilkan tautan ke insiden.
- **Timeline**: update berkala (update/keputusan/komunikasi) dengan visibilitas
  internal atau publik, lengkap dengan penulis dan waktu.
- **Laporan**: panel **Insiden mayor** di halaman Laporan menampilkan total,
  aktif, MTTR median, PIR selesai, dan tren bulanan.
- Requester tidak dapat membaca detail insiden; hanya staf IT dan akun platform.
