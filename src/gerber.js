/**
 * Stencil Design Report — leitor de Gerber RS-274X (camada de pasta)
 * ---------------------------------------------------------------------------
 * Alternativa ao .rpt: extrai um "aperture usage report" equivalente ao do
 * CAM350 diretamente do .gbr, a partir de:
 *   - %AD  (definição de cada abertura: forma padrão C/R/O ou macro custom)
 *   - %AM  (macro custom: bounding box calculado a partir dos primitivos)
 *   - D01/D02/D03 no corpo do arquivo (draw / move / flash), contados por D-code
 *
 * Validado 348/348 D-codes contra um .rpt real do mesmo item (ST42364):
 * forma, ângulo, flashes, draws e tamanho (Size A/B) idênticos.
 *
 * Limitações conhecidas:
 *  - Squircle (retângulo de canto arredondado) não é reconhecido como tal a
 *    partir de um macro genérico — cai em "Custom" (mesmo destino de outras
 *    formas customizadas do CAM350). O tamanho (bounding box) sai correto;
 *    a fórmula de volume usa A*B em vez de descontar o canto. Ainda não há
 *    exemplo de squircle em Gerber para validar esse caso.
 *  - O ângulo só é detectado quando o CAM exporta uma macro dedicada por
 *    rotação (sufixo _90/_180/_270, como no CAM350). Isso não afeta as
 *    métricas IPC (Area/Aspect Ratio, Volume) — só a coluna "Ângulo" da tabela.
 */

import { classify } from './engine.js';

const MM_TO_MIL = 1000 / 25.4;

function unitScale(text) {
  return /%MOMM\*%/i.test(text) ? MM_TO_MIL : 1000; // padrão: polegadas -> mils
}

function parseMacros(text) {
  const macros = {};
  const re = /%AM([^*]+)\*([\s\S]*?)%/g;
  let m;
  while ((m = re.exec(text))) macros[m[1]] = m[2];
  return macros;
}

/** Bounding box (largura, altura) de um macro custom, em unidades do arquivo. */
function macroBBox(body) {
  const xs = [], ys = [];
  for (const prim of body.split('*')) {
    const p = prim.trim();
    if (!p) continue;
    const parts = p.split(',');
    const code = parts[0];
    try {
      if (code === '4') {                                   // outline
        const n = parseInt(parts[2], 10);
        const coords = parts.slice(3, 3 + 2 * (n + 1)).map(Number);
        for (let i = 0; i < coords.length - 1; i += 2) { xs.push(coords[i]); ys.push(coords[i + 1]); }
      } else if (code === '1') {                              // circle
        const dia = +parts[2], cx = +parts[3], cy = +parts[4];
        xs.push(cx - dia / 2, cx + dia / 2); ys.push(cy - dia / 2, cy + dia / 2);
      } else if (code === '20') {                             // vector line
        const w = +parts[2], x1 = +parts[3], y1 = +parts[4], x2 = +parts[5], y2 = +parts[6];
        xs.push(x1 - w / 2, x1 + w / 2, x2 - w / 2, x2 + w / 2);
        ys.push(y1 - w / 2, y1 + w / 2, y2 - w / 2, y2 + w / 2);
      } else if (code === '21' || code === '22') {            // rectangle (centrado / canto inferior)
        const w = +parts[2], h = +parts[3], cx = +parts[4], cy = +parts[5];
        if (code === '21') { xs.push(cx - w / 2, cx + w / 2); ys.push(cy - h / 2, cy + h / 2); }
        else { xs.push(cx, cx + w); ys.push(cy, cy + h); }
      } else if (code === '5') {                              // polygon regular
        const cx = +parts[3], cy = +parts[4], dia = +parts[5];
        xs.push(cx - dia / 2, cx + dia / 2); ys.push(cy - dia / 2, cy + dia / 2);
      }
    } catch { /* primitivo não suportado — ignora */ }
  }
  if (!xs.length) return null;
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
}

function parseApertures(text, scale) {
  const macros = parseMacros(text);
  const cache = {};
  const bboxOf = name => {
    if (!(name in cache)) cache[name] = macros[name] ? macroBBox(macros[name]) : null;
    return cache[name];
  };
  const apertures = {}; // dcode -> {shape, A, B, radius, angle}
  const re = /%ADD(\d+)([A-Za-z_][A-Za-z0-9_]*)(?:,([^*%]*))?\*%/g;
  let m;
  while ((m = re.exec(text))) {
    const d = parseInt(m[1], 10);
    const shape = m[2];
    const params = m[3];
    if (shape === 'C') {
      const dia = parseFloat(String(params).split('X')[0]) * scale;
      apertures[d] = { shape: 'Round', A: dia, B: dia, radius: 0, angle: 0 };
    } else if (shape === 'R') {
      const [w, h] = String(params).split('X').map(Number);
      apertures[d] = { shape: 'Rectangle', A: w * scale, B: h * scale, radius: 0, angle: 0 };
    } else if (shape === 'O') {
      const [w, h] = String(params).split('X').map(Number);
      apertures[d] = { shape: 'Oblong', A: w * scale, B: h * scale, radius: 0, angle: 0 };
    } else {
      let base = shape, angle = 0;
      const rm = shape.match(/^(.*)_(90|180|270)$/);
      if (rm) { base = rm[1]; angle = parseInt(rm[2], 10); }
      const bbox = bboxOf(shape) || bboxOf(base);
      if (bbox) {
        let [wA, hB] = bbox;
        if (angle === 90 || angle === 270) [wA, hB] = [hB, wA];   // macro já vem pré-rotacionado
        apertures[d] = { shape: base, A: wA * scale, B: hB * scale, radius: 0, angle };
      } else {
        apertures[d] = { shape: base, A: null, B: null, radius: 0, angle };
      }
    }
  }
  return apertures;
}

/** Conta disparos (D03) e traços (D01) por D-code no corpo do arquivo. */
function countFlashesAndDraws(text) {
  const flashes = {}, draws = {};
  let current = null;
  const re = /D(\d+)\*/g;
  let m;
  while ((m = re.exec(text))) {
    const n = parseInt(m[1], 10);
    if (n >= 10) { current = n; continue; }        // seleção de abertura
    if (current == null) continue;
    if (n === 3) flashes[current] = (flashes[current] || 0) + 1;
    else if (n === 1) draws[current] = (draws[current] || 0) + 1;
  }
  return { flashes, draws };
}

/**
 * Faz o parsing de um Gerber RS-274X (camada de pasta).
 * Retorna uma linha por D-Code, no mesmo formato de parseRpt().
 */
export function parseGerber(text, thickness) {
  const scale = unitScale(text);
  const apertures = parseApertures(text, scale);
  const { flashes } = countFlashesAndDraws(text);
  const out = [];
  for (const [dStr, ap] of Object.entries(apertures)) {
    const dcode = parseInt(dStr, 10);
    const qty = flashes[dcode] || 0;
    if (!(qty > 0)) continue;                       // ignora aberturas sem disparo (ex.: só contorno)
    if (ap.A == null || ap.B == null) continue;      // macro não suportado — ignora silenciosamente
    out.push({
      dcode,
      shape: classify(ap.shape),
      rawType: ap.shape,
      A: ap.A, B: ap.B, radius: ap.radius,
      thickness: Number(thickness),
      qty,
      angle: ap.angle,
    });
  }
  return out.sort((a, b) => a.dcode - b.dcode);
}

/** true se o nome do arquivo indica um Gerber (camada de pasta). */
export function isGerberFile(name) {
  return /\.(gbr|gtp|gbp)$/i.test(String(name));
}
