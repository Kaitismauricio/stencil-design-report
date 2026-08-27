/**
 * Velocímetro IPC-7525C em SVG (réplica do custom visual "Tachometer" do Power BI).
 * Zonas: vermelho = reprovado, amarelo = limite, verde = aprovado.
 */
export function gauge({ value, min = 0, max = 1, bands = [], ticks = [], size = 300 }) {
  const cx = size / 2, cy = size * 0.62, R = size * 0.42, r0 = R * 0.55;
  const A0 = Math.PI, A1 = 0;                       // semicírculo (180° -> 0°)
  const ang = v => {
    const t = Math.min(1, Math.max(0, (v - min) / (max - min)));
    return A0 + t * (A1 - A0);
  };
  const pt = (a, rad) => [cx + rad * Math.cos(a), cy - rad * Math.sin(a)];
  const arc = (v1, v2, rIn, rOut, fill) => {
    const a1 = ang(v1), a2 = ang(v2);
    const [x1, y1] = pt(a1, rOut), [x2, y2] = pt(a2, rOut);
    const [x3, y3] = pt(a2, rIn),  [x4, y4] = pt(a1, rIn);
    const large = Math.abs(a2 - a1) > Math.PI ? 1 : 0;
    return `<path d="M${x1} ${y1} A${rOut} ${rOut} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${rIn} ${rIn} 0 ${large} 0 ${x4} ${y4} Z" fill="${fill}"/>`;
  };
  let svg = `<svg viewBox="0 0 ${size} ${size * 0.74}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">`;
  for (const b of bands) svg += arc(b.from, b.to, r0, R, b.color);
  // ponteiro
  const a = ang(Math.min(max, Math.max(min, value)));
  const [px, py] = pt(a, R * 0.92);
  svg += `<line x1="${cx}" y1="${cy}" x2="${px}" y2="${py}" stroke="#9aa7b4" stroke-width="${size*0.022}" stroke-linecap="round"/>`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${size*0.055}" fill="#8f9ba8"/>`;
  // rótulos das escalas
  for (const t of ticks) {
    const [tx, ty] = pt(ang(t), R * 1.16);
    svg += `<text x="${tx}" y="${ty}" fill="#dbe6f0" font-size="${size*0.062}" font-family="Segoe UI,Arial,sans-serif" text-anchor="middle" dominant-baseline="middle">${String(t).replace('.', ',')}</text>`;
  }
  svg += `</svg>`;
  return svg;
}

/** Faixas do Area Ratio: <0.5 reprovado, 0.5–0.6 limite, >0.6 aprovado (IPC 7525C 3.2.1.2). */
export const AR_GAUGE = {
  min: 0, max: 1,
  bands: [
    { from: 0.00, to: 0.50, color: '#e03131' },
    { from: 0.50, to: 0.60, color: '#f2d600' },
    { from: 0.60, to: 1.00, color: '#37b24d' },
  ],
  ticks: [0, 0.5, 0.6, 1],
};

/** Faixas do Aspect Ratio: <1.5 reprovado, 1.5–2.0 limite, >2.0 aprovado. */
export const ASPECT_GAUGE = {
  min: 0, max: 3,
  bands: [
    { from: 0.0, to: 1.5, color: '#e03131' },
    { from: 1.5, to: 2.0, color: '#f2d600' },
    { from: 2.0, to: 3.0, color: '#37b24d' },
  ],
  ticks: [0, 1.5, 2, 3],
};
