/** Formatação pt-BR idêntica à do Power BI. */
export const nf = (v, d) =>
  Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });

export const int = v => Number(v).toLocaleString('pt-BR');

/** Data no formato MM/DD/YYYY (como no relatório atual). */
export function stampDate(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
}

/** Espessura: mostra "5,5" e não "5,50"; a maior quando há step. */
export function thicknessLabel(list) {
  return list.map(t => nf(t, Number.isInteger(t) ? 0 : 1)).join(' / ');
}

/** Gera o CSV com as MESMAS 10 colunas do Power BI (volume cm³ com vírgula). */
export function toCsv(report) {
  const head = ['D-CODE','Shape','Size A (mils)','Size B (mils)','Thickness (mils)',
                'Area Ratio','Aspect Ratio','Qtd','Volume cm³','Volume mils³'];
  const lines = [head.join(',')];
  for (const r of report.rows) {
    lines.push([
      r.dcode, r.shape, r.A, r.B, r.thickness,
      r.areaRatio, r.aspectRatio, r.qty,
      '"' + r.volCm3.toFixed(8).replace('.', ',') + '"',
      r.volMils3,
    ].join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
