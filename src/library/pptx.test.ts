import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { pptxText, slideText, zipEntries } from './pptx';

/** A real zip built by hand, the way PowerPoint writes one: local headers, data, then the central directory. */
function makeZip(files: { name: string; text: string; store?: boolean }[]): ArrayBuffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const raw = Buffer.from(f.text, 'utf8');
    const data = f.store ? raw : deflateRawSync(raw);
    const name = Buffer.from(f.name, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(f.store ? 0 : 8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0, 8);
    c.writeUInt16LE(f.store ? 0 : 8, 10);
    c.writeUInt32LE(0, 12);
    c.writeUInt32LE(0, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt16LE(0, 30);
    c.writeUInt16LE(0, 32);
    c.writeUInt16LE(0, 34);
    c.writeUInt16LE(0, 36);
    c.writeUInt32LE(0, 38);
    c.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([c, name]));
    parts.push(local, name, data);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  const all = Buffer.concat([...parts, cd, eocd]);
  return all.buffer.slice(all.byteOffset, all.byteOffset + all.byteLength);
}

const slide = (runs: string[][]) => `<?xml version="1.0"?><p:sld xmlns:a="a" xmlns:p="p"><p:cSld><p:spTree>${runs.map((r) => `<p:sp><p:txBody>${'<a:p>' + r.map((t) => `<a:r><a:rPr lang="en-US"/><a:t>${t}</a:t></a:r>`).join('') + '</a:p>'}</p:txBody></p:sp>`).join('')}</p:spTree></p:cSld></p:sld>`;

export const SAMPLE_PPTX = makeZip([
  { name: '[Content_Types].xml', text: '<Types/>', store: true },
  { name: 'ppt/slides/slide2.xml', text: slide([['Limiting ', 'reagent'], ['The reactant that runs out first &amp; caps the product']]) },
  { name: 'ppt/slides/slide1.xml', text: slide([['Stoichiometry'], ['Mole ratios from balanced equations']]) },
  { name: 'ppt/slides/slide3.xml', text: slide([]) },
  { name: 'ppt/notesSlides/notesSlide1.xml', text: slide([['Remind them about the quiz on Friday']]) },
  { name: 'ppt/media/image1.png', text: 'PNG', store: true },
]);

describe('pptx reading', () => {
  it('lists the archive and reads deflated and stored parts', async () => {
    const entries = zipEntries(SAMPLE_PPTX);
    expect(entries.map((e) => e.name)).toContain('ppt/slides/slide1.xml');
    expect(entries.find((e) => e.name === '[Content_Types].xml')?.method).toBe(0);
  });
  it('pulls slide text in order, joins runs, decodes entities, keeps notes, and flags empty slides', async () => {
    const r = await pptxText(SAMPLE_PPTX);
    expect(r.slides).toEqual(['Stoichiometry\nMole ratios from balanced equations', 'Limiting reagent\nThe reactant that runs out first & caps the product', '']);
    expect(r.notes).toEqual(['Remind them about the quiz on Friday', null, null]);
    expect(r.warnings[0]).toMatch(/1 of 3 slides had no readable text/);
  });
  it('says so when there are no slides', async () => {
    await expect(pptxText(makeZip([{ name: 'docProps/app.xml', text: '<x/>' }]))).rejects.toThrow(/Export it as PDF/);
    expect(slideText('<a:p><a:t>a</a:t><a:t>b</a:t></a:p><a:p><a:t>c</a:t></a:p>')).toBe('ab\nc');
  });
});
