# Projekt-Fer

Generator template e-RDKK untuk diunggah ke **https://erdkk25.pertanian.go.id**.

Aplikasi statis satu halaman — seluruh data diolah di dalam peramban, tidak ada
server dan tidak ada data yang dikirim ke mana pun.

## Yang dikerjakan

- **Impor database poktan** (.xlsx / .xls / .csv). Judul kolom dicocokkan otomatis,
  dan pemetaannya bisa diperbaiki sendiri sebelum diimpor.
- **Hitung pupuk otomatis** — `luas lahan × dosis per hektar`, dibulatkan setengah
  ke atas (437,5 → 438) sama seperti berkas ERDKK resmi.
- **Tambah petani satu per satu** lewat formulir, lengkap dengan pratinjau pupuk
  yang berubah seketika dan tombol *Simpan & Baru* untuk entri beruntun.
- **ID Poktan per kelompok** — untuk database yang tidak memuat kolom ID Poktan.
  Isi ID sekali per nama kelompok (ketik, tempel massal dari Excel, atau impor berkas),
  lalu terapkan ke seluruh baris sekaligus.
- **Isi Musim Tanam massal** — isi MT1/MT2/MT3 sekaligus untuk banyak baris:
  komoditas diambil dari musim lain atau dipilih sendiri, luas mengikuti musim lain,
  persentase darinya, atau nilai tetap. Ada pratinjau jumlah baris & total luas
  sebelum diterapkan, plus opsi mengosongkan satu musim tanam.
- **Gabungkan NIK ganda** (opsional) — satu orang yang terdaftar di dua kelompok
  disatukan menjadi satu baris, luas tiap musim tanam dijumlahkan dan pupuk dihitung ulang.
  NIK ganda **bukan masalah** di aplikasi ini: data diekspor apa adanya sesuai database,
  biar portal e-RDKK yang menilai.
- **Tabel dosis** bisa disunting, diimpor dari berkas `Dosis_<tahun>_..._<kecamatan>.xlsx`,
  atau dikembalikan ke bawaan.
- **Pemeriksaan** sebelum ekspor: NIK bukan 16 digit, NIK ganda, kolom wajib kosong,
  komoditas tanpa dosis, dan luas melebihi batas.
- **Ekspor** ke template ERDKK resmi (28 kolom, A–AB) — judul kolom persis, NIK
  ditulis sebagai teks agar tidak berubah jadi notasi ilmiah, dan opsi memisah berkas
  **per desa** atau **per kelompok tani**. Tiap kelompok juga bisa diunduh satuan
  lewat tombol di tab ID Poktan.
- **Cadangan** seluruh data (termasuk nama petani & poktan) sebagai satu berkas Excel.

## Struktur template

Kolom A–AB mengikuti berkas resmi. Dua di antaranya memakai **dua spasi**
(`Luas Lahan (Ha)  MT2` dan `MT3`) — jangan diubah, sistem e-RDKK mencocokkan judul
kolom secara harfiah.

Kolom `sp36` dan `poc` ada di berkas dosis tetapi **tidak ada** di template, jadi
tidak ikut diekspor.

## Dosis bawaan

Dosis 2026 Kec. Pitu Riawa, Kab. Sidenreng Rappang (kg/Ha) sudah dimuat sebagai
bawaan. Untuk kecamatan lain, impor berkas dosis yang sesuai lewat tab **Dosis Pupuk**.

## Menjalankan secara lokal

```bash
python -m http.server 4329
```

Buka `http://localhost:4329`. Perlu server HTTP karena aplikasi memakai ES module.

## Susunan berkas

```
index.html
assets/css/app.css
assets/js/
  schema.js         struktur template, dosis bawaan, alias kolom
  store.js          state, penyimpanan lokal, hitung pupuk, validasi
  xlsxio.js         baca berkas & tulis template
  app.js            antarmuka
  xlsx.full.min.js  SheetJS 0.18.5 (disertakan, tanpa CDN)
```

## Catatan

Data tersimpan di `localStorage` peramban. Membersihkan data situs akan menghapusnya —
gunakan **Ekspor → Unduh Cadangan** sebelum berpindah perangkat atau peramban.
