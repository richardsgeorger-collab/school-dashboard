import { worksheetDoc, type Worksheet } from './worksheet';

/** The worksheet as a Word document. The library loads only when a download is asked for. */
export async function worksheetDocx(ws: Worksheet): Promise<Blob> {
  const { AlignmentType, Document, HeadingLevel, Packer, PageBreak, Paragraph, TextRun } = await import('docx');
  const children: InstanceType<typeof Paragraph>[] = [];
  for (const b of worksheetDoc(ws)) {
    if (b.kind === 'break') {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      continue;
    }
    switch (b.kind) {
      case 'title':
        children.push(new Paragraph({ text: b.text, heading: HeadingLevel.TITLE }));
        break;
      case 'subtitle':
        children.push(new Paragraph({ children: [new TextRun({ text: b.text, color: '666666' })], spacing: { after: 200 } }));
        break;
      case 'note':
        children.push(new Paragraph({ children: [new TextRun({ text: b.text, italics: true })], spacing: { after: 160 } }));
        break;
      case 'heading':
        children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 120 } }));
        break;
      case 'problem':
        children.push(new Paragraph({ children: [new TextRun({ text: b.text })], spacing: { before: 200, after: 80 } }));
        break;
      case 'choice':
        children.push(new Paragraph({ children: [new TextRun({ text: b.text })], indent: { left: 720 }, spacing: { after: 40 } }));
        break;
      case 'answer':
        children.push(new Paragraph({ children: [new TextRun({ text: b.text, bold: true })], spacing: { before: 160, after: 40 } }));
        break;
      case 'step':
        children.push(new Paragraph({ children: [new TextRun({ text: b.text })], indent: { left: 720 }, spacing: { after: 40 } }));
        break;
      case 'rule':
        children.push(new Paragraph({ children: [new TextRun({ text: b.text, color: '888888', size: 16 })], spacing: { before: 320 }, alignment: AlignmentType.LEFT }));
        break;
    }
  }
  const doc = new Document({ creator: 'Halo+', title: ws.title, sections: [{ children }] });
  return Packer.toBlob(doc);
}
