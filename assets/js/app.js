/* ============================================================
   app.js — antarmuka Projekt-Fer
   ============================================================ */

import {
  PUPUK, SUBSEKTOR, FIELDS, DOSIS_DEFAULT, SETTINGS_DEFAULT,
} from './schema.js';
import {
  state, load, emit, onChange, uid, cleanKtp, num, numLuas, txt, upper, fmt,
  emptyPetani, normalizePetani, dosisFor, komoditasList,
  recalcMt, recalcPetani, recalcAll, validatePetani, validateAll, summary,
  poktanRingkas, terapkanPoktanId, nikGanda, gabungNikGanda,
} from './store.js';
import {
  readWorkbook, sheetToMatrix, guessHeaderRow, autoMap, rowsToPetani,
  parseDosisSheet, buildTemplateWorkbook, downloadWorkbook,
  buildBackupWorkbook, backupToPetani,
} from './xlsxio.js';

/* ── helper DOM ──────────────────────────────────────────── */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, kind = 'ok') {
  const icons = { ok: 'ti-circle-check', err: 'ti-alert-circle', warn: 'ti-alert-triangle', info: 'ti-info-circle' };
  const t = el('div', `toast ${kind}`, `<i class="ti ${icons[kind] || icons.info}"></i><span>${esc(msg)}</span>`);
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .25s'; }, 3200);
  setTimeout(() => t.remove(), 3500);
}

const readFile = (file) => new Promise((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result);
  fr.onerror = () => rej(fr.error);
  fr.readAsArrayBuffer(file);
});

/* ── tema ────────────────────────────────────────────────── */
const THEME_KEY = 'projekt-fer:theme';
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  $('#btnTheme').innerHTML = `<i class="ti ti-${t === 'dark' ? 'sun' : 'moon'}"></i>`;
  localStorage.setItem(THEME_KEY, t);
}
$('#btnTheme').onclick = () =>
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

/* ── navigasi ────────────────────────────────────────────── */
function go(view) {
  $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (view === 'periksa') renderPeriksa();
  if (view === 'ekspor') renderEkspor();
  if (view === 'dosis') renderDosis();
  if (view === 'poktan') renderPoktan();
  if (view === 'setelan') fillSetelan();
}
$$('.nav-item').forEach((b) => (b.onclick = () => go(b.dataset.view)));

/* ============================================================
   TAMPILAN DATA
   ============================================================ */

let vres = { map: new Map(), errors: 0, warns: 0, badRows: 0 };

function filtered() {
  const q = txt($('#q').value).toLowerCase();
  const fd = $('#fDesa').value, fp = $('#fPoktan').value;
  const fk = $('#fKom').value, fs = $('#fStatus').value;

  return state.petani.filter((p) => {
    if (fd && txt(p.namaDesa || p.kodeDesa) !== fd) return false;
    if (fp && txt(p.namaPoktan) !== fp) return false;
    if (fk && !p.mt.some((m) => upper(m.komoditas) === fk)) return false;
    if (fs) {
      const iss = vres.map.get(p.id) || [];
      const hasErr = iss.some((i) => i.level === 'error');
      const hasWarn = iss.some((i) => i.level === 'warn');
      if (fs === 'err' && !hasErr) return false;
      if (fs === 'warn' && !hasWarn) return false;
      if (fs === 'ok' && iss.length) return false;
    }
    if (q) {
      const hay = [p.namaPetani, p.ktp, p.namaIbu, p.namaPoktan, p.namaDesa, p.kodeDesa, p.idPoktan, p.kodeKios]
        .join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderStats(list) {
  const s = summary(list);
  const tiles = [
    { k: 'Petani', v: fmt(s.petani), c: 'var(--moss)' },
    { k: 'Total Luas', v: fmt(s.luas, 2), u: 'Ha', c: 'var(--teal)' },
    { k: 'Urea', v: fmt(s.urea), u: 'kg', c: 'var(--sky)' },
    { k: 'NPK', v: fmt(s.npk), u: 'kg', c: 'var(--amber)' },
    { k: 'NPK Formula', v: fmt(s.npkFormula), u: 'kg', c: 'var(--amber)' },
    { k: 'Organik', v: fmt(s.organik), u: 'kg', c: 'var(--moss)' },
    { k: 'ZA', v: fmt(s.za), u: 'kg', c: 'var(--coral)' },
    { k: 'Baris MT', v: s.mt.join(' / '), u: 'MT1/2/3', c: 'var(--ink-3)' },
  ];
  $('#stats').innerHTML = tiles.map((t) => `
    <div class="stat" style="--accent:${t.c}">
      <div class="stat-k">${esc(t.k)}</div>
      <div class="stat-v">${esc(t.v)}${t.u ? `<span class="stat-u">${esc(t.u)}</span>` : ''}</div>
    </div>`).join('');
}

function fillFilterOptions() {
  const keep = (sel, vals) => {
    const cur = sel.value;
    const first = sel.options[0].outerHTML;
    sel.innerHTML = first + vals.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if (vals.includes(cur)) sel.value = cur;
  };
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();
  keep($('#fDesa'), uniq(state.petani.map((p) => txt(p.namaDesa || p.kodeDesa))));
  keep($('#fPoktan'), uniq(state.petani.map((p) => txt(p.namaPoktan))));
  keep($('#fKom'), uniq(state.petani.flatMap((p) => p.mt.map((m) => upper(m.komoditas)))));
}

function rowChip(p) {
  const iss = vres.map.get(p.id) || [];
  if (iss.some((i) => i.level === 'error')) return `<span class="tag tag-coral" title="${esc(iss.map((i) => i.msg).join(' · '))}">galat</span>`;
  if (iss.length) return `<span class="tag tag-amber" title="${esc(iss.map((i) => i.msg).join(' · '))}">cek</span>`;
  return '';
}

function renderTable() {
  const list = filtered();
  renderStats(list);
  const tb = $('#tbody');

  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="16"><div class="tbl-empty">
      <i class="ti ti-${state.petani.length ? 'filter-off' : 'database-off'}"></i>
      <b>${state.petani.length ? 'Tidak ada baris yang cocok' : 'Belum ada data petani'}</b>
      ${state.petani.length ? 'Ubah kata kunci atau saringan di atas.' : 'Impor database poktan, atau tambahkan petani satu per satu.'}
    </div></td></tr>`;
    $('#pillCount').innerHTML = `<b>${fmt(state.petani.length)}</b> petani`;
    $('#badgeData').textContent = fmt(state.petani.length);
    return;
  }

  const kom = (m) => {
    const k = upper(m.komoditas);
    if (!k) return '<span class="muted">—</span>';
    return `<span class="tag ${dosisFor(k) ? 'tag-moss' : 'tag-coral'}">${esc(k)}</span>`;
  };
  const n = (v) => (num(v) ? `<span class="mono">${fmt(v)}</span>` : '<span class="muted">·</span>');

  tb.innerHTML = list.map((p, i) => {
    const iss = vres.map.get(p.id) || [];
    const bad = iss.some((x) => x.level === 'error');
    const m1 = p.mt[0];
    return `<tr data-id="${p.id}" class="${bad ? 'bad' : ''}">
      <td class="mono muted">${i + 1}</td>
      <td><b>${esc(p.namaPetani || '(tanpa nama)')}</b> ${rowChip(p)}
        <span class="sub">${esc(p.namaIbu || '—')}</span></td>
      <td class="mono nowrap">${esc(p.ktp || '—')}</td>
      <td>${esc(p.namaPoktan || p.idPoktan || '—')}<span class="sub">${esc(p.namaDesa || p.kodeDesa || '—')}</span></td>
      <td>${kom(m1)}${m1.manual ? ' <span class="tag tag-amber">manual</span>' : ''}</td>
      <td class="num">${numLuas(m1.luas) ? fmt(numLuas(m1.luas), 2) : '<span class="muted">·</span>'}</td>
      <td class="num">${n(m1.urea)}</td>
      <td class="num">${n(m1.npk)}</td>
      <td class="num">${n(m1.npkFormula)}</td>
      <td class="num">${n(m1.organik)}</td>
      <td class="num">${n(m1.za)}</td>
      <td>${kom(p.mt[1])}</td>
      <td class="num">${numLuas(p.mt[1].luas) ? fmt(numLuas(p.mt[1].luas), 2) : '<span class="muted">·</span>'}</td>
      <td>${kom(p.mt[2])}</td>
      <td class="num">${numLuas(p.mt[2].luas) ? fmt(numLuas(p.mt[2].luas), 2) : '<span class="muted">·</span>'}</td>
      <td><div class="row-acts">
        <button class="btn btn-sm btn-icon" data-act="dup" title="Gandakan"><i class="ti ti-copy"></i></button>
        <button class="btn btn-sm btn-icon btn-danger" data-act="del" title="Hapus"><i class="ti ti-trash"></i></button>
      </div></td>
    </tr>`;
  }).join('');

  $('#pillCount').innerHTML = `<b>${fmt(list.length)}</b>${list.length !== state.petani.length ? ` / ${fmt(state.petani.length)}` : ''} petani`;
  $('#badgeData').textContent = fmt(state.petani.length);
}

$('#tbody').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  const p = state.petani.find((x) => x.id === tr.dataset.id);
  if (!p) return;
  const act = e.target.closest('[data-act]')?.dataset.act;

  if (act === 'del') {
    if (!confirm(`Hapus ${p.namaPetani || p.ktp || 'baris ini'}?`)) return;
    state.petani = state.petani.filter((x) => x.id !== p.id);
    emit(); toast('Baris dihapus');
  } else if (act === 'dup') {
    const copy = normalizePetani(JSON.parse(JSON.stringify(p)));
    copy.id = uid(); copy.ktp = ''; copy.namaPetani = (p.namaPetani || '') + ' (salinan)';
    state.petani.splice(state.petani.indexOf(p) + 1, 0, copy);
    emit(); openDrawer(copy);
  } else {
    openDrawer(p);
  }
});

['#q', '#fDesa', '#fPoktan', '#fKom', '#fStatus'].forEach((s) => {
  $(s).addEventListener('input', renderTable);
});

$('#btnRecalc').onclick = () => {
  if (!state.petani.length) return toast('Belum ada data', 'warn');
  const manual = state.petani.reduce((s, p) => s + p.mt.filter((m) => m.manual).length, 0);
  const force = manual > 0
    ? confirm(`Ada ${manual} musim tanam dengan pupuk manual.\n\nOK  = timpa juga yang manual\nBatal = pertahankan nilai manual`)
    : false;
  recalcAll({ force });
  if (force) state.petani.forEach((p) => p.mt.forEach((m) => (m.manual = false)));
  emit();
  toast(`Pupuk dihitung ulang untuk ${state.petani.length} petani`);
};

$('#btnHapusFilter').onclick = () => {
  const list = filtered();
  if (!list.length) return toast('Tidak ada baris tampil', 'warn');
  if (!confirm(`Hapus ${list.length} baris yang sedang tampil?`)) return;
  const ids = new Set(list.map((p) => p.id));
  state.petani = state.petani.filter((p) => !ids.has(p.id));
  emit(); toast(`${ids.size} baris dihapus`);
};

$('#btnTambah').onclick = () => openDrawer(null);

/* ============================================================
   DRAWER FORM
   ============================================================ */

let editing = null;

function mtFieldsHtml() {
  return [0, 1, 2].map((i) => `
    <fieldset class="mt" data-mt="${i}">
      <legend>Musim Tanam ${i + 1}${i === 0 ? ' · wajib' : ''}</legend>
      <div class="grid g2">
        <div class="field">
          <label>Komoditas</label>
          <select name="mt${i}Komoditas" data-mt-kom="${i}"></select>
        </div>
        <div class="field">
          <label>Luas Lahan (Ha)</label>
          <input type="number" step="0.01" min="0" class="mono" name="mt${i}Luas" data-mt-luas="${i}" />
        </div>
      </div>
      <div class="pupuk-preview" data-mt-prev="${i}"></div>
      <label class="check" style="margin-top:9px">
        <input type="checkbox" data-mt-manual="${i}" />
        <span>Ubah pupuk secara manual<small>Nilai tidak akan ditimpa perhitungan dosis</small></span>
      </label>
      <div class="grid g3" data-mt-manual-fields="${i}" hidden style="margin-top:9px"></div>
    </fieldset>`).join('');
}

function komOptions(selected) {
  const list = komoditasList();
  const has = list.includes(upper(selected));
  return ['<option value="">— tidak ada —</option>']
    .concat(list.map((k) => `<option value="${esc(k)}"${upper(selected) === k ? ' selected' : ''}>${esc(k)}</option>`))
    .concat(!has && upper(selected) ? [`<option value="${esc(upper(selected))}" selected>${esc(upper(selected))} (dosis tidak ada)</option>`] : [])
    .join('');
}

function renderMtPreview(i) {
  const p = editing;
  const mt = p.mt[i];
  const box = $(`[data-mt-prev="${i}"]`);
  const d = dosisFor(mt.komoditas);
  box.innerHTML = PUPUK.map(({ key, label }) => {
    const v = num(mt[key]);
    const per = d ? num(d[key]) : 0;
    return `<div class="pp ${v ? '' : 'zero'}" title="${esc(label)} — ${fmt(per)} kg/Ha">
      <k>${esc(label)}</k><v>${fmt(v)}</v></div>`;
  }).join('');

  const mf = $(`[data-mt-manual-fields="${i}"]`);
  mf.hidden = !mt.manual;
  if (mt.manual && mf.childElementCount === 0) {
    mf.innerHTML = PUPUK.map(({ key, label }) =>
      `<div class="field"><label>${esc(label)} (kg)</label>
        <input type="number" min="0" step="1" class="mono" data-mt-pupuk="${i}" data-key="${key}" value="${num(mt[key])}" /></div>`).join('');
  } else if (mt.manual) {
    PUPUK.forEach(({ key }) => {
      const inp = mf.querySelector(`[data-key="${key}"]`);
      if (inp && document.activeElement !== inp) inp.value = num(mt[key]);
    });
  } else {
    mf.innerHTML = '';
  }
}

function syncSubsektor() {
  const auto = dosisFor(editing.mt[0].komoditas) || dosisFor(editing.mt[1].komoditas) || dosisFor(editing.mt[2].komoditas);
  if (auto) {
    editing.subsektor = upper(auto.subsektor);
    $('#fSubsektor').value = editing.subsektor;
  }
}

function renderFormIssues() {
  const iss = validatePetani(editing);
  const box = $('#formIssues');
  if (!iss.length) {
    box.innerHTML = `<div class="alert alert-ok"><i class="ti ti-circle-check"></i><div>Data lengkap dan valid.</div></div>`;
    return;
  }
  const errs = iss.filter((i) => i.level === 'error');
  const warns = iss.filter((i) => i.level === 'warn');
  box.innerHTML = [
    errs.length ? `<div class="alert alert-err"><i class="ti ti-alert-circle"></i><div><b>${errs.length} galat</b>${errs.map((i) => esc(i.msg)).join('<br>')}</div></div>` : '',
    warns.length ? `<div class="alert alert-warn"><i class="ti ti-alert-triangle"></i><div><b>${warns.length} peringatan</b>${warns.map((i) => esc(i.msg)).join('<br>')}</div></div>` : '',
  ].join('');
}

function fillForm() {
  const f = $('#form');
  ['namaPetani', 'ktp', 'namaIbu', 'namaPenyuluh', 'kodeDesa', 'namaDesa', 'idPoktan', 'namaPoktan', 'kodeKios', 'namaKios']
    .forEach((k) => { if (f[k]) f[k].value = editing[k] ?? ''; });

  $('#fSubsektor').innerHTML = ['<option value="">— pilih —</option>']
    .concat(SUBSEKTOR.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`)).join('');
  $('#fSubsektor').value = upper(editing.subsektor);

  [0, 1, 2].forEach((i) => {
    const sel = $(`[data-mt-kom="${i}"]`);
    sel.innerHTML = komOptions(editing.mt[i].komoditas);
    sel.value = upper(editing.mt[i].komoditas);
    $(`[data-mt-luas="${i}"]`).value = numLuas(editing.mt[i].luas) || '';
    $(`[data-mt-manual="${i}"]`).checked = !!editing.mt[i].manual;
    renderMtPreview(i);
  });
  renderFormIssues();
}

function openDrawer(p) {
  editing = p ? normalizePetani(JSON.parse(JSON.stringify(p))) : recalcPetani(emptyPetani(state.settings));
  editing._new = !p;
  $('#drawerTitle').textContent = p ? 'Ubah Petani' : 'Tambah Petani';
  $('#btnSimpanLagi').hidden = !!p;
  fillForm();
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  $('#scrim').classList.add('open');
  setTimeout(() => $('#form').namaPetani.focus(), 220);
}

function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $('#scrim').classList.remove('open');
  editing = null;
}

$('#drawerClose').onclick = closeDrawer;
$('#btnBatal').onclick = closeDrawer;
$('#scrim').onclick = closeDrawer;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#drawer').classList.contains('open')) closeDrawer();
});

$('#form').addEventListener('input', (e) => {
  if (!editing) return;
  const t = e.target;

  if (t.name && editing[t.name] !== undefined && !t.dataset.mtKom && !t.dataset.mtLuas) {
    editing[t.name] = t.name === 'ktp' ? cleanKtp(t.value) : t.value;
    if (t.name === 'ktp' && t.value !== editing.ktp) t.value = editing.ktp;
  }
  if (t.id === 'fSubsektor') editing.subsektor = t.value;

  // nama poktan dikenal → ID poktan ikut terisi
  if (t.name === 'namaPoktan') {
    const id = txt(state.poktanId[upper(t.value)]);
    if (id && !txt(editing.idPoktan)) {
      editing.idPoktan = id;
      $('#form').idPoktan.value = id;
    }
  }

  const iKom = t.dataset.mtKom, iLuas = t.dataset.mtLuas, iPup = t.dataset.mtPupuk;

  if (iKom != null) {
    const i = +iKom;
    editing.mt[i].komoditas = upper(t.value);
    recalcMt(editing.mt[i]);
    if (i === 0 && state.settings.salinMt2 && editing._new) {
      editing.mt[1].komoditas = editing.mt[0].komoditas;
      editing.mt[1].luas = editing.mt[0].luas;
      recalcMt(editing.mt[1]);
      $(`[data-mt-kom="1"]`).innerHTML = komOptions(editing.mt[1].komoditas);
      $(`[data-mt-kom="1"]`).value = upper(editing.mt[1].komoditas);
      $(`[data-mt-luas="1"]`).value = numLuas(editing.mt[1].luas) || '';
      renderMtPreview(1);
    }
    syncSubsektor();
    renderMtPreview(i);
  }
  if (iLuas != null) {
    const i = +iLuas;
    editing.mt[i].luas = numLuas(t.value);
    recalcMt(editing.mt[i]);
    if (i === 0 && state.settings.salinMt2 && editing._new) {
      editing.mt[1].luas = editing.mt[0].luas;
      recalcMt(editing.mt[1]);
      $(`[data-mt-luas="1"]`).value = numLuas(editing.mt[1].luas) || '';
      renderMtPreview(1);
    }
    renderMtPreview(i);
  }
  if (iPup != null) {
    editing.mt[+iPup][t.dataset.key] = Math.max(0, Math.round(num(t.value)));
    renderMtPreview(+iPup);
  }
  renderFormIssues();
});

$('#form').addEventListener('change', (e) => {
  const i = e.target.dataset.mtManual;
  if (i == null || !editing) return;
  const mt = editing.mt[+i];
  mt.manual = e.target.checked;
  if (!mt.manual) recalcMt(mt, { force: true });
  $(`[data-mt-manual-fields="${i}"]`).innerHTML = '';
  renderMtPreview(+i);
  renderFormIssues();
});

function simpan(lagi) {
  if (!editing) return;
  const iss = validatePetani(editing);
  const errs = iss.filter((i) => i.level === 'error');
  if (errs.length && !confirm(`Masih ada ${errs.length} galat:\n\n${errs.map((e) => '• ' + e.msg).join('\n')}\n\nTetap simpan?`)) return;

  const rec = normalizePetani(editing);
  delete rec._new;
  const ix = state.petani.findIndex((x) => x.id === rec.id);
  if (ix >= 0) state.petani[ix] = rec; else state.petani.push(rec);
  emit();
  toast(ix >= 0 ? 'Perubahan disimpan' : 'Petani ditambahkan');

  if (lagi) {
    const seed = emptyPetani(state.settings);
    seed.namaPenyuluh = rec.namaPenyuluh; seed.kodeDesa = rec.kodeDesa; seed.namaDesa = rec.namaDesa;
    seed.idPoktan = rec.idPoktan; seed.namaPoktan = rec.namaPoktan;
    seed.kodeKios = rec.kodeKios; seed.namaKios = rec.namaKios;
    seed.mt[0].komoditas = rec.mt[0].komoditas;
    seed.mt[1].komoditas = rec.mt[1].komoditas;
    seed.mt[2].komoditas = rec.mt[2].komoditas;
    recalcPetani(seed);
    openDrawer(null);
    editing = seed; editing._new = true;
    fillForm();
    $('#form').namaPetani.focus();
  } else closeDrawer();
}
$('#btnSimpan').onclick = () => simpan(false);
$('#btnSimpanLagi').onclick = () => simpan(true);

/* ============================================================
   IMPOR DATABASE
   ============================================================ */

let imp = null; // { wb, sheets, sheet, matrix, headerRow, map, rows }

const dz = $('#dz');
dz.onclick = () => $('#fileImp').click();
dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
dz.ondragleave = () => dz.classList.remove('over');
dz.ondrop = (e) => {
  e.preventDefault(); dz.classList.remove('over');
  if (e.dataTransfer.files[0]) muatImpor(e.dataTransfer.files[0]);
};
$('#fileImp').onchange = (e) => { if (e.target.files[0]) muatImpor(e.target.files[0]); e.target.value = ''; };

async function muatImpor(file) {
  try {
    const wb = readWorkbook(await readFile(file));
    imp = { wb, sheets: wb.SheetNames, sheet: wb.SheetNames[0], nama: file.name };
    $('#impSheet').innerHTML = imp.sheets.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
    pilihSheet(imp.sheet);
    $('#impPanel').hidden = false;
    $('#impPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(`${file.name} dibaca — ${imp.sheets.length} sheet`);
  } catch (err) {
    console.error(err);
    toast('Gagal membaca berkas: ' + err.message, 'err');
  }
}

function pilihSheet(name) {
  imp.sheet = name;
  imp.matrix = sheetToMatrix(imp.wb, name);
  imp.headerRow = guessHeaderRow(imp.matrix);
  imp.map = autoMap(imp.matrix[imp.headerRow] || []);
  $('#impHeaderRow').value = imp.headerRow + 1;
  renderMapRows();
  renderImpPreview();
}

$('#impSheet').onchange = (e) => pilihSheet(e.target.value);
$('#impHeaderRow').oninput = (e) => {
  const r = Math.max(0, Math.min(imp.matrix.length - 1, (+e.target.value || 1) - 1));
  imp.headerRow = r;
  imp.map = autoMap(imp.matrix[r] || []);
  renderMapRows();
  renderImpPreview();
};

function renderMapRows() {
  const heads = (imp.matrix[imp.headerRow] || []).map((h, i) =>
    `${XLSX.utils.encode_col(i)} · ${txt(h) || '(kosong)'}`);
  $('#mapRows').innerHTML = FIELDS.map((f) => {
    const cur = imp.map[f.key];
    const unset = cur == null;
    return `<div class="maprow ${f.req ? 'req' : ''} ${unset && f.req ? 'unset' : ''}">
      <div class="mf">${esc(f.label)}${f.req ? ' <span style="color:var(--coral)">*</span>' : ''}
        ${f.note ? `<small>${esc(f.note)}</small>` : ''}</div>
      <div class="arr">→</div>
      <select data-map="${f.key}">
        <option value="">— tidak dipetakan —</option>
        ${heads.map((h, i) => `<option value="${i}"${cur === i ? ' selected' : ''}>${esc(h)}</option>`).join('')}
      </select>
    </div>`;
  }).join('');
}

$('#mapRows').addEventListener('change', (e) => {
  const key = e.target.dataset.map;
  if (!key) return;
  if (e.target.value === '') delete imp.map[key];
  else imp.map[key] = +e.target.value;
  renderMapRows();
  renderImpPreview();
});

function impOptions() {
  return {
    salinMt2: $('#impSalinMt2').checked,
    ...($('#impIsiKosong').checked ? state.settings : {}),
  };
}

function renderImpPreview() {
  const rows = rowsToPetani(imp.matrix, imp.headerRow, imp.map, impOptions());
  rows.forEach((p) => recalcPetani(p));
  imp.rows = rows;

  const kurang = FIELDS.filter((f) => f.req && imp.map[f.key] == null && !txt(state.settings[f.key]));
  $('#impStat').innerHTML = `
    <div class="section-label" style="margin-top:14px">Ringkasan</div>
    <div class="kv"><span>Baris terbaca</span><b>${fmt(rows.length)}</b></div>
    <div class="kv"><span>Kolom terpetakan</span><b>${Object.keys(imp.map).length} / ${FIELDS.length}</b></div>
    <div class="kv"><span>Total luas MT1</span><b>${fmt(rows.reduce((s, p) => s + numLuas(p.mt[0].luas), 0), 2)} Ha</b></div>
    <div class="kv"><span>Komoditas tanpa dosis</span><b>${[...new Set(rows.flatMap((p) => p.mt.map((m) => upper(m.komoditas)).filter((k) => k && !dosisFor(k))))].length}</b></div>
    ${kurang.length ? `<div class="alert alert-warn" style="margin-top:10px"><i class="ti ti-alert-triangle"></i><div><b>Kolom wajib belum terpetakan</b>${kurang.map((f) => esc(f.label)).join(', ')}</div></div>` : ''}`;

  const cols = ['namaPetani', 'ktp', 'namaIbu', 'kodeDesa', 'idPoktan', 'kodeKios', 'subsektor'];
  const labels = ['Nama', 'NIK', 'Ibu', 'Kode Desa', 'ID Poktan', 'Kode Kios', 'Subsektor'];
  $('#impPrev').innerHTML = `
    <thead><tr>${labels.map((l) => `<th>${esc(l)}</th>`).join('')}
      <th>MT1</th><th class="num">Luas</th><th class="num">Urea</th><th class="num">NPK</th><th class="num">Organik</th></tr></thead>
    <tbody>${rows.slice(0, 8).map((p) => `<tr>
      ${cols.map((c) => `<td class="${c === 'ktp' || c === 'kodeDesa' || c === 'idPoktan' || c === 'kodeKios' ? 'mono nowrap' : ''}">${esc(p[c] || '—')}</td>`).join('')}
      <td>${esc(p.mt[0].komoditas || '—')}</td>
      <td class="num">${fmt(numLuas(p.mt[0].luas), 2)}</td>
      <td class="num">${fmt(p.mt[0].urea)}</td>
      <td class="num">${fmt(p.mt[0].npk)}</td>
      <td class="num">${fmt(p.mt[0].organik)}</td></tr>`).join('')
      || `<tr><td colspan="12"><div class="tbl-empty"><i class="ti ti-file-off"></i><b>Tidak ada baris terbaca</b>Periksa baris judul dan pemetaan kolom.</div></td></tr>`}
    </tbody>`;

  $('#impJumlah').textContent = rows.length ? `${fmt(rows.length)} baris` : '';
  $('#impJalan').disabled = !rows.length;
}

['#impSalinMt2', '#impIsiKosong'].forEach((s) => ($(s).onchange = renderImpPreview));

$('#impBatal').onclick = () => { $('#impPanel').hidden = true; imp = null; };

$('#impJalan').onclick = () => {
  if (!imp?.rows?.length) return;
  const mode = $('input[name="impMode"]:checked').value;
  let rows = imp.rows.map((p) => ({ ...p, id: uid() }));

  if (mode === 'replace') state.petani = [];

  let lewat = 0;
  if ($('#impDedup').checked) {
    const ada = new Set(state.petani.map((p) => cleanKtp(p.ktp)).filter(Boolean));
    rows = rows.filter((p) => {
      const k = cleanKtp(p.ktp);
      if (k && ada.has(k)) { lewat++; return false; }
      if (k) ada.add(k);
      return true;
    });
  }

  state.petani.push(...rows.map(normalizePetani));
  emit();
  $('#impPanel').hidden = true; imp = null;
  toast(`${fmt(rows.length)} petani diimpor${lewat ? ` · ${lewat} NIK ganda dilewati` : ''}`);
  go('data');
};

/* ============================================================
   ID POKTAN
   ============================================================ */

function renderPoktan() {
  const list = poktanRingkas();
  const belum = list.filter((o) => !o.id && !o.idTerpakai.length);

  $('#poktanKosong').innerHTML = !list.length
    ? `<div class="alert alert-info"><i class="ti ti-info-circle"></i><div><b>Belum ada nama poktan di data</b>Impor database poktan lebih dulu.</div></div>`
    : belum.length
      ? `<div class="alert alert-warn"><i class="ti ti-alert-triangle"></i><div><b>${belum.length} dari ${list.length} kelompok belum punya ID</b>
          Isi kolom ID Poktan di bawah, lalu tekan <b>Terapkan ke Semua Baris</b>.</div></div>`
      : `<div class="alert alert-ok"><i class="ti ti-circle-check"></i><div><b>Seluruh ${list.length} kelompok sudah punya ID Poktan</b></div></div>`;

  $('#tbodyPoktan').innerHTML = list.map((o, i) => {
    const efektif = o.id || o.idTerpakai[0] || '';
    const status = o.id
      ? '<span class="tag tag-moss">dipetakan</span>'
      : o.idTerpakai.length === 1 ? '<span class="tag tag-teal">dari data</span>'
      : o.idTerpakai.length > 1 ? `<span class="tag tag-amber">${o.idTerpakai.length} ID berbeda</span>`
      : '<span class="tag tag-coral">kosong</span>';
    return `<tr data-poktan="${esc(o.nama)}">
      <td class="mono muted">${i + 1}</td>
      <td><b>${esc(o.nama)}</b></td>
      <td class="num">${fmt(o.anggota)}</td>
      <td class="num">${fmt(o.luas, 2)}</td>
      <td><input type="text" class="mono" data-poktan-id="${esc(o.nama)}"
            value="${esc(efektif)}" placeholder="mis. 1048014" /></td>
      <td>${status}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="6"><div class="tbl-empty"><i class="ti ti-users-off"></i><b>Belum ada kelompok tani</b>Nama poktan diambil dari kolom "Nama Poktan" saat impor.</div></td></tr>`;

  $('#badgePoktan').textContent = list.length;
  $('#badgePoktan').classList.toggle('warn', belum.length > 0);
}

$('#tbodyPoktan').addEventListener('input', (e) => {
  const nama = e.target.dataset.poktanId;
  if (nama == null) return;
  const v = txt(e.target.value);
  if (v) state.poktanId[nama] = v; else delete state.poktanId[nama];
  emit();
});

$('#btnPoktanTerap').onclick = () => {
  const list = poktanRingkas();
  if (!list.length) return toast('Belum ada data poktan', 'warn');
  const adaId = state.petani.some((p) => txt(p.idPoktan));
  const timpa = adaId
    ? confirm('Sebagian baris sudah punya ID Poktan.\n\nOK  = timpa dengan ID dari tabel ini\nBatal = hanya isi yang masih kosong')
    : false;
  const n = terapkanPoktanId({ timpa });
  emit(); renderPoktan();
  toast(n ? `ID Poktan diterapkan ke ${fmt(n)} baris` : 'Tidak ada baris yang perlu diubah', n ? 'ok' : 'warn');
};

$('#btnPoktanTempel').onclick = () => {
  const list = poktanRingkas();
  if (!list.length) return toast('Belum ada data poktan', 'warn');
  const contoh = list.slice(0, 3).map((o) => `${o.nama}\t${o.id || ''}`).join('\n');
  const teks = prompt(
    `Tempel daftar "NAMA POKTAN <tab atau ;> ID" — satu baris per kelompok.\n` +
    `Bisa langsung disalin dari Excel.\n\nContoh:\n${contoh}`, '');
  if (teks == null) return;

  const namaAda = new Map(list.map((o) => [o.nama, true]));
  let cocok = 0, asing = [];
  teks.split(/\r?\n/).forEach((baris) => {
    const bagian = baris.split(/\t|;|\||,(?=\s*\d)/).map((x) => txt(x));
    if (bagian.length < 2) return;
    const nama = upper(bagian[0]);
    const id = txt(bagian[bagian.length - 1]);
    if (!nama || !id) return;
    if (namaAda.has(nama)) { state.poktanId[nama] = id; cocok++; }
    else asing.push(nama);
  });
  emit(); renderPoktan();
  toast(`${cocok} kelompok terisi${asing.length ? ` · ${asing.length} nama tidak dikenali` : ''}`,
    cocok ? 'ok' : 'warn');
};

$('#btnPoktanFile').onclick = () => $('#filePoktan').click();
$('#filePoktan').onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const wb = readWorkbook(await readFile(file));
    const namaAda = new Set(poktanRingkas().map((o) => o.nama));
    let cocok = 0;
    for (const s of wb.SheetNames) {
      const m = sheetToMatrix(wb, s);
      const hr = guessHeaderRow(m);
      const heads = (m[hr] || []).map((h) => txt(h).toLowerCase());
      const iNama = heads.findIndex((h) => /nama\s*poktan|nama\s*kelompok|poktan|kelompok/.test(h));
      const iId = heads.findIndex((h) => /id\s*poktan|idpoktan|kode\s*poktan|id\s*kelompok/.test(h));
      if (iNama < 0 || iId < 0) continue;
      m.slice(hr + 1).forEach((r) => {
        const nama = upper(r[iNama]), id = txt(r[iId]);
        if (nama && id && namaAda.has(nama)) { state.poktanId[nama] = id; cocok++; }
      });
      if (cocok) break;
    }
    if (!cocok) return toast('Tidak menemukan pasangan kolom "Nama Poktan" dan "ID Poktan"', 'err');
    emit(); renderPoktan();
    toast(`${cocok} ID poktan dimuat dari berkas`);
  } catch (err) {
    console.error(err);
    toast('Gagal membaca berkas: ' + err.message, 'err');
  }
};

/* ============================================================
   DOSIS
   ============================================================ */

function renderDosis() {
  $('#tbodyDosis').innerHTML = state.dosis.map((d, i) => `
    <tr data-i="${i}">
      <td><input type="text" data-d="komoditas" value="${esc(d.komoditas)}" style="min-width:130px" /></td>
      <td><select data-d="subsektor" style="min-width:140px">
        ${SUBSEKTOR.map((s) => `<option value="${esc(s)}"${upper(d.subsektor) === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
      </select></td>
      ${['urea', 'npk', 'npkFormula', 'organik', 'za', 'sp36', 'poc'].map((k) =>
        `<td class="num"><input type="number" min="0" step="1" class="mono" data-d="${k}" value="${num(d[k])}" style="width:82px;text-align:right" /></td>`).join('')}
      <td><button class="btn btn-sm btn-icon btn-danger" data-del-dosis><i class="ti ti-trash"></i></button></td>
    </tr>`).join('') || `<tr><td colspan="10"><div class="tbl-empty"><i class="ti ti-flask-off"></i><b>Tabel dosis kosong</b>Impor berkas dosis atau kembalikan bawaan.</div></td></tr>`;

  $('#badgeDosis').textContent = state.dosis.length;
  const m = state.dosisMeta;
  $('#dmYear').value = m.year; $('#dmProv').value = m.namaProv;
  $('#dmKab').value = m.namaKab; $('#dmKec').value = m.namaKec;
  $('#pillWilayah').textContent = `${m.namaKec || '—'} · ${m.year}`;
  $('#brandSub').textContent = `Dosis ${m.year} · ${m.namaKec || '—'}`;
}

$('#tbodyDosis').addEventListener('input', (e) => {
  const tr = e.target.closest('tr[data-i]');
  const key = e.target.dataset.d;
  if (!tr || !key) return;
  const d = state.dosis[+tr.dataset.i];
  d[key] = key === 'komoditas' ? e.target.value.toUpperCase() : (key === 'subsektor' ? e.target.value : num(e.target.value));
  if (key === 'komoditas') e.target.value = d.komoditas;
  emit();
});

$('#tbodyDosis').addEventListener('click', (e) => {
  if (!e.target.closest('[data-del-dosis]')) return;
  const tr = e.target.closest('tr[data-i]');
  state.dosis.splice(+tr.dataset.i, 1);
  emit(); renderDosis();
});

$('#btnDosisTambah').onclick = () => {
  state.dosis.push({ komoditas: '', subsektor: SUBSEKTOR[0], urea: 0, npk: 0, npkFormula: 0, organik: 0, za: 0, sp36: 0, poc: 0 });
  emit(); renderDosis();
};

$('#btnDosisReset').onclick = () => {
  if (!confirm('Kembalikan tabel dosis ke bawaan 2026 (Pitu Riawa)?')) return;
  state.dosis = DOSIS_DEFAULT.map((d) => ({ ...d }));
  emit(); renderDosis(); toast('Dosis dikembalikan ke bawaan');
};

$('#btnDosisFile').onclick = () => $('#fileDosis').click();
$('#fileDosis').onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const wb = readWorkbook(await readFile(file));
    let hasil = { rows: [], meta: null };
    for (const s of wb.SheetNames) {
      const r = parseDosisSheet(sheetToMatrix(wb, s));
      if (r.rows.length > hasil.rows.length) hasil = r;
    }
    if (!hasil.rows.length) return toast('Tidak menemukan baris dosis di berkas ini', 'err');
    state.dosis = hasil.rows;
    if (hasil.meta) state.dosisMeta = hasil.meta;
    emit(); renderDosis();
    toast(`${hasil.rows.length} komoditas dimuat${hasil.meta ? ` · ${hasil.meta.namaKec}` : ''}`);
  } catch (err) {
    console.error(err);
    toast('Gagal membaca berkas dosis: ' + err.message, 'err');
  }
};

['#dmYear', '#dmProv', '#dmKab', '#dmKec'].forEach((s) => {
  $(s).oninput = () => {
    state.dosisMeta.year = num($('#dmYear').value) || state.dosisMeta.year;
    state.dosisMeta.namaProv = $('#dmProv').value;
    state.dosisMeta.namaKab = $('#dmKab').value;
    state.dosisMeta.namaKec = $('#dmKec').value;
    $('#pillWilayah').textContent = `${state.dosisMeta.namaKec || '—'} · ${state.dosisMeta.year}`;
    $('#brandSub').textContent = `Dosis ${state.dosisMeta.year} · ${state.dosisMeta.namaKec || '—'}`;
    emit();
  };
});

/* ============================================================
   PERIKSA
   ============================================================ */

function renderPeriksa() {
  const bersih = state.petani.length - vres.map.size;
  $('#statsPeriksa').innerHTML = [
    { k: 'Total Baris', v: fmt(state.petani.length), c: 'var(--ink-3)' },
    { k: 'Siap Ekspor', v: fmt(state.petani.length - vres.badRows), c: 'var(--moss)' },
    { k: 'Baris Bergalat', v: fmt(vres.badRows), c: 'var(--coral)' },
    { k: 'Galat', v: fmt(vres.errors), c: 'var(--coral)' },
    { k: 'Peringatan', v: fmt(vres.warns), c: 'var(--amber)' },
    { k: 'Tanpa Catatan', v: fmt(bersih), c: 'var(--teal)' },
  ].map((t) => `<div class="stat" style="--accent:${t.c}"><div class="stat-k">${t.k}</div><div class="stat-v">${t.v}</div></div>`).join('');

  renderDup();

  const filter = $('#fIssue').value;
  const items = [];
  state.petani.forEach((p, ix) => {
    (vres.map.get(p.id) || []).forEach((i) => {
      if (filter !== 'all' && i.level !== filter) return;
      items.push({ p, ix, i });
    });
  });

  $('#issueList').innerHTML = items.length ? items.map(({ p, ix, i }) => `
    <div class="issue" data-id="${p.id}" style="cursor:pointer">
      <span class="ix">${ix + 1}</span>
      <div class="who">${esc(p.namaPetani || '(tanpa nama)')} <span class="muted mono">${esc(p.ktp || '—')}</span>
        <small>${esc(i.msg)}</small></div>
      <span class="tag ${i.level === 'error' ? 'tag-coral' : 'tag-amber'}">${i.level === 'error' ? 'galat' : 'peringatan'}</span>
    </div>`).join('')
    : `<div class="tbl-empty"><i class="ti ti-circle-check"></i><b>Tidak ada temuan</b>${state.petani.length ? 'Seluruh data lolos pemeriksaan.' : 'Belum ada data untuk diperiksa.'}</div>`;
}

function renderDup() {
  const grup = nikGanda();
  $('#cardDup').hidden = !grup.length;
  if (!grup.length) return;

  const barisTerdampak = grup.reduce((s, g) => s + g.rows.length, 0);
  const batas = num(state.settings.batasLuas) || 0;
  const lebih = grup.filter((g) => {
    const t = g.rows.reduce((s, p) => s + numLuas(p.mt[0].luas), 0);
    return batas > 0 && t > batas;
  });

  $('#dupRingkas').innerHTML = `
    <div class="alert alert-warn"><i class="ti ti-alert-triangle"></i><div>
      <b>${fmt(grup.length)} NIK muncul lebih dari sekali (${fmt(barisTerdampak)} baris)</b>
      Portal e-RDKK menolak NIK ganda. Menggabungkan akan menyatukan tiap NIK menjadi satu baris
      dengan luas tiap musim tanam dijumlahkan, lalu pupuk dihitung ulang.
      ${lebih.length ? `<br><b>${lebih.length} NIK akan melebihi batas ${batas} Ha</b> setelah digabung — periksa baris tersebut sesudahnya.` : ''}
    </div></div>`;

  $('#tbodyDup').innerHTML = grup.slice(0, 60).map((g) => {
    const total = g.rows.reduce((s, p) => s + numLuas(p.mt[0].luas), 0);
    return `<tr>
      <td class="mono nowrap">${esc(g.ktp)}</td>
      <td>${esc(g.rows[0].namaPetani || '—')}</td>
      <td>${g.rows.map((p) => esc(p.namaPoktan || '—')).join(' + ')}</td>
      <td class="num">${g.rows.map((p) => fmt(numLuas(p.mt[0].luas), 2)).join(' + ')}</td>
      <td class="num"><b>${fmt(total, 2)}</b></td>
    </tr>`;
  }).join('') + (grup.length > 60
    ? `<tr><td colspan="5" class="muted" style="text-align:center">…dan ${grup.length - 60} NIK lainnya</td></tr>` : '');
}

$('#btnGabungNik').onclick = () => {
  const grup = nikGanda();
  if (!grup.length) return toast('Tidak ada NIK ganda', 'warn');
  if (!confirm(`Gabungkan ${grup.length} NIK ganda menjadi masing-masing satu baris?\n\n` +
    `Luas tiap musim tanam dijumlahkan dan pupuk dihitung ulang.\n` +
    `${grup.reduce((s, g) => s + g.rows.length, 0) - grup.length} baris akan dihapus.\n\n` +
    `Tindakan ini tidak bisa dibatalkan — unduh cadangan lebih dulu bila perlu.`)) return;

  const r = gabungNikGanda();
  emit(); renderPeriksa();
  toast(`${r.digabung} NIK digabung · ${r.dihapus} baris dihapus` +
    (r.lebihBatas.length ? ` · ${r.lebihBatas.length} melebihi batas luas` : ''),
    r.lebihBatas.length ? 'warn' : 'ok');
};

$('#fIssue').onchange = renderPeriksa;
$('#issueList').addEventListener('click', (e) => {
  const row = e.target.closest('.issue[data-id]');
  if (!row) return;
  const p = state.petani.find((x) => x.id === row.dataset.id);
  if (p) openDrawer(p);
});

/* ============================================================
   EKSPOR
   ============================================================ */

function eksporList() {
  return $('#expBersih').checked
    ? state.petani.filter((p) => !(vres.map.get(p.id) || []).some((i) => i.level === 'error'))
    : state.petani;
}

function renderEkspor() {
  // jangan timpa kotak yang sedang diketik — caret akan lompat ke akhir
  if (document.activeElement !== $('#expNama')) $('#expNama').value = state.settings.namaFile;
  if (document.activeElement !== $('#expSheet')) $('#expSheet').value = state.settings.sheetName;

  const list = eksporList();
  const s = summary(list);
  const desa = new Map();
  list.forEach((p) => {
    const k = txt(p.kodeDesa) || '(tanpa kode)';
    const o = desa.get(k) || { n: 0, nama: txt(p.namaDesa) };
    o.n++; if (!o.nama && p.namaDesa) o.nama = txt(p.namaDesa);
    desa.set(k, o);
  });

  $('#expRekap').innerHTML = `
    <div class="kv"><span>Baris diekspor</span><b>${fmt(list.length)}</b></div>
    <div class="kv"><span>Total luas</span><b>${fmt(s.luas, 2)} Ha</b></div>
    ${PUPUK.map(({ key, label }) => `<div class="kv"><span>${label}</span><b>${fmt(s[key])} kg</b></div>`).join('')}
    <div class="divider"></div>
    <div class="section-label">Sebaran per desa</div>
    ${[...desa.entries()].map(([k, o]) =>
      `<div class="kv"><span class="mono">${esc(k)}${o.nama ? ` · ${esc(o.nama)}` : ''}</span><b>${fmt(o.n)}</b></div>`).join('')
      || '<p class="muted" style="font-size:12.5px">Belum ada data.</p>'}`;

  $('#expWarn').innerHTML = vres.badRows
    ? `<div class="alert alert-err"><i class="ti ti-alert-circle"></i><div><b>${vres.badRows} baris masih bergalat</b>
        Baris bergalat kemungkinan besar ditolak sistem e-RDKK. Buka tab <b>Periksa</b> untuk memperbaikinya, atau centang "Hanya baris tanpa galat".</div></div>`
    : (state.petani.length
      ? `<div class="alert alert-ok"><i class="ti ti-circle-check"></i><div><b>Semua baris lolos pemeriksaan</b>Berkas siap diunggah.</div></div>`
      : `<div class="alert alert-info"><i class="ti ti-info-circle"></i><div><b>Belum ada data</b>Impor database poktan atau tambahkan petani lebih dulu.</div></div>`);
}

['#expBersih', '#expNol', '#expPerDesa'].forEach((s) => ($(s).onchange = renderEkspor));
$('#expNama').oninput = (e) => { state.settings.namaFile = e.target.value; emit(); };
$('#expSheet').oninput = (e) => { state.settings.sheetName = e.target.value; emit(); };

$('#btnEkspor').onclick = () => {
  const list = eksporList();
  if (!list.length) return toast('Tidak ada baris untuk diekspor', 'warn');

  const opts = {
    sheetName: txt($('#expSheet').value) || 'Worksheet',
    tulisNol: $('#expNol').checked,
  };
  const base = txt($('#expNama').value) || 'template-erdkk';

  if (!$('#expPerDesa').checked) {
    downloadWorkbook(buildTemplateWorkbook(list, opts), base);
    return toast(`${fmt(list.length)} baris diekspor`);
  }

  const grup = new Map();
  list.forEach((p) => {
    const k = txt(p.kodeDesa) || 'tanpa-kode';
    if (!grup.has(k)) grup.set(k, []);
    grup.get(k).push(p);
  });
  let i = 0;
  grup.forEach((rows, kode) => {
    const nama = txt(rows[0].namaDesa).replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
    setTimeout(() => downloadWorkbook(buildTemplateWorkbook(rows, opts),
      `${base}-${kode}${nama ? '-' + nama : ''}`), i * 450);
    i++;
  });
  toast(`${grup.size} berkas diunduh berurutan`);
};

$('#btnBackup').onclick = () => {
  if (!state.petani.length) return toast('Belum ada data', 'warn');
  const tgl = new Date().toISOString().slice(0, 10);
  downloadWorkbook(buildBackupWorkbook(), `cadangan-erdkk-${tgl}`);
  toast('Cadangan diunduh');
};

$('#btnRestore').onclick = () => $('#fileRestore').click();
$('#fileRestore').onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  if (state.petani.length && !confirm('Data saat ini akan diganti dengan isi cadangan. Lanjutkan?')) return;
  try {
    const wb = readWorkbook(await readFile(file));
    const sheet = wb.SheetNames.find((s) => /poktan|petani|database/i.test(s)) || wb.SheetNames[0];
    const list = backupToPetani(sheetToMatrix(wb, sheet));
    if (!list.length) return toast('Tidak ada baris terbaca dari cadangan', 'err');

    const dSheet = wb.SheetNames.find((s) => /dosis/i.test(s));
    if (dSheet) {
      const r = parseDosisSheet(sheetToMatrix(wb, dSheet));
      if (r.rows.length) state.dosis = r.rows;
    }
    state.petani = list.map(normalizePetani);
    recalcAll();
    emit(); go('data');
    toast(`${fmt(list.length)} petani dimuat dari cadangan`);
  } catch (err) {
    console.error(err);
    toast('Gagal memuat cadangan: ' + err.message, 'err');
  }
};

/* ============================================================
   SETELAN
   ============================================================ */

const SET_MAP = {
  '#sPenyuluh': 'namaPenyuluh', '#sKodeDesa': 'kodeDesa', '#sNamaDesa': 'namaDesa',
  '#sKodeKios': 'kodeKios', '#sNamaKios': 'namaKios', '#sIdPoktan': 'idPoktanDefault',
};

function fillSetelan() {
  Object.entries(SET_MAP).forEach(([sel, key]) => ($(sel).value = state.settings[key] ?? ''));
  $('#sBatas').value = state.settings.batasLuas;
  $('#sSalinMt2').checked = !!state.settings.salinMt2;
}

Object.entries(SET_MAP).forEach(([sel, key]) => {
  $(sel).oninput = (e) => { state.settings[key] = e.target.value; emit(); };
});
$('#sBatas').oninput = (e) => { state.settings.batasLuas = num(e.target.value); emit(); };
$('#sSalinMt2').onchange = (e) => { state.settings.salinMt2 = e.target.checked; emit(); };

$('#btnReset').onclick = () => {
  if (!confirm('Hapus SELURUH data petani, dosis, dan setelan dari peramban ini?\n\nTindakan ini tidak bisa dibatalkan.')) return;
  if (!confirm('Yakin? Pastikan Anda sudah mengunduh cadangan.')) return;
  state.petani = [];
  state.dosis = DOSIS_DEFAULT.map((d) => ({ ...d }));
  state.settings = { ...SETTINGS_DEFAULT };
  state.poktanId = {};
  emit(); fillSetelan(); renderDosis(); renderPoktan(); go('data');
  toast('Semua data dihapus');
};

/* ============================================================
   SIKLUS RENDER
   ============================================================ */

function renderAll() {
  vres = validateAll();
  const badge = $('#badgeIssue');
  badge.textContent = fmt(vres.errors + vres.warns);
  badge.classList.toggle('warn', vres.errors > 0);
  fillFilterOptions();
  renderTable();
  const belumId = poktanRingkas().filter((o) => !o.id && !o.idTerpakai.length).length;
  $('#badgePoktan').textContent = poktanRingkas().length;
  $('#badgePoktan').classList.toggle('warn', belumId > 0);
  if ($('#view-periksa').classList.contains('active')) renderPeriksa();
  if ($('#view-ekspor').classList.contains('active')) renderEkspor();
}

onChange(renderAll);

/* ── init ────────────────────────────────────────────────── */
applyTheme(localStorage.getItem(THEME_KEY)
  || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

$('#mtFields').innerHTML = mtFieldsHtml();
load();
renderDosis();
fillSetelan();
renderAll();

window.addEventListener('beforeunload', (e) => {
  if ($('#drawer').classList.contains('open')) { e.preventDefault(); e.returnValue = ''; }
});
