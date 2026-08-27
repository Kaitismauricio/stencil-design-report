import { parseRpt, parseFilename, build } from './engine.js';
import { toCsv, nf, int } from './format.js';
import { page1, page2, pageTable, ROWS_PER_CONT_PAGE } from './report.js';

const $ = s => document.querySelector(s);
const state = { files: [], report: null, assets: {}, step: {} };

/* ---------- assets (fundo original + QR) ---------- */
async function toDataUrl(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const b = await r.blob();
    return await new Promise(res => { const f = new FileReader(); f.onload = () => res(f.result); f.readAsDataURL(b); });
  } catch { return null; }
}
const assetsReady = (async () => {
  const [logo, qr, ipcFig] = await Promise.all([
    toDataUrl('assets/logo.png'), toDataUrl('assets/qr.png'), toDataUrl('assets/ipc_fig317.png'),
  ]);
  state.assets = { logo, qr, ipcFig };
})();

const readText = f => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result); r.onerror = rej;
  r.readAsText(f, 'ISO-8859-1');                 // .rpt vem em latin-1
});
const readImg = f => new Promise(res => {
  if (!f) return res(null);
  const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f);
});

function msg(el, text, kind) {
  const n = $(el);
  n.className = 'msg' + (kind ? ' ' + kind : '');
  n.textContent = text || '';
  if (!text) n.className = 'msg';
}

/* ---------- lista de arquivos ---------- */
function renderFiles() {
  const box = $('#flist');
  if (!state.files.length) { box.innerHTML = ''; sync(); return; }
  box.innerHTML = `<table class="files">
    <thead><tr><th>Arquivo</th><th>Espessura (mils)</th><th>ST</th><th>Aberturas</th><th></th></tr></thead>
    <tbody>${state.files.map((f, i) => `
      <tr><td>${f.name}</td>
        <td><input type="number" step="any" value="${f.thickness ?? ''}" data-i="${i}"
             class="${f.thickness > 0 ? '' : 'bad'}" placeholder="?"></td>
        <td><span class="tag">${f.st || '—'}</span></td>
        <td>${f.rows.length}</td>
        <td><button class="rm" data-rm="${i}">remover</button></td></tr>`).join('')}
    </tbody></table>`;
  box.querySelectorAll('input[data-i]').forEach(inp => {
    inp.oninput = e => {
      const i = +e.target.dataset.i, v = parseFloat(e.target.value);
      state.files[i].thickness = Number.isFinite(v) && v > 0 ? v : null;
      e.target.classList.toggle('bad', !(state.files[i].thickness > 0));
      sync();
    };
  });
  box.querySelectorAll('button[data-rm]').forEach(b => {
    b.onclick = () => { state.files.splice(+b.dataset.rm, 1); renderFiles(); };
  });
  sync();
}

/** Habilita/desabilita e detecta step. */
function sync() {
  const ok = state.files.length > 0 && state.files.every(f => f.thickness > 0);
  $('#gen').disabled = !ok;
  const ths = new Set(state.files.filter(f => f.thickness > 0).map(f => f.thickness));
  const isStep = ths.size > 1;
  $('#stepcard').style.display = isStep ? '' : 'none';
  $('#steptag').textContent = isStep ? `${ths.size} espessuras: ${[...ths].sort((a,b)=>a-b).join(' / ')} mils` : '';

  const sts = new Set(state.files.map(f => f.st).filter(Boolean));
  if (sts.size === 1 && !$('#st').dataset.touched) $('#st').value = [...sts][0];
  if (sts.size > 1) msg('#fmsg', `Atenção: há STs diferentes (${[...sts].join(', ')}). Confirme o campo ST — o relatório será emitido como um só.`, 'warn');
  else if (state.files.some(f => !(f.thickness > 0))) msg('#fmsg', 'Informe a espessura dos arquivos marcados em vermelho (não foi possível ler do nome).', 'warn');
  else msg('#fmsg', '');
}

async function addFiles(list) {
  const arr = [...list].filter(f => /\.rpt$/i.test(f.name) || f.type === 'text/plain');
  if (!arr.length) { msg('#fmsg', 'Nenhum arquivo .rpt reconhecido.', 'err'); return; }
  for (const f of arr) {
    const text = await readText(f);
    const { thickness, st } = parseFilename(f.name);
    const rows = parseRpt(text, thickness || 1);
    if (!rows.length) { msg('#fmsg', `"${f.name}" não contém linhas de D-Code reconhecíveis.`, 'err'); continue; }
    if (state.files.some(x => x.name === f.name)) continue;
    state.files.push({ name: f.name, text, thickness, st, rows });
  }
  renderFiles();
}

/* ---------- drag & drop ---------- */
const drop = $('#drop');
drop.onclick = () => $('#file').click();
$('#file').onchange = e => { addFiles(e.target.files); e.target.value = ''; };
['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.add('over');
}));
['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => {
  e.preventDefault(); drop.classList.remove('over');
}));
drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
$('#st').oninput = e => { e.target.dataset.touched = '1'; };

/* ---------- geração ---------- */
$('#gen').onclick = async () => {
  await assetsReady;
  try {
    let rows = [];
    for (const f of state.files) rows = rows.concat(parseRpt(f.text, f.thickness));
    const report = build(rows);
    state.report = report;
    const st = ($('#st').value || state.files[0]?.st || 'ST').trim().toUpperCase();
    const layout = document.querySelector('input[name=lay]:checked').value;
    const limit = +$('#limit').value || 0;

    state.step = {
      k1: $('#k1').value !== '' ? nf(+$('#k1').value, 0) : null,
      k2: $('#k2').value !== '' ? nf(+$('#k2').value, 0) : null,
      k1Img: await readImg($('#k1img').files[0]),
      k2Img: await readImg($('#k2img').files[0]),
      fig:   await readImg($('#figimg').files[0]),
    };
    state.meta = { st, layout };

    const FIT = 13;                       // linhas que cabem no cartão da página 1
    const shown = limit ? Math.min(limit, report.rows.length) : Math.min(FIT, report.rows.length);
    const parts = [page1({ st, report, layout, assets: state.assets, tableLimit: shown })];
    if (report.isStep) parts.push(page2({ report, layout, step: state.step, assets: state.assets }));
    if (!limit && report.rows.length > FIT) {          // "todas": páginas de continuação
      for (let i = FIT; i < report.rows.length; i += ROWS_PER_CONT_PAGE) {
        parts.push(pageTable({ st, rows: report.rows.slice(i, i + ROWS_PER_CONT_PAGE),
                               layout, assets: state.assets, from: i }));
      }
    }
    $('#pages').innerHTML = parts.join('');
    // numeração correta em todas as páginas
    const all = [...$('#pages').querySelectorAll('.page')];
    all.forEach((pg, i) => {
      const f = pg.querySelector('footer span:first-child');
      if (f) f.textContent = `Página ${i + 1} de ${all.length}`;
    });
    $('#preview').classList.add('on');
    fitPreview();

    const cls = v => v >= 0.66 ? 'g' : v >= 0.5 ? 'y' : 'r';
    $('#kpis').innerHTML = [
      ['ST', st, ''], ['Aberturas', int(report.qty), ''],
      ['Espessura', report.thicknesses.map(t => nf(t, Number.isInteger(t) ? 0 : 1)).join(' / ') + ' mils', ''],
      ['Menor Area Ratio', nf(report.minAreaRatio, 2), cls(report.minAreaRatio)],
      ['Menor Aspect Ratio', nf(report.minAspectRatio, 2), report.minAspectRatio >= 2 ? 'g' : report.minAspectRatio >= 1.5 ? 'y' : 'r'],
      ['Volume total', nf(report.volCm3, 6) + ' cm³', ''],
      ['SAC305', nf(report.paste['SAC305'], 4) + ' g', ''],
      ['Five Ball', Math.round(report.fiveBall) + ' µm', ''],
    ].map(([k, v, c]) => `<div class="k ${c}"><span>${k}</span><strong>${v}</strong></div>`).join('');
    $('#kpis').classList.add('on');

    $('#pdf').disabled = false; $('#csv').disabled = false;
    const warn = [];
    if (report.isStep && (state.step.k1 == null || state.step.k2 == null))
      warn.push('página 2 gerada sem K1/K2 — preencha os campos para completá-la');
    msg('#gmsg', `Relatório gerado: ${report.rows.length} aberturas, ${report.isStep ? 2 : 1} página(s).`
        + (warn.length ? ' Aviso: ' + warn.join('; ') + '.' : ''), warn.length ? 'warn' : 'ok');
  } catch (err) {
    msg('#gmsg', 'Erro ao gerar: ' + err.message, 'err');
    console.error(err);
  }
};

function fitPreview() {
  const wrap = $('#pages').parentElement;
  const s = Math.min(1, (wrap.clientWidth - 28) / 1280);
  const pgs = $('#pages');
  pgs.style.transform = `scale(${s})`;
  const n = pgs.querySelectorAll('.page').length;
  pgs.parentElement.style.height = (720 * n + 18 * (n - 1)) * s + 'px';
}
addEventListener('resize', () => { if (state.report) fitPreview(); });

/* ---------- PDF ---------- */
$('#pdf').onclick = async () => {
  const btn = $('#pdf'); const old = btn.textContent;
  btn.disabled = true; btn.textContent = 'Gerando PDF…';
  try {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: [1280, 720], compress: true });
    const pages = [...$('#pages').querySelectorAll('.page')];
    const prev = $('#pages').style.transform;
    $('#pages').style.transform = 'scale(1)';       // captura em 1:1
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], {
        scale: 2, backgroundColor: '#0d2237', useCORS: true, logging: false,
        width: 1280, height: 720, windowWidth: 1280, windowHeight: 720,
      });
      if (i) pdf.addPage([1280, 720], 'landscape');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.93), 'JPEG', 0, 0, 1280, 720);
    }
    $('#pages').style.transform = prev;
    pdf.save(`${state.meta.st}_REPORT.pdf`);
    msg('#gmsg', 'PDF salvo.', 'ok');
  } catch (e) {
    msg('#gmsg', 'Erro no PDF: ' + e.message, 'err'); console.error(e);
  } finally { btn.disabled = false; btn.textContent = old; }
};

/* ---------- CSV ---------- */
$('#csv').onclick = () => {
  const blob = new Blob(['﻿' + toCsv(state.report)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.meta.st}_DATAREPORT.csv`;
  a.click(); URL.revokeObjectURL(a.href);
};

$('#reset').onclick = () => {
  state.files = []; state.report = null;
  renderFiles();
  $('#pages').innerHTML = ''; $('#preview').classList.remove('on');
  $('#kpis').classList.remove('on'); $('#kpis').innerHTML = '';
  $('#pdf').disabled = true; $('#csv').disabled = true;
  ['#st','#k1','#k2'].forEach(s => { $(s).value = ''; delete $(s).dataset.touched; });
  ['#k1img','#k2img','#figimg'].forEach(s => $(s).value = '');
  msg('#gmsg', ''); msg('#fmsg', '');
};
