import { extractPages } from '../parser/pdfText';
import { pptxText } from './pptx';

export interface Extracted {
  kind: 'pdf' | 'pptx';
  /** Text per page or slide; empty strings for pages with nothing readable. */
  pages: string[];
  warnings: string[];
}

export const isDeckFile = (name: string, type?: string): boolean => /\.(pdf|pptx)$/i.test(name) || type === 'application/pdf';

/** Text out of a dropped deck. Never guesses: a file that cannot be read says so. */
export async function extractDeck(file: File): Promise<Extracted> {
  const buf = await file.arrayBuffer();
  if (/\.pptx$/i.test(file.name)) {
    const r = await pptxText(buf);
    const pages = r.slides.map((s, i) => (r.notes[i] ? `${s}\nNotes: ${r.notes[i]}` : s));
    return { kind: 'pptx', pages, warnings: r.warnings };
  }
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    const pages = await extractPages(buf);
    const empty = pages.filter((p) => !p.trim()).length;
    const warnings = empty > 0 ? [`${empty} of ${pages.length} pages had no readable text. A scanned or image-only PDF has no text layer.`] : [];
    return { kind: 'pdf', pages, warnings };
  }
  throw new Error('Drop a .pdf or .pptx. For .ppt or Keynote, export as PDF first.');
}

/** Title from the file name: "CHM113_Topic3_Stoichiometry.pdf" → "CHM113 Topic3 Stoichiometry". */
export function titleFromFileName(name: string): string {
  return name
    .replace(/\.(pdf|pptx)$/i, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
