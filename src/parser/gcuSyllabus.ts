import { parseGcuDate, parseGcuDateTime } from '../domain/dates';
import type { DateStr, Instructor } from '../domain/types';

export interface ParsedAssessment {
  title: string;
  opensAt: string | null;
  dueAt: string;
  points: number;
  timeLimit: string | null;
  traits: string[];
  description: string;
  topic: string | null;
}

export interface ParsedTopic {
  n: number;
  title: string;
  start: DateStr;
  end: DateStr;
  maxPoints: number;
}

export interface ParsedSyllabus {
  code: string;
  name: string;
  credits: number;
  termStart: DateStr;
  termEnd: DateStr;
  instructors: Instructor[];
  topics: ParsedTopic[];
  assessments: ParsedAssessment[];
  warnings: string[];
}

const HEADER = /^([A-Z]{2,4}-\d{3}[A-Z]?)\s+(\d+)\s+Credits?\s+([A-Z][a-z]{2} \d{1,2})\s*-\s*([A-Z][a-z]{2} \d{1,2})$/;
const TOPIC = /^Topic (\d+): (.+)$/;
const TOPIC_DATES = /^([A-Z][a-z]{2} \d{1,2}, \d{4})\s*-\s*([A-Z][a-z]{2} \d{1,2}, \d{4})\s+Max Points: (\d+)$/;
const ASSESS_HDR = /^Start Date & Time\s+Due Date & Time\s+Points(\s+Time Limit)?$/;
const DT = '([A-Z][a-z]{2} \\d{1,2}, \\d{4}, \\d{1,2}:\\d{2} [AP]M)';
const ASSESS_ROW = new RegExp(`^${DT}\\s+${DT}\\s+(\\d+)(?:\\s+(.+))?$`);
const TIMESTAMP = /^[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2} [AP]M$/;
const FOOTER = /^Page \d+\s+Grand Canyon University/;
const EMAIL = /^[\w.+-]+@[\w.-]+\.\w+$/;

const KNOWN_TRAITS = ['Not Submitted in Halo', 'Requires LopesWrite', 'Timed', 'Group', 'Benchmark'];
const MAX_DESCRIPTION = 600;

const MONTH_INDEX: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

function clean(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function normalizeTrait(raw: string): string {
  const text = raw.replace(/^[^A-Za-z]+/, '').trim();
  return KNOWN_TRAITS.find((t) => text.includes(t)) ?? text;
}

function detectYear(lines: string[]): number {
  for (const line of lines) {
    const t = TOPIC_DATES.exec(line);
    if (t) return Number(t[1].slice(-4));
    const r = ASSESS_ROW.exec(line);
    if (r) return Number(r[1].split(',')[1]);
  }
  const ts = lines.find((l) => TIMESTAMP.test(l));
  if (ts) return Number(ts.split(',')[1]);
  return new Date().getFullYear();
}

function parseInstructors(lines: string[]): Instructor[] {
  const start = lines.findIndex((l) => /^Instructor Contact Information$/i.test(l));
  if (start < 0) return [];
  const out: Instructor[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^Class Resources$/i.test(lines[i]) || TOPIC.test(lines[i])) break;
    if (EMAIL.test(lines[i]) && i > start + 1) {
      out.push({ name: lines[i - 1], email: lines[i] });
    }
  }
  return out;
}

export function parseGcuSyllabus(rawLines: string[], opts: { tz?: string } = {}): ParsedSyllabus {
  const tz = opts.tz ?? 'America/Phoenix';
  const lines = rawLines.map(clean).filter((l) => l.length > 0 && !FOOTER.test(l));

  const headerIdx = lines.findIndex((l) => HEADER.test(l));
  if (headerIdx < 0) throw new Error('Not a GCU syllabus: course header not found');
  const header = HEADER.exec(lines[headerIdx])!;

  let name = '';
  for (let i = headerIdx - 1; i >= 0; i--) {
    if (!TIMESTAMP.test(lines[i])) {
      name = lines[i];
      break;
    }
  }

  const year = detectYear(lines);
  const termStart = parseGcuDate(header[3], year)!;
  let termEnd = parseGcuDate(header[4], year)!;
  if (MONTH_INDEX[header[4].slice(0, 3)] < MONTH_INDEX[header[3].slice(0, 3)]) {
    termEnd = parseGcuDate(header[4], year + 1)!;
  }

  const warnings: string[] = [];
  const topics: ParsedTopic[] = [];
  const topicAtLine: { idx: number; label: string; n: number }[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const t = TOPIC.exec(lines[i]);
    if (!t) continue;
    const d = TOPIC_DATES.exec(lines[i + 1]);
    if (!d) continue;
    const n = Number(t[1]);
    topics.push({
      n,
      title: t[2],
      start: parseGcuDate(d[1])!,
      end: parseGcuDate(d[2])!,
      maxPoints: Number(d[3]),
    });
    topicAtLine.push({ idx: i, label: `Topic ${n}: ${t[2]}`, n });
  }
  const isTopicLine = (i: number) => topicAtLine.some((t) => t.idx === i);
  const topicFor = (i: number) => {
    let cur: { label: string; n: number } | null = null;
    for (const t of topicAtLine) {
      if (t.idx < i) cur = t;
      else break;
    }
    return cur;
  };

  const headerIdxs: number[] = [];
  lines.forEach((l, i) => {
    if (ASSESS_HDR.test(l)) headerIdxs.push(i);
  });

  const assessments: ParsedAssessment[] = [];
  const pointsByTopic = new Map<number, number>();

  headerIdxs.forEach((hi, k) => {
    const title = hi > 0 ? lines[hi - 1] : '';
    const rowLine = lines[hi + 1] ?? '';
    const row = ASSESS_ROW.exec(rowLine);
    if (!row) {
      warnings.push(`Could not read dates for "${title}"`);
      return;
    }
    const opensAt = parseGcuDateTime(row[1], tz);
    const dueAt = parseGcuDateTime(row[2], tz);
    if (!dueAt) {
      warnings.push(`Could not parse due date for "${title}"`);
      return;
    }

    const nextHeader = headerIdxs[k + 1];
    let end = nextHeader !== undefined ? nextHeader - 1 : lines.length;
    for (let i = hi + 2; i < end; i++) {
      if (isTopicLine(i)) {
        end = i;
        break;
      }
    }

    const traits: string[] = [];
    const descLines: string[] = [];
    let mode: 'none' | 'traits' | 'desc' | 'stop' = 'none';
    for (let i = hi + 2; i < end; i++) {
      const l = lines[i];
      if (/^Assessment Traits$/i.test(l)) {
        mode = 'traits';
        continue;
      }
      if (/^Assessment Description$/i.test(l)) {
        mode = 'desc';
        continue;
      }
      if (/^Attachments$/i.test(l)) {
        mode = 'stop';
        continue;
      }
      if (mode === 'traits') traits.push(normalizeTrait(l));
      else if (mode === 'desc') descLines.push(l);
    }

    const topic = topicFor(hi);
    const points = Number(row[3]);
    if (topic) pointsByTopic.set(topic.n, (pointsByTopic.get(topic.n) ?? 0) + points);

    assessments.push({
      title,
      opensAt,
      dueAt,
      points,
      timeLimit: row[4]?.trim() || null,
      traits: traits.filter(Boolean),
      description: descLines.join(' ').slice(0, MAX_DESCRIPTION),
      topic: topic?.label ?? null,
    });
  });

  for (const t of topics) {
    const sum = pointsByTopic.get(t.n) ?? 0;
    if (sum !== t.maxPoints) {
      warnings.push(`Topic ${t.n} points sum to ${sum} but syllabus says ${t.maxPoints}`);
    }
  }

  return {
    code: header[1],
    name,
    credits: Number(header[2]),
    termStart,
    termEnd,
    instructors: parseInstructors(lines),
    topics,
    assessments,
    warnings,
  };
}
