import { worksheetDoc, type DocBlock, type Worksheet } from './worksheet';

const PAGE = { w: 612, h: 792, margin: 56 };

/** Point sizes and the vertical room each block kind takes, so the layout is the same on every run. */
const STYLE: Record<Exclude<DocBlock, { kind: 'break' }>['kind'], { size: number; bold?: boolean; indent: number; before: number; after: number; gray?: boolean }> = {
  title: { size: 20, bold: true, indent: 0, before: 0, after: 6 },
  subtitle: { size: 11, indent: 0, before: 0, after: 14, gray: true },
  note: { size: 10.5, indent: 0, before: 0, after: 10, gray: true },
  heading: { size: 13, bold: true, indent: 0, before: 14, after: 6 },
  problem: { size: 11, indent: 0, before: 8, after: 4 },
  choice: { size: 11, indent: 22, before: 0, after: 2 },
  answer: { size: 11, bold: true, indent: 0, before: 8, after: 2 },
  step: { size: 10.5, indent: 22, before: 0, after: 2 },
  rule: { size: 8.5, indent: 0, before: 18, after: 0, gray: true },
};

/** The worksheet as a PDF. Problems on the first pages, the answers on a new last page. Loads jsPDF only when asked. */
export async function worksheetPdf(ws: Worksheet): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  const width = PAGE.w - PAGE.margin * 2;
  let y = PAGE.margin;
  const newPage = () => {
    pdf.addPage();
    y = PAGE.margin;
  };
  for (const b of worksheetDoc(ws)) {
    if (b.kind === 'break') {
      newPage();
      continue;
    }
    const st = STYLE[b.kind];
    pdf.setFont('helvetica', st.bold ? 'bold' : 'normal');
    pdf.setFontSize(st.size);
    pdf.setTextColor(st.gray ? 110 : 20);
    const lines: string[] = pdf.splitTextToSize(b.text, width - st.indent);
    const lineH = st.size * 1.35;
    y += st.before;
    // Keep a block on one page: a question never splits from its choices at the fold.
    if (y + lines.length * lineH > PAGE.h - PAGE.margin) newPage();
    for (const line of lines) {
      pdf.text(line, PAGE.margin + st.indent, y + st.size);
      y += lineH;
    }
    y += st.after;
  }
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8.5);
    pdf.setTextColor(140);
    pdf.text(`${ws.subtitle} · ${i} of ${n}`, PAGE.margin, PAGE.h - 28);
  }
  return pdf.output('blob');
}
