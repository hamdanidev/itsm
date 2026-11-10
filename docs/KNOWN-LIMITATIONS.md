# Batasan yang diketahui

Daftar ini dipindahkan dari SCHEMA (perapian dokumen 2026-11-10). Batasan berlaku pada rilis 2026-11-10; perbarui bersama fitur yang menutupnya.

- Problem belum punya laporan aging/repeat incident rate khusus di halaman
  Laporan; ringkasan operasional ada di halaman Problem dan Knowledge.
- Knowledge base belum punya editor rich text, versi artikel, atau workflow
  review multi-approver; lifecycle draft → review → published → retired dijaga
  route.
- Katalog layanan (Increment A) belum punya dynamic form builder atau checklist
  fulfillment; item hanya membawa deskripsi, approval mode, dan SLA. Vendor
  hanya baca katalog; penulisan lewat konsol vendor belum dibuka.
- Triage hanya boleh sebelum pekerjaan dimulai; setelah `in_progress`, koreksi
  prioritas/layanan harus lewat alur perubahan atau penanganan manual.
- CAB memakai IT Lead kedua (belum ada peran/komite CAB terpisah). Yang dihitung
  hanya IT Lead **rumah sakit**; lead vendor tidak menambah kursi CAB, sehingga
  jumlah akun vendor tidak mengubah alur approval tenant.
- Delegasi tidak otomatis dari kalender cuti dan belum dapat dicabut sebelum
  tahap diputuskan; penerima delegasi tetap punya akses baca tiket.
- SLA approval per tahap memakai `sla_snapshot` tiket, bukan policy terbaru.
- Eskalasi Level 3 terlihat in-app (badge + timeline + notifikasi) dan dikirim
  lewat email bila penerima mengaktifkan preferensi; WhatsApp belum ada.
- Dashboard belum punya tren historis atau ekspor; agregatnya dihitung di
  client dari tiket aktif per tenant (bukan seluruh riwayat). Gunakan halaman
  Laporan untuk tren dan ekspor.
- Laporan menghitung ulang dari field tiket saat ini (tidak ada snapshot
  laporan), belum bisa difilter per unit dari UI, dan belum dikirim otomatis
  lewat email/PDF. Rentang dibatasi 366 hari dan agregasi berjalan di server
  (JS) atas tiket pada rentang tersebut.
- Profil belum punya 2FA/OTP dan avatar tidak dimoderasi; kebijakan password
  hanya panjang minimal 8 karakter. File avatar disajikan tanpa token (nama file
  acak), jadi jangan dipakai untuk data sensitif.
- Provisioning akun: IT Lead rumah sakit mengelola timnya lewat tab **Tim** di
  `/admin`; undangan berisi password sementara dikirim lewat SMTP bila aktif,
  atau diserahkan manual bila SMTP mati. Akun platform tetap hanya bisa dibuat
  superuser. Belum ada verifikasi email saat pemilik akun ingin mengganti
  alamat email.
- Lupa password: tautan memakai token bertanda tangan dengan masa berlaku dari
  setelan collection `users`; pembatasan satu permintaan per menit per pengguna.
  Bila SMTP belum aktif, pengguna tidak menerima tautan dan harus meminta IT
  Lead mereset dari tab Tim.
- Email: password sementara dikirim sebagai teks biasa di isi email, jadi SMTP
  wajib memakai TLS di produksi. Email notifikasi bisa dimatikan per pengguna;
  undangan dan reset password tetap dikirim. `MAIL_TRANSPORT=capture` menyimpan
  salinan email (termasuk password) hanya untuk test/development.
- Logo: route `/api/itsm/branding/logo` bersifat publik pada mode standalone
  (hanya mengembalikan logo rumah sakit aktif), jadi jangan unggah gambar yang
  memuat data sensitif. Pada mode vendor route ini 404.
- Konsol Vendor: akun vendor sudah bisa menjadi assignee, approver, dan penerima
  notifikasi tiket lintas tenant (Fase 2), serta mengelola data master rumah
  sakit dari konsol. Yang belum: membuat tiket (akun platform tidak punya
  tenant/unit) dan mengubah data master dari UI tiket (hanya lewat konsol).
- Gate CAB hanya menghitung IT Lead rumah sakit. Rumah sakit yang sepenuhnya
  dioperasikan vendor (tanpa lead sendiri) tidak akan pernah membentuk tahap
  CAB, meski vendor punya beberapa lead. Vendor tetap bisa menyetujui tahap
  IT Lead dan bisa didelegasikan.
- Pemilih tenant menyaring daftar tiket/notifikasi di UI, bukan batas keamanan:
  akun vendor memang boleh membaca semua tenant. Dashboard gabungan semua RS
  belum ada; laporan dan audit lintas RS sudah tersedia.
- Reset password oleh vendor tidak mencabut token akses yang masih berlaku;
  pengguna lama tetap aktif sampai token kedaluwarsa.
- Mode tenancy hanya bisa diubah lewat environment; tidak ada tombol ubah mode
  di aplikasi (disengaja agar mode tidak bisa dinaikkan dari dalam).
- Belum ada SSO.
- Perhitungan SLA memakai zona policy/tenant dan sadar DST, tetapi belum ada
  editor zona per policy di UI: zona policy mengikuti zona rumah sakit (diselaraskan
  saat zona tenant diubah).
- Deteksi data pasien bersifat kebijakan + attestation, bukan DLP.
- PocketBase berjalan sebagai satu instance; jangan scale horizontal dengan
  SQLite yang sama.
