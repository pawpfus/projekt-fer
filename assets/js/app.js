/* ============================================================
   app.js — antarmuka Projekt-Fer
   ============================================================ */

import {
  PUPUK, SUBSEKTOR, FIELDS, DOSIS_DEFAULT, SETTINGS_DEFAULT, PMAAS_DEFAULT,
} from './schema.js?v=20260922';
import {
  state, load, emit, onChange, uid, cleanKtp, num, numLuas, txt, upper, fmt,
  emptyPetani, normalizePetani, dosisFor, komoditasList,
  recalcMt, recalcPetani, recalcAll, validatePetani, validateAll, summary,
  poktanRingkas, terapkanPoktanId, nikGanda, gabungNikGanda, cocokkanPoktan,
  isiMusimTanam, sebaranPetani, sebaranLuasKomoditas, sebaranLuasWilayah,
  sebaranBarisMt, sebaranPupuk, isPmaas, dosisBerlaku, pmaasRingkas, setPmaas,
  janganSimpan, setJanganSimpan, bersihkanSesi,
  simpanMentah, hapusMentah, mentahRingkas, mentahUntukPoktan, poktanMentah,
} from './store.js?v=20260922';
import {
  readWorkbook, sheetToMatrix, guessHeaderRow, autoMap, rowsToPetani,
  parseDosisSheet, buildTemplateWorkbook, downloadWorkbook,
  buildBackupWorkbook, backupToPetani, bacaDaftarPoktan, buildMentahWorkbook,
  bacaSimluhtan,
} from './xlsxio.js?v=20260922';

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
  if (view === 'dosis') { renderDosis(); renderPmaas(); }
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

/* ── infografik donat ────────────────────────────────────── */

const R = 42, TEBAL = 13, KELILING = 2 * Math.PI * R, CELAH = 2;

/** Satu donat: irisan [{label, value}], plus angka besar di tengah. */
function donutHtml(p) {
  const total = p.irisan.reduce((s, x) => s + x.value, 0);
  if (!total) {
    return `<figure class="viz">
      <figcaption class="viz-title">${esc(p.judul)}</figcaption>
      <div class="viz-sub">${esc(p.sub || '')}</div>
      <div class="viz-kosong">Belum ada data</div></figure>`;
  }

  const tunggal = p.irisan.length === 1;
  const warna = (x, i) => (x.sisa ? 'var(--s-lain)' : `var(--s${(i % 6) + 1})`);
  let jalan = 0;
  const cincin = p.irisan.map((x, i) => {
    const bagian = x.value / total;
    const panjang = Math.max(bagian * KELILING - (tunggal ? 0 : CELAH), 0.6);
    const offset = -jalan * KELILING;
    jalan += bagian;
    return `<circle r="${R}" cx="50" cy="50" fill="none"
      stroke="${warna(x, i)}" stroke-width="${TEBAL}"
      stroke-dasharray="${panjang.toFixed(2)} ${(KELILING - panjang).toFixed(2)}"
      stroke-dashoffset="${offset.toFixed(2)}"
      data-i="${i}" data-nm="${esc(x.label)}"
      data-vl="${esc(p.fmt(x.value))}" data-ps="${esc(fmt(bagian * 100, 1))}%">
      <title>${esc(x.label)}: ${esc(p.fmt(x.value))} (${fmt(bagian * 100, 1)}%)</title></circle>`;
  }).join('');

  const legenda = p.irisan.map((x, i) => `
    <li><i style="--c:${warna(x, i)}"></i>
      <span class="nm" title="${esc(x.label)}">${esc(x.label)}</span>
      <span class="vl"><b>${esc(p.fmt(x.value))}</b> · ${fmt(x.value / total * 100, 1)}%</span></li>`).join('');

  return `<figure class="viz">
    <figcaption class="viz-title">${esc(p.judul)}</figcaption>
    <div class="viz-sub">${esc(p.sub || '')}</div>
    <div class="viz-donut" data-total="${esc(p.pusat)}" data-satuan="${esc(p.satuan)}">
      <svg viewBox="0 0 100 100" role="img" aria-label="${esc(p.judul)}"
           style="transform:rotate(-90deg)">${cincin}</svg>
      <div class="viz-center"><b>${esc(p.pusat)}</b><span>${esc(p.satuan)}</span></div>
    </div>
    <ul class="viz-legend">${legenda}</ul>
  </figure>`;
}

function panelViz(list) {
  const s = summary(list);
  const kg = (v) => fmt(v) + ' kg';
  const ha = (v) => fmt(v, 2) + ' Ha';
  const org = (v) => fmt(v);

  const pet = sebaranPetani(list);
  const kom = sebaranLuasKomoditas(list);
  const pakaiKom = kom.length > 1;

  return [
    { judul: 'Petani', sub: `Sebaran per ${pet.basis}`, irisan: pet.irisan,
      pusat: fmt(s.petani), satuan: 'petani', fmt: org },
    // satu komoditas saja bikin donat komoditas jadi cincin utuh tanpa makna —
    // pakai sebaran wilayah supaya panel ini tetap menjawab sesuatu
    pakaiKom
      ? { judul: 'Luas lahan', sub: 'Sebaran per komoditas', irisan: kom,
          pusat: fmt(s.luas, 2), satuan: 'Ha total', fmt: ha }
      : (() => { const w = sebaranLuasWilayah(list);
          return { judul: 'Luas lahan', sub: `Sebaran per ${w.basis}`, irisan: w.irisan,
                   pusat: fmt(s.luas, 2), satuan: 'Ha total', fmt: ha }; })(),
    { judul: 'Baris terisi', sub: 'Sebaran per musim tanam', irisan: sebaranBarisMt(list),
      pusat: fmt(s.mt.reduce((a, b) => a + b, 0)), satuan: 'baris musim tanam', fmt: org },
    { judul: 'Pupuk', sub: 'Komposisi kebutuhan', irisan: sebaranPupuk(list),
      pusat: fmt(PUPUK.reduce((a, { key }) => a + num(s[key]), 0)), satuan: 'kg total', fmt: kg },
  ];
}

let vizPanel = [];

function renderStats(list) {
  vizPanel = panelViz(list);
  $('#vizGrid').innerHTML = vizPanel.map(donutHtml).join('');
  if (!$('#vizTabel').hidden) renderVizTabel();
}

/** Tampilan tabel — pemenuhan aturan relief & pembaca layar. */
function renderVizTabel() {
  $('#vizTabel').innerHTML = vizPanel.map((p) => {
    const total = p.irisan.reduce((s, x) => s + x.value, 0);
    return `<div class="section-label" style="margin-top:16px">${esc(p.judul)} — ${esc(p.sub)}</div>
      <table class="tbl"><thead><tr><th>Kategori</th><th class="num">Nilai</th><th class="num">Porsi</th></tr></thead>
      <tbody>${p.irisan.map((x) => `<tr><td>${esc(x.label)}</td>
        <td class="num">${esc(p.fmt(x.value))}</td>
        <td class="num">${total ? fmt(x.value / total * 100, 1) : '0'}%</td></tr>`).join('')
        || '<tr><td colspan="3" class="muted">Belum ada data</td></tr>'}</tbody></table>`;
  }).join('');
}

/* ringkasan bisa dilipat — pilihannya diingat antar sesi */
const VIZ_KEY = 'projekt-fer:viz-lipat';
/* peramban di komputer bersama bisa mengunci penyimpanan; jangan sampai
   seluruh skrip berhenti hanya karena preferensi lipat gagal dibaca */
const vizIngat = {
  baca() { try { return localStorage.getItem(VIZ_KEY); } catch (e) { return null; } },
  tulis(v) { try { localStorage.setItem(VIZ_KEY, v); } catch (e) { /* terkunci */ } },
};
function setVizLipat(lipat, simpan = true) {
  $('#vizBody').hidden = lipat;
  $('#btnVizTabel').hidden = lipat;
  $('#btnVizLipat').innerHTML = `<i class="ti ti-chevron-${lipat ? 'down' : 'up'}"></i>`;
  $('#btnVizLipat').title = lipat ? 'Tampilkan ringkasan' : 'Sembunyikan ringkasan';
  if (simpan) vizIngat.tulis(lipat ? '1' : '0');
}
$('#btnVizLipat').onclick = () => setVizLipat(!$('#vizBody').hidden);

$('#btnVizTabel').onclick = () => {
  const t = $('#vizTabel'), g = $('#vizGrid');
  const keTabel = t.hidden;
  t.hidden = !keTabel; g.hidden = keTabel;
  if (keTabel) renderVizTabel();
  $('#btnVizTabel').innerHTML = keTabel
    ? '<i class="ti ti-chart-donut-3"></i>Lihat sebagai grafik'
    : '<i class="ti ti-table"></i>Lihat sebagai tabel';
};

/* sorot irisan: angka tengah ikut berganti saat ditunjuk */
$('#vizGrid').addEventListener('mouseover', (e) => {
  const c = e.target.closest('circle[data-nm]');
  const box = e.target.closest('.viz-donut');
  if (!c || !box) return;
  box.classList.add('hover');
  box.querySelectorAll('circle').forEach((x) => x.classList.toggle('on', x === c));
  box.querySelector('.viz-center').innerHTML =
    `<b>${esc(c.dataset.vl)}</b><span>${esc(c.dataset.nm)} · ${esc(c.dataset.ps)}</span>`;
});
$('#vizGrid').addEventListener('mouseout', (e) => {
  const box = e.target.closest('.viz-donut');
  if (!box || box.contains(e.relatedTarget)) return;
  box.classList.remove('hover');
  box.querySelectorAll('circle').forEach((x) => x.classList.remove('on'));
  box.querySelector('.viz-center').innerHTML =
    `<b>${esc(box.dataset.total)}</b><span>${esc(box.dataset.satuan)}</span>`;
});

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
  if (iss.some((i) => i.level === 'error')) return `<span class="tag tag-coral" title="${esc(iss.map((i) => i.msg).join(' · '))}">tidak sesuai</span>`;
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
      ${state.petani.length ? 'Ubah kata kunci atau filter di atas.' : 'Impor database poktan, atau tambahkan petani satu per satu.'}
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
      <td>${esc(p.namaPoktan || p.idPoktan || '—')}${isPmaas(p) ? ' <span class="tag tag-teal">PM-AAS</span>' : ''}<span class="sub">${esc(p.namaDesa || p.kodeDesa || '—')}</span></td>
      <td class="g">${kom(m1)}${m1.manual ? ' <span class="tag tag-amber">manual</span>' : ''}</td>
      <td class="num">${numLuas(m1.luas) ? fmt(numLuas(m1.luas), 2) : '<span class="muted">·</span>'}</td>
      <td class="num">${n(m1.urea)}</td>
      <td class="num">${n(m1.npk)}</td>
      <td class="num">${n(m1.npkFormula)}</td>
      <td class="num">${n(m1.organik)}</td>
      <td class="num">${n(m1.za)}</td>
      <td class="g">${kom(p.mt[1])}</td>
      <td class="num">${numLuas(p.mt[1].luas) ? fmt(numLuas(p.mt[1].luas), 2) : '<span class="muted">·</span>'}</td>
      <td class="g">${kom(p.mt[2])}</td>
      <td class="num">${numLuas(p.mt[2].luas) ? fmt(numLuas(p.mt[2].luas), 2) : '<span class="muted">·</span>'}</td>
      <td class="g"><div class="row-acts">
        <button class="btn btn-sm btn-icon" data-act="dup" title="Gandakan"><i class="ti ti-copy"></i></button>
        <button class="btn btn-sm btn-icon btn-danger" data-act="del" title="Hapus"><i class="ti ti-trash"></i></button>
      </div></td>
    </tr>`;
  }).join('');

  $('#pillCount').innerHTML = `<b>${fmt(list.length)}</b>${list.length !== state.petani.length ? ` / ${fmt(state.petani.length)}` : ''} petani`;
  $('#badgeData').textContent = fmt(state.petani.length);
  renderTally(list.length);
  ukurHeaderKelompok();
}

/** Tinggi baris kelompok dipakai sebagai offset lengket tingkat kedua. */
function ukurHeaderKelompok() {
  const r = $('#tbl thead tr.grouprow');
  if (!r) return;
  // di ponsel baris kelompok disembunyikan (tinggi 0) — offset harus ikut 0,
  // kalau tidak tingkat kedua menggantung 26px dari atas
  const h = Math.round(r.getBoundingClientRect().height);
  $('#tbl').style.setProperty('--grouph', h + 'px');
}
addEventListener('resize', ukurHeaderKelompok);

/** Keterangan hasil saring + tombol bersihkan, muncul hanya saat menyaring. */
function renderTally(tampil) {
  const total = state.petani.length;
  const menyaring = tampil !== total;
  $('#btnBersihSaring').hidden = !menyaring;
  renderTombolSaring();
  $('#tally').textContent = !total ? ''
    : menyaring ? `${fmt(tampil)} dari ${fmt(total)} baris` : `${fmt(total)} baris`;
}

/* Saringan di ponsel disembunyikan sampai diminta; lencana angka memberi
   tahu berapa saringan yang sedang aktif meski panelnya tertutup. */
const SARING = ['#fDesa', '#fPoktan', '#fKom', '#fStatus'];
function renderTombolSaring() {
  const aktif = SARING.filter((s) => $(s).value).length;
  $('#btnSaring').innerHTML =
    `<i class="ti ti-filter"></i>Filter${aktif ? `<span class="jml">${aktif}</span>` : ''}`;
}
$('#btnSaring').onclick = () => {
  const t = $('.card-head.stackhead .toolbar');
  t.classList.toggle('saring-buka');
  $('#btnSaring').title = t.classList.contains('saring-buka')
    ? 'Sembunyikan pilihan filter' : 'Tampilkan pilihan filter';
};

$('#btnBersihSaring').onclick = () => {
  $('#q').value = '';
  ['#fDesa', '#fPoktan', '#fKom', '#fStatus'].forEach((s) => ($(s).value = ''));
  renderTable();
};

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

/* ── isi musim tanam massal ──────────────────────────────── */

const mtOpt = () => ({
  target: +$('#mtTarget .on').dataset.t,
  komoditas: $('#mtKom').value,
  luasDari: $('#mtLuasDari').value,
  luasTetap: num($('#mtLuasTetap').value),
  skala: num($('#mtSkala').value) / 100,
  luasSkalaDari: +$('#mtSkalaDari').value,
  hanyaKosong: $('#mtHanyaKosong').checked,
});

const mtSasaran = () => ($('#mtCakupan .on').dataset.c === 'semua' ? state.petani : filtered());

function renderMtModal() {
  const o = mtOpt();
  $('#mtSkalaBox').hidden = o.luasDari !== 'skala';
  $('#mtTetapBox').hidden = o.luasDari !== 'tetap';

  const list = mtSasaran();
  const label = `MT${o.target + 1}`;
  const terisi = list.filter((p) => upper(p.mt[o.target].komoditas) && numLuas(p.mt[o.target].luas) > 0).length;

  // hitung di salinan agar pratinjau tidak mengubah data
  const uji = JSON.parse(JSON.stringify(list)).map(normalizePetani);
  const r = isiMusimTanam(uji, o);
  const luasBaru = uji.reduce((s, p) => s + numLuas(p.mt[o.target].luas), 0);

  $('#mtRingkas').innerHTML = `
    <div class="section-label">Perkiraan hasil</div>
    <div class="kv"><span>Baris disasar</span><b>${fmt(list.length)}</b></div>
    <div class="kv"><span>${label} sudah terisi</span><b>${fmt(terisi)}</b></div>
    <div class="kv"><span>Akan diubah</span><b>${fmt(r.diubah)}</b></div>
    <div class="kv"><span>Dilewati</span><b>${fmt(r.dilewati)}</b></div>
    <div class="kv"><span>Total luas ${label} sesudahnya</span><b>${fmt(luasBaru, 2)} Ha</b></div>
    ${r.tanpaDosis.length ? `<div class="alert alert-warn" style="margin-top:10px"><i class="ti ti-alert-triangle"></i>
      <div><b>Komoditas tanpa dosis</b>${r.tanpaDosis.map(esc).join(', ')} — pupuknya akan 0.</div></div>` : ''}
    ${!r.diubah ? `<div class="alert alert-info" style="margin-top:10px"><i class="ti ti-info-circle"></i>
      <div>Tidak ada baris yang berubah dengan pilihan ini.</div></div>` : ''}`;

  $('#mtTerap').disabled = !r.diubah;
}

function bukaMtModal() {
  if (!state.petani.length) return toast('Belum ada data petani', 'warn');
  const kom = komoditasList();
  $('#mtKom').innerHTML =
    `<option value="mt1">Sama seperti MT1</option><option value="mt2">Sama seperti MT2</option>` +
    `<option value="mt3">Sama seperti MT3</option>` +
    `<option disabled>──────────</option>` +
    kom.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join('');
  $('#mtKom').value = 'mt1';
  renderMtModal();
  $('#modalMt').classList.add('open');
  $('#modalMt').setAttribute('aria-hidden', 'false');
  $('#scrim').classList.add('open');
}

function tutupMtModal() {
  $('#modalMt').classList.remove('open');
  $('#modalMt').setAttribute('aria-hidden', 'true');
  if (!$('#drawer').classList.contains('open')) $('#scrim').classList.remove('open');
}

$('#btnIsiMt').onclick = bukaMtModal;
$('#mtTutup').onclick = tutupMtModal;
$('#mtBatal').onclick = tutupMtModal;

['#mtTarget', '#mtCakupan'].forEach((sel) => {
  $(sel).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    $$(`${sel} button`).forEach((x) => x.classList.toggle('on', x === b));
    renderMtModal();
  });
});
['#mtKom', '#mtLuasDari', '#mtLuasTetap', '#mtSkala', '#mtSkalaDari', '#mtHanyaKosong']
  .forEach((s) => $(s).addEventListener('input', renderMtModal));

$('#mtTerap').onclick = () => {
  const o = mtOpt();
  const list = mtSasaran();
  const r = isiMusimTanam(list, o);
  emit(); tutupMtModal();
  toast(`MT${o.target + 1}: ${fmt(r.diubah)} baris diisi` + (r.dilewati ? ` · ${fmt(r.dilewati)} dilewati` : ''));
};

$('#mtKosongkan').onclick = () => {
  const o = mtOpt();
  const list = mtSasaran();
  const label = `MT${o.target + 1}`;
  if (!confirm(`Kosongkan ${label} pada ${list.length} baris?\n\nKomoditas, luas, dan pupuknya dihapus.`)) return;
  const r = isiMusimTanam(list, { target: o.target, kosongkan: true });
  emit(); tutupMtModal();
  toast(`${label} dikosongkan pada ${fmt(r.diubah)} baris`);
};

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
  const d = dosisBerlaku(mt.komoditas, p);
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
    errs.length ? `<div class="alert alert-err"><i class="ti ti-alert-circle"></i><div><b>${errs.length} data tidak sesuai</b>${errs.map((i) => esc(i.msg)).join('<br>')}</div></div>` : '',
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
$('#scrim').onclick = () => {
  if ($('#modalMt').classList.contains('open')) tutupMtModal();
  else closeDrawer();
};
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if ($('#modalMt').classList.contains('open')) tutupMtModal();
  else if ($('#drawer').classList.contains('open')) closeDrawer();
});

/* Enter di dalam formulir tidak boleh men-submit — halaman ter-reload dan
   isian yang belum disimpan hilang. */
$('#form').addEventListener('submit', (e) => e.preventDefault());
$('#form').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault();
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
    recalcMt(editing.mt[i], { petani: editing });
    if (i === 0 && state.settings.salinMt2 && editing._new) {
      editing.mt[1].komoditas = editing.mt[0].komoditas;
      editing.mt[1].luas = editing.mt[0].luas;
      recalcMt(editing.mt[1], { petani: editing });
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
    recalcMt(editing.mt[i], { petani: editing });
    if (i === 0 && state.settings.salinMt2 && editing._new) {
      editing.mt[1].luas = editing.mt[0].luas;
      recalcMt(editing.mt[1], { petani: editing });
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
  if (!mt.manual) recalcMt(mt, { force: true, petani: editing });
  $(`[data-mt-manual-fields="${i}"]`).innerHTML = '';
  renderMtPreview(+i);
  renderFormIssues();
});

function simpan(lagi) {
  if (!editing) return;
  const iss = validatePetani(editing);
  const errs = iss.filter((i) => i.level === 'error');
  if (errs.length && !confirm(`Masih ada ${errs.length} data tidak sesuai:\n\n${errs.map((e) => '• ' + e.msg).join('\n')}\n\nTetap simpan?`)) return;

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
$('#fileImp').onchange = (e) => { muatBanyak([...e.target.files]); e.target.value = ''; };

/** Unduhan SIMLUHTAN datang satu berkas per kelompok — 26 kelompok berarti
 *  26 berkas. Terima sekaligus; berkas database biasa tetap satu per satu. */
async function muatBanyak(files) {
  if (!files.length) return;
  if (files.length === 1) return muatImpor(files[0]);

  const kumpulan = [];
  for (const f of files) {
    try {
      const wb = readWorkbook(await readFile(f));
      const sim = cariSimluhtan(wb);
      if (sim) kumpulan.push({ ...sim, berkas: f.name });
      else toast(`${f.name} bukan berkas SIMLUHTAN — buka satu per satu`, 'warn');
    } catch (err) {
      toast(`Gagal membaca ${f.name}: ${err.message}`, 'err');
    }
  }
  if (!kumpulan.length) return;
  bukaSimPanel(kumpulan);
}

/** Berkas raksasa membekukan tab saat dirender — tolak lebih awal. */
const BATAS_UKURAN_MB = 25;
const BATAS_BARIS = 20000;

async function muatImpor(file) {
  try {
    const mb = file.size / (1024 * 1024);
    if (mb > BATAS_UKURAN_MB) {
      return toast(`Berkas ${mb.toFixed(1)} MB melebihi batas ${BATAS_UKURAN_MB} MB`, 'err');
    }
    const wb = readWorkbook(await readFile(file));

    // Unduhan SIMLUHTAN punya bentuk tetap — tidak perlu pemetaan kolom.
    const sim = cariSimluhtan(wb);
    if (sim) {
      $('#impPanel').hidden = true; imp = null;
      return bukaSimPanel([{ ...sim, berkas: file.name }]);
    }

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
  if (imp.matrix.length > BATAS_BARIS) {
    toast(`Sheet berisi ${fmt(imp.matrix.length)} baris — dipotong ke ${fmt(BATAS_BARIS)}`, 'warn');
    imp.matrix = imp.matrix.slice(0, BATAS_BARIS);
  }
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

  // Hanya mengambil salinan mentahnya. Berguna untuk data yang sudah telanjur
  // diimpor sebelum fitur unduh mentah ada: tidak satu pun baris petani
  // disentuh, jadi suntingan manual aman.
  if (mode === 'mentah') {
    const bagian = bagianMentah();
    if (bagian.iPoktan == null) {
      return toast('Kolom Nama Poktan tidak terpetakan — data mentah tak bisa dipisah per kelompok', 'err');
    }
    simpanMentah(bagian, true);
    const tersimpan = emit();
    $('#impPanel').hidden = true; imp = null;
    toast(`${fmt(bagian.baris.length)} baris mentah disimpan — data petani tidak diubah`);
    if (tersimpan === false) {
      toast('Penyimpanan peramban penuh — data hanya bertahan selama tab terbuka. Unduh cadangan.', 'err');
    }
    return go('poktan');
  }

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

  // Simpan baris apa adanya sebelum imp dibuang, supaya tiap kelompok bisa
  // menerima kembali data aslinya — bukan hasil olahan aplikasi.
  simpanMentah(bagianMentah(), mode === 'replace');

  state.petani.push(...rows.map(normalizePetani));
  const tersimpan = emit();
  $('#impPanel').hidden = true; imp = null;
  toast(`${fmt(rows.length)} petani diimpor${lewat ? ` · ${lewat} NIK ganda dilewati` : ''}`);
  if (tersimpan === false) {
    toast('Penyimpanan peramban penuh — data hanya bertahan selama tab terbuka. Unduh cadangan.', 'err');
  }
  go('data');
};

/* ── SIMLUHTAN ───────────────────────────────────────────── */
/* Satu berkas = satu kelompok, formatnya tetap. Yang berharga di sini bukan
   cuma daftar anggotanya, tapi ID Kelompok Tani di blok atas — nomor yang
   justru paling sulit didapat dari database biasa. */

let sim = null; // [{ namaPoktan, idPoktan, anggota, berkas, matrix }]

/** Cari sheet berbentuk SIMLUHTAN di dalam workbook. */
function cariSimluhtan(wb) {
  for (const nama of wb.SheetNames) {
    const matrix = sheetToMatrix(wb, nama);
    const hasil = bacaSimluhtan(matrix);
    if (hasil) return { ...hasil, sheet: nama, matrix };
  }
  return null;
}

function bukaSimPanel(daftar) {
  sim = daftar;
  renderSimPreview();
  $('#simPanel').hidden = false;
  go('impor');
  $('#simPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  const total = daftar.reduce((s, d) => s + d.anggota.length, 0);
  toast(`${daftar.length} berkas SIMLUHTAN dibaca — ${fmt(total)} anggota`);
}

/** Susun record petani dari satu berkas SIMLUHTAN. */
function simKeRecord(d, opt) {
  const bawaan = opt.isiKosong ? state.settings : {};
  // NIK → nama ibu kandung dari data yang sudah ada; SIMLUHTAN tidak memuatnya
  const ibuLama = new Map();
  if (opt.ambilIbu) {
    state.petani.forEach((p) => {
      const k = cleanKtp(p.ktp);
      if (k && txt(p.namaIbu)) ibuLama.set(k, p.namaIbu);
    });
  }
  return d.anggota.map((a) => {
    const kom = upper(a.komoditas);
    const dos = dosisFor(kom);
    const p = normalizePetani({
      id: uid(),
      namaPetani: a.nama,
      ktp: a.nik,
      namaIbu: ibuLama.get(a.nik) || '',
      namaPenyuluh: txt(bawaan.namaPenyuluh),
      kodeDesa: txt(bawaan.kodeDesa), namaDesa: upper(bawaan.namaDesa),
      idPoktan: txt(d.idPoktan), namaPoktan: upper(d.namaPoktan),
      kodeKios: txt(bawaan.kodeKios), namaKios: upper(bawaan.namaKios),
      // subsektor diturunkan dari komoditasnya lewat tabel kuota pupuk
      subsektor: dos ? upper(dos.subsektor) : '',
      mt: [{ komoditas: kom, luas: a.luas }, {}, {}],
    });
    recalcPetani(p);
    return p;
  });
}

function simOpsi() {
  return {
    ambilIbu: $('#simIbu').checked,
    isiKosong: $('#simIsiKosong').checked,
  };
}

function renderSimPreview() {
  if (!sim) return;
  const opt = simOpsi();
  const semua = sim.flatMap((d) => simKeRecord(d, opt));
  const tanpaIbu = semua.filter((p) => !txt(p.namaIbu)).length;
  const tanpaDosis = [...new Set(semua.map((p) => upper(p.mt[0].komoditas))
    .filter((k) => k && !dosisFor(k)))];

  // Setelan hanya dipakai saat baris dibuat — mengisinya belakangan tidak
  // mengisi mundur baris yang sudah masuk. Peringatkan sebelum, bukan sesudah.
  const wajibSetelan = [
    ['namaPenyuluh', 'Nama Penyuluh'], ['kodeDesa', 'Kode Desa'], ['kodeKios', 'Kode Kios'],
  ].filter(([k]) => !txt(state.settings[k])).map(([, label]) => label);

  $('#simRingkas').innerHTML = `
    ${sim.map((d) => `<div class="kv"><span>${esc(d.namaPoktan)}</span>
      <b>${fmt(d.anggota.length)} anggota · ID ${esc(d.idPoktan) || '<span class="muted">tidak ada</span>'}</b></div>`).join('')}
    ${opt.isiKosong && wajibSetelan.length ? `<div class="alert alert-warn" style="margin-top:10px">
      <i class="ti ti-alert-triangle"></i><div>
      <b>Setelan belum lengkap: ${esc(wajibSetelan.join(', '))}</b>
      SIMLUHTAN tidak memuat kolom ini. Isi di tab Setelan <b>sebelum</b> mengimpor —
      mengisinya belakangan tidak akan mengisi baris yang sudah masuk.</div>
      <button class="btn btn-sm" id="simKeSetelan" style="margin-left:auto;align-self:start">
        <i class="ti ti-settings"></i>Setelan</button></div>` : ''}
    <div class="divider"></div>
    <div class="kv"><span>Total baris di berkas</span><b>${fmt(semua.length)}</b></div>
    <div class="kv"><span>Total luas</span><b>${fmt(semua.reduce((s, p) => s + numLuas(p.mt[0].luas), 0), 2)} Ha</b></div>
    ${(() => {
      const d = simDampak(opt);
      if ($('input[name="simMode"]:checked')?.value !== 'gabung') return '';
      return `<div class="divider"></div>
        <div class="kv"><span>Sudah ada di data (NIK cocok)</span><b>${fmt(d.cocok)} baris dilengkapi</b></div>
        <div class="kv"><span>Belum ada di data</span><b>${fmt(d.baru)} baris ditambahkan</b></div>
        <div class="kv"><span>Anggota lama di luar berkas ini</span><b>${fmt(d.diLuarBerkas)} baris dibiarkan</b></div>
        ${d.tanpaNik ? `<div class="kv"><span>Tanpa NIK</span><b>${fmt(d.tanpaNik)} baris ditambahkan sebagai baru</b></div>` : ''}`;
    })()}
    ${tanpaIbu ? `<div class="alert alert-warn" style="margin-top:10px"><i class="ti ti-alert-triangle"></i><div>
      <b>${fmt(tanpaIbu)} baris belum punya Nama Ibu Kandung</b>
      SIMLUHTAN tidak memuat kolom itu, padahal template ERDKK mewajibkannya.
      Yang cocok NIK-nya dengan data lama sudah terisi otomatis; sisanya perlu
      dilengkapi manual — tab <b>Check</b> akan menandainya.</div></div>` : ''}
    ${tanpaDosis.length ? `<div class="alert alert-warn" style="margin-top:10px"><i class="ti ti-alert-triangle"></i><div>
      <b>Komoditas tanpa dosis: ${esc(tanpaDosis.join(', '))}</b>
      Pupuknya jadi 0. Tambahkan di tab Kuota Pupuk lalu tekan Hitung Ulang.</div></div>` : ''}`;

  $('#simPrev').innerHTML = `
    <thead><tr><th>Nama</th><th>NIK</th><th>Ibu</th><th>Poktan</th><th>ID</th>
      <th>Komoditas</th><th class="num">Luas</th><th class="num">Urea</th>
      <th class="num">NPK</th><th class="num">Organik</th></tr></thead>
    <tbody>${semua.slice(0, 8).map((p) => `<tr>
      <td>${esc(p.namaPetani || '—')}</td>
      <td class="mono nowrap">${esc(p.ktp || '—')}</td>
      <td>${p.namaIbu ? esc(p.namaIbu) : '<span class="tag tag-coral">kosong</span>'}</td>
      <td>${esc(p.namaPoktan)}</td>
      <td class="mono">${esc(p.idPoktan) || '—'}</td>
      <td>${esc(p.mt[0].komoditas || '—')}</td>
      <td class="num">${fmt(numLuas(p.mt[0].luas), 2)}</td>
      <td class="num">${fmt(p.mt[0].urea)}</td>
      <td class="num">${fmt(p.mt[0].npk)}</td>
      <td class="num">${fmt(p.mt[0].organik)}</td></tr>`).join('')}</tbody>`;

  const keSetelan = $('#simKeSetelan');
  if (keSetelan) keSetelan.onclick = () => go('setelan');
}

['#simIbu', '#simIsiKosong'].forEach((s) => ($(s).onchange = renderSimPreview));
$$('input[name="simMode"]').forEach((r) => (r.onchange = renderSimPreview));
$('#simBatal').onclick = () => { $('#simPanel').hidden = true; sim = null; };

/** Gabungkan satu record SIMLUHTAN ke baris yang sudah ada.
 *  Aturannya satu: hanya kolom KOSONG yang diisi. Nilai yang sudah ada —
 *  termasuk hasil suntingan manual — tidak pernah ditimpa, sebab data lama
 *  ERDKK memuat hal yang tidak dipunyai SIMLUHTAN (ibu kandung, MT2/MT3).
 *  @returns {number} berapa kolom yang terisi */
function gabungKeBaris(lama, baru) {
  let isi = 0;
  const isiKalauKosong = (k) => {
    if (txt(lama[k]) || !txt(baru[k])) return;
    lama[k] = baru[k]; isi++;
  };
  ['namaPetani', 'namaIbu', 'namaPenyuluh', 'kodeDesa', 'namaDesa',
    'idPoktan', 'namaPoktan', 'kodeKios', 'namaKios', 'subsektor'].forEach(isiKalauKosong);

  // MT1 hanya diisi bila memang masih kosong — luas yang sudah disesuaikan
  // sendiri tidak boleh diganti angka SIMLUHTAN
  const m = lama.mt[0], b = baru.mt[0];
  if (!txt(m.komoditas) && txt(b.komoditas)) {
    m.komoditas = b.komoditas;
    m.luas = b.luas;
    isi++;
    if (!m.manual) recalcMt(m, { petani: lama });
  }
  return isi;
}

/** Hitung dampak penggabungan tanpa mengubah apa pun — untuk pratinjau. */
function simDampak(opt) {
  const perNik = new Map();
  state.petani.forEach((p) => { const k = cleanKtp(p.ktp); if (k) perNik.set(k, p); });
  let cocok = 0, baru = 0, tanpaNik = 0;
  const nikBerkas = new Set();
  sim.forEach((d) => {
    simKeRecord(d, opt).forEach((p) => {
      const k = cleanKtp(p.ktp);
      if (!k) { tanpaNik++; return; }
      nikBerkas.add(k);
      if (perNik.has(k)) cocok++; else baru++;
    });
  });
  const namaBerkas = new Set(sim.map((d) => upper(d.namaPoktan)));
  const diLuarBerkas = state.petani.filter(
    (p) => namaBerkas.has(upper(p.namaPoktan)) && !nikBerkas.has(cleanKtp(p.ktp))).length;
  return { cocok, baru, tanpaNik, diLuarBerkas };
}

$('#simJalan').onclick = () => {
  if (!sim?.length) return;
  const mode = $('input[name="simMode"]:checked').value;
  const opt = simOpsi();
  let masuk = 0, lewat = 0, digabung = 0, kolomTerisi = 0;

  sim.forEach((d) => {
    const rows = simKeRecord(d, opt);
    const nama = upper(d.namaPoktan);

    if (mode === 'ganti') {
      // hanya kelompok ini yang diganti — kelompok lain tidak disentuh
      state.petani = state.petani.filter((p) => upper(p.namaPoktan) !== nama);
    }
    const perNik = new Map();
    state.petani.forEach((p) => { const k = cleanKtp(p.ktp); if (k) perNik.set(k, p); });

    rows.forEach((p) => {
      const k = cleanKtp(p.ktp);
      const lama = k ? perNik.get(k) : null;
      if (lama) {
        if (mode === 'gabung') { kolomTerisi += gabungKeBaris(lama, p); digabung++; }
        else lewat++;
        return;
      }
      if (k) perNik.set(k, p);
      state.petani.push(p);
      masuk++;
    });

    // ID kelompok dari SIMLUHTAN adalah sumber paling tepercaya
    if (d.idPoktan) {
      state.poktanId[nama] = txt(d.idPoktan);
      // Anggota lama kelompok ini yang tidak ada di berkas pun ikut terisi —
      // ID-nya sekarang diketahui. Hanya yang kosong; yang sudah terisi
      // dibiarkan supaya tidak menimpa koreksi manual.
      state.petani.forEach((p) => {
        if (upper(p.namaPoktan) === nama && !txt(p.idPoktan)) {
          p.idPoktan = txt(d.idPoktan);
          kolomTerisi++;
        }
      });
    }

    // simpan juga salinan mentahnya supaya bisa diunduh ulang per kelompok
    const judul = (d.matrix[d.barisJudul] || []).map((h) => txt(h));
    const baris = d.matrix.slice(d.barisJudul + 1)
      .filter((r) => r && r.some((c) => txt(c) !== ''));
    const iPoktan = judul.length;               // kolom buatan: nama kelompok
    simpanMentah({
      nama: txt(d.namaPoktan).slice(0, 28) || 'SIMLUHTAN',
      berkas: txt(d.berkas),
      waktu: new Date().toISOString().slice(0, 10),
      judul: [...judul, 'Nama Poktan'],
      baris: baris.map((r) => [...r, d.namaPoktan]),
      iPoktan,
    }, false);
  });

  const tersimpan = emit();
  $('#simPanel').hidden = true; sim = null;
  toast(mode === 'gabung'
    ? `${fmt(masuk)} anggota baru ditambahkan · ${fmt(digabung)} baris lama dilengkapi (${fmt(kolomTerisi)} kolom terisi)`
    : `${fmt(masuk)} anggota diimpor${lewat ? ` · ${lewat} NIK ganda dilewati` : ''}`);
  if (tersimpan === false) {
    toast('Penyimpanan peramban penuh — data hanya bertahan selama tab terbuka. Unduh cadangan.', 'err');
  }
  go('data');
};

/** Potret baris mentah sheet yang sedang diimpor, siap disimpan. */
function bagianMentah() {
  const judul = (imp.matrix[imp.headerRow] || []).map((h) => txt(h));
  const iPoktan = imp.map.namaPoktan;
  const baris = imp.matrix.slice(imp.headerRow + 1)
    .filter((r) => r && r.some((c) => txt(c) !== ''));
  return {
    nama: txt(imp.sheet) || txt(imp.nama) || 'Data',
    berkas: txt(imp.nama),
    waktu: new Date().toISOString().slice(0, 10),
    judul,
    baris,
    iPoktan: iPoktan == null || iPoktan < 0 ? null : iPoktan,
  };
}

/* ============================================================
   ID POKTAN
   ============================================================ */

let lastImporPoktan = null;

function renderPoktanLaporan() {
  const box = $('#poktanLaporan');
  const r = lastImporPoktan;
  if (!r) { box.innerHTML = ''; return; }
  box.innerHTML = [
    `<div class="alert alert-ok"><i class="ti ti-circle-check"></i><div>
       <b>${fmt(r.cocok)} kelompok terisi dari ${fmt(r.kandidat)} baris daftar</b>
       Nama dicocokkan tanpa memandang huruf besar/kecil, spasi, dan tanda baca.</div></div>`,
    r.ganda.length ? `<div class="alert alert-warn"><i class="ti ti-alert-triangle"></i><div>
       <b>${r.ganda.length} nama punya lebih dari satu kandidat ID — periksa manual</b>
       ${r.ganda.map((g) => `${esc(g.nama)} → dipakai <b>${esc(g.pilihan[0].id)}</b> (${esc(g.pilihan[0].nama)});
         alternatif: ${g.pilihan.slice(1).map((p) => `${esc(p.id)} (${esc(p.nama)})`).join(', ')}`).join('<br>')}
       </div></div>` : '',
    r.takKetemu.length ? `<div class="alert alert-err"><i class="ti ti-alert-circle"></i><div>
       <b>${r.takKetemu.length} kelompok tidak ada di daftar</b>
       ${r.takKetemu.map((n) => esc(n)).join(', ')}</div></div>` : '',
  ].join('');
}

function renderPoktan() {
  const list = poktanRingkas();
  const belum = list.filter((o) => !o.id && !o.idTerpakai.length);
  const adaMentah = poktanMentah();
  // Tanpa satu pun data mentah, tombolnya tidak digambar sama sekali —
  // tombol pudar yang tak bisa ditekan terbaca seperti fitur rusak.
  const adaMentahSamaSekali = adaMentah.size > 0;
  renderPoktanLaporan();
  renderMentahInfo();

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
      <td><label class="check" style="justify-content:center">
        <input type="checkbox" data-pmaas="${esc(o.nama)}"${state.pmaas.poktan[o.nama] ? ' checked' : ''} />
      </label></td>
      <td><div class="row-acts">
        ${adaMentahSamaSekali ? `<button class="btn btn-sm btn-icon" data-unduh-mentah="${esc(o.nama)}"${adaMentah.has(o.nama) ? '' : ' disabled'}
            title="${adaMentah.has(o.nama)
              ? 'Unduh data mentah kelompok ini — persis seperti berkas yang diunggah'
              : 'Kelompok ini tidak ada di berkas yang diunggah'}"><i class="ti ti-file-spreadsheet"></i></button>` : ''}
        <button class="btn btn-sm btn-icon" data-unduh-poktan="${esc(o.nama)}"
            title="Unduh template ERDKK kelompok ini"><i class="ti ti-download"></i></button>
      </div></td>
    </tr>`;
  }).join('') || `<tr><td colspan="8"><div class="tbl-empty"><i class="ti ti-users-off"></i><b>Belum ada kelompok tani</b>Nama poktan diambil dari kolom "Nama Poktan" saat impor.</div></td></tr>`;

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

$('#tbodyPoktan').addEventListener('change', (e) => {
  const nama = e.target.dataset.pmaas;
  if (nama == null) return;
  setPmaas(nama, e.target.checked);
  hitungUlangPmaas([nama]);
  emit(); renderPoktan(); renderPmaas();
  toast(`${nama} ${e.target.checked ? 'masuk' : 'keluar dari'} program PM-AAS`);
});

/** Hitung ulang pupuk anggota kelompok tertentu.
 *  Baris yang pupuknya diubah manual sengaja dipertahankan — pakai
 *  "Hitung Ulang" di tab Data bila ingin menimpanya juga. */
function hitungUlangPmaas(namaList) {
  const set = namaList ? new Set(namaList.map(upper)) : null;
  let n = 0;
  state.petani.forEach((p) => {
    if (set && !set.has(upper(p.namaPoktan))) return;
    recalcPetani(p);
    n++;
  });
  return n;
}


/** Keterangan data mentah tersimpan + tombol hapusnya. */
function renderMentahInfo() {
  const box = $('#mentahInfo');
  if (!box) return;
  const r = mentahRingkas();
  if (!r.baris) {
    // Data yang diimpor sebelum fitur ini ada memang tidak punya salinan
    // mentah — baris aslinya dibuang begitu impor selesai. Katakan apa
    // adanya, jangan biarkan pengguna mengira tombolnya rusak.
    box.innerHTML = `<div class="alert alert-info"><i class="ti ti-info-circle"></i><div>
      <b>Belum ada data mentah untuk diunduh</b>
      Data yang sudah ada di sini diimpor sebelum fitur ini dibuat, jadi baris
      aslinya tidak ikut tersimpan dan tidak bisa dimunculkan kembali.
      Buka berkas database yang sama lalu pilih <b>Simpan data mentahnya saja</b> —
      data petani Anda tidak disentuh sama sekali.</div>
      <button class="btn btn-sm btn-primary" id="btnKeImpor" style="margin-left:auto;align-self:start">
        <i class="ti ti-file-upload"></i>Buka berkas</button></div>`;
    $('#btnKeImpor').onclick = () => {
      go('impor');
      // pilihkan modenya supaya tidak ada yang salah tekan "Ganti"
      const m = $('input[name="impMode"][value="mentah"]');
      if (m) m.checked = true;
      $('#fileImp').click();
    };
    return;
  }
  // Saat semuanya beres cukup satu baris — tab ini sudah penuh spanduk.
  // Penjelasan panjang disimpan untuk kasus yang memang perlu dijelaskan.
  box.innerHTML = r.adaKolomPoktan
    ? `<div class="alert alert-ok"><i class="ti ti-database"></i><div>
         <b>${fmt(r.baris)} baris data mentah tersimpan</b></div>
       <button class="btn btn-sm" id="btnHapusMentah" style="margin-left:auto;align-self:center">
         <i class="ti ti-trash"></i>Hapus</button></div>`
    : `<div class="alert alert-warn"><i class="ti ti-alert-triangle"></i><div>
         <b>Data mentah tidak bisa dipisah per kelompok</b>
         Berkas yang diunggah tidak punya kolom Nama Poktan, jadi ${fmt(r.baris)} baris
         mentah itu tersimpan tapi tak ada dasar untuk memecahnya.</div>
       <button class="btn btn-sm" id="btnHapusMentah" style="margin-left:auto;align-self:start">
         <i class="ti ti-trash"></i>Hapus</button></div>`;
  $('#btnHapusMentah').onclick = () => {
    if (!confirm(`Hapus ${fmt(r.baris)} baris data mentah dari peramban ini?\n\nData petani yang sudah diimpor tidak ikut terhapus.`)) return;
    hapusMentah();
    emit(); renderPoktan();
    toast('Data mentah dihapus');
  };
}

$('#tbodyPoktan').addEventListener('click', (e) => {
  const btnMentah = e.target.closest('[data-unduh-mentah]');
  if (btnMentah) {
    const nama = btnMentah.dataset.unduhMentah;
    const bagian = mentahUntukPoktan(nama);
    if (!bagian.length) return toast('Data mentah kelompok ini tidak tersimpan', 'warn');
    const jml = bagian.reduce((s, b) => s + b.baris.length, 0);
    downloadWorkbook(buildMentahWorkbook(bagian), `data-mentah-${slug(nama)}`);
    toast(`${nama}: ${fmt(jml)} baris mentah diunduh`);
    return;
  }

  const btn = e.target.closest('[data-unduh-poktan]');
  if (!btn) return;
  const nama = btn.dataset.unduhPoktan;
  const rows = state.petani.filter((p) => upper(p.namaPoktan) === upper(nama));
  if (!rows.length) return toast('Tidak ada anggota di kelompok ini', 'warn');

  const base = slug(state.settings.namaFile) || 'template-erdkk';
  downloadWorkbook(buildTemplateWorkbook(rows, {
    sheetName: txt(state.settings.sheetName) || 'Worksheet',
    tulisNol: false,
  }), `${base}-${slug(nama)}`);
  toast(`${esc(nama)}: ${fmt(rows.length)} baris diunduh`);
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
    const kandidat = wb.SheetNames.flatMap((s) => bacaDaftarPoktan(sheetToMatrix(wb, s)));
    if (!kandidat.length) {
      return toast('Tidak menemukan pasangan kolom nama kelompok dan ID poktan', 'err');
    }

    const namaAda = poktanRingkas().map((o) => o.nama);
    if (!namaAda.length) return toast('Belum ada data poktan — impor database dulu', 'warn');

    const { peta, ganda, takKetemu } = cocokkanPoktan(namaAda, kandidat);
    const cocok = Object.keys(peta).length;
    if (!cocok) {
      return toast(`${kandidat.length} baris terbaca, tapi tidak ada nama yang cocok dengan data Anda`, 'err');
    }
    Object.assign(state.poktanId, peta);
    emit(); renderPoktan();

    lastImporPoktan = { kandidat: kandidat.length, cocok, ganda, takKetemu };
    renderPoktanLaporan();
    toast(`${cocok} dari ${namaAda.length} kelompok cocok` +
      (takKetemu.length ? ` · ${takKetemu.length} belum ketemu` : ''),
      takKetemu.length || ganda.length ? 'warn' : 'ok');
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
      <td><input type="text" class="cell" data-d="komoditas" value="${esc(d.komoditas)}" style="min-width:130px" /></td>
      <td><select class="cell" data-d="subsektor" style="min-width:150px">
        ${SUBSEKTOR.map((s) => `<option value="${esc(s)}"${upper(d.subsektor) === s ? ' selected' : ''}>${esc(s)}</option>`).join('')}
      </select></td>
      ${['urea', 'npk', 'npkFormula', 'organik', 'za'].map((k) =>
        `<td class="num"><input type="number" min="0" step="1" class="mono cell" data-d="${k}" value="${num(d[k])}" /></td>`).join('')}
      <td><button class="btn btn-sm btn-icon btn-danger" data-del-dosis><i class="ti ti-trash"></i></button></td>
    </tr>`).join('') || `<tr><td colspan="8"><div class="tbl-empty"><i class="ti ti-flask-off"></i><b>Tabel dosis kosong</b>Impor berkas dosis atau kembalikan bawaan.</div></td></tr>`;

  $('#badgeDosis').textContent = state.dosis.length;
  const m = state.dosisMeta;
  $('#dmYear').value = m.year; $('#dmProv').value = m.namaProv;
  $('#dmKab').value = m.namaKab; $('#dmKec').value = m.namaKec;
}

/* ── kuota PM-AAS ────────────────────────────────────────── */

const PM_FIELD = { '#pmUrea': 'urea', '#pmNpk': 'npk', '#pmOrganik': 'organik', '#pmNpkF': 'npkFormula' };

function renderPmaas() {
  Object.entries(PM_FIELD).forEach(([sel, key]) => {
    if (document.activeElement !== $(sel)) $(sel).value = num(state.pmaas.dosis[key]);
  });
  const r = pmaasRingkas();
  $('#pmaasPill').textContent = `${r.poktan} kelompok · ${fmt(r.petani)} petani`;

  const d = state.pmaas.dosis;
  const contoh = (ha) => PUPUK
    .filter(({ key }) => num(d[key]) > 0)
    .map(({ key, label }) => `${label} ${fmt(Math.round(num(d[key]) * ha))} kg`).join(' · ');

  $('#pmaasDaftar').innerHTML = r.poktan
    ? `<div class="section-label" style="margin-top:4px">Kelompok peserta (${r.poktan})</div>
       <div class="inline" style="gap:6px">${r.nama.map((n) => `<span class="tag tag-teal">${esc(n)}</span>`).join('')}</div>
       <div class="divider"></div>
       <div class="kv"><span>Petani terdampak</span><b>${fmt(r.petani)}</b></div>
       <div class="kv"><span>Luas terdampak</span><b>${fmt(r.luas, 2)} Ha</b></div>
       <div class="kv"><span>Contoh 1 Ha</span><b>${esc(contoh(1)) || '—'}</b></div>`
    : `<div class="alert alert-warn"><i class="ti ti-alert-triangle"></i><div>
        <b>Belum ada kelompok peserta</b>
        Kuota ini belum dipakai. Tandai kelompoknya di kolom <b>PM-AAS</b> pada tab <b>ID Poktan</b>.</div></div>`;
}

Object.entries(PM_FIELD).forEach(([sel, key]) => {
  $(sel).oninput = (e) => {
    state.pmaas.dosis[key] = Math.max(0, num(e.target.value));
    hitungUlangPmaas(Object.keys(state.pmaas.poktan));
    emit(); renderPmaas();
  };
});

$('#btnPmaasReset').onclick = () => {
  state.pmaas.dosis = { ...PMAAS_DEFAULT };
  hitungUlangPmaas(Object.keys(state.pmaas.poktan));
  emit(); renderPmaas();
  toast('Kuota PM-AAS dikembalikan: 300 Urea · 400 NPK · 1.000 Organik');
};

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
    emit();
  };
});

/* ============================================================
   PERIKSA
   ============================================================ */

function renderPeriksa() {
  const bersih = state.petani.length - vres.map.size;
  $('#statsPeriksa').innerHTML = [
    { k: 'Total Baris', v: fmt(state.petani.length) },
    { k: 'Siap Ekspor', v: fmt(state.petani.length - vres.badRows) },
    { k: 'Baris Tidak Sesuai', v: fmt(vres.badRows) },
    { k: 'Tidak Sesuai', v: fmt(vres.errors) },
    { k: 'Peringatan', v: fmt(vres.warns) },
    { k: 'Tanpa Catatan', v: fmt(bersih) },
  ].map((t) => `<div class="stat"><div class="stat-k">${t.k}</div><div class="stat-v">${t.v}</div></div>`).join('');

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
      <span class="tag ${i.level === 'error' ? 'tag-coral' : 'tag-amber'}">${i.level === 'error' ? 'tidak sesuai' : 'peringatan'}</span>
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
    <div class="alert alert-info"><i class="ti ti-info-circle"></i><div>
      <b>${fmt(grup.length)} NIK muncul lebih dari sekali (${fmt(barisTerdampak)} baris)</b>
      Ini <b>bukan masalah</b> — data diekspor apa adanya sesuai database, biar portal e-RDKK yang menilai.
      Tombol di bawah hanya opsi bila Anda ingin menyatukannya: tiap NIK jadi satu baris,
      luas tiap musim tanam dijumlahkan, lalu pupuk dihitung ulang.
      ${lebih.length ? `<br><b>${lebih.length} NIK akan melebihi batas ${batas} Ha</b> bila digabung.` : ''}
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
  const mode = $('#expPisah').value;

  const berkas = mode ? grupEkspor(list, mode, 'x') : [];
  $('#expPisahHint').textContent = mode
    ? `${berkas.length} berkas akan diunduh berurutan`
    : '';

  const desa = new Map();
  list.forEach((p) => {
    const k = txt(p.kodeDesa) || '(tanpa kode)';
    const o = desa.get(k) || { n: 0, nama: txt(p.namaDesa) };
    o.n++; if (!o.nama && p.namaDesa) o.nama = txt(p.namaDesa);
    desa.set(k, o);
  });

  const perPoktan = mode === 'poktan' ? grupEkspor(list, 'poktan', 'x') : null;

  $('#expRekap').innerHTML = `
    <div class="kv"><span>Baris diekspor</span><b>${fmt(list.length)}</b></div>
    <div class="kv"><span>Total luas</span><b>${fmt(s.luas, 2)} Ha</b></div>
    ${PUPUK.map(({ key, label }) => `<div class="kv"><span>${label}</span><b>${fmt(s[key])} kg</b></div>`).join('')}
    <div class="divider"></div>
    ${perPoktan
      ? `<div class="section-label">Sebaran per kelompok tani (${perPoktan.length})</div>
         ${perPoktan.map((g) => `<div class="kv"><span>${esc(g.kunci)}</span><b>${fmt(g.rows.length)}</b></div>`).join('')}`
      : `<div class="section-label">Sebaran per desa</div>
         ${[...desa.entries()].map(([k, o]) =>
            `<div class="kv"><span class="mono">${esc(k)}${o.nama ? ` · ${esc(o.nama)}` : ''}</span><b>${fmt(o.n)}</b></div>`).join('')
            || '<p class="muted" style="font-size:12.5px">Belum ada data.</p>'}`}`;

  $('#expWarn').innerHTML = vres.badRows
    ? `<div class="alert alert-err"><i class="ti ti-alert-circle"></i><div><b>${vres.badRows} baris belum sesuai</b>
        Baris yang tidak sesuai kemungkinan besar ditolak sistem e-RDKK. Buka tab <b>Check</b> untuk memperbaikinya, atau centang "Hanya baris yang sesuai".</div></div>`
    : (state.petani.length
      ? `<div class="alert alert-ok"><i class="ti ti-circle-check"></i><div><b>Semua baris lolos pemeriksaan</b>Berkas siap diunggah.</div></div>`
      : `<div class="alert alert-info"><i class="ti ti-info-circle"></i><div><b>Belum ada data</b>Impor database poktan atau tambahkan petani lebih dulu.</div></div>`);
}

['#expBersih', '#expNol', '#expPisah'].forEach((s) => ($(s).onchange = renderEkspor));
$('#expNama').oninput = (e) => { state.settings.namaFile = e.target.value; emit(); };
$('#expSheet').oninput = (e) => { state.settings.sheetName = e.target.value; emit(); };

/** Nama berkas aman: tanpa karakter terlarang, spasi jadi tanda hubung. */
const slug = (s) => txt(s).replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60);

function eksporOpts() {
  return {
    sheetName: txt($('#expSheet').value) || 'Worksheet',
    tulisNol: $('#expNol').checked,
  };
}

/** Unduh beberapa workbook berurutan — peramban memblokir bila terlalu rapat. */
function unduhBeruntun(berkas) {
  berkas.forEach(({ rows, nama }, i) => {
    setTimeout(() => downloadWorkbook(buildTemplateWorkbook(rows, eksporOpts()), nama), i * 500);
  });
}

/** Kelompokkan daftar petani untuk dipisah jadi beberapa berkas. */
function grupEkspor(list, mode, base) {
  const m = new Map();
  list.forEach((p) => {
    const kunci = mode === 'poktan'
      ? (upper(p.namaPoktan) || txt(p.idPoktan) || '(tanpa poktan)')
      : (txt(p.kodeDesa) || '(tanpa kode desa)');
    if (!m.has(kunci)) m.set(kunci, []);
    m.get(kunci).push(p);
  });
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'id'))
    .map(([kunci, rows]) => ({
      kunci, rows,
      nama: mode === 'poktan'
        ? `${base}-${slug(kunci)}`
        : `${base}-${slug(kunci)}${rows[0].namaDesa ? '-' + slug(rows[0].namaDesa) : ''}`,
    }));
}

$('#btnEkspor').onclick = () => {
  const list = eksporList();
  if (!list.length) return toast('Tidak ada baris untuk diekspor', 'warn');

  const base = slug($('#expNama').value) || 'template-erdkk';
  const mode = $('#expPisah').value;

  if (!mode) {
    downloadWorkbook(buildTemplateWorkbook(list, eksporOpts()), base);
    return toast(`${fmt(list.length)} baris diekspor`);
  }

  const berkas = grupEkspor(list, mode, base);
  const label = mode === 'poktan' ? 'kelompok tani' : 'desa';
  if (berkas.length > 8 && !confirm(
    `Akan mengunduh ${berkas.length} berkas (satu per ${label}), berurutan tiap 0,5 detik.\n\n` +
    `Peramban mungkin meminta izin unduhan berganda. Lanjutkan?`)) return;

  unduhBeruntun(berkas);
  toast(`${berkas.length} berkas diunduh berurutan`);
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
  $('#sJanganSimpan').checked = janganSimpan;
}

$('#sJanganSimpan').onchange = (e) => {
  const on = e.target.checked;
  const pesan = [
    'Data tidak akan disimpan di peramban ini.',
    '',
    'Begitu tab ditutup atau dimuat ulang, seluruh data petani hilang.',
    'Unduh cadangan lebih dulu bila perlu.',
    '',
    'Lanjutkan?',
  ].join('\n');
  if (on && !confirm(pesan)) { e.target.checked = false; return; }
  setJanganSimpan(on);
  toast(on ? 'Mode tanpa simpan aktif — data hanya bertahan di tab ini'
           : 'Data kembali disimpan di peramban ini', on ? 'warn' : 'ok');
};

$('#btnKunci').onclick = () => {
  const pesan = [
    'Kosongkan data petani dari layar dan penyimpanan peramban?',
    '',
    'Berkas cadangan dan hasil ekspor yang sudah diunduh tidak tersentuh.',
    'Gunakan ini sebelum meninggalkan komputer bersama.',
  ].join('\n');
  if (!confirm(pesan)) return;
  bersihkanSesi();
  emit(); renderPoktan(); renderPmaas(); go('data');
  toast('Sesi dibersihkan — tidak ada data petani tersisa di peramban ini');
};

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
  state.pmaas = { dosis: { ...PMAAS_DEFAULT }, poktan: {} };
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
/* di ponsel empat donat memakan lebih dari satu layar penuh sebelum baris
   data pertama — bawaannya terlipat sampai pengguna memilih sendiri */
const vizTersimpan = vizIngat.baca();
setVizLipat(vizTersimpan === null ? window.innerWidth <= 640 : vizTersimpan === '1', false);
load();
renderDosis();
renderPmaas();
fillSetelan();
renderAll();

window.addEventListener('beforeunload', (e) => {
  if ($('#drawer').classList.contains('open')) { e.preventDefault(); e.returnValue = ''; }
});
