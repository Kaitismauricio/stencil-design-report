/**
 * Stencil Design Report — motor de cálculo
 * ---------------------------------------------------------------------------
 * Porte fiel do modelo do Power BI "AR.AUTOMATION_REV31".
 * Validado linha a linha contra 5 relatórios reais (196 aberturas, 0 divergência).
 *
 * Descobertas da engenharia reversa (NÃO alterar sem revalidar):
 *  1. PI = 3.14159 (literal usado no Power BI, não Math.PI)
 *  2. Area Ratio / Aspect Ratio usam SEMPRE o modelo retangular,
 *     para todas as formas (inclusive Round/Oblong/Squircle).
 *  3. O VOLUME usa a área real da abertura:
 *       Round    -> PI*(A/2)^2
 *       Oblong   -> (a-b)*b + PI*(b/2)^2      (formato "estádio")
 *       Squircle -> A*B - (4-PI)*r^2          (r = 3º campo do .rpt)
 *       Outros   -> A*B
 *  4. 1 mils³ = 1.6387064e-5 / 1000 cm³
 */

export const PI = 3.14159;
export const MILS3_TO_CM3 = 1.6387064e-5 / 1000.0;
export const DENSITIES = { 'SAC305': 5.23, 'Sn63/Pb37': 4.88 };

/** Classifica o campo "Type" do .rpt na forma usada no relatório. */
export function classify(typeStr) {
  const t = String(typeStr || '').trim().toLowerCase();
  if (t.startsWith('rectangle rounded')) return 'Squircle';
  if (t.startsWith('oblong'))            return 'Oblong';
  if (t.startsWith('square'))            return 'Square';
  if (t.startsWith('round'))             return 'Round';
  if (t.startsWith('rectangle'))         return 'Rectangle';
  return 'Custom';                       // acapXXXX, OveracapXXXX, ...
}

const LINE = /^\s*(\d+)\s+(.+?)\s{2,}([0-9][0-9.:]*)\s+(-?[\d.]+)\s+(\d+)\s+(\d+)\s*$/;
const SKIP = ['Project file', 'Time/Date', 'Layer:', 'Dcode', '=====', '==='];

/** Extrai a espessura e a ST do nome do arquivo: "5,5st42419.rpt" -> {5.5, ST42419} */
export function parseFilename(name) {
  const base = String(name).replace(/\.[^.]+$/, '');
  const m = base.match(/^\s*([\d]+(?:[.,][\d]+)?)\s*st[\s_-]*(.+?)\s*$/i);
  if (!m) return { thickness: null, st: base.toUpperCase() || null };
  return {
    thickness: parseFloat(m[1].replace(',', '.')),
    st: 'ST' + m[2].toUpperCase().replace(/[\s_]/g, ''),
  };
}

/** Faz o parsing de um arquivo .rpt. Retorna uma linha por D-Code. */
export function parseRpt(text, thickness) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim()) continue;
    if (SKIP.some(s => line.startsWith(s))) continue;
    if (line.includes('Totals:')) continue;
    const m = line.match(LINE);
    if (!m) continue;
    const qty = parseInt(m[5], 10);
    if (!(qty > 0)) continue;               // ignora aberturas sem flashes
    const dims = m[3].split(':').filter(x => x !== '').map(Number);
    let A = dims[0], B = dims[0];
    if (dims.length >= 2) { A = dims[0]; B = dims[1]; }
    const radius = dims.length >= 3 ? dims[2] : 0;
    out.push({
      dcode: parseInt(m[1], 10),
      shape: classify(m[2]),
      rawType: m[2].trim(),
      A, B, radius,
      thickness: Number(thickness),
      qty,
      angle: parseFloat(m[4]),
    });
  }
  return out;
}

/** Área real da abertura em mils² (usada só para volume). */
export function apertureArea(shape, A, B, radius) {
  const a = Math.max(A, B), b = Math.min(A, B);
  if (shape === 'Round')    return PI * Math.pow(A / 2, 2);
  if (shape === 'Oblong')   return (a - b) * b + PI * Math.pow(b / 2, 2);
  if (shape === 'Squircle') return A * B - (4 - PI) * Math.pow(radius, 2);
  return A * B;
}

/** Acrescenta as métricas IPC-7525C a uma linha. */
export function enrich(row) {
  const r = { ...row };
  const { A, B, thickness: T, qty: q } = r;
  const b = Math.min(A, B);
  r.areaRatio   = T ? (A * B) / (2 * (A + B) * T) : 0;
  r.aspectRatio = T ? b / T : 0;
  r.areaMils2   = apertureArea(r.shape, A, B, r.radius);
  r.volMils3    = r.areaMils2 * T * q;
  r.volCm3      = r.volMils3 * MILS3_TO_CM3;
  return r;
}

/** Consolida todas as linhas num relatório completo com os KPIs. */
export function build(rows) {
  const list = rows.map(enrich)
    .sort((x, y) => x.areaRatio - y.areaRatio || x.dcode - y.dcode);
  const qty     = list.reduce((s, r) => s + r.qty, 0);
  const volCm3  = list.reduce((s, r) => s + r.volCm3, 0);
  const volMils = list.reduce((s, r) => s + r.volMils3, 0);
  const minW    = list.length ? Math.min(...list.map(r => Math.min(r.A, r.B))) : 0;
  const paste = {};
  for (const [k, d] of Object.entries(DENSITIES)) paste[k] = volCm3 * d;
  return {
    rows: list,
    qty,
    volCm3,
    volMils3: volMils,
    minAreaRatio:   list.length ? Math.min(...list.map(r => r.areaRatio))   : 0,
    minAspectRatio: list.length ? Math.min(...list.map(r => r.aspectRatio)) : 0,
    fiveBall: minW / 5 * 25.4,     // maior pó recomendado, em microns
    paste,
    thicknesses: [...new Set(list.map(r => r.thickness))].sort((a, b) => a - b),
    isStep: new Set(list.map(r => r.thickness)).size > 1,
  };
}
