/* ============================================================
   store.js — state, penyimpanan lokal, hitung pupuk, validasi
   ============================================================ */

import { DOSIS_DEFAULT, DOSIS_META_DEFAULT, SETTINGS_DEFAULT, PUPUK } from './schema.js';

const KEY = 'projekt-fer:v1';

/* ── util ────────────────────────────────────────────────── */

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());

/** Bersihkan NIK: buang backtick/apostrof pengunci teks, spasi, dan non-digit. */
export function cleanKtp(v) {
  if (v == null) return '';
  return String(v).replace(/[`'\s]/g, '').replace(/\D/g, '');
}

/** Angka toleran koma desimal Indonesia. */
export function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, ''));
  return isFinite(n) ? n : 0;
}

/** Angka toleran, tapi titik dianggap desimal bila hanya satu dan ada 1–3 digit sesudahnya. */
export function numLuas(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s.replace(/[^\d.\-]/g, ''));
  return isFinite(n) ? n : 0;
}

export const txt = (v) => (v == null ? '' : String(v).trim());
export const upper = (v) => txt(v).toUpperCase().replace(/\s+/g, ' ');

/** Pembulatan setengah ke atas — sama seperti contoh ERDKK resmi (437,5 → 438). */
export const round0 = (n) => Math.round(n + (n >= 0 ? 0 : -1e-9));

export const fmt = (n, d = 0) =>
  Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });

/* ── bentuk data ─────────────────────────────────────────── */

export function emptyMt() {
  return { komoditas: '', luas: 0, urea: 0, npk: 0, npkFormula: 0, organik: 0, za: 0, manual: false };
}

export function emptyPetani(defaults = {}) {
  return {
    id: uid(),
    namaPetani: '', ktp: '', namaIbu: '',
    namaPenyuluh: defaults.namaPenyuluh || '',
    kodeDesa: defaults.kodeDesa || '', namaDesa: defaults.namaDesa || '',
    idPoktan: defaults.idPoktanDefault || '', namaPoktan: '',
    kodeKios: defaults.kodeKios || '', namaKios: defaults.namaKios || '',
    subsektor: '',
    mt: [emptyMt(), emptyMt(), emptyMt()],
  };
}

/* ── state ───────────────────────────────────────────────── */

export const state = {
  petani: [],
  dosis: DOSIS_DEFAULT.map((d) => ({ ...d })),
  dosisMeta: { ...DOSIS_META_DEFAULT },
  settings: { ...SETTINGS_DEFAULT },
  /** nama poktan (huruf besar) → ID poktan, untuk database tanpa kolom ID */
  poktanId: {},
};

const subs = new Set();
export const onChange = (fn) => { subs.add(fn); return () => subs.delete(fn); };
export function emit() { save(); subs.forEach((f) => f()); }

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      petani: state.petani, dosis: state.dosis,
      dosisMeta: state.dosisMeta, settings: state.settings,
      poktanId: state.poktanId,
    }));
  } catch (e) {
    console.warn('Gagal menyimpan ke localStorage', e);
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (Array.isArray(d.petani)) state.petani = d.petani.map(normalizePetani);
    if (Array.isArray(d.dosis) && d.dosis.length) state.dosis = d.dosis;
    if (d.dosisMeta) state.dosisMeta = { ...DOSIS_META_DEFAULT, ...d.dosisMeta };
    if (d.settings) state.settings = { ...SETTINGS_DEFAULT, ...d.settings };
    if (d.poktanId && typeof d.poktanId === 'object') state.poktanId = d.poktanId;
    return true;
  } catch (e) {
    console.warn('Gagal memuat data tersimpan', e);
    return false;
  }
}

/** Pastikan record punya 3 slot MT dan semua field pupuk. */
export function normalizePetani(p) {
  const base = emptyPetani();
  const out = { ...base, ...p, id: p.id || uid() };
  const mt = Array.isArray(p.mt) ? p.mt : [];
  out.mt = [0, 1, 2].map((i) => ({ ...emptyMt(), ...(mt[i] || {}) }));
  return out;
}

/* ── dosis ───────────────────────────────────────────────── */

export function dosisFor(komoditas) {
  const k = upper(komoditas);
  if (!k || k === '-') return null;
  return state.dosis.find((d) => upper(d.komoditas) === k) || null;
}

export const komoditasList = () =>
  state.dosis.map((d) => upper(d.komoditas)).filter(Boolean).sort();

/* ── hitung pupuk ────────────────────────────────────────── */

/** Hitung ulang satu musim tanam dari luas × dosis. Lewati bila ditandai manual. */
export function recalcMt(mt, { force = false } = {}) {
  if (mt.manual && !force) return mt;
  const d = dosisFor(mt.komoditas);
  const luas = numLuas(mt.luas);
  if (!d || luas <= 0) {
    PUPUK.forEach(({ key }) => { mt[key] = 0; });
    return mt;
  }
  PUPUK.forEach(({ key }) => { mt[key] = round0(num(d[key]) * luas); });
  return mt;
}

export function recalcPetani(p, opts) {
  p.mt.forEach((mt) => recalcMt(mt, opts));
  if (!txt(p.subsektor)) {
    const d = dosisFor(p.mt[0].komoditas) || dosisFor(p.mt[1].komoditas) || dosisFor(p.mt[2].komoditas);
    if (d) p.subsektor = upper(d.subsektor);
  }
  return p;
}

export function recalcAll(opts) {
  state.petani.forEach((p) => recalcPetani(p, opts));
}

/* ── validasi ────────────────────────────────────────────── */

const NAMA_KOSONG = ['', '-', '0'];

/** @returns {{level:'error'|'warn', field:string, msg:string}[]} */
export function validatePetani(p, ctx = {}) {
  const out = [];
  const E = (field, msg) => out.push({ level: 'error', field, msg });
  const W = (field, msg) => out.push({ level: 'warn', field, msg });

  if (!txt(p.namaPenyuluh)) E('namaPenyuluh', 'Nama penyuluh kosong');

  const ktp = cleanKtp(p.ktp);
  if (!ktp) E('ktp', 'KTP kosong');
  else if (ktp.length !== 16) E('ktp', `KTP ${ktp.length} digit — harus 16 digit`);
  else if (ctx.dupKtp && ctx.dupKtp.has(ktp)) E('ktp', 'KTP ganda di dalam daftar');

  if (NAMA_KOSONG.includes(txt(p.namaIbu))) E('namaIbu', 'Nama ibu kandung kosong');
  if (!txt(p.kodeDesa)) E('kodeDesa', 'Kode desa kosong');
  if (!txt(p.idPoktan)) E('idPoktan', 'ID poktan kosong');
  if (!txt(p.kodeKios)) E('kodeKios', 'Kode kios kosong');
  if (!txt(p.subsektor)) E('subsektor', 'Subsektor kosong');

  const batas = num(ctx.batasLuas ?? state.settings.batasLuas) || 0;
  let adaMt = false;

  p.mt.forEach((mt, i) => {
    const kom = upper(mt.komoditas);
    const luas = numLuas(mt.luas);
    const label = `MT${i + 1}`;
    if (!kom || kom === '-') {
      if (luas > 0) W(`mt${i}`, `${label}: ada luas tapi komoditas kosong`);
      return;
    }
    adaMt = true;
    if (luas <= 0) E(`mt${i}`, `${label}: luas lahan harus lebih dari 0`);
    if (!dosisFor(kom)) E(`mt${i}`, `${label}: dosis "${kom}" tidak ada di tabel dosis`);
    if (batas > 0 && luas > batas) W(`mt${i}`, `${label}: luas ${luas} Ha melebihi batas ${batas} Ha`);
    const totalPupuk = PUPUK.reduce((s, { key }) => s + num(mt[key]), 0);
    if (totalPupuk === 0 && dosisFor(kom)) W(`mt${i}`, `${label}: seluruh pupuk 0`);
  });

  if (!adaMt) E('mt0', 'Tidak ada musim tanam terisi — minimal MT1');
  return out;
}

/** Validasi seluruh daftar; mengembalikan peta id → daftar masalah. */
export function validateAll() {
  const seen = new Map();
  state.petani.forEach((p) => {
    const k = cleanKtp(p.ktp);
    if (!k) return;
    seen.set(k, (seen.get(k) || 0) + 1);
  });
  const dupKtp = new Set([...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k));

  const map = new Map();
  let errors = 0, warns = 0;
  state.petani.forEach((p) => {
    const issues = validatePetani(p, { dupKtp });
    if (issues.length) map.set(p.id, issues);
    issues.forEach((i) => (i.level === 'error' ? errors++ : warns++));
  });
  return { map, errors, warns, badRows: [...map.values()].filter((v) => v.some((i) => i.level === 'error')).length };
}

/* ── ID poktan ───────────────────────────────────────────── */

/** Daftar kelompok yang ada di data, lengkap dengan jumlah anggota & luas. */
export function poktanRingkas() {
  const m = new Map();
  state.petani.forEach((p) => {
    const nama = upper(p.namaPoktan);
    if (!nama) return;
    const o = m.get(nama) || { nama, anggota: 0, luas: 0, idTerpakai: new Set() };
    o.anggota++;
    o.luas += numLuas(p.mt[0].luas);
    if (txt(p.idPoktan)) o.idTerpakai.add(txt(p.idPoktan));
    m.set(nama, o);
  });
  return [...m.values()]
    .map((o) => ({ ...o, idTerpakai: [...o.idTerpakai], id: txt(state.poktanId[o.nama]) }))
    .sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
}

/** Isi kolom ID Poktan pada tiap petani dari peta nama → ID.
 *  @param timpa true = tulis ulang ID yang sudah ada */
export function terapkanPoktanId({ timpa = false } = {}) {
  let n = 0;
  state.petani.forEach((p) => {
    const id = txt(state.poktanId[upper(p.namaPoktan)]);
    if (!id) return;
    if (!timpa && txt(p.idPoktan)) return;
    if (txt(p.idPoktan) === id) return;
    p.idPoktan = id;
    n++;
  });
  return n;
}

/* ── NIK ganda ───────────────────────────────────────────── */

/** Kelompokkan baris yang NIK-nya sama (≥2 baris). */
export function nikGanda() {
  const m = new Map();
  state.petani.forEach((p) => {
    const k = cleanKtp(p.ktp);
    if (!k) return;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(p);
  });
  return [...m.entries()].filter(([, v]) => v.length > 1).map(([ktp, rows]) => ({ ktp, rows }));
}

/** Satukan baris ber-NIK sama menjadi satu, luas tiap MT dijumlahkan.
 *  Baris pertama jadi induk; nama poktan lain dicatat agar tidak hilang. */
export function gabungNikGanda() {
  const grup = nikGanda();
  if (!grup.length) return { digabung: 0, dihapus: 0, lebihBatas: [] };

  const buang = new Set();
  const lebihBatas = [];
  const batas = num(state.settings.batasLuas) || 0;

  grup.forEach(({ rows }) => {
    const induk = rows[0];
    const lain = rows.slice(1);

    [0, 1, 2].forEach((i) => {
      const total = rows.reduce((s, p) => s + numLuas(p.mt[i].luas), 0);
      if (total <= 0) return;
      if (!upper(induk.mt[i].komoditas)) {
        const sumber = rows.find((p) => upper(p.mt[i].komoditas));
        if (sumber) induk.mt[i].komoditas = upper(sumber.mt[i].komoditas);
      }
      induk.mt[i].luas = +total.toFixed(4);
      induk.mt[i].manual = false;
    });

    const poktanLain = [...new Set(lain.map((p) => upper(p.namaPoktan)).filter((n) => n && n !== upper(induk.namaPoktan)))];
    if (poktanLain.length) induk.namaPoktanGabung = poktanLain.join(' + ');

    lain.forEach((p) => buang.add(p.id));
    recalcPetani(induk, { force: true });

    if (batas > 0) {
      const maks = Math.max(...induk.mt.map((m) => numLuas(m.luas)));
      if (maks > batas) lebihBatas.push({ ktp: cleanKtp(induk.ktp), nama: induk.namaPetani, luas: maks });
    }
  });

  state.petani = state.petani.filter((p) => !buang.has(p.id));
  return { digabung: grup.length, dihapus: buang.size, lebihBatas };
}

/* ── ringkasan ───────────────────────────────────────────── */

export function summary(list = state.petani) {
  const s = { petani: list.length, luas: 0, urea: 0, npk: 0, npkFormula: 0, organik: 0, za: 0, mt: [0, 0, 0] };
  list.forEach((p) => {
    p.mt.forEach((mt, i) => {
      const luas = numLuas(mt.luas);
      if (!upper(mt.komoditas) || upper(mt.komoditas) === '-' || luas <= 0) return;
      s.mt[i]++;
      s.luas += luas;
      PUPUK.forEach(({ key }) => { s[key] += num(mt[key]); });
    });
  });
  return s;
}

export function groupCounts(list = state.petani, key = 'namaDesa') {
  const m = new Map();
  list.forEach((p) => {
    const k = txt(p[key]) || '(tanpa ' + key + ')';
    m.set(k, (m.get(k) || 0) + 1);
  });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
