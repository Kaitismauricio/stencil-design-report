/**
 * Teste de regressão do motor de cálculo.
 * Compara a saída do parser com os exports REAIS do Power BI (AR.AUTOMATION_REV31).
 * Roda no CI: `node tests/engine.test.mjs`
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseRpt, parseFilename, build, classify, apertureArea, PI } from '../src/engine.js';
import { toCsv } from '../src/format.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, 'fixtures');
const num = s => parseFloat(String(s).replace(',', '.'));

/* D-codes cujas linhas no CSV de referência vieram de uma revisão ANTERIOR do .rpt.
   Nesses casos validamos as FÓRMULAS usando as dimensões do próprio CSV. */
const STALE = new Set(['ST42419:236', 'ST42419:237', 'ST42437:89', 'ST42437:90']);

const CASES = [
  { st: 'ST42419', files: [['4st42419.rpt', 4], ['5,5st42419.rpt', 5.5]],
    kpi: { qty: 4780, ar: 0.67, asp: 1.56, fb: 44, step: true } },
  { st: 'ST42437', files: [['6st42437.rpt', 6], ['12st42437.rpt', 12]],
    kpi: { qty: 219, vol: 0.22904798, sac: 1.1979209, snpb: 1.1177541, ar: 0.69, asp: 2.00, fb: 122, step: true } },
  { st: 'ST42341', files: [['8st42341.rpt', 8]],  kpi: { qty: 60,   ar: 0.72, asp: 1.97, fb: 80, step: false } },
  { st: 'ST42340', files: [['4st42340.rpt', 4]],  kpi: { qty: 690,  ar: 0.94, asp: 2.15, fb: 44, step: false } },
  { st: 'ST42389', files: [['4st42389.rpt', 4], ['7st42389.rpt', 7]],
    kpi: { qty: 2646, ar: 0.87, asp: 2.20, fb: 45, step: true } },
];

function readCsv(p) {
  const t = readFileSync(p, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  const h = t[0].split(',');
  return t.slice(1).map(l => {
    const c = []; let cur = '', q = false;
    for (const ch of l) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { c.push(cur); cur = ''; }
      else cur += ch;
    }
    c.push(cur);
    return Object.fromEntries(h.map((k, i) => [k, c[i]]));
  }).filter(r => r['D-CODE']);
}

let fails = 0, checks = 0;
const bad = m => { console.error('  ✗ ' + m); fails++; };
const eq = (a, b, tol, m) => { checks++; if (Math.abs(a - b) > tol) bad(`${m}: ${a} ≠ ${b}`); };

/* ---- 1. testes unitários das fórmulas ---- */
console.log('1) fórmulas');
eq(PI, 3.14159, 0, 'PI literal do Power BI');
['Rectangle Rounded', 'Oblong', 'Square', 'Round', 'Rectangle', 'acap0013', 'Overacap01660']
  .forEach((t, i) => {
    const want = ['Squircle', 'Oblong', 'Square', 'Round', 'Rectangle', 'Custom', 'Custom'][i];
    checks++; if (classify(t) !== want) bad(`classify("${t}") = ${classify(t)}, esperado ${want}`);
  });
eq(apertureArea('Round', 40, 40, 0), PI * 400, 1e-9, 'área do círculo');
eq(apertureArea('Rectangle', 10, 20, 0), 200, 1e-12, 'área do retângulo');
eq(apertureArea('Squircle', 24, 54, 2), 24 * 54 - (4 - PI) * 4, 1e-12, 'área do squircle');
eq(apertureArea('Oblong', 50, 10, 0), 40 * 10 + PI * 25, 1e-12, 'área do oblong');

console.log('2) leitura do nome do arquivo');
[['5,5st42419.rpt', 5.5, 'ST42419'], ['12st42437.rpt', 12, 'ST42437'],
 ['4st913.716.rpt', 4, 'ST913.716'], ['3,5st42320.rpt', 3.5, 'ST42320']]
  .forEach(([n, th, st]) => {
    const r = parseFilename(n); checks++;
    if (r.thickness !== th || r.st !== st) bad(`parseFilename("${n}") = ${JSON.stringify(r)}`);
  });

/* ---- 3. comparação linha a linha com o Power BI ---- */
console.log('3) paridade com o Power BI');
for (const c of CASES) {
  let rows = [];
  for (const [fn, th] of c.files) rows = rows.concat(parseRpt(readFileSync(join(FIX, fn), 'latin1'), th));
  const got = build(rows);
  const exp = readCsv(join(FIX, `${c.st}_DATAREPORT.csv`));

  checks++; if (got.rows.length !== exp.length) bad(`${c.st}: ${got.rows.length} linhas ≠ ${exp.length}`);
  checks++; if (got.isStep !== c.kpi.step) bad(`${c.st}: step=${got.isStep}, esperado ${c.kpi.step}`);
  eq(got.qty, c.kpi.qty, 0, `${c.st} qtd total`);
  eq(Math.round(got.minAreaRatio * 100) / 100, c.kpi.ar, 0, `${c.st} menor area ratio`);
  eq(Math.round(got.minAspectRatio * 100) / 100, c.kpi.asp, 0, `${c.st} menor aspect ratio`);
  eq(Math.round(got.fiveBall), c.kpi.fb, 0, `${c.st} five ball rule`);
  if (c.kpi.vol) {
    eq(got.volCm3, c.kpi.vol, 1e-8, `${c.st} volume cm³`);
    eq(got.paste['SAC305'], c.kpi.sac, 1e-6, `${c.st} SAC305`);
    eq(got.paste['Sn63/Pb37'], c.kpi.snpb, 1e-6, `${c.st} Sn63/Pb37`);
  }

  const map = new Map(got.rows.map(r => [`${r.dcode}|${r.thickness}`, r]));
  for (const r of exp) {
    const d = +r['D-CODE'];
    const g = map.get(`${d}|${num(r['Thickness (mils)'])}`);
    checks++;
    if (!g) { bad(`${c.st}: falta o D-code ${d}`); continue; }
    if (STALE.has(`${c.st}:${d}`)) {
      const A = num(r['Size A (mils)']), B = num(r['Size B (mils)']), T = num(r['Thickness (mils)']);
      const area = g.shape === 'Squircle' ? A * B - (4 - PI) * g.radius ** 2 : A * B;
      eq((A * B) / (2 * (A + B) * T), num(r['Area Ratio']), 1e-12, `${c.st} d${d} AR (dados antigos)`);
      eq(area * T * num(r['Qtd']), num(r['Volume mils³']), 1e-6, `${c.st} d${d} volume (dados antigos)`);
      continue;
    }
    if (g.shape !== r['Shape']) bad(`${c.st} d${d}: forma ${g.shape} ≠ ${r['Shape']}`);
    eq(g.qty, num(r['Qtd']), 0, `${c.st} d${d} qtd`);
    eq(g.areaRatio, num(r['Area Ratio']), Math.abs(num(r['Area Ratio'])) * 1e-9, `${c.st} d${d} area ratio`);
    eq(g.aspectRatio, num(r['Aspect Ratio']), Math.abs(num(r['Aspect Ratio'])) * 1e-9, `${c.st} d${d} aspect ratio`);
    eq(g.volMils3, num(r['Volume mils³']), Math.max(1e-6, Math.abs(num(r['Volume mils³'])) * 1e-9), `${c.st} d${d} volume mils³`);
  }
  console.log(`   ${c.st}: ${got.rows.length} aberturas · ${got.qty} un · ${got.volCm3.toFixed(8)} cm³ · step=${got.isStep}`);
}

/* ---- 4. CSV idêntico ao do Power BI ---- */
console.log('4) formato do CSV');
{
  const rows = parseRpt(readFileSync(join(FIX, '4st42340.rpt'), 'latin1'), 4);
  const out = toCsv(build(rows)).split(/\r\n/);
  const ref = readFileSync(join(FIX, 'ST42340_DATAREPORT.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  checks++; if (out[0] !== ref[0]) bad(`cabeçalho do CSV difere:\n    ${out[0]}\n    ${ref[0]}`);
  checks++; if (out[1] !== ref[1]) bad(`1ª linha do CSV difere:\n    ${out[1]}\n    ${ref[1]}`);
}

console.log(`\n${checks} verificações, ${fails} falha(s)`);
if (fails) { console.error('REGRESSÃO DETECTADA'); process.exit(1); }
console.log('OK — o motor reproduz o Power BI AR.AUTOMATION_REV31');
