# Projekt-Fer

Generator template e-RDKK untuk diunggah ke **https://erdkk25.pertanian.go.id**.

Aplikasi statis satu halaman — seluruh data diolah di dalam peramban, tidak ada
server dan tidak ada data yang dikirim ke mana pun.

Produksi: **https://projekt-fer.vercel.app**

## Yang dikerjakan

- **Impor database poktan** (.xlsx / .xls / .csv). Judul kolom dicocokkan otomatis,
  dan pemetaannya bisa diperbaiki sendiri sebelum diimpor.
- **Impor unduhan SIMLUHTAN** — berkas "Daftar Anggota Kelompok Tani" dikenali
  sendiri tanpa pemetaan kolom. Bawaannya **menggabungkan**: NIK yang sudah ada
  dipertahankan dan hanya kolom kosongnya diisi, anggota baru ditambahkan, tidak
  ada baris yang dibuang. ID Kelompok Tani dari berkas ikut mengisi peta ID poktan.
- **Hitung pupuk otomatis** — `luas lahan × dosis per hektar`, dibulatkan setengah
  ke atas (437,5 → 438) sama seperti berkas ERDKK resmi.
- **Tambah petani satu per satu** lewat formulir, lengkap dengan pratinjau pupuk
  yang berubah seketika dan tombol *Simpan & Baru* untuk entri beruntun.
- **ID Poktan per kelompok** — untuk database yang tidak memuat kolom ID Poktan.
  Isi ID sekali per nama kelompok (ketik, tempel dari Excel, atau impor berkas),
  lalu terapkan ke seluruh baris sekaligus.
- **Isi Musim Tanam massal** — isi MT1/MT2/MT3 sekaligus untuk banyak baris:
  komoditas diambil dari musim lain atau dipilih sendiri, luas mengikuti musim lain,
  persentase darinya, atau nilai tetap. Ada pratinjau jumlah baris & total luas
  sebelum diterapkan, plus opsi mengosongkan satu musim tanam.
- **Gabungkan NIK ganda** (opsional) — satu orang yang terdaftar di dua kelompok
  disatukan menjadi satu baris, luas tiap musim tanam dijumlahkan dan pupuk dihitung ulang.
  NIK ganda **bukan masalah** di aplikasi ini: data diekspor apa adanya sesuai database,
  biar portal e-RDKK yang menilai.
- **Program PM-AAS** — tandai kelompok pesertanya di tab ID Poktan, lalu kuota
  pupuknya (bawaan 300 kg Urea, 400 kg NPK, 1.000 kg Organik per hektar; organik
  bisa disetel 1–2 ton) menimpa dosis komoditas hanya untuk anggota kelompok itu.
- **Tabel kuota pupuk** bisa disunting, diimpor dari berkas
  `Dosis_<tahun>_..._<kecamatan>.xlsx`, atau dikembalikan ke bawaan.
- **Pemeriksaan** sebelum ekspor: NIK bukan 16 digit, NIK ganda, kolom wajib kosong,
  komoditas tanpa dosis, dan luas melebihi batas.
- **Differ** — bandingkan dua berkas (misalnya ERDKK tahun lalu dan tahun ini) untuk
  mencari data yang hilang. Dikunci pada NIK, hasilnya empat kelompok yang saling
  lepas: *hilang*, *pindah kelompok*, *luas turun*, dan *baru*. Ada rekap per
  kelompok tani dan unduhan laporannya. Lihat [Cara kerja Differ](#cara-kerja-differ).
- **Ekspor** ke template ERDKK resmi (28 kolom, A–AB) — judul kolom persis, NIK
  ditulis sebagai teks agar tidak berubah jadi notasi ilmiah, dan opsi memisah berkas
  **per desa** atau **per kelompok tani**. Tiap kelompok juga bisa diunduh satuan
  lewat tombol di tab ID Poktan.
- **Cadangan** seluruh data (termasuk nama petani & poktan) sebagai satu berkas Excel.

## Struktur template

Kolom A–AB mengikuti berkas resmi **2027**, yang memakai penamaan
`Periode Tanam I / II / III`:

```
Nama Penyuluh | KTP | Nama Ibu Kandung | Kode Desa | ID Poktan |
Kode Kios Pengecer | Subsektor | Komoditas Periode Tanam I |
Luas Lahan (Ha) Periode Tanam I | …
```

Judul kolomnya ditulis langsung dari berkas resmi lewat skrip, bukan diketik ulang —
22 dari 28 nama berubah dari versi 2026, dan portal menolak berkas yang judulnya
tidak persis.

Perbedaan dari template 2026 yang perlu diingat:

| 2026 | 2027 |
|---|---|
| `Kode Kios` | `Kode Kios Pengecer` |
| `Komoditas MT1` | `Komoditas Periode Tanam I` |
| `Luas Lahan (Ha)  MT2` (**dua spasi**) | `Luas Lahan (Ha) Periode Tanam II` (satu spasi) |
| Sheet `Worksheet` | Sheet `2027` |

Spasi ganda itu keanehan khas berkas 2026 dan sudah **tidak ada lagi** di 2027.
Impor tetap menerima kedua penamaan, sebab database lama masih memakai `MT1`.

Kolom `sp36` dan `poc` ada di berkas dosis tetapi **tidak ada** di template, jadi
tidak ikut diekspor.

## Cara kerja Differ

Dicocokkan lewat **NIK** — satu-satunya kolom identitas yang pasti ada di template
ERDKK. Baris tanpa NIK dilewati, dan NIK yang muncul lebih dari sekali dalam satu
berkas digabung dengan luasnya dijumlahkan (tanpa itu, satu NIK bisa terhitung
"hilang" sekaligus "tetap").

Template ERDKK tidak memuat nama petani maupun nama kelompok, hanya NIK dan
ID Poktan. Nama dilengkapi berurutan dari: sisi lain perbandingan, data petani di
aplikasi, lalu peta nama→ID di tab ID Poktan. Supaya laporannya enak dibaca, impor
dulu database terbarunya ke tab Data Petani.

Hasil perbandingan **tidak disimpan** ke `localStorage` — ini alat periksa sekali
pakai, bukan data yang dirawat.

## Kuota pupuk bawaan

Dosis **2027** Kec. Pitu Riawa, Kab. Sidenreng Rappang (kg/Ha) sudah dimuat sebagai
bawaan. Untuk kecamatan lain, impor berkas dosis yang sesuai lewat tab
**Kuota Pupuk**.

## Menjalankan secara lokal

Perlu server HTTP — aplikasi memakai ES module, jadi membuka `index.html` lewat
`file://` tidak jalan.

```bash
npx --yes serve -l 4329
```

Lalu buka `http://localhost:4329`. Server statis apa pun bisa dipakai.

## Susunan berkas

```
index.html
vercel.json             header keamanan & aturan cache
assets/css/
  app.css               tata letak & tema terang/gelap
  fonts.css             Instrument Sans + JetBrains Mono (lokal)
  icons.css             ikon Tabler sebagai mask SVG — hanya yang dipakai
assets/fonts/           woff2, disertakan supaya tanpa CDN
assets/js/
  schema.js             struktur template, dosis bawaan, alias kolom
  store.js              state, penyimpanan lokal, hitung pupuk, validasi, banding
  xlsxio.js             baca berkas & tulis template
  app.js                antarmuka
  xlsx.full.min.js      SheetJS 0.20.3 (disertakan, tanpa CDN)
```

Berkas JS dimuat dengan penanda versi (`?v=…`) yang dinaikkan tiap rilis. Penanda
itu **harus sama di semua rujukan** — `./store.js` dan `./store.js?v=1` dianggap dua
modul berbeda oleh peramban, dan state-nya akan terbelah kalau tidak konsisten.

## Rilis

Repo tersambung ke Vercel, jadi **`git push` ke `master` menerbitkan ke produksi**.
Tidak perlu `vercel --prod` lagi — dan sebaliknya, apa pun yang di-push akan tayang.

Riwayat git juga dicadangkan otomatis ke OneDrive sebagai satu berkas bundle lewat
git hook `post-commit`. Hook tidak ikut terlacak git: kalau repo ini di-klon ulang,
hook-nya harus dipasang lagi.

## Catatan

Data tersimpan di `localStorage` peramban. Membersihkan data situs akan menghapusnya —
gunakan **Ekspor → Unduh Cadangan** sebelum berpindah perangkat atau peramban.
