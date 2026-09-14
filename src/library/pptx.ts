/**
 * Just enough ZIP and XML reading to pull the text out of a .pptx: slides are XML files inside a
 * deflate-compressed archive, and every visible run of text sits in an <a:t> element.
 * No library; the browser's DecompressionStream inflates each part.
 */
export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

function u16(b: DataView, o: number) {
  return b.getUint16(o, true);
}
function u32(b: DataView, o: number) {
  return b.getUint32(o, true);
}

/** The central directory: every file's name, method, sizes, and where its data starts. */
export function zipEntries(buf: ArrayBuffer): ZipEntry[] {
  const b = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66_000); i--) {
    if (u32(b, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a zip file');
  const count = u16(b, eocd + 10);
  let o = u32(b, eocd + 16);
  const out: ZipEntry[] = [];
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (u32(b, o) !== 0x02014b50) break;
    const method = u16(b, o + 10);
    const compressedSize = u32(b, o + 20);
    const size = u32(b, o + 24);
    const nameLen = u16(b, o + 28);
    const extraLen = u16(b, o + 30);
    const commentLen = u16(b, o + 32);
    const localOffset = u32(b, o + 42);
    const name = dec.decode(bytes.subarray(o + 46, o + 46 + nameLen));
    out.push({ name, method, compressedSize, size, localOffset });
    o += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export async function zipRead(buf: ArrayBuffer, e: ZipEntry): Promise<Uint8Array> {
  const b = new DataView(buf);
  if (u32(b, e.localOffset) !== 0x04034b50) throw new Error(`Bad local header for ${e.name}`);
  const nameLen = u16(b, e.localOffset + 26);
  const extraLen = u16(b, e.localOffset + 28);
  const start = e.localOffset + 30 + nameLen + extraLen;
  const data = new Uint8Array(buf, start, e.compressedSize);
  if (e.method === 0) return data;
  if (e.method !== 8) throw new Error(`Unsupported compression ${e.method} in ${e.name}`);
  const ds = new DecompressionStream('deflate-raw');
  const stream = new Blob([data]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeXml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e] ?? m)));

/** Visible text of one slide's XML: paragraphs on their own lines, runs joined. */
export function slideText(xml: string): string {
  const paras = xml.split(/<\/a:p>/);
  const lines: string[] = [];
  for (const p of paras) {
    const runs = [...p.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1]));
    const line = runs.join('').replace(/\s+/g, ' ').trim();
    if (line) lines.push(line);
  }
  return lines.join('\n');
}

export interface PptxResult {
  slides: string[];
  notes: (string | null)[];
  warnings: string[];
}

const slideNo = (name: string, kind: 'slide' | 'notesSlide') => {
  const m = new RegExp(`^ppt/${kind}s/${kind}(\\d+)\\.xml$`).exec(name);
  return m ? Number(m[1]) : null;
};

/** Text per slide, in slide order, with speaker notes when present. */
export async function pptxText(buf: ArrayBuffer): Promise<PptxResult> {
  const entries = zipEntries(buf);
  const dec = new TextDecoder();
  const slides = entries.map((e) => [slideNo(e.name, 'slide'), e] as const).filter((x): x is readonly [number, ZipEntry] => x[0] !== null).sort((a, b) => a[0] - b[0]);
  if (slides.length === 0) throw new Error('No slides found in this file. Export it as PDF from PowerPoint and drop that instead.');
  const notes = new Map(entries.map((e) => [slideNo(e.name, 'notesSlide'), e] as const).filter((x): x is readonly [number, ZipEntry] => x[0] !== null));
  const out: PptxResult = { slides: [], notes: [], warnings: [] };
  let empty = 0;
  for (const [n, e] of slides) {
    const text = slideText(dec.decode(await zipRead(buf, e)));
    if (!text) empty++;
    out.slides.push(text);
    const ne = notes.get(n);
    out.notes.push(ne ? slideText(dec.decode(await zipRead(buf, ne))).replace(/^\d+$/, '') || null : null);
  }
  if (empty > 0) out.warnings.push(`${empty} of ${slides.length} slides had no readable text (pictures, charts, or SmartArt). Export the deck as PDF from PowerPoint if that matters.`);
  return out;
}
