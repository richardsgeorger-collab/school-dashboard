import { describe, expect, it } from 'vitest';
import { docxText, docxXmlText, isWorkFile } from './extract';

describe('reading the student’s file', () => {
  it('turns Word’s XML into paragraphs', () => {
    const xml = '<w:document><w:body><w:p><w:r><w:t>Thesis:</w:t></w:r><w:r><w:t xml:space="preserve"> chemistry &amp; life</w:t></w:r></w:p><w:p><w:r><w:t>Second</w:t><w:tab/><w:t>para</w:t></w:r></w:p></w:body></w:document>';
    expect(docxXmlText(xml)).toBe('Thesis: chemistry & life\nSecond\tpara');
  });
  it('reads a real .docx made by the docx library', async () => {
    const { Document, Packer, Paragraph } = await import('docx');
    const doc = new Document({ sections: [{ children: [new Paragraph('My essay draft.'), new Paragraph('It has two paragraphs.')] }] });
    const buf = await Packer.toBuffer(doc);
    const text = await docxText(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    expect(text).toBe('My essay draft.\nIt has two paragraphs.');
  });
  it('knows which files it takes', () => {
    expect(isWorkFile('draft.docx')).toBe(true);
    expect(isWorkFile('hw.pdf')).toBe(true);
    expect(isWorkFile('notes.txt')).toBe(true);
    expect(isWorkFile('photo.jpg', 'image/jpeg')).toBe(false);
  });
});
