import { guessCourse, parseCapture } from '../capture/parse';
import { dateOf, fmtDate } from '../domain/dates';
import type { AppData, Course, DateStr, Item } from '../domain/types';
import type { Mention, MentionKind } from '../record/notes';
import { normCode } from './normalize';

export const HALO_URL = 'https://halo.gcu.edu/';

/** The audit prompt, verbatim as given. [CLASS], [DATE], and [PLANNER DUMP FOR THAT CLASS] are filled in when it is copied. */
export const DEFAULT_AUDIT_PROMPT = `Audit ONE class in my GCU Halo account. Exhaustively. Every nook and
cranny. Do not touch my other classes.

I am doing this because I don't fully trust my planner yet and I keep
re-checking Halo by hand. A shallow pass is worse than useless — it
gives me false confidence. If you are not certain you have opened
everything, say so rather than telling me it's fine.

READ ONLY. Do not submit anything, start a quiz or exam, post a
discussion, or click any button that changes state. Navigate and read
only.

=== PHASE 1: ENUMERATE BEFORE YOU READ ===
Before reporting a single finding, list every page in this class you
intend to visit:
- Every topic/module, by name — all of them, not just current or
  upcoming ones
- The gradebook
- Announcements — all of them, including old ones. Scroll and paginate
  to the very beginning.
- Syllabus
- Course materials / resources
- The class home page
- The class calendar, if the class has its own
- Every other tab, drawer, link, or section in the class navigation,
  including any you don't recognize

Print this first as: COVERAGE PLAN — n pages

=== PHASE 2: VISIT EVERY ONE ===
Work the list in order. On each page:
- Open it. Expand every collapsed section, accordion, "show more",
  "view details", and anything hidden behind a toggle.
- Open every attached PDF, Word doc, spreadsheet, or file and READ IT.
  Rubrics, instruction sheets, and lab handouts routinely contain dates
  and requirements the topic page does not show. This is where things
  hide.
- Open every assignment's full detail page, not just the list entry.
- Record due date, due time, points, submission status, and whether
  Halo flags it late or missing.
- Read the full text of every announcement, not the preview.
- Follow every link to a sub-page and read that too.
- Check for items with no due date, items due at unusual times, and
  items that appear in one place but not another.

After each page print: VISITED — [page name] — [n items found]

=== PHASE 3: REPORT ===
One line per finding, nothing else:
CLASS | TITLE | STATUS | DUE | NOTE

STATUS is one of:
  new      — in Halo, not in my list
  changed  — different due date or points
  missing  — in my list, not in Halo
  grade    — a posted score
  overdue  — Halo flags it late, missing, or reassigned
  announce — a deadline change mentioned in an announcement
  schedule — class meeting days or times differ
  rubric   — a date or requirement found inside an attached file

DUE is YYYY-MM-DD HH:MM in 24-hour Phoenix time, or blank.
NOTE is short: the old date, the points, the score ("14/20"), or which
file it came from.

Use the class code from my planner. Skip participation and attendance
items — those are just showing up to class.

=== PHASE 4: PROVE COVERAGE ===
End with:
COVERAGE — visited x of n pages
Name every page you skipped and why. Never silently skip one.
Then one of:
  ALL MATCH
  END OF FINDINGS — n items

=== RULES ===
- Never summarize. Never say "everything looks fine" without the
  coverage count behind it.
- If you are unsure whether something is a difference, REPORT IT. False
  positives cost me ten seconds. A miss costs me a grade.
- If a page fails to load, say so on its own line and keep going.
- If you run out of room before finishing, stop and say exactly where
  you stopped so I can resume there. Do not skip ahead to a summary.

CLASS TO AUDIT: [CLASS]

MY PLANNER for that class (as of [DATE]):
[PLANNER DUMP FOR THAT CLASS]`;

function fmtTime24(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso));
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hh === '24' ? '00' : hh}:${mm}`;
}

/** Items the audit can refer to: open, not participation, not yet past. One class when asked. */
export const openItemsFor = (data: AppData, tz: string, today: DateStr, courseId?: string | null): Item[] =>
  data.items.filter((i) => i.status !== 'done' && i.type !== 'participation' && dateOf(i.dueAt, tz) >= today && (!courseId || i.courseId === courseId));

/** Open items as plain lines Claude can compare against: one class flat, or every class grouped. */
export function plannerListing(data: AppData, tz: string, today: DateStr, courseId?: string | null): string {
  const byCourse = new Map(data.courses.map((c) => [c.id, c]));
  const open = openItemsFor(data, tz, today, courseId).sort((a, b) => (byCourse.get(a.courseId)?.code ?? '').localeCompare(byCourse.get(b.courseId)?.code ?? '') || a.dueAt.localeCompare(b.dueAt));
  const line = (i: Item) => `${byCourse.get(i.courseId)?.code ?? '?'} | ${i.title} | ${dateOf(i.dueAt, tz)} ${fmtTime24(i.dueAt, tz)} | ${i.points} pts`;
  if (courseId) return open.length ? open.map(line).join('\n') : '(no open items in my planner for this class)';
  const lines: string[] = [];
  let last = '';
  for (const i of open) {
    const c = byCourse.get(i.courseId);
    const code = c?.code ?? '?';
    if (code !== last) {
      lines.push(`\n${code} ${c?.name ?? ''}`.trimEnd());
      last = code;
    }
    lines.push(line(i));
  }
  return lines.join('\n').trim();
}

/** The full text that goes on the clipboard for one class: the template with its three slots filled in. */
export function buildAuditPrompt(template: string | null | undefined, data: AppData, tz: string, today: DateStr, course?: Course | null): string {
  const t = (template ?? '').trim() || DEFAULT_AUDIT_PROMPT;
  const date = `${fmtDate(today, 'long')}, ${today.slice(0, 4)}`;
  const cls = course ? `${course.code} ${course.name}`.trim() : 'all classes';
  const dump = plannerListing(data, tz, today, course?.id);
  const filled = t.split('[CLASS]').join(cls).split('[DATE]').join(date).split('[PLANNER DUMP FOR THAT CLASS]').join(dump).split('[PLANNER DUMP]').join(dump);
  if (t.includes('[PLANNER DUMP FOR THAT CLASS]') || t.includes('[PLANNER DUMP]')) return `${filled}\n`;
  return course ? `${filled}\n\nCLASS TO AUDIT: ${cls}\n\nMY PLANNER for that class (as of ${date}):\n${dump}\n` : `${filled}\n\nMY PLANNER (as of ${date}, open items only):\n${dump}\n`;
}

export type AuditStatus = 'new' | 'changed' | 'missing' | 'grade' | 'overdue' | 'announce' | 'schedule' | 'rubric' | 'same' | 'note';
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
  /** COVERAGE PLAN — n pages. */
  plan: number | null;
  /** Pages named in the plan before any page was visited. */
  planPages: string[];
  /** VISITED — page — n items found, in order. */
  visited: { page: string; items: number | null }[];
  /** COVERAGE — visited x of n pages. */
  coverage: { visited: number; planned: number } | null;
  /** Pages Claude said it skipped, with its reason. */
  skipped: string[];
  /** Pages that failed to load. */
  failed: string[];
  /** Where Claude said it ran out of room, when it did. */
  stoppedAt: string | null;
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
  reassigned: 'overdue',
  announce: 'announce',
  announcement: 'announce',
  announced: 'announce',
  schedule: 'schedule',
  rubric: 'rubric',
  file: 'rubric',
  attachment: 'rubric',
  same: 'same',
  ok: 'same',
  unchanged: 'same',
  match: 'same',
};
const KIND: Record<AuditStatus, MentionKind> = { new: 'new', changed: 'date_change', announce: 'date_change', missing: 'cancel', grade: 'grade', overdue: 'info', schedule: 'info', rubric: 'info', same: 'info', note: 'info' };
const PREFIX = /^(ENG105-PENDING|OLD-SECTION)\b\s*[|:\-–]?\s*/i;
const PREFIX_COURSE: Record<AuditPrefix, string> = { 'ENG105-PENDING': 'ENG-105', 'OLD-SECTION': 'ESG-162' };
const DASH = /\s*[—–\-:]+\s*/;
const FAILED = /\b(fail|failed|couldn.t|can.t reach|unable|didn.t load|not load|error 4\d\d|error)\b/i;
const STOPPED = /\b(ran out of room|out of room|stopped at|stopping here|resume (from|at|here)|stopped before)\b/i;
const SKIPPED = /^(skipped|not visited|did not visit|could not visit|unvisited)\b/i;

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
 * Claude's answer → findings for the review screen plus the coverage proof. Pipe lines are read exactly; the plan,
 * VISITED, and COVERAGE lines are read as such; anything else becomes a note rather than being dropped.
 */
export function parseAuditResults(text: string, courses: Course[], today: DateStr, audited?: Course | null): AuditParse {
  const out: AuditParse = { mentions: [], same: 0, unread: [], allMatch: false, reported: null, plan: null, planPages: [], visited: [], coverage: null, skipped: [], failed: [], stoppedAt: null };
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s\-*•]+|^\d+[.)]\s+/g, '').trim())
    .filter(Boolean);
  let n = 0;
  let phase: 'plan' | 'visit' | 'after' = 'plan';
  const note = (line: string) => {
    out.unread.push(line);
    out.mentions.push({ id: `a${++n}`, quote: line, kind: 'info', title: line.slice(0, 80), date: null, time: null, points: null, score: null, confidence: 'low', itemId: null, courseId: audited?.id ?? null, audit: { status: 'note', prefix: null } });
  };
  for (const raw of lines) {
    if (/^all match\b/i.test(raw)) {
      out.allMatch = true;
      phase = 'after';
      continue;
    }
    const end = /^end of findings\b[^\d]*(\d+)?/i.exec(raw);
    if (end) {
      if (end[1]) out.reported = Number(end[1]);
      phase = 'after';
      continue;
    }
    const plan = /^coverage plan\b[^\d]*(\d+)/i.exec(raw);
    if (plan) {
      out.plan = Number(plan[1]);
      continue;
    }
    const cov = /^coverage\b[^\d]*(\d+)\s*(?:of|\/)\s*(\d+)/i.exec(raw);
    if (cov) {
      out.coverage = { visited: Number(cov[1]), planned: Number(cov[2]) };
      phase = 'after';
      continue;
    }
    const vis = /^visited\b/i.exec(raw);
    if (vis) {
      const rest = raw.slice(vis[0].length).replace(/^\s*[—–\-:]+\s*/, '');
      const parts = rest.split(DASH).map((p) => p.trim()).filter(Boolean);
      const count = /(\d+)\s*items?/i.exec(rest);
      const page = (count ? parts.filter((p) => !/^\d+\s*items?/i.test(p)).join(' — ') : rest).replace(/^\[|\]$/g, '').trim();
      out.visited.push({ page: page || rest, items: count ? Number(count[1]) : null });
      phase = 'visit';
      continue;
    }
    if (/^class\s*\|\s*title/i.test(raw)) continue;
    if (/^(=== )?phase \d/i.test(raw) || /^(=== )?rules/i.test(raw)) continue;
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
      // The CLASS column is a code. A code not in the planner stays unmatched; a class named in words gets guessed; one-class audits default to that class.
      const course = courseByCode(cls, courses) ?? (/[A-Z]{2,4}-?\d{3}/i.test(cls) ? null : guessCourse(cls, courses)) ?? (prefix ? courseByCode(PREFIX_COURSE[prefix], courses) : null) ?? audited ?? null;
      const { date, time } = readDue(due);
      const frac = /(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(noteText) ?? /(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(due);
      const pts = /(\d+(?:\.\d+)?)\s*pts?\b/i.exec(noteText) ?? /(\d+(?:\.\d+)?)\s*pts?\b/i.exec(due);
      const kind: MentionKind = status === 'rubric' ? (date ? 'date_change' : 'info') : KIND[status];
      out.mentions.push({
        id: `a${++n}`,
        quote: raw,
        kind,
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
      phase = 'visit';
      continue;
    }
    if (STOPPED.test(line)) {
      out.stoppedAt = out.stoppedAt ?? line;
      note(raw);
      continue;
    }
    if (SKIPPED.test(line)) {
      out.skipped.push(line.replace(SKIPPED, '').replace(/^\s*[—–\-:]+\s*/, '').trim() || line);
      continue;
    }
    // A two-part line is a page plus a remark ("CHM-113L | page failed to load"), never a finding.
    if (parts.length === 2 || FAILED.test(line)) {
      out.failed.push(line);
      note(raw);
      continue;
    }
    if (phase === 'after') {
      out.skipped.push(line);
      continue;
    }
    if (phase === 'plan') {
      out.planPages.push(line);
      continue;
    }
    const cap = parseCapture(line, courses, today);
    if (!cap.mention.date && cap.mention.kind !== 'cancel') {
      note(raw);
      continue;
    }
    out.mentions.push({ ...cap.mention, id: `a${++n}`, courseId: cap.courseId ?? audited?.id ?? null, audit: { status: cap.mention.kind === 'cancel' ? 'missing' : cap.mention.kind === 'date_change' ? 'changed' : 'new', prefix } });
  }
  if (out.plan === null && out.planPages.length > 0 && out.visited.length > 0) out.plan = out.planPages.length;
  return out;
}

export interface CheckOutcome {
  /** ALL MATCH with every planned page visited. */
  clean: boolean;
  /** Coverage fell short: no coverage count, fewer pages than planned, pages skipped, or the run stopped early. */
  partial: boolean;
  findings: number;
  coverage: { visited: number; planned: number } | null;
  skipped: string[];
  /** One line saying why, for the paste box and the history. */
  reason: string;
}

/** What a pasted result is worth: clean only with proof of full coverage; otherwise partial, with the gaps named. */
export function classifyCheck(p: AuditParse): CheckOutcome {
  const findings = p.mentions.filter((m) => m.audit?.status !== 'note').length;
  const cov = p.coverage;
  const short = cov ? cov.visited < cov.planned || (p.plan !== null && cov.planned < p.plan) : true;
  const skipped = [...p.skipped, ...p.failed.filter((f) => !p.skipped.includes(f))];
  const partial = short || skipped.length > 0 || p.stoppedAt !== null;
  const clean = p.allMatch && findings === 0 && !partial;
  let reason: string;
  if (!cov) reason = p.stoppedAt ? `Stopped early: ${p.stoppedAt}` : 'No coverage count, so this cannot count as a full check.';
  else if (short) reason = `Visited ${cov.visited} of ${cov.planned} pages${p.plan !== null && cov.planned < p.plan ? ` (planned ${p.plan})` : ''}.`;
  else if (skipped.length) reason = `All ${cov.planned} pages counted, but ${skipped.length} named as skipped or failed.`;
  else if (p.stoppedAt) reason = `Stopped early: ${p.stoppedAt}`;
  else reason = `Every one of ${cov.planned} planned pages visited.`;
  return { clean, partial, findings, coverage: cov, skipped, reason };
}
