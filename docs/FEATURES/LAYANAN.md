# Layanan, katalog, triage, dan intake QR

Katalog layanan dan item permintaan, triage oleh staf IT, serta intake publik lewat QR per unit.

Bagian ini dipindahkan dari README (perapian dokumen 2026-11-10). Daftar route ada di [API.md](../API.md); data model di [DATA-MODEL.md](../DATA-MODEL.md).

## Katalog layanan dan triage

Tiket bisa dikaitkan ke satu **layanan** dan satu **item permintaan**. Katalog
dikelola Kepala IT di **Pengaturan > Layanan**; pengguna memilihnya dari
`/catalog` atau langsung di form tiket.

| Konsep | Isi |
|---|---|
| `services` | nama, kode, deskripsi, service owner, unit pendukung, tim default, SLA default |
| `service_items` | nama, kode, deskripsi, `approval_mode`, SLA item, urutan |
| `tickets.service` / `service_item` | layanan dan item yang dipilih saat intake/triage |
| `tickets.requested_for` | pemohon sebenarnya bila staf mencatat atas nama pengguna lain |
| `tickets.location` | poli/ruangan/lokasi perangkat |
| `tickets.approval_mode` | snapshot mode approval saat tiket dibuat |

Mode approval per item:

| Mode | Perilaku |
|---|---|
| `none` | tanpa approval; cocok untuk reset password atau permintaan rutin |
| `manager` | manajer unit; bila tidak ada, fallback ke IT Lead |
| `lead` | IT Lead saja |
| `cab` | manajer unit → IT Lead → CAB (CAB hanya untuk CR high risk) |
| `default` | perilaku lama: manajer unit → IT Lead → CAB |

Prioritas SLA: **SLA item → SLA default layanan → policy tipe × prioritas**.
Tiket menyimpan `sla_policy` dan `sla_snapshot`, sehingga perubahan katalog
tidak mengubah tiket lama.

Triage (`POST /api/itsm/tickets/{id}/triage`) hanya untuk staf IT, hanya pada
status `open`/`assigned`, dan hanya sebelum ada approval yang diputuskan. Staf
dapat mengubah prioritas, dampak, kategori, layanan, item, dan lokasi. Bila
layanan/item berubah, alur approval yang masih pending dibangun ulang; SLA
dihitung ulang dari waktu tiket dibuat dan breach/escalation lama dibersihkan
(nilainya tetap tersimpan di audit). Triage wajib menyertakan alasan minimal 5
karakter.

Staf juga dapat mencatat tiket dari kanal non-web (`source` = `phone`,
`email`, `whatsapp`) dan mengisi `requested_for`, `reporter_name`, serta
`reporter_contact`. Requester biasa selalu tercatat sebagai dirinya sendiri.

Change Request wajib mengisi `change_outcome` (`successful`, `partial`,
`failed`, `rolled_back`) saat resolved; `actual_start` diisi saat pekerjaan
dimulai dan `actual_end` saat resolved.

## Intake QR publik

Setiap unit dapat memiliki satu titik QR. Staf memindai stiker, mengisi form
tanpa login, dan tiket langsung masuk ke antrean tim yang tepat.

- **Pengaturan > Titik QR** (Kepala IT): buat titik dengan unit, lokasi, dan
  batas tiket per jam; cetak lembar A5, salin tautan, rotasi token, atau
  nonaktifkan titik.
- **URL publik** `/i/{token}`: hanya menampilkan nama rumah sakit, logo, layanan
  aktif, item, dan pilihan dampak. Tidak ada daftar pengguna, aset, tiket, atau
  data internal lain.
- **Identitas:** pelapor mengisi nama dan email/WhatsApp. Tiket memakai
  `requester` kosong, `reporter_name`/`reporter_contact` terisi, dan unit diambil
  dari titik QR — bukan dari body request.
- **Lampiran:** maksimal 3 file, 10 MB per file (PDF, PNG, JPG, WEBP, TXT, LOG).
  Screenshot bug bisa dikirim sejak awal. Lampiran tamu disimpan tanpa akun
  pengunggah.
- **Alur tiket:** `source=web`, `intake_channel=qr`, `intake_ref` = titik QR.
  SLA, approval, dan penugasan berjalan sama seperti tiket lain.
- **Status & CSAT tamu:** setiap tiket QR mendapat `public_token` acak. Pelapor
  dapat membuka `/t/{token}` tanpa login untuk melihat status, komentar publik,
  target SLA, dan ringkasan penyelesaian. Setelah tiket `resolved`/`closed`,
  halaman yang sama menampilkan form CSAT satu kali. Komentar internal, daftar
  pengguna, aset, dan audit mentah tidak pernah dikirim ke halaman publik.
- **Email konfirmasi:** bila kontak pelapor berupa email, sistem mengantrekan
  email berisi nomor tiket dan tautan status. Kegagalan antrean tidak membatalkan
  tiket. Kontak WhatsApp/telepon tetap mendapat tautan di layar sukses.
- **Pengamanan:** rate limit per titik (default 20/jam), honeypot, token yang
  dapat dicabut, attestation data pasien wajib, serta validasi tipe/ukuran
  lampiran. Batas per IP tidak dipakai karena di produksi semua request melewati
  reverse proxy yang sama.
- **Batasan:** tautan status hanya membuka satu tiket dan tidak dapat dipakai
  untuk menulis komentar. Change Request tetap tidak dapat diajukan dari kanal
  publik.
