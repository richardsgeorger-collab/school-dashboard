import { describe, expect, it } from 'vitest';
import type { Course, Item } from '../domain/types';
import type { QuizSource } from '../quiz/sources';
import { worksheetDocx } from './docx';
import { worksheetPdf } from './pdf';
import { buildWorksheetPrompt, worksheetDoc, worksheetFileName, worksheetFromTool } from './worksheet';

const course = { id: 'chm', code: 'CHM-113', name: 'General Chemistry I' } as Course;
const test = { id: 'q2', label: 'Chem Quiz 2', type: 'quiz', points: 50 } as Item;
const sources: QuizSource[] = [
  { id: 'S1', kind: 'slide', label: 'Topic 4, slide 4', href: '#', text: 'Limiting reagent: the reactant that runs out first.' },
  { id: 'S2', kind: 'slide', label: 'Topic 4, slide 7', href: '#', text: 'Molarity M = mol / L.' },
];
const args = { course, test, testDate: 'Fri, Oct 23', topics: ['limiting reagent'], weakTopics: ['molarity'], sources };
const raw = {
  title: 'Quiz 2 practice',
  instructions: 'Show every conversion factor.',
  problems: [
    { kind: 'worked', topic: 'limiting reagent', prompt: '10.0 g H2 and 64.0 g O2 react. Which is limiting?', choices: [], answer: 'O2', solution: ['H2: 4.96 mol → 4.96 mol H2O', 'O2: 2.00 mol → 4.00 mol H2O', 'O2 gives less: limiting'], sourceId: 'S1' },
    { kind: 'multiple_choice', topic: 'molarity', prompt: '0.25 mol NaCl in 0.50 L is', choices: ['0.125 M', '0.50 M', '2.0 M', '0.25 M'], answer: '1', solution: ['M = mol / L = 0.25 / 0.50'], sourceId: 'S2' },
    { kind: 'short', topic: 'molarity', prompt: 'Nonsense from nowhere', choices: [], answer: 'x', solution: [], sourceId: 'S9' },
    { kind: 'multiple_choice', topic: 'molarity', prompt: 'Only three options', choices: ['a', 'b', 'c'], answer: 'A', solution: [], sourceId: 'S2' },
  ],
};

describe('a worksheet from the model', () => {
  it('keeps what cites a real source and holds together, numbered in order, answers as letters', () => {
    const ws = worksheetFromTool(raw, args);
    expect(ws.problems.map((p) => p.n)).toEqual([1, 2]);
    expect(ws.problems[1].answer).toBe('B');
    expect(ws.subtitle).toBe('CHM-113 · Chem Quiz 2 · Fri, Oct 23');
    expect(ws.itemId).toBe('q2');
    expect(worksheetFileName(ws, 'pdf')).toBe('CHM-113 Chem Quiz 2 practice.pdf');
  });
  it('the prompt names the test, its topics, the weak ones, and asks a chemistry class for worked problems', () => {
    const { user } = buildWorksheetPrompt(args);
    expect(user).toContain('Chem Quiz 2, Fri, Oct 23, 50 points');
    expect(user).toContain("test's own topics: limiting reagent");
    expect(user).toContain('keeps missing (give them at least three problems): molarity');
    expect(user).toContain('worked problems');
  });
});

describe('the document', () => {
  const ws = worksheetFromTool(raw, args);
  const doc = worksheetDoc(ws);
  it('puts the answers after one page break, never before it', () => {
    const breaks = doc.map((b, i) => (b.kind === 'break' ? i : -1)).filter((i) => i >= 0);
    expect(breaks).toHaveLength(1);
    const before = doc.slice(0, breaks[0]);
    const after = doc.slice(breaks[0] + 1);
    expect(before.some((b) => b.kind === 'answer' || b.kind === 'step')).toBe(false);
    expect(after.filter((b) => b.kind === 'answer').map((b) => (b as { text: string }).text)).toEqual(['1. O2', '2. B']);
    expect(before.filter((b) => b.kind === 'problem')).toHaveLength(2);
    expect(before.filter((b) => b.kind === 'choice')).toHaveLength(4);
    expect(before.some((b) => b.kind === 'note' && b.text.includes('answers on the last page'))).toBe(true);
  });
  it('sets the PDF in the shipped Unicode font when it is on hand, so H₂O and → survive', async () => {
    const { readFileSync } = await import('node:fs');
    const buf = (name: string) => { const b = readFileSync(`public/fonts/${name}`); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
    const pdf = await worksheetPdf(ws, { fonts: { regular: buf('worksheet-regular.ttf'), bold: buf('worksheet-bold.ttf') } });
    const bytes = new TextDecoder('latin1').decode(await pdf.arrayBuffer());
    // jsPDF embeds the TrueType programs under the family it was given.
    expect(bytes).toMatch(/\/BaseFont\s*\/Worksheet/);
    expect((bytes.match(/FontFile2/g) ?? []).length).toBe(2);
    expect(bytes).not.toContain('could not be loaded');
  });
  it('without the font, falls back to Helvetica with the characters it cannot draw rewritten, and says so', async () => {
    const pdf = await worksheetPdf({ ...ws, problems: [{ ...ws.problems[0], prompt: '2 H₂ + O₂ → 2 H₂O: which is limiting?' }] }, { fonts: null });
    const bytes = new TextDecoder('latin1').decode(await pdf.arrayBuffer());
    expect(bytes).toMatch(/Helvetica/);
    expect(bytes).not.toMatch(/FontFile2/);
  });
  it('writes a real .docx and a real PDF', async () => {
    const docx = await worksheetDocx(ws);
    expect(docx.size).toBeGreaterThan(1000);
    expect(new Uint8Array(await docx.slice(0, 2).arrayBuffer())).toEqual(new Uint8Array([0x50, 0x4b]));
    const pdf = await worksheetPdf(ws);
    expect(pdf.size).toBeGreaterThan(1000);
    expect(new TextDecoder().decode(await pdf.slice(0, 5).arrayBuffer())).toBe('%PDF-');
  });
});
