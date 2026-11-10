# Uji restore

Folder ini menyimpan bukti uji restore bertanggal. Runbook lengkap ada di
[`docs/OPERATIONS.md`](../OPERATIONS.md).

## Kebijakan

- Uji restore minimal **sekali sebelum pilot**, lalu **setiap 3 bulan**.
- Ulangi setelah upgrade PocketBase besar atau perubahan volume/backup.
- Minimal satu uji harus memakai **backup produksi** di **staging**, bukan
  dataset sintetis.
- Uji juga restore dari salinan **off-host/enkripsi**, bukan hanya file lokal.
- Jangan menguji restore langsung di produksi tanpa volume/backup cadangan.

## Cara mencatat

1. Salin [`TEMPLATE.md`](./TEMPLATE.md) menjadi `YYYY-MM-DD-lingkungan.md`.
2. Isi hasil apa adanya; kegagalan justru bagian penting dari bukti.
3. Lampirkan/ringkas: nama ZIP, checksum, jumlah record, waktu, screenshot
   health/login bila ada.
4. Perbarui tabel indeks di bawah.

## Indeks

| Tanggal | Lingkungan | Backup | Hasil | Catatan |
|---|---|---|---|---|
| 2026-11-10 | Lokal (Windows, dataset sintetis) | `pb_backup_acme_20261110085700.zip` | LULUS | [Lihat](./2026-11-10-local.md) — mekanisme saja, bukan RTO produksi |

## Drill lokal otomatis

```bash
npm run ops:restore-drill
```

Skrip membuat dataset sintetis, backup, restore ke direktori baru, lalu
memverifikasi health/login/tiket/lampiran/jumlah record. Gunakan untuk menguji
mekanisme setelah perubahan skrip/backup; tetap lakukan drill staging dengan
data produksi sebelum pilot.
