import { guessCourse, parseCapture } from '../capture/parse';
import { dateOf, fmtDate } from '../domain/dates';
import type { AppData, Course, DateStr, Item } from '../domain/types';
import type { Mention, MentionKind } from '../record/notes';
import { normCode } from './normalize';

export const HALO_URL = 'https://halo.gcu.edu/';

/** The audit prompt, verbatim as given. [DATE] and [PLANNER DUMP] are filled in when it is copied. */
export const DEFAULT_AUDIT_PROMPT = `You are looking at my GCU Halo account in this browser. Audit it 
completely against MY PLANNER below. Leave no holes.

READ ONLY. Do not submit anything, start a quiz or exam, post a 
discussion, or click any button that changes state. Navigate and read 
only.

CHECK ALL OF THIS, for every class:
1. Every topic/module — open each one, read every assignment, quiz, 
   exam, discussion, and lab with its due date and points
2. The gradebook — every score posted, every item still ungraded
3. Announcements — anything mentioning a moved deadline, a cancelled 
   item, a changed exam date, or an added assignment
4. The syllabus page — exam dates and weights that may differ from the 
   topic pages
5. Any item marked late, missing, overdue, or reassigned
6. The class schedule — meeting days and times

OUTPUT FORMAT. One line per finding, nothing else:
CLASS | TITLE | STATUS | DUE | NOTE

STATUS is one of:
  new         — in Halo, not in my list
  changed     — different due date or points
  missing     — in my list, not in Halo
  grade       — a posted score
  overdue     — Halo flags it late or missing
  announce    — a deadline change from an announcement
  schedule    — class meeting days/times differ

DUE is YYYY-MM-DD HH:MM in 24-hour Phoenix time, or blank.
NOTE is short: the old date, the points, the score ("14/20"), or why.

Use the class code from my list. Skip participation and attendance.

SPECIAL CASES:
- ENG-105 English Composition is deliberately absent from my list — I 
  switched sections and it hasn't synced. Prefix its lines with 
  ENG105-PENDING instead of reporting them as new.
- ESG-162 in my list is a section I dropped. If Halo shows a different 
  Engineering Math section, prefix those lines with OLD-SECTION.
- If a page fails to load or you can't reach a class, say so on its own 
  line. Never silently skip.

Finish with one of:
  ALL MATCH
  or
  END OF FINDINGS — n items

MY PLANNER (as of [DATE], open items only):
[PLANNER DUMP]`;

function fmtTime24(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso));
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hh === '24' ? '00' : hh}:${mm}`;
}

/** Items the audit can refer to: open, not participation, not yet past. */
export const openItemsFor = (data: AppData, tz: string, today: DateStr): Item[] => data.items.filter((i) => i.status !== 'done' && i.type !== 'participation' && dateOf(i.dueAt, tz) >= today);

/** Open items grouped by class, as plain lines Claude can compare against. */
export function plannerListing(data: AppData, tz: string, today: DateStr): string {
  const byCourse = new Map(data.courses.map((c) => [c.id, c]));
  const open = openItemsFor(data, tz, today).sort((a, b) => (byCourse.get(a.courseId)?.code ?? '').localeCompare(byCourse.get(b.courseId)?.code ?? '') || a.dueAt.localeCompare(b.dueAt));
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

/** The full text that goes on the clipboard: the template with [DATE] and [PLANNER DUMP] filled in. */
export function buildAuditPrompt(template: string | null | undefined, data: AppData, tz: string, today: DateStr): string {
  const t = (template ?? '').trim() || DEFAULT_AUDIT_PROMPT;
  const date = `${fmtDate(today, 'long')}, ${today.slice(0, 4)}`;
  const dump = plannerListing(data, tz, today);
  if (t.includes('[PLANNER DUMP]')) return `${t.split('[DATE]').join(date).split('[PLANNER DUMP]').join(dump)}\n`;
  return `${t}\n\nMY PLANNER (as of ${date}, open items only):\n${dump}\n`;
}

export type AuditStatus = 'new' | 'changed' | 'missing' | 'grade' | 'overdue' | 'announce' | 'schedule' | 'same' | 'note';
export type AuditPrefix = 'ENG105-PENDING' | 'OLD-SECTION';

export interface AuditParse {
  mentions: Mention[];
  /** Lines that said nothing changed. */
  same: number;
  /** Lines that could not be read; also carried into the mentions as notes so nothing is lost. */
  unread: string[];
  allMatch: boolean;
  /** The count Claude reported after END OF FINDINGS, when it did. */
  reported: number | null;
}

const STATUS: Record<string, AuditStatus> = {
  new: 'new',
  added: 'new',
  changed: 'changed',
  moved: 'changed',
  different: 'changed',
  missing: 'missing',
  removed: 'missing',
  gone: 'missing',
  grade: 'grade',
  graded: 'grade',
  score: 'grade',
  scored: 'grade',
  overdue: 'overdue',
  late: 'overdue',
  announce: 'announce',
  announcement: 'announce',
  announced: 'announce',
  schedule: 'schedule',
  same: 'same',
  ok: 'same',
  unchanged: 'same',
  match: 'same',
};
const KIND: Record<AuditStatus, MentionKind> = { new: 'new', changed: 'date_change', announce: 'date_change', missing: 'cancel', grade: 'grade', overdue: 'info', schedule: 'info', same: 'info', note: 'info' };
const PREFIX = /^(ENG105-PENDING|OLD-SECTION)\b\s*[|:\-–]?\s*/i;
const PREFIX_COURSE: Record<AuditPrefix, string> = { 'ENG105-PENDING': 'ENG-105', 'OLD-SECTION': 'ESG-162' };

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

const courseByCode = (code: string, courses: Course[]): Course | null => {
  const n = normCode(code);
  return n ? (courses.find((c) => normCode(c.code) === n) ?? null) : null;
};

/**
 * Claude's answer → mentions for the review screen, one per finding, each tagged with its status and any prefix.
 * Pipe lines are read exactly; other lines go through the quick-capture parser; whatever is left becomes a note
 * rather than being dropped.
 */
export function parseAuditResults(text: string, courses: Course[], today: DateStr): AuditParse {
  const out: AuditParse = { mentions: [], same: 0, unread: [], allMatch: false, reported: null };
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s\-*•]+|^\d+[.)]\s+/g, '').trim())
    .filter(Boolean);
  let n = 0;
  const note = (line: string) => {
    out.unread.push(line);
    out.mentions.push({ id: `a${++n}`, quote: line, kind: 'info', title: line.slice(0, 80), date: null, time: null, points: null, score: null, confidence: 'low', itemId: null, courseId: null, audit: { status: 'note', prefix: null } });
  };
  for (const raw of lines) {
    if (/^all match\b/i.test(raw)) {
      out.allMatch = true;
      continue;
    }
    const end = /^end of findings\b[^\d]*(\d+)?/i.exec(raw);
    if (end) {
      if (end[1]) out.reported = Number(end[1]);
      continue;
    }
    if (/^class\s*\|\s*title/i.test(raw)) continue;
    let line = raw;
    let prefix: AuditPrefix | null = null;
    const pm = PREFIX.exec(line);
    if (pm) {
      prefix = pm[1].toUpperCase() as AuditPrefix;
      line = line.slice(pm[0].length).trim();
    }
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length >= 3) {
      const [cls, title, statusWord, due = '', noteText = ''] = parts;
      const status = STATUS[statusWord.toLowerCase().replace(/[^a-z]/g, '')];
      if (!status || !title) {
        note(raw);
        continue;
      }
      if (status === 'same') {
        out.same++;
        continue;
      }
      // The CLASS column is a code. A code that is not in the planner stays unmatched; only a class named in words gets guessed.
      const course = courseByCode(cls, courses) ?? (/[A-Z]{2,4}-?\d{3}/i.test(cls) ? null : guessCourse(cls, courses)) ?? (prefix ? courseByCode(PREFIX_COURSE[prefix], courses) : null);
      const { date, time } = readDue(due);
      const frac = /(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(noteText) ?? /(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(due);
      const pts = /(\d+(?:\.\d+)?)\s*pts?\b/i.exec(noteText) ?? /(\d+(?:\.\d+)?)\s*pts?\b/i.exec(due);
      out.mentions.push({
        id: `a${++n}`,
        quote: raw,
        kind: KIND[status],
        title,
        date,
        time,
        points: frac ? Number(frac[2]) : pts ? Number(pts[1]) : null,
        score: status === 'grade' && frac ? Number(frac[1]) : null,
        confidence: course && (date || status === 'missing' || status === 'grade') ? 'high' : 'medium',
        itemId: null,
        courseId: course?.id ?? null,
        audit: { status, prefix },
      });
      continue;
    }
    // A two-part line is a class plus a remark ("CHM-113L | page failed to load"), never a finding.
    if (parts.length === 2 || /\b(fail|failed|couldn.t|can.t reach|unable|didn.t load|not load|error)\b/i.test(line)) {
      note(raw);
      continue;
    }
    const cap = parseCapture(line, courses, today);
    if (!cap.mention.date && cap.mention.kind !== 'cancel') {
      note(raw);
      continue;
    }
    out.mentions.push({ ...cap.mention, id: `a${++n}`, courseId: cap.courseId, audit: { status: cap.mention.kind === 'cancel' ? 'missing' : cap.mention.kind === 'date_change' ? 'changed' : 'new', prefix } });
  }
  return out;
}
