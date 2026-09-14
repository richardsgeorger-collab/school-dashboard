import { parseCapture, guessCourse } from '../capture/parse';
import { dateOf, fmtDate } from '../domain/dates';
import type { AppData, Course, DateStr, Item } from '../domain/types';
import { normCode } from './normalize';
import type { Mention, MentionKind } from '../record/notes';

export const HALO_URL = 'https://halo.gcu.edu/';

/** What the student edits in Settings. The item list below it is generated fresh every time. */
export const DEFAULT_AUDIT_PROMPT = `You are looking at my GCU Halo account in this browser. Open each of my classes and read every assignment, quiz, exam, and discussion with its due date and points. Then compare what Halo shows with the list under "MY PLANNER" and report only the differences.

Rules:
- One line per difference, in exactly this shape, nothing else:
  CLASS | TITLE | STATUS | DUE | NOTE
  STATUS is one of: new (in Halo, not in my list), changed (different due date or points), missing (in my list, not in Halo).
  DUE is the date and time Halo shows, as YYYY-MM-DD HH:MM in 24-hour Phoenix time, or blank.
  NOTE is short: the old date, the points ("15 pts"), or why.
- Use the class code from my list (CHM-113, ESG-162, and so on).
- If a class in Halo is not in my list at all, report each of its items as new.
- Skip participation and attendance items.
- If everything matches, reply: ALL MATCH
- Do not summarize, do not add headings.`;

/** Open items grouped by class, as plain lines Claude can compare against. */
export function plannerListing(data: AppData, tz: string, today: DateStr): string {
  const byCourse = new Map(data.courses.map((c) => [c.id, c]));
  const open = data.items
    .filter((i) => i.status !== 'done' && i.type !== 'participation' && dateOf(i.dueAt, tz) >= today)
    .sort((a, b) => (byCourse.get(a.courseId)?.code ?? '').localeCompare(byCourse.get(b.courseId)?.code ?? '') || a.dueAt.localeCompare(b.dueAt));
  const lines: string[] = [];
  let last = '';
  for (const i of open) {
    const c = byCourse.get(i.courseId);
    const code = c?.code ?? '?';
    if (code !== last) {
      lines.push(`\n${code} ${c?.name ?? ''}`.trimEnd());
      last = code;
    }
    lines.push(`${code} | ${i.title} | ${dateOf(i.dueAt, tz)} ${fmtTime24(i.dueAt, tz)} | ${i.points} pts`);
  }
  return lines.join('\n').trim();
}

function fmtTime24(iso: string, tz: string): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hh === '24' ? '00' : hh}:${mm}`;
}

/** The full text that goes on the clipboard. */
export function buildAuditPrompt(template: string | null | undefined, data: AppData, tz: string, today: DateStr): string {
  const t = (template ?? '').trim() || DEFAULT_AUDIT_PROMPT;
  return `${t}\n\nMY PLANNER (as of ${fmtDate(today, 'long')}, open items only):\n${plannerListing(data, tz, today)}\n`;
}

export interface AuditParse {
  mentions: Mention[];
  /** Lines that matched but said nothing changed. */
  same: number;
  /** Lines that could not be read. */
  unread: string[];
  allMatch: boolean;
}

const STATUS: Record<string, MentionKind | 'same'> = {
  new: 'new',
  added: 'new',
  changed: 'date_change',
  moved: 'date_change',
  different: 'date_change',
  missing: 'cancel',
  removed: 'cancel',
  gone: 'cancel',
  same: 'same',
  ok: 'same',
  unchanged: 'same',
  match: 'same',
};

function readDue(s: string): { date: string | null; time: string | null } {
  const m = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?:\s*(am|pm))?)?/i.exec(s);
  if (!m) return { date: null, time: null };
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4]) return { date, time: null };
  let hh = Number(m[4]);
  const ap = m[6]?.toLowerCase();
  if (ap === 'pm' && hh < 12) hh += 12;
  if (ap === 'am' && hh === 12) hh = 0;
  return { date, time: `${String(hh).padStart(2, '0')}:${m[5]}` };
}

function courseByCode(code: string, courses: Course[]): Course | null {
  const n = normCode(code);
  return courses.find((c) => normCode(c.code) === n) ?? null;
}

/**
 * Claude's answer → mentions for the review screen. Pipe lines are read exactly; other lines go through
 * the quick-capture parser; whatever is left is reported back rather than guessed.
 */
export function parseAuditResults(text: string, courses: Course[], today: DateStr): AuditParse {
  const out: AuditParse = { mentions: [], same: 0, unread: [], allMatch: false };
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s\-*•\d.)]+/, '').trim())
    .filter(Boolean);
  if (lines.some((l) => /^all match\b/i.test(l))) out.allMatch = true;
  let n = 0;
  for (const line of lines) {
    if (/^all match\b/i.test(line) || /^class\s*\|\s*title/i.test(line)) continue;
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length >= 3) {
      const [cls, title, status, due = '', note = ''] = parts;
      const kind = STATUS[status.toLowerCase().replace(/[^a-z]/g, '')];
      const course = courseByCode(cls, courses) ?? guessCourse(cls, courses);
      if (!kind || !title) {
        out.unread.push(line);
        continue;
      }
      if (kind === 'same') {
        out.same++;
        continue;
      }
      const { date, time } = readDue(due);
      const pts = /(\d+(?:\.\d+)?)\s*pts?/i.exec(note) ?? /(\d+(?:\.\d+)?)\s*pts?/i.exec(due);
      out.mentions.push({
        id: `a${++n}`,
        quote: line,
        kind,
        title,
        date,
        time,
        points: pts ? Number(pts[1]) : null,
        confidence: course && (date || kind === 'cancel') ? 'high' : 'medium',
        itemId: null,
        courseId: course?.id ?? null,
      });
      continue;
    }
    const cap = parseCapture(line, courses, today);
    if (!cap.courseId && !cap.mention.date) {
      out.unread.push(line);
      continue;
    }
    out.mentions.push({ ...cap.mention, id: `a${++n}`, courseId: cap.courseId });
  }
  return out;
}

/** Items the audit could refer to, for tests and previews. */
export const openItemsFor = (data: AppData, tz: string, today: DateStr): Item[] => data.items.filter((i) => i.status !== 'done' && i.type !== 'participation' && dateOf(i.dueAt, tz) >= today);
