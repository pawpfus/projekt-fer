/* ============================================================
   schema.js — struktur template ERDKK, dosis bawaan, alias kolom
   ============================================================ */

/** Judul kolom template ERDKK persis seperti berkas resmi (28 kolom, A–AB).
 *  Perhatikan: "Luas Lahan (Ha)  MT2" dan MT3 memakai DUA spasi — jangan diubah. */
export const TEMPLATE_HEADERS = [
  'Nama Penyuluh',
  'KTP',
  'Nama Ibu Kandung',
  'Kode Desa',
  'ID Poktan',
  'Kode Kios',
  'Subsektor',
  'Komoditas MT1',
  'Luas Lahan (Ha) MT1',
  'Pupuk Urea (Kg) MT1',
  'Pupuk NPK (Kg) MT1',
  'Pupuk NPK Formula Khusus (Kg) MT1',
  'Pupuk Organik (Kg) MT1',
  'Pupuk Za (Kg) MT1',
  'Komoditas MT2',
  'Luas Lahan (Ha)  MT2',
  'Pupuk Urea (Kg) MT2',
  'Pupuk NPK (Kg) MT2',
  'Pupuk NPK Formula Khusus (Kg) MT2',
  'Pupuk Organik (Kg) MT2',
  'Pupuk Za (Kg) MT2',
  'Komoditas MT3',
  'Luas Lahan (Ha)  MT3',
  'Pupuk Urea (Kg) MT3',
  'Pupuk NPK (Kg) MT3',
  'Pupuk NPK Formula Khusus (Kg) MT3',
  'Pupuk Organik (Kg) MT3',
  'Pupuk Za (Kg) MT3',
];

/** Jenis pupuk yang dipakai template (sp36 & poc tidak ada kolomnya). */
export const PUPUK = [
  { key: 'urea',       label: 'Urea' },
  { key: 'npk',        label: 'NPK' },
  { key: 'npkFormula', label: 'NPK Formula' },
  { key: 'organik',    label: 'Organik' },
  { key: 'za',         label: 'ZA' },
];

export const SUBSEKTOR = ['TANAMAN PANGAN', 'HORTIKULTURA', 'PERKEBUNAN'];

/** Dosis bawaan 2026 — Kec. Pitu Riawa, Kab. Sidenreng Rappang (kg/Ha). */
export const DOSIS_DEFAULT = [
  { komoditas: 'PADI',         subsektor: 'TANAMAN PANGAN', urea: 250, npk: 300,  npkFormula: 0,   organik: 500, za: 0,   sp36: 0, poc: 0 },
  { komoditas: 'JAGUNG',       subsektor: 'TANAMAN PANGAN', urea: 250, npk: 350,  npkFormula: 0,   organik: 500, za: 0,   sp36: 0, poc: 0 },
  { komoditas: 'KEDELAI',      subsektor: 'TANAMAN PANGAN', urea: 0,   npk: 225,  npkFormula: 0,   organik: 500, za: 0,   sp36: 0, poc: 0 },
  { komoditas: 'UBI KAYU',     subsektor: 'TANAMAN PANGAN', urea: 200, npk: 375,  npkFormula: 0,   organik: 500, za: 0,   sp36: 0, poc: 0 },
  { komoditas: 'BAWANG MERAH', subsektor: 'HORTIKULTURA',   urea: 0,   npk: 525,  npkFormula: 0,   organik: 500, za: 0,   sp36: 0, poc: 0 },
  { komoditas: 'BAWANG PUTIH', subsektor: 'HORTIKULTURA',   urea: 0,   npk: 600,  npkFormula: 0,   organik: 500, za: 0,   sp36: 0, poc: 0 },
  { komoditas: 'CABAI',        subsektor: 'HORTIKULTURA',   urea: 0,   npk: 400,  npkFormula: 0,   organik: 500, za: 0,   sp36: 0, poc: 0 },
  { komoditas: 'KAKAO',        subsektor: 'PERKEBUNAN',     urea: 20,  npk: 0,    npkFormula: 615, organik: 500, za: 0,   sp36: 0, poc: 0 },
  { komoditas: 'KOPI',         subsektor: 'PERKEBUNAN',     urea: 0,   npk: 860,  npkFormula: 0,   organik: 500, za: 0,   sp36: 0, poc: 0 },
  { komoditas: 'TEBU RAKYAT',  subsektor: 'PERKEBUNAN',     urea: 0,   npk: 1200, npkFormula: 0,   organik: 500, za: 108, sp36: 0, poc: 0 },
];

export const DOSIS_META_DEFAULT = {
  year: 2026,
  kodeProv: '73', namaProv: 'SULAWESI SELATAN',
  kodeKab: '7314', namaKab: 'KAB. SIDENRENG RAPPANG',
  kodeKec: '731410', namaKec: 'PITU RIAWA',
};

export const SETTINGS_DEFAULT = {
  namaPenyuluh: '',
  kodeDesa: '',
  namaDesa: '',
  kodeKios: '',
  namaKios: '',
  idPoktanDefault: '',
  sheetName: 'Worksheet',
  batasLuas: 2,            // Ha per musim tanam — di atas ini diberi peringatan
  tulisNol: false,         // false = sel pupuk 0 dikosongkan (seperti contoh resmi)
  salinMt2: true,          // saat input manual, MT2 mengikuti MT1
  namaFile: 'template-erdkk-2026',
};

/* ── Alias kolom untuk pemetaan otomatis saat impor ──────── */
export const FIELDS = [
  { key: 'namaPetani',   label: 'Nama Petani',       req: false, note: 'bantu identifikasi, tidak diekspor',
    alias: ['nama petani', 'nama', 'nama lengkap', 'petani'] },
  { key: 'ktp',          label: 'KTP / NIK',         req: true,  note: 'kolom B template',
    alias: ['ktp', 'nik', 'no ktp', 'nomor ktp', 'no. ktp', 'nik ktp', 'nomor induk kependudukan'] },
  { key: 'namaIbu',      label: 'Nama Ibu Kandung',  req: true,  note: 'kolom C template',
    alias: ['nama ibu kandung', 'ibu kandung', 'nama ibu'] },
  { key: 'namaPenyuluh', label: 'Nama Penyuluh',     req: true,  note: 'kolom A template',
    alias: ['nama penyuluh', 'penyuluh', 'pendamping'] },
  { key: 'kodeDesa',     label: 'Kode Desa',         req: true,  note: 'kolom D template',
    alias: ['kode desa', 'kd desa', 'kodedesa'] },
  { key: 'namaDesa',     label: 'Nama Desa',         req: false, note: 'untuk filter & pisah berkas',
    alias: ['nama desa', 'desa', 'kelurahan'] },
  { key: 'idPoktan',     label: 'ID Poktan',         req: true,  note: 'kolom E template',
    alias: ['id poktan', 'idpoktan', 'id kelompok', 'kode poktan', 'id poktan (simluhtan)'] },
  { key: 'namaPoktan',   label: 'Nama Poktan',       req: false, note: 'untuk filter & pengelompokan',
    alias: ['nama poktan', 'poktan', 'kelompok tani', 'nama kelompok', 'nama kelompok tani'] },
  { key: 'kodeKios',     label: 'Kode Kios',         req: true,  note: 'kolom F template',
    alias: ['kode kios', 'kode kios pengecer', 'kios pengecer', 'kd kios'] },
  { key: 'namaKios',     label: 'Nama Kios',         req: false, note: 'catatan internal',
    alias: ['nama kios', 'nama kios pengecer', 'kios'] },
  { key: 'subsektor',    label: 'Subsektor',         req: false, note: 'otomatis dari komoditas MT1 bila kosong',
    alias: ['subsektor', 'sub sektor', 'sub-sektor'] },
  { key: 'mt1Komoditas', label: 'Komoditas MT1',     req: true,  note: 'kolom H template',
    alias: ['komoditas mt1', 'komoditas mt 1', 'komoditi mt1', 'komoditas'] },
  { key: 'mt1Luas',      label: 'Luas Lahan MT1',    req: true,  note: 'hektar',
    alias: ['luas lahan (ha) mt1', 'luas lahan mt1', 'luas mt1', 'luas lahan (ha)  mt1', 'luas tanam mt1', 'luas lahan'] },
  { key: 'mt2Komoditas', label: 'Komoditas MT2',     req: false, note: '',
    alias: ['komoditas mt2', 'komoditas mt 2', 'komoditi mt2'] },
  { key: 'mt2Luas',      label: 'Luas Lahan MT2',    req: false, note: 'hektar',
    alias: ['luas lahan (ha) mt2', 'luas lahan (ha)  mt2', 'luas lahan mt2', 'luas mt2', 'luas tanam mt2'] },
  { key: 'mt3Komoditas', label: 'Komoditas MT3',     req: false, note: '',
    alias: ['komoditas mt3', 'komoditas mt 3', 'komoditi mt3'] },
  { key: 'mt3Luas',      label: 'Luas Lahan MT3',    req: false, note: 'hektar',
    alias: ['luas lahan (ha) mt3', 'luas lahan (ha)  mt3', 'luas lahan mt3', 'luas mt3', 'luas tanam mt3'] },
];

/** Alias untuk berkas dosis (format Dosis_<tahun>_..._<kecamatan>.xlsx). */
export const DOSIS_ALIAS = {
  komoditas:  ['komoditas', 'komoditi', 'commodity'],
  subsektor:  ['subsector', 'subsektor', 'sub sektor'],
  urea:       ['urea'],
  sp36:       ['sp36', 'sp-36', 'sp 36'],
  za:         ['za'],
  npk:        ['npk'],
  organik:    ['organik', 'organic', 'pupuk organik'],
  npkFormula: ['npk formula', 'npk formula khusus', 'npkformula', 'npk_formula'],
  poc:        ['poc'],
};

/** Normalisasi judul kolom: huruf kecil, spasi rangkap jadi satu, buang tanda baca. */
export function normHeader(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ /g, ' ')
    .replace(/[._:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
