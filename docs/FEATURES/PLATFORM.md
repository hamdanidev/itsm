# Multi-tenant dan konsol vendor

Mode tenancy, konsol vendor lintas rumah sakit, dan isolasi data per tenant.

Bagian ini dipindahkan dari README (perapian dokumen 2026-11-10). Daftar route ada di [API.md](../API.md); data model di [DATA-MODEL.md](../DATA-MODEL.md).

## Mode tenancy

Kode yang sama dipakai pada dua bentuk instalasi. Bentuk instalasi ditentukan
environment `TENANCY_MODE` (bukan setting database, dan tidak dapat dinaikkan
dari dalam aplikasi):

| Mode | Isi `tenants` | Konsol Vendor | Login akun vendor |
|---|---|---|---|
| `standalone` (default) | tepat 1 baris | tersembunyi | ditolak (403) |
| `vendor` | banyak baris | aktif | diizinkan |

Nilai tidak dikenal jatuh ke `standalone` (gagal tertutup). Isinya bisa
diletakkan di `.env` (dibaca `scripts/lib/pocketbase.mjs` dan diteruskan ke
PocketBase, sama seperti Docker) atau dari shell:

```powershell
$env:TENANCY_MODE="vendor"; npm run dev
```

Perubahan mode tidak mengubah data: instalasi standalone bisa dinaikkan ke
vendor kapan saja.

Mode ditegakkan di tiga tempat, karena API rule PocketBase statis dan tidak bisa
membaca environment:

1. `onRecordAuthRequest` menolak login **dan refresh** akun platform saat mode
   bukan vendor, sehingga sesi lama tidak bertahan.
2. Route `/api/itsm/platform/*` memanggil `tenancy.assertVendor()`.
3. Frontend menyembunyikan menu dari `GET /api/itsm/app-meta`.

### Konsol Vendor

Hanya untuk akun `is_platform_staff`. `role` tetap menentukan kewenangan:
`it_lead` = admin konsol (boleh membuat/mengubah), `it_support` = hanya baca.

| Kemampuan | Keterangan |
|---|---|
| Daftar rumah sakit | Nama, kode, zona waktu, status, jumlah pengguna, tiket aktif |
| Tambah rumah sakit | Membuat tenant + data master default + akun IT pertama dalam satu transaksi |
| Data master default | 10 unit, 9 kategori, 12 kebijakan SLA, 3 hari libur, 6 layanan + 7 item; idempoten, bisa diulang |
| Data master per RS | Kelola unit, kategori, kebijakan SLA, dan hari libur setelah RS berjalan |
| Pengguna tenant | Tambah pengguna, aktif/nonaktif, reset password |
| Audit | Setiap aksi menulis `audit_logs` dengan `actor_role` berawalan `platform_` |

Semua pembacaan lintas tenant dilakukan di server dengan filter eksplisit. Akun
platform tidak membaca koleksi lewat rule tenant biasa; cabang
`is_platform_staff` dibahas di bagian berikut.

### Vendor sebagai resolver tiket

Akun vendor tidak berhenti di konsol: mereka mengerjakan tiket rumah sakit.

| Kemampuan | Keterangan |
|---|---|
| Pemilih rumah sakit | Dropdown di top bar; pilihan tersimpan dan menjadi konteks kerja |
| Antrean tiket | `Tiket` di sidebar menampilkan tiket rumah sakit aktif, termasuk "Tiket saya" |
| Assignee | Staf vendor muncul bersama staf rumah sakit di dropdown assignee |
| Kerja tiket | Komentar (publik/internal), mulai, menunggu, selesaikan, tutup, buka kembali |
| Approval | Lead vendor bisa menyetujui tahap IT Lead/CAB dan menerima delegasi |
| Notifikasi | Penugasan, komentar, approval, dan tiket kritis ikut masuk ke akun vendor |
| Laporan lintas RS | Compliance dan median per rumah sakit, plus tabel perbandingan antar RS |
| Audit lintas RS | Jejak aktivitas semua RS: aktor, aksi, tiket/data master, perubahan, IP |

Aturan mainnya:

- Vendor **membaca** data semua rumah sakit lewat cabang rule
  `is_platform_staff = true`; penulisan tetap lewat route `/api/itsm/*`.
- Vendor **tidak bisa membuat tiket** (akun platform tidak punya tenant/unit)
  dan tidak bisa mengubah data master rumah sakit dari UI tiket.
- Gate CAB tetap menghitung IT Lead rumah sakit saja, agar jumlah akun vendor
  tidak mengubah alur approval tenant.
- Setiap aksi tercatat di `audit_logs` milik rumah sakit terkait dengan
  `actor_role` `platform_*`, jadi IT Lead rumah sakit bisa melihatnya.
- Pemilih tenant adalah filter UI, bukan batas keamanan: vendor memang boleh
  melihat semua RS.
- Pemilih mengikuti tiket yang dibuka. Membuka tiket RS lain lewat tautan atau
  notifikasi akan memindahkan pemilih ke RS pemilik tiket, dan mengganti RS
  saat halaman detail terbuka akan kembali ke daftar tiket RS yang baru
  (tidak pernah menampilkan tiket RS lain di bawah pemilih yang berbeda).

## Tenant

`tenants` adalah identitas organisasi (rumah sakit) sekaligus batas isolasi
data. Setiap akun rumah sakit memiliki tepat satu `tenant`; akun platform tidak
punya tenant sama sekali. Backend mengambil tenant dari `e.auth`, bukan dari body
request, dan seluruh API rule memfilter `tenant = @request.auth.tenant`.

- Satu baris seed: `Rumah Sakit Contoh` (`RS01`), `Asia/Jakarta`, aktif.
- Sidebar menampilkan `name` dan `code` tenant (avatar diambil dari inisial
  nama), bukan teks hardcoded.
- Menonaktifkan tenant (`is_active = false`) memblokir login baru semua
  penggunanya karena rule auth user memakai `tenant.is_active`. Sesi yang sedang
  berjalan tetap hidup sampai token akses kedaluwarsa.
- Di mode vendor, tenant dibuat dan diubah dari Konsol Vendor. Di mode
  standalone, tenant tunggal tetap dapat diubah superuser lewat Admin UI.
- `timezone` tenant disimpan dan dipakai saat membuat kebijakan SLA default
  tenant baru, tetapi perhitungan SLA tetap memakai `sla_policies.timezone`.
- Akun vendor diarahkan ke `/platform` setelah login; semua route ruang kerja
  tenant (`/tickets`, `/dashboard`, `/admin`, `/reports`) mengalihkannya kembali.

## Detail teknis: penegakan tenancy

> Pelengkap bagian di atas: kontrak level field dan detail implementasi (dipindahkan dari SCHEMA, 2026-11-10).

Mode dibaca `lib/tenancy.js` saat request (bukan dari database) dan tidak
mengubah schema maupun data, sehingga instalasi standalone bisa naik ke vendor
tanpa migrasi. Akun platform (`is_platform_staff = true`) bertindak sebagai
resolver: mereka boleh **membaca** tiket semua rumah sakit, tetapi penulisan
tetap lewat route `/api/itsm/*` yang memeriksa role dan kepemilikan tiket per
record.

### Akses vendor ke data rumah sakit

Rule baca yang diberi cabang `@request.auth.is_platform_staff = true`:
`tickets`, `ticket_comments`, `ticket_attachments`, `ticket_approvals`,
`notifications`, `users`, `units`, `ticket_categories`, `services`,
`service_items`, `problems`, `problem_tickets`, `knowledge_articles`, `assets`,
`asset_tickets`, `service_cis`, `sla_policies`, `holidays`, `tenants`. Cabang
tenant lama tidak diubah, sehingga akun rumah sakit tetap terisolasi.
`ticket_csat` sengaja tidak punya rule baca/tulis langsung; akses hanya lewat
route `/api/itsm/tickets/{id}/csat`.

`users` juga membuka `is_platform_staff = true` untuk pembaca tenant, supaya nama
assignee/approver vendor bisa di-expand di tiket rumah sakit. Field sensitif
tetap disembunyikan `onRecordEnrich` (hanya diri sendiri / IT Lead /
superuser).

Konsekuensi lain yang disengaja:

- `guards.findTicket` menerima akun platform untuk tiket tenant mana pun;
  `assertSameTenant` dan `canAccessTicket` punya cabang platform.
- Assignee boleh staf rumah sakit pemilik tiket **atau** staf vendor aktif.
  Staf vendor bisa menugaskan tiket ke dirinya sendiri; staf rumah sakit yang
  bisa melihat akun vendor juga bisa mengescalate ke vendor.
- Delegasi approval boleh ditujukan ke staf vendor.
- Notifikasi approval dikirim ke lead rumah sakit + lead vendor
  (`notify.approvalAlerts`), termasuk notifikasi tiket kritis.
- **Gate CAB tetap menghitung lead rumah sakit saja** (`notify.activeLeads`),
  agar jumlah akun vendor tidak mengubah alur approval tenant mana pun.
- Audit mencatat aktor vendor dengan `actor_role` berawalan `platform_`
  (mis. `platform_it_lead`), pada tenant tiket yang bersangkutan.
- Vendor tidak bisa membuat tiket: route create membutuhkan `tenant` dan `unit`
  milik akun, yang tidak dimiliki akun platform.

### Layar audit vendor

`GET /api/itsm/platform/audit` membaca `audit_logs` lintas tenant tanpa
melonggarkan rule koleksi (rule baca audit tetap milik IT Lead per tenant).

Parameter: `tenant`, `actor` (id user), `scope` (`platform` / `tenant` /
`superuser`), `action`, `collection`, `q` (nomor tiket), `from`, `to`, `page`,
`perPage` (maks 100; default 25). Rentang tanggal memakai parser laporan
(default 90 hari, maks 366).

Respons memuat `items` yang sudah dilengkapi `tenant_name`, `tenant_code`,
`actor_name`, `actor_role`, `actor_scope`, `ticket_no`, `changes`, `ip`, dan
`user_agent`, plus `totalItems`, `totalPages`, dan `actors` (pilihan filter
aktor: staf vendor + staf tenant terpilih).

### Layar audit rumah sakit

`GET /api/itsm/audit` dipakai Kepala IT dan Pengamat. Tenant selalu diambil
dari `e.auth`; parameter `tenant` diabaikan. Parameter lain sama dengan audit
vendor. Pengamat tidak membuka koleksi `audit_logs`; route ini yang membaca
untuknya. Rule koleksi tetap hanya untuk Kepala IT.

Catatan semantik:

- `scope=tenant` berarti staf rumah sakit saja; baris `superuser` tidak ikut.
- Aksi vendor tercatat dengan `actor_role` `platform_*` dan `actor_scope`
  `platform`.
- Perubahan data master lewat Admin UI (superuser) tercatat dengan
  `actor_role = "superuser"` dan **tanpa** relasi `actor`, karena superuser
  bukan record `users`. Sebelumnya baris ini tidak tersimpan sama sekali.

### Data master per rumah sakit

`GET`/`POST`/`PATCH` pada `/api/itsm/platform/tenants/{id}/master...` memberi
vendor akses kelola unit, kategori, kebijakan SLA, dan hari libur tanpa
melonggarkan rule tulis `LEAD && TENANT` milik rumah sakit.

- `kind`: `units` | `categories` | `policies` | `holidays`.
- Baca untuk semua akun platform; tulis hanya `role = it_lead` (vendor admin).
- Setiap record dipaksa `tenant = {id}` dari URL. Record milik tenant lain
  menghasilkan 404, termasuk saat `recordId` valid tetapi beda rumah sakit.
- Validasi di `lib/master_data.js`: kode huruf besar 1–20 karakter, jenis
  unit/kategori dikenal, jam `HH:MM` dengan mulai < selesai, hari kerja 1–7,
  respons ≥ 1 menit, tanggal `YYYY-MM-DD`.
- Keunikan dijaga manual: `(tenant, code)` untuk unit/kategori,
  `(tenant, ticket_type, priority)` untuk kebijakan SLA, `(tenant, date)` untuk
  hari libur. Pelanggaran → 400.
- Manajer unit harus pengguna aktif pada rumah sakit yang sama.
- Tidak ada hard delete; gunakan `is_active = false` agar riwayat tiket lama
  tetap valid.
- Setiap create/update menulis `audit_logs` pada tenant terkait dengan
  `collection_name` yang diubah dan `actor_role` platform.

Di UI, vendor memilih satu rumah sakit aktif lewat pemilih tenant di top bar.
Pilihan disimpan di `localStorage` dan menjadi filter daftar tiket; ia **bukan**
batas keamanan (vendor memang boleh melihat semua), melainkan konteks kerja.

Halaman detail tiket menyelaraskan pemilih ke tenant tiket saat dibuka (sekali
per tiket), sehingga membuka tautan/notifikasi tiket RS lain tidak
meninggalkan pemilih di RS yang salah. Mengganti rumah sakit dari halaman
detail mengalihkan ke daftar tiket rumah sakit yang baru, bukan menampilkan
tiket RS lain di bawah pemilih tersebut.
