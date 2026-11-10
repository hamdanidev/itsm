# Tiket: alur, merge, lampiran, dan antrean

Alur status tiket, penggabungan duplikat, lampiran, papan/daftar kerja, dan riwayat aktivitas.

Bagian ini dipindahkan dari README (perapian dokumen 2026-11-10). Daftar route ada di [API.md](../API.md); data model di [DATA-MODEL.md](../DATA-MODEL.md).

## Alur tiket

Status: `open → assigned → in_progress → resolved → closed`, dengan `waiting`
(menunggu requester) dari `assigned`/`in_progress`, dan `reopened` dari
`resolved`/`closed`.

| Aksi | Pemohon | Staff IT | Teknisi | Manajer unit | Kepala IT | Aturan |
|---|---|---|---|---|---|---|
| Assign | — | ke diri sendiri | — | — | ke Staff IT/Teknisi mana pun / lepas | Hanya staf aktif di tenant yang sama |
| Mulai kerjakan | — | assignee atau tiket belum di-assign | assignee | — | ya | Service/Change Request harus sudah approved; tiket tanpa assignee otomatis di-claim |
| Menunggu requester | — | assignee | assignee | — | ya | Dari assigned/in_progress; jam penyelesaian dijeda, komentar tetap bisa ditambahkan |
| Lanjutkan | — | assignee | assignee | — | ya | Dari waiting; tenggat penyelesaian digeser sebesar durasi jeda |
| Selesaikan | — | assignee | assignee | — | ya | Wajib ringkasan resolusi ≥ 10 karakter + kode resolusi; approval harus approved untuk non-incident; tidak bisa dari waiting |
| Tutup | — | ya | — | — | ya | Hanya dari status resolved |
| Buka kembali | tiket sendiri | ya | — | — | ya | Dari resolved/closed; resolusi dibersihkan, `reopen_count` bertambah, dan SLA penyelesaian dihitung ulang |
| Approval | — | — | — | tahap 1 (bila ditunjuk) | tahap 2 dan CAB | Hanya sebelum pekerjaan dimulai; CAB khusus CR high risk dan harus lead berbeda |
| Delegasikan approval | — | — | — | tahap aktif miliknya | tahap mana pun | Pengganti harus aktif; tahap Kepala IT/CAB hanya ke Kepala IT; alasan wajib |

**Teknisi (`resolver`)** melihat tiket yang ditugaskan kepadanya dan antrean
timnya (`tickets.team`), lalu dapat mengambil tiket tim yang belum di-assign.
Ia boleh menulis komentar/lampiran internal setelah tiket menjadi miliknya. Ia
tidak boleh triage, meng-assign orang lain, menutup tiket, atau mengelola
aset/problem/KB.
**Pengamat (`viewer`)** hanya membaca laporan dan audit tenant; tidak membuka
tiket dan tidak menulis apa pun.

Setiap aksi ditulis ke audit log (`assign`, `transition`, `triage`, `approve`,
`reject`) dengan aktor dan perubahan status.

### Antrean tim

Tiket dapat dimiliki sebuah **tim/bidang kerja**, terpisah dari unit rumah
sakit. Nilainya: `service_desk`, `application`, `network`, `hardware`,
`database`, `biomedical`, `other`.

- `services.team` menentukan tim default layanan; tiket baru mewarisi nilai ini.
- `tickets.team` dapat dikoreksi lewat triage oleh Staff IT/Kepala IT.
- Teknisi (`resolver`) melihat tiket timnya, termasuk yang belum di-assign, lalu
  menekan **Ambil tiket** untuk menjadi assignee.
- Komentar/lampiran internal tiket tim baru terlihat setelah tiket diambil.
- Teknisi tim lain tidak melihat atau mengambil tiket tersebut.
- Staff IT dan Kepala IT tetap melihat seluruh tiket tenant.

## Merge tiket duplikat

Satu gangguan SIMRS sering dilaporkan dari beberapa unit. Staf IT dapat
menggabungkan laporan duplikat lewat tombol **Gabungkan** di detail tiket:

- Cari tiket tujuan berdasarkan nomor atau judul; tiket harus sejenis dan
  berasal dari rumah sakit yang sama.
- Komentar, lampiran, tautan aset/problem/insiden mayor, dan metadata yang
  belum ada di tujuan dipindahkan ke tiket tujuan.
- Tiket sumber ditutup dengan `resolution_code=duplicate` dan
  `resolution_summary` berisi nomor tiket tujuan; `merged_into` menyimpan
  tiket tujuan, `merged_at`/`merged_by`/`merge_reason` mencatat jejaknya.
- Approval yang masih pending di tiket sumber ditolak dengan alasan merge.
- Audit `merge` ditulis di kedua tiket; pemohon dan assignee tiket sumber
  menerima notifikasi "Tiket digabung". Pemohon sumber juga ditambahkan ke
  delegasi tiket tujuan agar tetap bisa mengikuti perkembangan.
- Tidak ada rantai merge: tiket yang sudah menjadi sumber tidak dapat digabung
  lagi, dan tiket tujuan harus masih aktif.

## Lampiran saat membuat tiket

Form buat tiket menerima sampai 3 lampiran sebelum tiket dikirim. Setelah tiket
dibuat, frontend mengunggah lampiran ke endpoint lampiran yang sudah ada; bila
salah satu gagal, tiket tetap tersimpan dan detail tiket menampilkan peringatan
agar lampiran bisa diunggah ulang secara manual.

## Dashboard dan antrean kerja

Staff IT dan Kepala IT mendarat di `/dashboard` setelah login; Pemohon dan
Teknisi diarahkan ke `/tickets`, sedangkan Pengamat ke `/reports`. Menu
Ringkasan hanya tampil untuk Staff IT/Kepala IT.

| Kartu / panel | Isi |
|---|---|
| Tiket aktif | semua tiket yang belum `resolved`/`closed` |
| Kritis | prioritas `critical` pada tiket aktif |
| SLA lewat | salah satu `*_breach_at` terisi |
| Belum di-assign | tiket aktif tanpa assignee |
| Menunggu approval | `approval_status = pending` |
| Antrean saya | assignee = user, urut breach lalu tenggat terdekat |
| Perlu perhatian | breach atau jatuh tempo ≤ 24 jam |
| Beban per unit / Usia tiket | agregat tiket aktif per unit dan umur |

Daftar tiket menerima query param berikut sehingga tautan dari dashboard selalu
mereproduksi tampilan yang sama:

| Param | Nilai |
|---|---|
| `scope` | `active` (belum resolved/closed) |
| `status` | `open`, `assigned`, `in_progress`, `resolved`, `closed`, `reopened` |
| `priority` | `critical`, `high`, `normal`, `low` |
| `assignee` | `mine`, `unassigned` |
| `sla` | `breached` |
| `approval` | `pending` |
| `q` | pencarian nomor tiket / judul |
| `sort` | `created`, `created_asc`, `updated`, `due` |
| `page` | halaman (25/50/100 per halaman) |

`sort=due` memakai field `next_due_at` — SLA gate yang masih berlaku
(approval untuk SR/CR, resolution untuk incident). Tanpa field ini Change
Request akan selalu muncul di atas karena tidak punya resolution SLA.

## Riwayat aktivitas dan realtime

Halaman detail tiket punya tab **Riwayat** di samping komentar. Datanya berasal
dari `audit_logs` lewat route `GET /api/itsm/tickets/{id}/timeline`, bukan dari
list rule audit (yang tetap khusus IT Lead). Route memproyeksikan satu event per
aksi — create, assign, transition, triage, problem_link, knowledge_link,
approve/reject, comment, attachment,
sla_breach — dan menyembunyikan komentar/lampiran internal dari requester.

- Tiap event berisi aktor, aksi, perubahan yang aman ditampilkan, dan waktu.
  IP dan user-agent tidak pernah dikirim ke client.
- Riwayat dimuat ulang otomatis saat tiket berubah.
- Detail tiket berlangganan realtime untuk record tiket, komentar, dan lampiran
  (`subscribe` PocketBase). Event hanya memicu muat ulang data dengan debounce
  150 ms, jadi status, komentar, dan lampiran tampil tanpa refresh manual.
- Indikator `Live` di panel aktivitas menunjukkan koneksi SSE aktif; jika
  terputus, tampil `Offline` dan halaman tetap bisa dipakai.

Realtime tetap menghormati API rule: requester hanya menerima event komentar
publik pada tiket yang boleh dia lihat.
