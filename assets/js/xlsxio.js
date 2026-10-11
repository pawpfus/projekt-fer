/* ============================================================
   xlsxio.js — baca berkas database poktan / dosis, tulis template ERDKK
   ============================================================ */

import {
  TEMPLATE_HEADERS, PUPUK, FIELDS, DOSIS_ALIAS, normHeader,
} from './schema.js?v=20261011';
import {
  state, uid, cleanKtp, num, numLuas, txt, upper, recalcPetani, emptyMt,
} from './store.js?v=20261011';

/* ── BACA ────────────────────────────────────────────────── */

export function readWorkbook(arrayBuffer) {
  return XLSX.read(arrayBuffer, { type: 'array', cellDates: true, raw: false });
}

/** Ambil isi sheet sebagai matriks (array of array), sel kosong = ''. */
export function sheetToMatrix(wb, sheetName) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false, raw: true });
}

/** Tebak baris judul: baris dengan sel terisi terbanyak di 10 baris pertama. */
export function guessHeaderRow(matrix) {
  let best = 0, bestScore = -1;
  const limit = Math.min(10, matrix.length);
  for (let i = 0; i < limit; i++) {
    const row = matrix[i] || [];
    const filled = row.filter((c) => txt(c) !== '').length;
    const texty = row.filter((c) => typeof c === 'string' && txt(c) !== '').length;
    const score = filled + texty;
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

/** Cocokkan judul kolom berkas dengan field aplikasi. @returns {Object<string,number>} key → indeks kolom */
export function autoMap(headers) {
  const norm = headers.map(normHeader);
  const used = new Set();
  const map = {};

  const take = (idx, key) => { map[key] = idx; used.add(idx); };

  // 1) kecocokan persis
  FIELDS.forEach((f) => {
    if (map[f.key] != null) return;
    for (const a of f.alias) {
      const i = norm.findIndex((h, ix) => !used.has(ix) && h === normHeader(a));
      if (i >= 0) { take(i, f.key); return; }
    }
  });
  // 2) kecocokan sebagian (judul mengandung alias)
  FIELDS.forEach((f) => {
    if (map[f.key] != null) return;
    for (const a of f.alias) {
      const na = normHeader(a);
      if (na.length < 4) continue;
      const i = norm.findIndex((h, ix) => !used.has(ix) && h.includes(na));
      if (i >= 0) { take(i, f.key); return; }
    }
  });
  return map;
}

/** Ubah baris mentah + pemetaan menjadi daftar record petani (belum dihitung). */
export function rowsToPetani(matrix, headerRow, map, opts = {}) {
  const body = matrix.slice(headerRow + 1);
  const get = (row, key) => {
    const i = map[key];
    return i == null || i < 0 ? '' : row[i];
  };
  const out = [];

  for (const row of body) {
    if (!row || row.every((c) => txt(c) === '')) continue;

    const p = {
      id: uid(),
      namaPetani: txt(get(row, 'namaPetani')),
      ktp: cleanKtp(get(row, 'ktp')),
      namaIbu: upper(get(row, 'namaIbu')),
      namaPenyuluh: txt(get(row, 'namaPenyuluh')) || txt(opts.namaPenyuluh),
      kodeDesa: txt(get(row, 'kodeDesa')) || txt(opts.kodeDesa),
      namaDesa: upper(get(row, 'namaDesa')) || upper(opts.namaDesa),
      idPoktan: txt(get(row, 'idPoktan')) || txt(opts.idPoktanDefault),
      namaPoktan: upper(get(row, 'namaPoktan')),
      kodeKios: txt(get(row, 'kodeKios')) || txt(opts.kodeKios),
      namaKios: upper(get(row, 'namaKios')) || upper(opts.namaKios),
      subsektor: upper(get(row, 'subsektor')),
      mt: [0, 1, 2].map((i) => {
        const kom = upper(get(row, `mt${i + 1}Komoditas`));
        const luas = numLuas(get(row, `mt${i + 1}Luas`));
        // komoditas berluas 0 = musim tanam kosong (pola umum "PADI · 0" pada MT3)
        return {
          ...emptyMt(),
          komoditas: kom === '-' || luas <= 0 ? '' : kom,
          luas: luas > 0 ? luas : 0,
        };
      }),
    };

    // database tanpa kolom ID Poktan: ambil dari peta nama poktan → ID
    if (!p.idPoktan && p.namaPoktan) p.idPoktan = txt(state.poktanId[upper(p.namaPoktan)]);

    // baris tanpa identitas & tanpa komoditas apa pun dianggap sampah
    const kosong = !p.ktp && !p.namaPetani && !p.mt.some((m) => m.komoditas);
    if (kosong) continue;

    if (opts.salinMt2 && !p.mt[1].komoditas && p.mt[0].komoditas && map.mt2Komoditas == null) {
      p.mt[1].komoditas = p.mt[0].komoditas;
      p.mt[1].luas = p.mt[0].luas;
    }
    out.push(p);
  }
  return out;
}

/* ── BACA DOSIS ──────────────────────────────────────────── */

export function parseDosisSheet(matrix) {
  if (!matrix.length) return { rows: [], meta: null };
  const hr = guessHeaderRow(matrix);
  const headers = (matrix[hr] || []).map(normHeader);
  const idx = {};
  Object.entries(DOSIS_ALIAS).forEach(([key, aliases]) => {
    let i = -1;
    for (const a of aliases) {
      i = headers.findIndex((h) => h === normHeader(a));
      if (i >= 0) break;
    }
    if (i < 0) {
      for (const a of aliases) {
        const na = normHeader(a);
        i = headers.findIndex((h) => h.includes(na) && na.length >= 3);
        if (i >= 0) break;
      }
    }
    idx[key] = i;
  });

  const col = (name) => headers.findIndex((h) => h === normHeader(name));
  const metaIdx = {
    year: col('year'), kodeProv: col('kode_prov'), namaProv: col('nama_prov'),
    kodeKab: col('kode_kab'), namaKab: col('nama_kab'),
    kodeKec: col('kode_kec'), namaKec: col('nama_kec'),
  };

  const rows = [];
  let meta = null;
  for (const row of matrix.slice(hr + 1)) {
    if (!row || row.every((c) => txt(c) === '')) continue;
    const komoditas = upper(idx.komoditas >= 0 ? row[idx.komoditas] : '');
    if (!komoditas) continue;
    rows.push({
      komoditas,
      subsektor: upper(idx.subsektor >= 0 ? row[idx.subsektor] : ''),
      urea: num(idx.urea >= 0 ? row[idx.urea] : 0),
      npk: num(idx.npk >= 0 ? row[idx.npk] : 0),
      npkFormula: num(idx.npkFormula >= 0 ? row[idx.npkFormula] : 0),
      organik: num(idx.organik >= 0 ? row[idx.organik] : 0),
      za: num(idx.za >= 0 ? row[idx.za] : 0),
      sp36: num(idx.sp36 >= 0 ? row[idx.sp36] : 0),
      poc: num(idx.poc >= 0 ? row[idx.poc] : 0),
    });
    if (!meta && metaIdx.namaKec >= 0) {
      meta = {
        year: num(metaIdx.year >= 0 ? row[metaIdx.year] : 0) || new Date().getFullYear(),
        kodeProv: txt(row[metaIdx.kodeProv]), namaProv: upper(row[metaIdx.namaProv]),
        kodeKab: txt(row[metaIdx.kodeKab]), namaKab: upper(row[metaIdx.namaKab]),
        kodeKec: txt(row[metaIdx.kodeKec]), namaKec: upper(row[metaIdx.namaKec]),
      };
    }
  }
  return { rows, meta };
}

/* ── BACA UNDUHAN SIMLUHTAN ──────────────────────────────── */
/* Berkas "Daftar Anggota Kelompok Tani" dari SIMLUHTAN berbentuk tetap:
   blok identitas kelompok di baris atas (nama & ID kelompok — justru yang
   paling sulit didapat dari database biasa), lalu tabel anggota.
   Satu berkas = satu kelompok.

   Yang TIDAK ada di sini: Nama Ibu Kandung, kode desa, dan kode kios —
   padahal ketiganya wajib di template ERDKK. Pemanggil harus melengkapinya
   dari data yang sudah ada atau dari Setelan. */

/** @returns {null|{namaPoktan, idPoktan, prov, kab, kec, anggota: object[]}} */
export function bacaSimluhtan(matrix) {
  if (!matrix || matrix.length < 3) return null;

  // 1) blok identitas: cari label di kolom mana pun, nilainya sel terisi berikutnya
  const labelDi = (label) => {
    const target = normHeader(label);
    for (let r = 0; r < Math.min(12, matrix.length); r++) {
      const row = matrix[r] || [];
      for (let c = 0; c < row.length; c++) {
        if (normHeader(row[c]) !== target) continue;
        for (let k = c + 1; k < row.length; k++) {
          if (txt(row[k]) !== '') return txt(row[k]);
        }
      }
    }
    return '';
  };

  const namaPoktan = labelDi('nama kelompok tani');
  if (!namaPoktan) return null;

  // 2) baris judul tabel: harus punya kolom NIK dan Nama sekaligus
  let hr = -1, kol = null;
  for (let r = 0; r < Math.min(20, matrix.length); r++) {
    const head = (matrix[r] || []).map(normHeader);
    const iNik = head.findIndex((h) => h === 'nik');
    const iNama = head.findIndex((h) => h === 'nama');
    if (iNik < 0 || iNama < 0) continue;
    const iKom = head.findIndex((h) => h.includes('komoditas') && h.includes('diusahakan'));
    kol = {
      nama: iNama, nik: iNik,
      lahir: head.findIndex((h) => h.includes('tgl lahir') || h.includes('tempat')),
      alamat: head.findIndex((h) => h === 'alamat'),
      komoditas: iKom,
      // kolom volume selalu tepat sesudah komoditas pada format ini
      luas: iKom >= 0 && head[iKom + 1] && head[iKom + 1].includes('volume') ? iKom + 1 : -1,
      totalLuas: head.findIndex((h) => h.includes('total') && h.includes('diuasahakan')),
    };
    hr = r;
    break;
  }
  if (hr < 0) return null;

  const ambil = (row, i) => (i >= 0 ? row[i] : '');
  const anggota = [];
  for (const row of matrix.slice(hr + 1)) {
    if (!row || row.every((c) => txt(c) === '')) continue;
    const nik = cleanKtp(ambil(row, kol.nik));
    const nama = txt(ambil(row, kol.nama));
    if (!nik && !nama) continue;
    // luas per komoditas; bila kosong pakai total luas yang diusahakan
    const luas = numLuas(ambil(row, kol.luas)) || numLuas(ambil(row, kol.totalLuas));
    anggota.push({
      nama, nik,
      komoditas: upper(ambil(row, kol.komoditas)),
      luas,
      alamat: txt(ambil(row, kol.alamat)),
      lahir: txt(ambil(row, kol.lahir)),
    });
  }
  if (!anggota.length) return null;

  return {
    namaPoktan: upper(namaPoktan),
    idPoktan: txt(labelDi('id kelompok tani')),
    prov: upper(labelDi('provinsi')),
    kab: upper(labelDi('kabupaten')),
    kec: upper(labelDi('kecamatan')),
    barisJudul: hr,
    anggota,
  };
}

/* ── BACA DAFTAR ID POKTAN ───────────────────────────────── */

const RE_NAMA_POKTAN = /^(nama\s*)?(poktan|kelompok\s*tani|kelompok|nama\s*kelompok)$/;
const RE_ID_POKTAN   = /^(id\s*poktan|idpoktan|id\s*kelompok|kode\s*poktan|id)$/;

/** Kumpulkan pasangan {nama, id} dari sebuah sheet.
 *  Setiap baris diuji sebagai baris judul, jadi beberapa tabel dalam satu
 *  sheet (mis. daftar Simluhtan yang ditempel di bawah) tetap terbaca. */
export function bacaDaftarPoktan(matrix) {
  const hasil = [];
  const dipakai = new Set();

  for (let r = 0; r < matrix.length; r++) {
    const head = (matrix[r] || []).map((c) => normHeader(c));
    const iNama = head.findIndex((h) => RE_NAMA_POKTAN.test(h));
    const iId = head.findIndex((h) => RE_ID_POKTAN.test(h));
    if (iNama < 0 || iId < 0 || iNama === iId) continue;

    for (let k = r + 1; k < matrix.length; k++) {
      const row = matrix[k] || [];
      // berhenti bila bertemu baris judul tabel berikutnya
      const h2 = row.map((c) => normHeader(c));
      if (h2.some((h) => RE_NAMA_POKTAN.test(h)) && h2.some((h) => RE_ID_POKTAN.test(h))) break;

      const nama = txt(row[iNama]), id = txt(row[iId]);
      if (!nama || !id) continue;
      const kunci = upper(nama) + '\u0000' + id;
      if (dipakai.has(kunci)) continue;
      dipakai.add(kunci);
      hasil.push({ nama, id });
    }
  }
  return hasil;
}

/* ── BACA UNTUK PERBANDINGAN TAHUN ───────────────────────── */

/** Baca satu sheet (template ERDKK atau database poktan) menjadi catatan
 *  ringkas untuk dibandingkan antar tahun. Hanya kolom yang dipakai
 *  perbandingan yang diambil; pupuk diabaikan karena ikut luas.
 *
 *  Berkas tahun lalu boleh berformat 2026 ("MT1") maupun 2027
 *  ("Periode Tanam I") — alias di FIELDS menerima keduanya.
 *  NIK ganda dalam satu berkas digabung dan luasnya dijumlahkan, sama
 *  seperti perlakuan "NIK Ganda" di tab Check.
 *  @returns {{ktp:string, nama:string, idPoktan:string, namaPoktan:string,
 *             kodeDesa:string, namaDesa:string, kom:string[], luas:number[],
 *             baris:number, ganda:number}[]} */
export function bacaBandingan(matrix) {
  if (!matrix.length) return [];
  const hr = guessHeaderRow(matrix);
  const map = autoMap(matrix[hr] || []);
  if (map.ktp == null) return [];   // tanpa kolom KTP tidak ada yang bisa dicocokkan

  const amb = (row, key) => {
    const i = map[key];
    return i == null || i < 0 ? '' : row[i];
  };

  const peta = new Map();
  for (let k = hr + 1; k < matrix.length; k++) {
    const row = matrix[k];
    if (!row || row.every((c) => txt(c) === '')) continue;
    const ktp = cleanKtp(amb(row, 'ktp'));
    if (!ktp) continue;

    const luas = [0, 1, 2].map((i) => numLuas(amb(row, `mt${i + 1}Luas`)));
    const kom = [0, 1, 2].map((i) => {
      const s = upper(amb(row, `mt${i + 1}Komoditas`));
      return s === '-' || luas[i] <= 0 ? '' : s;
    });

    const lama = peta.get(ktp);
    if (lama) {
      lama.luas = lama.luas.map((v, i) => v + luas[i]);
      lama.kom = lama.kom.map((v, i) => v || kom[i]);
      lama.nama = lama.nama || upper(amb(row, 'namaPetani'));
      lama.ganda++;
      continue;
    }

    peta.set(ktp, {
      ktp,
      nama: upper(amb(row, 'namaPetani')),
      namaIbu: upper(amb(row, 'namaIbu')),
      idPoktan: txt(amb(row, 'idPoktan')),
      namaPoktan: upper(amb(row, 'namaPoktan')),
      kodeDesa: txt(amb(row, 'kodeDesa')),
      namaDesa: upper(amb(row, 'namaDesa')),
      kom, luas,
      baris: k + 1,
      ganda: 1,
    });
  }
  return [...peta.values()];
}

/** Baca seluruh sheet sebuah workbook, ambil yang catatannya paling banyak.
 *  Berkas unduhan sering memuat sheet petunjuk atau sheet kosong di sampingnya.
 *  @returns {{sheet:string, baris:object[]}} */
export function bacaBandinganWb(wb) {
  let pilih = { sheet: '', baris: [] };
  wb.SheetNames.forEach((s) => {
    const baris = bacaBandingan(sheetToMatrix(wb, s));
    if (baris.length > pilih.baris.length) pilih = { sheet: s, baris };
  });
  return pilih;
}

/* ── TULIS TEMPLATE ──────────────────────────────────────── */

/** Satu record petani → satu baris array sesuai urutan TEMPLATE_HEADERS. */
export function petaniToRow(p, { tulisNol = false } = {}) {
  const blank = tulisNol ? 0 : '';
  const numOrBlank = (v) => (num(v) === 0 ? blank : num(v));

  // Kode desa & ID poktan: tetap angka bila memang numerik (seperti berkas resmi)
  const numeric = (v) => {
    const s = txt(v);
    if (s === '') return '';
    return /^\d+$/.test(s) ? Number(s) : s;
  };

  const row = [
    txt(p.namaPenyuluh),
    cleanKtp(p.ktp),          // string — dipaksa teks saat penulisan sel
    txt(p.namaIbu),
    numeric(p.kodeDesa),
    numeric(p.idPoktan),
    txt(p.kodeKios),
    txt(p.subsektor),
  ];

  p.mt.forEach((mt) => {
    const kom = upper(mt.komoditas);
    const luas = numLuas(mt.luas);
    if (!kom || kom === '-' || luas <= 0) {
      row.push('', '', '', '', '', '', '');
      return;
    }
    row.push(kom, luas);
    PUPUK.forEach(({ key }) => row.push(numOrBlank(mt[key])));
  });

  return row;
}

/** Bangun workbook template ERDKK siap unggah. */
export function buildTemplateWorkbook(list, opts = {}) {
  const sheetName = (opts.sheetName || 'Worksheet').slice(0, 31);
  const aoa = [TEMPLATE_HEADERS, ...list.map((p) => petaniToRow(p, opts))];
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: false });

  // Paksa kolom KTP (B) sebagai teks agar 16 digit tidak jadi notasi ilmiah
  for (let r = 1; r <= list.length; r++) {
    const ref = XLSX.utils.encode_cell({ c: 1, r });
    const cell = ws[ref];
    if (cell) { cell.t = 's'; cell.z = '@'; cell.v = String(cell.v ?? ''); }
  }

  // Jaminan berlapis: tidak satu pun sel boleh keluar sebagai rumus, sekalipun
  // isinya diawali "=" atau "@" dari berkas sumber. Sel teks tetap teks.
  Object.keys(ws).forEach((ref) => {
    if (ref[0] === '!') return;
    const cell = ws[ref];
    if (cell && cell.f != null) { delete cell.f; cell.t = 's'; cell.v = String(cell.v ?? ''); }
  });

  ws['!cols'] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(10, Math.min(34, h.length + 2)) }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

/** Workbook bertabel: satu sheet per bagian, judul di baris pertama.
 *  Dipakai untuk unduhan data mentah (isinya persis seperti saat dibaca) dan
 *  untuk laporan selisih antar tahun.
 *  @param {{nama?:string, judul:any[], baris:any[][], ktpKol?:number}[]} bagian
 *         ktpKol = indeks kolom NIK yang harus ditulis sebagai teks */
export function buildTabelWorkbook(bagian) {
  const wb = XLSX.utils.book_new();
  const terpakai = new Set();

  bagian.forEach((b, i) => {
    const ws = XLSX.utils.aoa_to_sheet([b.judul, ...b.baris], { cellDates: false });

    // Kolom NIK dipaksa teks agar 16 digit tidak jadi notasi ilmiah di Excel
    if (b.ktpKol != null && b.ktpKol >= 0) {
      for (let r = 1; r <= b.baris.length; r++) {
        const cell = ws[XLSX.utils.encode_cell({ c: b.ktpKol, r })];
        if (cell) { cell.t = 's'; cell.z = '@'; cell.v = String(cell.v ?? ''); }
      }
    }

    // Isi berkas unggahan tidak boleh keluar sebagai rumus. Sel yang isinya
    // diawali "=", "+", "-", "@" bisa dieksekusi Excel saat dibuka.
    Object.keys(ws).forEach((ref) => {
      if (ref[0] === '!') return;
      const cell = ws[ref];
      if (cell && cell.f != null) { delete cell.f; cell.t = 's'; cell.v = String(cell.v ?? ''); }
    });

    ws['!cols'] = b.judul.map((h) => ({ wch: Math.max(10, Math.min(38, String(h ?? '').length + 2)) }));
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    // Nama sheet Excel: maksimal 31 karakter, tanpa : \ / ? * [ ] dan unik
    let nama = String(b.nama || `Sheet${i + 1}`).replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || `Sheet${i + 1}`;
    let n = 2;
    while (terpakai.has(nama.toLowerCase())) nama = `${nama.slice(0, 28)} ${n++}`;
    terpakai.add(nama.toLowerCase());

    XLSX.utils.book_append_sheet(wb, ws, nama);
  });

  return wb;
}

/** Nama lama, dipertahankan agar pemanggil unduhan mentah tidak ikut berubah. */
export const buildMentahWorkbook = buildTabelWorkbook;

export function downloadWorkbook(wb, filename) {
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : filename + '.xlsx', {
    bookType: 'xlsx', compression: true,
  });
}

/** Cadangan lengkap (termasuk nama petani/poktan) agar bisa dilanjutkan nanti. */
export function buildBackupWorkbook() {
  const wb = XLSX.utils.book_new();

  const head = [
    'Nama Petani', 'KTP', 'Nama Ibu Kandung', 'Nama Penyuluh', 'Kode Desa', 'Nama Desa',
    'ID Poktan', 'Nama Poktan', 'Kode Kios', 'Nama Kios', 'Subsektor',
    'Komoditas MT1', 'Luas Lahan (Ha) MT1', 'Komoditas MT2', 'Luas Lahan (Ha) MT2',
    'Komoditas MT3', 'Luas Lahan (Ha) MT3',
  ];
  const rows = state.petani.map((p) => [
    p.namaPetani, cleanKtp(p.ktp), p.namaIbu, p.namaPenyuluh, p.kodeDesa, p.namaDesa,
    p.idPoktan, p.namaPoktan, p.kodeKios, p.namaKios, p.subsektor,
    p.mt[0].komoditas, numLuas(p.mt[0].luas),
    p.mt[1].komoditas, numLuas(p.mt[1].luas),
    p.mt[2].komoditas, numLuas(p.mt[2].luas),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([head, ...rows]);
  ws['!cols'] = head.map((h) => ({ wch: Math.max(12, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Database Poktan');

  const dHead = ['komoditas', 'subsector', 'urea', 'sp36', 'za', 'npk', 'organik', 'npk formula', 'poc'];
  const dRows = state.dosis.map((d) => [
    d.komoditas, d.subsektor, num(d.urea), num(d.sp36), num(d.za),
    num(d.npk), num(d.organik), num(d.npkFormula), num(d.poc),
  ]);
  const dws = XLSX.utils.aoa_to_sheet([dHead, ...dRows]);
  XLSX.utils.book_append_sheet(wb, dws, 'Dosis');

  return wb;
}

/** Impor cadangan (sheet "Database Poktan") kembali menjadi record. */
export function backupToPetani(matrix) {
  const hr = guessHeaderRow(matrix);
  const map = autoMap(matrix[hr] || []);
  const list = rowsToPetani(matrix, hr, map, {});
  list.forEach((p) => recalcPetani(p));
  return list;
}
