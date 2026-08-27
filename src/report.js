/** Renderização das páginas do relatório (layout fiel e layout moderno). */
import { nf, int, stampDate, thicknessLabel } from './format.js';
import { gauge, AR_GAUGE, ASPECT_GAUGE } from './gauge.js';

export const REV = 'Revisão nº31 – 22/09/2025';
const FOOTER = 'Rua Anésio Marciano, 122 – 13284-070 - Vinhedo - SP  Fone: 19 2660-1760 - www.stentec.com.br';
const FUNNEL = `<svg class="fi" viewBox="0 0 16 16" fill="none" stroke="#cfe3f4" stroke-width="1.4"><path d="M1.5 2.5h13l-5 6v5l-3-1.6v-3.4z"/></svg>`;

const tableRows = (rows, limit) => (limit ? rows.slice(0, limit) : rows).map(r => `
  <tr>
    <td class="c">${r.dcode}</td><td>${r.shape}</td>
    <td class="n">${nf(r.A, 2)}</td><td class="n">${nf(r.B, 2)}</td>
    <td class="n">${nf(r.thickness, 2)}</td>
    <td class="n">${nf(r.areaRatio, 2)}</td><td class="n">${nf(r.aspectRatio, 2)}</td>
    <td class="n">${int(r.qty)}</td><td class="n">${nf(r.volCm3, 8)}</td>
  </tr>`).join('');

const COLS = `<colgroup>
  <col style="width:9%"><col style="width:14%"><col style="width:11%"><col style="width:11%">
  <col style="width:12%"><col style="width:9.5%"><col style="width:9.5%">
  <col style="width:9%"><col style="width:15.5%"></colgroup>`;

const THEAD = `<thead><tr>
  <th>D-CODE</th><th>Shape</th><th>Size A<br><s>(mils)</s></th><th>Size B<br><s>(mils)</s></th>
  <th>Thickness<br><s>(mils)</s></th><th>Area<br>Ratio</th><th>Aspect<br>Ratio</th>
  <th>Qtd</th><th>Volume cm³</th></tr></thead>`;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Limite (em mícrons) do Five Ball Rule a partir do qual se recomenda pó Type 5. */
const MESH_TYPE5_LIMIT = 38;

/** Página 1 — Stencil Design Report */
export function page1({ st, report, layout, assets = {}, tableLimit, gerberLink }) {
  const faithful = layout === 'faithful';
  const logo = assets.logo ? `<img class="logo" src="${assets.logo}" alt="STENTEC">` : '';
  const meshAlert = report.fiveBall <= MESH_TYPE5_LIMIT;
  const kpis = [
    ['ID', st, '', st.length > 9],
    ['Qty Apertures', int(report.qty), '', false],
    ['Thickness', thicknessLabel(report.thicknesses), 'mils', report.thicknesses.length > 2],
    ['Smallest Area Ratio', nf(report.minAreaRatio, 2), '', false],
    ['Smallest Aspect Ratio', nf(report.minAspectRatio, 2), '', false],
    ['Date', stampDate(), '', true],
  ];
  return `
<section class="page page1 ${faithful ? 'faithful' : 'modern'}">
  ${faithful ? `${logo}
    <div class="fhead"><h1>Stencil Design Report</h1><p>${REV}</p></div>
    <div class="stbox pnl">${FUNNEL}<label>ST</label><div class="stval"><span>${st}</span></div></div>`
   : `<header class="mhead">${logo}
      <div class="mtitle"><h1>Stencil Design Report</h1><p>${REV}</p></div>
      <div class="mst">${st}</div></header>`}

  <div class="kpis">
    ${kpis.map(([t, v, u, sm]) => `<div class="kpi pnl${sm ? ' sm' : ''}">
      <span class="kt">${t}${u ? `<em>${u}</em>` : ''}</span><strong>${v}</strong></div>`).join('')}
  </div>

  <div class="tablebox pnl">
    <div class="scroll"><table>${COLS}${THEAD}<tbody>${tableRows(report.rows, tableLimit)}</tbody></table></div>
    <div class="totrow"><span>Total</span><b class="q">${int(report.qty)}</b><b>${nf(report.volCm3, 8)}</b></div>
  </div>

  <div class="gauges">
    <div class="gbox pnl"><h3>Smallest Area Ratio</h3><p class="ipc">IPC 7525C - 3.2.1.2</p>
      <div class="gwrap">${gauge({ value: report.minAreaRatio, ...AR_GAUGE })}</div>
      <div class="gval">${nf(report.minAreaRatio, 2)}</div></div>
    <div class="gbox pnl"><h3>Smallest Aspect Ratio</h3><p class="ipc">IPC 7525C - 3.2.1.2</p>
      <div class="gwrap">${gauge({ value: report.minAspectRatio, ...ASPECT_GAUGE })}</div>
      <div class="gval">${nf(report.minAspectRatio, 2)}</div></div>
  </div>

  <div class="paste pnl">
    <h3>Estimated solder paste usage per print cycle:</h3>
    <dl>
      <div><dt>Total Aperture Volume:</dt><dd class="big">${nf(report.volCm3, 8)}</dd><dd class="u">cm³</dd></div>
      <div><dt>SAC305 (5,23) Estimated:</dt><dd class="big">${nf(report.paste['SAC305'], 7)}</dd><dd class="u">g</dd></div>
      <div><dt>Sn63/Pb37 (4,88) Estimated:</dt><dd class="big">${nf(report.paste['Sn63/Pb37'], 7)}</dd><dd class="u">g</dd></div>
    </dl>
    <p class="fine">Paste (g) = Aperture Volume (cm³) × Paste Density (g/cm³)<br>
       To find the specific gravity of your solder paste, use Greely Formula:</p>
    ${assets.qr ? `<img class="qr" src="${assets.qr}" alt="QR">` : ''}
  </div>

  <div class="fiveball pnl">
    <h3>Largest recommended<br>powder diameter</h3><p class="ipc">IPC 7525C - 3.2.1</p>
    <div class="fbval${meshAlert ? ' alert' : ''}">${Math.round(report.fiveBall)}</div><p class="u">Microns</p>
    <p class="rule">Five Ball Rule</p>
    ${meshAlert ? `<p class="meshwarn">Attention: Type 5 solder size recommended</p>` : ''}
  </div>

  ${gerberLink ? `<div class="linkbox pnl">
    <p class="linktitle">Link para visualização online do projeto:</p>
    <a class="linkurl" href="${esc(gerberLink)}" target="_blank" rel="noopener">${esc(gerberLink)}</a>
  </div>` : ''}

  <footer><span>Página 1 de ${report.isStep ? 2 : 1}</span><span>${FOOTER}</span></footer>
</section>`;
}

/** Página 2 — Step Information (somente quando há mais de uma espessura) */
export function page2({ report, layout, step = {}, assets = {} }) {
  const faithful = layout === 'faithful';
  const logo = assets.logo ? `<img class="logo" src="${assets.logo}" alt="STENTEC">` : '';
  const fig = step.fig || assets.ipcFig;
  const img = (src, alt) => src
    ? `<img src="${src}" alt="${alt}">`
    : `<div class="noimg">sem imagem</div>`;
  return `
<section class="page step ${faithful ? 'faithful' : 'modern'}">
  ${faithful ? `${logo}<div class="fhead"><h1>Step Information</h1><p>${REV}</p></div>
      <div class="stbox pnl">${FUNNEL}</div>`
   : `<header class="mhead">${logo}
      <div class="mtitle"><h1>Step Information</h1><p>${REV}</p></div>
      <div class="mst"></div></header>`}

  <div class="ipcfig">${fig
      ? `<img src="${fig}" alt="IPC 7525b-3-17">`
      : `<div class="figph"><b>Figure 3-17</b><span>Overprint With Step (Squeegee Side)</span>
           <small>1. Step Stencil &nbsp;&nbsp; 2. Board &nbsp;&nbsp; 3. Through-Hole Land<br>
                  4. Through-Hole &nbsp;&nbsp; 5. SMT Land</small></div>`}</div>

  <div class="kbox k1 pnl"><h3>Smallest<br>K1 - Keep Out Distance</h3><p class="ipc">IPC 7525C - 3.3.1.2</p>
    <div class="kval">${step.k1 ?? '—'}</div><p class="u">Mil</p></div>
  <div class="kbox k2 pnl"><h3>Smallest<br>K2 - Keep Out Distance</h3><p class="ipc">IPC 7525C - 3.3.1.2</p>
    <div class="kval">${step.k2 ?? '—'}</div><p class="u">Mil</p></div>

  <div class="kimg i1 pnl"><h4>Smallest - K1 - Keep Out Distance</h4>${img(step.k1Img, 'K1')}</div>
  <div class="kimg i2 pnl"><h4>Smallest - K2 - Keep Out Distance</h4>${img(step.k2Img, 'K2')}</div>

  <div class="steptable">
    <h4>Espessuras deste step</h4>
    <table><thead><tr><th>Thickness (mils)</th><th>Aberturas</th><th>Qtd</th><th>Volume cm³</th></tr></thead><tbody>
    ${report.thicknesses.map(t => {
      const rs = report.rows.filter(r => r.thickness === t);
      return `<tr><td class="n">${nf(t, 2)}</td><td class="n">${rs.length}</td>
        <td class="n">${int(rs.reduce((s, r) => s + r.qty, 0))}</td>
        <td class="n">${nf(rs.reduce((s, r) => s + r.volCm3, 0), 8)}</td></tr>`;
    }).join('')}</tbody></table>
  </div>

  <footer><span>Página 2 de 2</span><span>${FOOTER}</span></footer>
</section>`;
}

/** Página(s) de continuação da tabela de aberturas (quando "todas as linhas"). */
export function pageTable({ st, rows, layout, assets = {}, from }) {
  const faithful = layout === 'faithful';
  const logo = assets.logo ? `<img class="logo" src="${assets.logo}" alt="STENTEC">` : '';
  return `
<section class="page cont ${faithful ? 'faithful' : 'modern'}">
  ${faithful ? `${logo}<div class="fhead"><h1>Aperture List</h1><p>${st}</p></div>`
   : `<header class="mhead">${logo}
      <div class="mtitle"><h1>Aperture List</h1><p>${st}</p></div><div class="mst"></div></header>`}
  <div class="contbox pnl">
    <table>${COLS}${THEAD}<tbody>${rows.map(r => `
      <tr><td class="c">${r.dcode}</td><td>${r.shape}</td>
        <td class="n">${nf(r.A, 2)}</td><td class="n">${nf(r.B, 2)}</td>
        <td class="n">${nf(r.thickness, 2)}</td>
        <td class="n">${nf(r.areaRatio, 2)}</td><td class="n">${nf(r.aspectRatio, 2)}</td>
        <td class="n">${int(r.qty)}</td><td class="n">${nf(r.volCm3, 8)}</td></tr>`).join('')}
    </tbody></table>
  </div>
  <p class="contnote">Aberturas ${from + 1} a ${from + rows.length}, ordenadas por Area Ratio (crescente).</p>
  <footer><span class="pgno"></span><span>${FOOTER}</span></footer>
</section>`;
}

/** Quantas linhas cabem numa página de continuação. */
export const ROWS_PER_CONT_PAGE = 26;
