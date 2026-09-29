import { zipEntries, zipRead } from '../library/pptx';

/** The kinds of file Check reads. Anything else is pasted as text. */
export const isWorkFile = (name: string, type?: string): boolean => /\.(txt|md|pdf|docx)$/i.test(name) || type === 'application/pdf' || type === 'text/plain';

/** Word's document.xml as plain text: paragraphs become lines, tabs stay tabs, everything else is dropped. */
export function docxXmlText(xml: string): string {
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>|<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The text of a .docx. */
export async function docxText(buf: ArrayBuffer): Promise<string> {
  const entry = zipEntries(buf).find((e) => e.name === 'word/document.xml');
  if (!entry) throw new Error('That .docx has no document inside it.');
  return docxXmlText(new TextDecoder().decode(await zipRead(buf, entry)));
}

/** What the student wrote, out of whatever file they dropped. Never guesses: a file it cannot read says so. */
export async function textFromFile(file: File): Promise<string> {
  if (/\.docx$/i.test(file.name)) return docxText(await file.arrayBuffer());
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
    const { extractPages } = await import('../parser/pdfText');
    const pages = await extractPages(await file.arrayBuffer());
    const text = pages.join('\n\n').trim();
    if (!text) throw new Error('That PDF has no readable text. A scanned or image-only PDF has no text layer; paste the text instead.');
    return text;
  }
  if (/\.(txt|md)$/i.test(file.name) || file.type.startsWith('text/')) return (await file.text()).trim();
  throw new Error('Drop a .docx, .pdf, .txt or .md, or paste the text.');
}
