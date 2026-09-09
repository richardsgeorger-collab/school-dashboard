export interface TextItemLike {
  str: string;
  x: number;
  y: number;
  width: number;
}

const FOOTER = /^Page \S+\s+Grand Canyon University/;
/** Gap (in PDF user-space units) above which two runs on one baseline are separate words. */
const WORD_GAP = 1;

/** Rebuild text lines from positioned PDF text runs: group by baseline, order left to right. */
export function linesFromTextItems(items: TextItemLike[], yTol = 2.5): string[] {
  const valid = items.filter((i) => i.str.trim().length > 0);
  valid.sort((a, b) => b.y - a.y || a.x - b.x);

  const groups: TextItemLike[][] = [];
  for (const it of valid) {
    const last = groups[groups.length - 1];
    if (last && Math.abs(last[0].y - it.y) <= yTol) last.push(it);
    else groups.push([it]);
  }

  return groups
    .map((group) => {
      group.sort((a, b) => a.x - b.x);
      let text = '';
      let prevEnd: number | null = null;
      for (const it of group) {
        if (prevEnd !== null && it.x - prevEnd > WORD_GAP) text += ' ';
        text += it.str;
        prevEnd = it.x + it.width;
      }
      return text.replace(/\s+/g, ' ').trim();
    })
    .filter((l) => l.length > 0);
}

export function stripFooters(lines: string[]): string[] {
  return lines.filter((l) => !FOOTER.test(l));
}

/** Extract text lines from a PDF. Works in the browser (with worker) and in Node (fake worker). */
export async function extractLines(data: ArrayBuffer | Uint8Array): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (typeof window !== 'undefined' && !pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  // pdf.js insists on a plain Uint8Array (Node's Buffer is rejected), so always re-wrap.
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const task = pdfjs.getDocument({ data: bytes });
  const doc = await task.promise;
  const lines: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items: TextItemLike[] = [];
    for (const raw of content.items) {
      if (!('str' in raw)) continue;
      items.push({ str: raw.str, x: raw.transform[4], y: raw.transform[5], width: raw.width });
    }
    lines.push(...linesFromTextItems(items));
  }
  await task.destroy();
  return stripFooters(lines);
}
