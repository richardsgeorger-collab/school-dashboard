import type { ItemType } from './types';

/** Short class words for known GCU codes; anything else uses the department prefix. */
const COURSE_WORDS: Record<string, string> = {
  'CHM-113': 'Chem',
  'CHM-113L': 'Chem Lab',
  'ENG-105': 'English',
  'ESG-162': 'Eng Math',
  'ESG-162L': 'Eng Math Lab',
  'UNV-106': 'UNV',
};

const STOP = new Set(['and', 'of', 'in', 'the', 'a', 'an', 'for', 'to', 'with', 'on', 'chemical', 'chemistry', 'understanding']);
const CLC_WORDS: Record<string, string> = { mathematical: 'Math', materials: 'Materials', sensor: 'Sensor' };

export function courseShortName(code: string): string {
  const c = code.trim().toUpperCase();
  if (COURSE_WORDS[c]) return COURSE_WORDS[c];
  const m = /^([A-Z]{2,4})-?\d*([A-Z]?)$/.exec(c);
  if (!m) return code.trim();
  return m[2] === 'L' ? `${m[1]} Lab` : m[1];
}

const words = (s: string) => s.split(/[^A-Za-z0-9'&-]+/).filter(Boolean);
const significant = (ws: string[]) => ws.filter((w) => !STOP.has(w.toLowerCase()));
const first = (s: string) => significant(words(s))[0] ?? words(s)[0] ?? s;
const clcWord = (s: string) => {
  const w = first(s);
  return CLC_WORDS[w.toLowerCase()] ?? w;
};

type Rule = [RegExp, (m: RegExpMatchArray) => string];

/** Ordered: specific syllabus phrasings before generic shapes. */
const RULES: Rule[] = [
  [/^topic (\d+) homework$/i, (m) => `HW ${m[1]}`],
  [/^homework (\d+)$/i, (m) => `HW ${m[1]}`],
  [/^topic (\d+) activity$/i, (m) => `Activity ${m[1]}`],
  [/^topic (\d+) review$/i, (m) => `Review ${m[1]}`],
  [/^practice final exam$/i, () => 'Practice Final'],
  [/^practice quiz (\d+)$/i, (m) => `Practice Quiz ${m[1]}`],
  [/^apa quiz (\d+)$/i, (m) => `APA Quiz ${m[1]}`],
  [/^quiz #?(\d+)$/i, (m) => `Quiz ${m[1]}`],
  [/^topic (\d+) quiz$/i, (m) => `Quiz ${m[1]}`],
  [/^exam (\d+)$/i, (m) => `Exam ${m[1]}`],
  [/^topic (\d+) dq (\d+)$/i, (m) => `DQ ${m[1]}.${m[2]}`],
  [/^week (\d+) participation$/i, (m) => `Participation W${m[1]}`],
  [/^topic (\d+) participation$/i, (m) => `Participation ${m[1]}`],
  [/^matlab:\s*(.+)$/i, (m) => `MATLAB ${first(m[1])}`],
  [/^excel:\s*(.+)$/i, (m) => `Excel ${first(m[1])}`],
  [/^clc\s*[-–]\s*engineering design report with lab$/i, () => 'Design Report'],
  [/^clc\s*[-–]\s*engineering design report and demo (\d+)$/i, (m) => `Report & Demo ${m[1]}`],
  [/^clc\s*[-–]\s*(.+?) lab (\d+)$/i, (m) => `CLC ${clcWord(m[1])} ${m[2]}`],
  [/^formal lab report$/i, () => 'Lab Report'],
  [/^benchmark\s*[-–]\s*lab practical exam$/i, () => 'Lab Practical'],
  [/^chemical safety and equipment$/i, () => 'Safety'],
  [/^chemistry connections essay$/i, () => 'Connections Essay'],
  [/^chemistry connections presentation$/i, () => 'Connections Talk'],
  [/^(.+) lab$/i, (m) => `${first(m[1])} Lab`],
  [/^first draft of a rhetorical analysis/i, () => 'Rhetorical Draft'],
  [/^final draft of a rhetorical analysis/i, () => 'Rhetorical Final'],
  [/^review of ai generated text/i, () => 'AI Text Review'],
  [/^first draft of a review assignment/i, () => 'Review Draft'],
  [/^review assignment: peer or self review/i, () => 'Peer Review'],
  [/^final draft of a review assignment/i, () => 'Review Final'],
  [/^first draft of an op-ed/i, () => 'Op-Ed Draft'],
  [/^self-review and reflection on an op-ed/i, () => 'Op-Ed Self-Review'],
  [/^final draft of an op-ed/i, () => 'Op-Ed Final'],
  [/^microsoft office 365 quiz$/i, () => 'Office 365 Quiz'],
  [/^ai-assisted career reflection$/i, () => 'Career Reflection'],
  [/^technology & online time tracking/i, () => 'Excel Time Tracking'],
  [/^online privacy & security/i, () => 'Privacy Slides'],
  [/purpose plan/i, () => 'Purpose Plan'],
  [/^final video reflection$/i, () => 'Video Reflection'],
  [/^academic plan reflection$/i, () => 'Plan Reflection'],
  [/^academic plan$/i, () => 'Academic Plan'],
  [/prerequisite concept/i, () => 'Prereq Concepts'],
  [/^effective scheduling$/i, () => 'Scheduling'],
];

const FALLBACK_DROP = new Set([...STOP, 'assignment', 'assignments']);

function coreLabel(title: string): string {
  const clean = title.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  for (const [re, fn] of RULES) {
    const m = clean.match(re);
    if (m) return fn(m);
  }
  const kept = words(clean).filter((w) => !FALLBACK_DROP.has(w.toLowerCase()));
  return (kept.length ? kept : words(clean)).slice(0, 3).join(' ');
}

export interface LabelInput {
  title: string;
  courseCode: string;
  type?: ItemType;
}

/** Plain-language 2-4 word label: class word + what it is + number. */
export function shortLabel({ title, courseCode }: LabelInput): string {
  const cls = courseShortName(courseCode);
  let core = coreLabel(title);
  if (/\bLab$/.test(cls)) {
    if (/^Lab\s/i.test(core)) core = core.slice(4);
    else if (/\sLab$/i.test(core)) core = core.slice(0, -4);
  }
  return `${cls} ${core}`.replace(/\s+/g, ' ').trim();
}
