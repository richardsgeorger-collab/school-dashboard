// Debug helper: node scripts/parsepdf.ts <file.pdf> — prints what the app's parser sees.
import { readFileSync } from 'node:fs';
import { parseGcuSyllabus } from '../src/parser/gcuSyllabus';
import { extractLines } from '../src/parser/pdfText';

const lines = await extractLines(readFileSync(process.argv[2]));
console.log('lines', lines.length, '| first:', JSON.stringify(lines.slice(0, 3)));
const p = parseGcuSyllabus(lines);
console.log(p.code, '|', p.name, '|', p.credits, 'cr |', p.termStart, '→', p.termEnd, '| assessments', p.assessments.length, '| warnings', p.warnings);
for (const t of ['Quiz #1', 'Week 1 Participation', 'Exam 2']) console.log(p.assessments.find((a) => a.title === t));
