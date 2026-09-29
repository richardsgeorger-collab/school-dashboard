import { ENV } from '../env';
import { helveticaSafe } from './pdfText';
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

export interface PdfFonts {
  regular: ArrayBuffer;
  bold: ArrayBuffer;
}

/** The worksheet font, a subset of DejaVu Sans shipped with the app (public/fonts). Null when it cannot be fetched. */
export async function loadWorksheetFonts(fetchImpl: typeof globalThis.fetch = globalThis.fetch): Promise<PdfFonts | null> {
  try {
    const [regular, bold] = await Promise.all(['worksheet-regular.ttf', 'worksheet-bold.ttf'].map(async (name) => {
      const res = await fetchImpl(`${ENV.BASE_URL}fonts/${name}`);
      if (!res.ok) throw new Error(`${name}: ${res.status}`);
      return res.arrayBuffer();
    }));
    return { regular, bold };
  } catch {
    return null;
  }
}

const toBase64 = (buf: ArrayBuffer): string => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

/**
 * The worksheet as a PDF. Problems on the first pages, the answers on a new last page. Loads jsPDF only when asked.
 * `fonts` is fetched when not given (the app's own subset of DejaVu Sans); without it the sheet is set in Helvetica
 * with the characters it cannot draw rewritten (H₂O becomes H2O) and a line at the foot saying so.
 */
export async function worksheetPdf(ws: Worksheet, opts: { fonts?: PdfFonts | null } = {}): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const fonts = opts.fonts === undefined ? await loadWorksheetFonts() : opts.fonts;
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  let family = 'helvetica';
  if (fonts) {
    pdf.addFileToVFS('worksheet-regular.ttf', toBase64(fonts.regular));
    pdf.addFont('worksheet-regular.ttf', 'Worksheet', 'normal');
    pdf.addFileToVFS('worksheet-bold.ttf', toBase64(fonts.bold));
    pdf.addFont('worksheet-bold.ttf', 'Worksheet', 'bold');
    family = 'Worksheet';
  }
  const width = PAGE.w - PAGE.margin * 2;
  let y = PAGE.margin;
  let rewritten = false;
  const newPage = () => {
    pdf.addPage();
    y = PAGE.margin;
  };
  const blocks = worksheetDoc(ws);
  for (const b of blocks) {
    if (b.kind === 'break') {
      newPage();
      continue;
    }
    const st = STYLE[b.kind];
    pdf.setFont(family, st.bold ? 'bold' : 'normal');
    pdf.setFontSize(st.size);
    pdf.setTextColor(st.gray ? 110 : 20);
    let text = b.text;
    if (!fonts) {
      const safe = helveticaSafe(text);
      text = safe.text;
      rewritten = rewritten || safe.changed;
    }
    const lines: string[] = pdf.splitTextToSize(text, width - st.indent);
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
  if (rewritten) {
    pdf.setFont(family, 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(110);
    y += 12;
    if (y + 12 > PAGE.h - PAGE.margin) newPage();
    pdf.text('Subscripts, arrows and Greek letters are written out here (H2O, ->, delta): the worksheet font could not be loaded. The .docx keeps them.', PAGE.margin, y + 8.5);
  }
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    pdf.setFont(family, 'normal');
    pdf.setFontSize(8.5);
    pdf.setTextColor(140);
    pdf.text(`${fonts ? ws.subtitle : helveticaSafe(ws.subtitle).text} · ${i} of ${n}`, PAGE.margin, PAGE.h - 28);
  }
  return pdf.output('blob');
}
