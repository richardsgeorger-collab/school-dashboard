import { dateOf, fmtDate } from '../domain/dates';
import type { AppData, Course, DateStr, Item } from '../domain/types';
import type { Mention, MentionKind } from '../record/notes';
import { CONTENT, isNoiseLine, isPageNameLine } from './noise';
import { normCode, resolveCourse } from './normalize';

export const HALO_URL = 'https://halo.gcu.edu/';

/**
 * The audit prompt: every class, one at a time, each to full depth. [CLASS LIST], [RESUME], [DATE], and
 * [PLANNER DUMP BY CLASS] are filled in when it is copied. A single-class audit is the same prompt with one class listed.
 */
export const DEFAULT_AUDIT_PROMPT = `Audit my GCU Halo account, one class at a time. Exhaustively. Every nook
and cranny of each class. Finish one class completely — plan, visit,
report, prove coverage — before you start the next. Never batch classes
into one pass; that is exactly what produces a shallow audit.

I am doing this because I don't fully trust my planner yet and I keep
re-checking Halo by hand. A shallow pass is worse than useless — it
gives me false confidence. If you are not certain you have opened
everything, say so rather than telling me it's fine.

READ ONLY. Do not submit anything, start a quiz or exam, post a
discussion, or click any button that changes state. Navigate and read
only.

CLASSES TO AUDIT, in this order:
[CLASS LIST]
[RESUME]
FOR EACH CLASS, in that order, print a header line first:
=== CLASS: [class code] ===
then do all four phases for that class before touching the next one.

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

Print this first as: COVERAGE PLAN — [class code] — n pages

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

Prose between sections is fine, but every finding must be one
pipe-delimited row in the format above, and every class must end with
its COVERAGE line.

You may skip these seven generic GCU pages by name, and skipping them
does NOT count against coverage (they are identical in every class and
hold no dates): Mission Statement, Doctrinal Statement, Library,
Student Success Center, Student AI Resources, Learning Support,
Classroom Policies.

=== PHASE 4: PROVE COVERAGE ===
End the class with:
COVERAGE — [class code] — visited x of n pages
Name every page you skipped and why. Never silently skip one.
Then move to the next class and start its Phase 1.

=== AFTER THE LAST CLASS ===
FINAL COVERAGE
One line per class: [class code] — visited x of n pages — clean or
n findings
Then one of:
  ALL MATCH
  END OF FINDINGS — n items

=== RULES ===
- Never summarize. Never say "everything looks fine" without the
  coverage count behind it.
- If you are unsure whether something is a difference, REPORT IT. False
  positives cost me ten seconds. A miss costs me a grade.
- If a page fails to load, say so on its own line and keep going.
- If you run out of room before finishing, stop and print exactly where
  you stopped, as one line:
  STOPPED — [class code] — [page name]
  Do not skip ahead to a summary or to the next class.

MY PLANNER (as of [DATE]), open items by class:
[PLANNER DUMP BY CLASS]`;

function fmtTime24(iso: string, tz: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso));
  const hh = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const mm = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return `${hh === '24' ? '00' : hh}:${mm}`;
}

/** Items the audit can refer to: open, not participation, not yet past. One class when asked. */
export const openItemsFor = (data: AppData, tz: string, today: DateStr, courseId?: string | null): Item[] =>
  data.items.filter((i) => i.status !== 'done' && i.type !== 'participation' && dateOf(i.dueAt, tz) >= today && (!courseId || i.courseId === courseId));

const itemLine = (i: Item, code: string, tz: string) => `${code} | ${i.title} | ${dateOf(i.dueAt, tz)} ${fmtTime24(i.dueAt, tz)} | ${i.points} pts`;

/** Open items as plain lines Claude can compare against: one class flat, or every class grouped. */
export function plannerListing(data: AppData, tz: string, today: DateStr, courseId?: string | null): string {
  const byCourse = new Map(data.courses.map((c) => [c.id, c]));
  const open = openItemsFor(data, tz, today, courseId).sort((a, b) => (byCourse.get(a.courseId)?.code ?? '').localeCompare(byCourse.get(b.courseId)?.code ?? '') || a.dueAt.localeCompare(b.dueAt));
  if (courseId) return open.length ? open.map((i) => itemLine(i, byCourse.get(i.courseId)?.code ?? '?', tz)).join('\n') : '(no open items in my planner for this class)';
  const lines: string[] = [];
  let last = '';
  for (const i of open) {
    const c = byCourse.get(i.courseId);
    const code = c?.code ?? '?';
    if (code !== last) {
      lines.push(`\n${code} ${c?.name ?? ''}`.trimEnd());
      last = code;
    }
    lines.push(itemLine(i, code, tz));
  }
  return lines.join('\n').trim();
}

/** The planner dump for a set of classes, each under its own heading, in the audit order. */
export function plannerByClass(data: AppData, tz: string, today: DateStr, courses: Course[]): string {
  return courses.map((c) => `${c.code} ${c.name}`.trim() + '\n' + plannerListing(data, tz, today, c.id)).join('\n\n');
}

export interface PromptOptions {
  /** Where an earlier run stopped, when this prompt picks up from there. */
  resumeFrom?: string | null;
}

/** The full text that goes on the clipboard: the template with the class list, date, and per-class planner filled in. */
export function buildAuditPrompt(template: string | null | undefined, data: AppData, tz: string, today: DateStr, courses: Course[], opts: PromptOptions = {}): string {
  const t = (template ?? '').trim() || DEFAULT_AUDIT_PROMPT;
  const date = `${fmtDate(today, 'long')}, ${today.slice(0, 4)}`;
  const list = courses.length ? courses.map((c, i) => `${i + 1}. ${c.code} ${c.name}`.trim()).join('\n') : '(no classes)';
  const resume = opts.resumeFrom ? `RESUMING: an earlier run stopped at ${opts.resumeFrom}. Start again from the first class above, from its Phase 1; anything printed for it before is discarded.\n` : '';
  const dump = plannerByClass(data, tz, today, courses);
  const filled = t
    .split('[CLASS LIST]')
    .join(list)
    .split('[RESUME]\n')
    .join(resume)
    .split('[RESUME]')
    .join(resume.trimEnd())
    .split('[CLASS]')
    .join(courses.map((c) => `${c.code} ${c.name}`.trim()).join(', ') || '(no classes)')
    .split('[DATE]')
    .join(date)
    .split('[PLANNER DUMP BY CLASS]')
    .join(dump)
    .split('[PLANNER DUMP FOR THAT CLASS]')
    .join(dump)
    .split('[PLANNER DUMP]')
    .join(dump);
  if (/\[PLANNER DUMP( BY CLASS| FOR THAT CLASS)?\]/.test(t)) return `${filled}\n`;
  return `${filled}\n\nCLASSES TO AUDIT, in this order:\n${list}\n${resume}\nMY PLANNER (as of ${date}), open items by class:\n${dump}\n`;
}

/** The seven generic GCU pages every class carries; skipping them never counts against coverage and they are never shown. */
export const GENERIC_PAGES = ['Mission Statement', 'Doctrinal Statement', 'Library', 'Student Success Center', 'Student AI Resources', 'Learning Support', 'Classroom Policies'];
const GENERIC_KEYS = GENERIC_PAGES.map((p) => p.toLowerCase());
export const isGenericPage = (name: string): boolean => {
  const n = name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (/\b(generic|institution resources|university wide|gcu wide|same 7|same seven)\b/.test(n)) return true;
  return GENERIC_KEYS.some((k) => n === k || n.startsWith(`${k} `) || n.startsWith(`${k}:`) || (k !== 'library' && n.includes(k)) || (k === 'library' && /^library\b/.test(n)));
};
/** How many whitelisted pages a set of skip notes accounts for: the distinct names found, or all seven when the note only says "the generic ones". */
export function genericAllowance(notes: string[]): number {
  const text = notes.join(' \n ').toLowerCase();
  const named = GENERIC_KEYS.filter((k) => text.includes(k)).length;
  const vague = notes.some((n) => /\b(generic|institution resources|university-wide|gcu-wide|same 7|same seven)\b/i.test(n));
  return Math.max(named, vague ? GENERIC_PAGES.length : 0);
}

export type AuditStatus = 'new' | 'changed' | 'missing' | 'grade' | 'overdue' | 'announce' | 'schedule' | 'rubric' | 'same' | 'note';
export type AuditPrefix = 'ENG105-PENDING' | 'OLD-SECTION';

/** What one class's section of the transcript proved. */
export interface ClassCoverage {
  courseId: string;
  plan: number | null;
  planPages: string[];
  visited: { page: string; items: number | null }[];
  coverage: { visited: number; planned: number } | null;
  skipped: string[];
  failed: string[];
  stoppedAt: string | null;
  /** What the FINAL COVERAGE line said for this class, when there was one. */
  verdict: string | null;
  /** The finding count that line gave, when it gave one ("clean" is 0). */
  reportedFindings: number | null;
  /** How many of the seven whitelisted GCU pages the plan listed. */
  genericPlanned: number;
  /** Where the coverage numbers came from: the class's own COVERAGE line (authoritative) or only the FINAL block. */
  coverageFrom: 'class' | 'final' | null;
  /** Any header, plan, visit, coverage, or finding was seen for this class. */
  reached: boolean;
}

export interface AuditParse {
  mentions: Mention[];
  /** Lines that said nothing changed. */
  same: number;
  /** Lines that could not be read; also carried into the mentions as notes so nothing is lost. */
  unread: string[];
  allMatch: boolean;
  /** The count Claude reported after END OF FINDINGS, when it did. */
  reported: number | null;
  /** Coverage per class, keyed by course id; '' holds anything that named no class. */
  classes: Record<string, ClassCoverage>;
  /** Classes in the order the transcript reached them. */
  order: string[];
  /** Where Claude said it ran out of room, when it did. */
  stopped: { courseId: string | null; page: string } | null;
  /** Who read the paste: the model, or the pipe-row fallback. */
  source: 'claude' | 'pipes';
  /** The transcript said, somewhere, that the generic GCU pages were the ones skipped. */
  genericSkipNote: boolean;
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
/** The review kind a status maps to; a rubric finding with a date is a date change. */
export const auditStatusKind = (status: AuditStatus, date: string | null): MentionKind => (status === 'rubric' ? (date ? 'date_change' : 'info') : KIND[status]);
const PREFIX = /^(ENG105-PENDING|OLD-SECTION)\b\s*[|:\-–]?\s*/i;
const PREFIX_COURSE: Record<AuditPrefix, string> = { 'ENG105-PENDING': 'ENG-105', 'OLD-SECTION': 'ESG-162' };
const CODE = /\b([A-Z]{2,4}-?\d{3}[A-Z]?)\b/i;
const DASH = /\s*[—–\-:]+\s*/;
const FAILED = /\b(fail|failed|couldn.t|can.t reach|unable|didn.t load|not load|error 4\d\d|error)\b/i;
const STOPPED_LOOSE = /\b(ran out of room|out of room|stopped at|stopping here|resume (from|at|here)|stopped before)\b/i;
const SKIPPED = /^\(?(skipped|skipping|not visited|did not visit|could not visit|unvisited)\b/i;
const NOT_A_FAILURE = /\bno (page|pages|failures?|errors?|links?)\b[^.]{0,20}\b(failed|fail|error)\b|^\(?no (page|pages|failures?|errors?|links?)\b/i;
const HEADER = /^(?:=+\s*)?(?:class\s*:\s*|#+\s*)?([A-Z]{2,4}-?\d{3}[A-Z]?)\b\s*([^=|]*?)\s*(?:=+)?\s*$/i;

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

const courseByCode = (code: string, courses: Course[]): Course | null => (normCode(code) ? resolveCourse(code, courses) : null);
const codeIn = (s: string, courses: Course[]): Course | null => {
  const m = CODE.exec(s);
  return m ? courseByCode(m[1], courses) : null;
};

const blank = (courseId: string): ClassCoverage => ({ courseId, plan: null, planPages: [], visited: [], coverage: null, skipped: [], failed: [], stoppedAt: null, verdict: null, reportedFindings: null, genericPlanned: 0, coverageFrom: null, reached: false });

/** How many of the seven whitelisted pages a list of page names carries. */
export function countGenericPages(pages: string[]): number {
  const text = pages.join(' \n ').toLowerCase();
  return GENERIC_KEYS.filter((k) => text.includes(k)).length;
}

/** "3 findings" → 3, "clean" → 0, anything else → null. */
export function readVerdictCount(verdict: string | null): number | null {
  if (!verdict) return null;
  const m = /(\d+)\s*findings?/i.exec(verdict);
  if (m) return Number(m[1]);
  if (/\b(clean|no findings|all match|nothing)\b/i.test(verdict)) return 0;
  return null;
}

/**
 * Claude's answer → findings for the review screen plus per-class coverage proof. Pipe lines are read exactly; class
 * headers, plan, VISITED, COVERAGE, STOPPED, and FINAL COVERAGE lines are read as such; anything else becomes a note
 * rather than being dropped.
 */
export function parseAuditResults(text: string, courses: Course[], _today: DateStr, audited: Course[] = []): AuditParse {
  const out: AuditParse = { mentions: [], same: 0, unread: [], allMatch: false, reported: null, classes: {}, order: [], stopped: null, source: 'pipes', genericSkipNote: false };
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s\-*•]+|^\d+[.)]\s+/g, '').trim())
    .filter(Boolean);
  let n = 0;
  let phase: 'plan' | 'visit' | 'after' | 'final' | 'done' = 'plan';
  let current: string = audited.length === 1 ? audited[0].id : '';
  const section = (id: string, touch = true): ClassCoverage => {
    const key = id || '';
    if (!out.classes[key]) out.classes[key] = blank(key);
    if (touch && key) {
      out.classes[key].reached = true;
      if (!out.order.includes(key)) out.order.push(key);
    }
    return out.classes[key];
  };
  const enter = (c: Course) => {
    current = c.id;
    section(c.id);
    phase = 'plan';
  };
  const note = (line: string) => {
    out.unread.push(line);
    out.mentions.push({ id: `a${++n}`, quote: line, kind: 'info', title: line.slice(0, 80), date: null, time: null, points: null, score: null, confidence: 'low', itemId: null, courseId: current || audited[0]?.id || null, audit: { status: 'note', prefix: null } });
  };
  for (const raw of lines) {
    if (/^all match\b/i.test(raw)) {
      out.allMatch = true;
      phase = 'done';
      continue;
    }
    const end = /^end of findings\b[^\d]*(\d+)?/i.exec(raw);
    if (end) {
      if (end[1]) out.reported = Number(end[1]);
      phase = 'done';
      continue;
    }
    // "PHASE 3: REPORT — ESG-162L" is often the only header a class gets.
    const phaseHead = /^(?:=+\s*)?(?:phase\s*\d\b.*?|report\b\s*[—–\-:]*\s*)([A-Z]{2,4}-?\d{3}[A-Z]?)\b/i.exec(raw);
    if (phaseHead && !raw.includes('|')) {
      const named = courseByCode(phaseHead[1], courses);
      if (named && named.id !== current) enter(named);
      if (/phase\s*[34]|^report/i.test(raw)) phase = 'visit';
      continue;
    }
    if (/^final coverage\b/i.test(raw)) {
      phase = 'final';
      continue;
    }
    const plan = /^coverage plan\b(.*?)(\d+)\s*pages?/i.exec(raw) ?? /^coverage plan\b[^\d]*(\d+)()/i.exec(raw);
    if (plan) {
      const named = codeIn(plan[1] ?? '', courses);
      if (named) enter(named);
      const cc = section(current);
      cc.plan = Number(plan[2] || plan[1]);
      phase = 'plan';
      continue;
    }
    const cov = /^coverage\b(?!\s*plan)(.*?)(\d+)\s*(?:of|\/)\s*(\d+)/i.exec(raw);
    if (cov) {
      const named = codeIn(cov[1], courses);
      if (named && named.id !== current) enter(named);
      const cc = section(current);
      cc.coverage = { visited: Number(cov[2]), planned: Number(cov[3]) };
      cc.coverageFrom = 'class';
      phase = 'after';
      continue;
    }
    const stop = /^stopped\b\s*[—–\-:]*\s*(.*)$/i.exec(raw);
    if (stop) {
      const named = codeIn(stop[1], courses);
      const page = stop[1].replace(CODE, '').replace(/^\s*[—–\-:]+\s*/, '').trim() || stop[1].trim();
      if (named && named.id !== current) enter(named);
      const id = named?.id ?? current;
      if (id) section(id).stoppedAt = page;
      out.stopped = out.stopped ?? { courseId: id || null, page };
      continue;
    }
    if (phase === 'final') {
      const fc = /([A-Z]{2,4}-?\d{3}[A-Z]?)\b.*?(\d+)\s*(?:of|\/)\s*(\d+)\s*(?:pages?)?\s*[—–\-:]*\s*(.*)$/i.exec(raw);
      if (fc) {
        const c = courseByCode(fc[1], courses);
        if (c) {
          const cc = section(c.id);
          if (!cc.coverage) {
            cc.coverage = { visited: Number(fc[2]), planned: Number(fc[3]) };
            cc.coverageFrom = 'final';
          }
          cc.verdict = fc[4].trim() || null;
          cc.reportedFindings = readVerdictCount(cc.verdict);
        }
        continue;
      }
    }
    if (/\bskipp?(ed|ing)?\b/i.test(raw) && /\b(generic|institution resources|university-wide|gcu-wide)\b/i.test(raw)) out.genericSkipNote = true;
    if (isNoiseLine(raw)) continue;
    const vis = /^visited\b/i.exec(raw);
    if (vis) {
      const rest = raw.slice(vis[0].length).replace(/^\s*[—–\-:]+\s*/, '');
      const parts = rest.split(DASH).map((p) => p.trim()).filter(Boolean);
      const count = /(\d+)\s*items?/i.exec(rest);
      const page = (count ? parts.filter((p) => !/^\d+\s*items?/i.test(p)).join(' — ') : rest).replace(/^\[|\]$/g, '').trim();
      section(current).visited.push({ page: page || rest, items: count ? Number(count[1]) : null });
      phase = 'visit';
      continue;
    }
    if (!raw.includes('|')) {
      const head = HEADER.exec(raw);
      const named = head ? courseByCode(head[1], courses) : null;
      if (named && (/^(=|#|class\s*:)/i.test(raw) || !head![2] || normCode(head![2]) === normCode(named.name) || named.name.toLowerCase().startsWith(head![2].toLowerCase()))) {
        enter(named);
        continue;
      }
    }
    if (/^class\s*\|\s*title/i.test(raw)) continue;
    if (/^(=== )?phase \d/i.test(raw) || /^(=== )?(rules|after the last class)/i.test(raw)) continue;
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
      // The CLASS column is a code or a name, section suffixes ignored; otherwise the class whose section this is.
      const course = resolveCourse(cls, courses) ?? (prefix ? courseByCode(PREFIX_COURSE[prefix], courses) : null) ?? courses.find((c) => c.id === current) ?? audited[0] ?? null;
      if (course) section(course.id);
      const { date, time } = readDue(due);
      // A score fraction ("19.66/20"), never a date ("9/9", "9/10 12:55 PM").
      const fracOf = (s: string) => [...s.matchAll(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g)].find((f) => f[1].includes('.') || f[2].includes('.') || Number(f[1]) > 12 || Number(f[2]) > 31 || status === 'grade') ?? null;
      const frac = fracOf(noteText) ?? fracOf(due);
      const pts = /(\d+(?:\.\d+)?)\s*pts?\b/i.exec(noteText) ?? /(\d+(?:\.\d+)?)\s*pts?\b/i.exec(due);
      const kind: MentionKind = auditStatusKind(status, date);
      out.mentions.push({
        id: `a${++n}`,
        quote: raw,
        kind,
        title,
        date,
        time,
        points: pts ? Number(pts[1]) : frac ? Number(frac[2]) : null,
        score: status === 'grade' && frac ? Number(frac[1]) : null,
        confidence: course && (date || status === 'missing' || status === 'grade') ? 'high' : 'medium',
        itemId: null,
        courseId: course?.id ?? null,
        audit: { status, prefix },
        note: noteText || undefined,
      });
      if (phase !== 'after') phase = 'visit';
      continue;
    }
    if (STOPPED_LOOSE.test(line)) {
      const cc = section(current, false);
      cc.stoppedAt = cc.stoppedAt ?? line;
      out.stopped = out.stopped ?? { courseId: current || null, page: line };
      note(raw);
      continue;
    }
    if (SKIPPED.test(line)) {
      section(current, false).skipped.push(line.replace(SKIPPED, '').replace(/^\s*[—–\-:]+\s*/, '').replace(/\)$/, '').trim() || line);
      continue;
    }
    // A two-part line is a page plus a remark ("Syllabus | page failed to load"), never a finding.
    if (parts.length === 2 || (FAILED.test(line) && !NOT_A_FAILURE.test(line))) {
      section(current, false).failed.push(line);
      note(raw);
      continue;
    }
    if (phase === 'after' && isPageNameLine(line)) {
      section(current, false).skipped.push(line);
      continue;
    }
    if (phase === 'plan' && (isPageNameLine(line) || line.length < 60)) {
      section(current, false).planPages.push(line);
      continue;
    }
    // The fallback reads pipe rows only. Prose that carries a date, a point value, or a score is kept as a note so it
    // is not lost; prose without one is narration.
    if (CONTENT.test(line)) note(raw);
  }
  for (const cc of Object.values(out.classes)) {
    if (cc.plan === null && cc.planPages.length > 0 && cc.visited.length > 0) cc.plan = cc.planPages.length;
    cc.genericPlanned = countGenericPages(cc.planPages);
  }
  // Anything that named no class belongs to the only class audited.
  if (out.classes[''] && audited.length === 1) {
    const orphan = out.classes[''];
    const cc = section(audited[0].id);
    cc.plan = cc.plan ?? orphan.plan;
    cc.planPages.push(...orphan.planPages);
    cc.visited.push(...orphan.visited);
    if (!cc.coverage && orphan.coverage) {
      cc.coverage = orphan.coverage;
      cc.coverageFrom = orphan.coverageFrom;
    }
    cc.skipped.push(...orphan.skipped);
    cc.failed.push(...orphan.failed);
    cc.stoppedAt = cc.stoppedAt ?? orphan.stoppedAt;
    delete out.classes[''];
  }
  return out;
}

export interface CheckOutcome {
  /** ALL MATCH with every planned page visited. */
  clean: boolean;
  /** Every real page visited once the whitelisted ones are set aside, nothing skipped, not stopped. */
  coverageComplete: boolean;
  /** The audit's own count for this class is higher than the rows read: a report section is probably missing. */
  missingRows: boolean;
  /** Coverage fell short: no coverage count, fewer pages than planned, pages skipped, or the run stopped early. */
  partial: boolean;
  findings: number;
  coverage: { visited: number; planned: number } | null;
  skipped: string[];
  /** One line saying why, for the paste box and the history. */
  reason: string;
}

/** What one class's section is worth: clean only with proof of full coverage; otherwise partial, with the gaps named. */
export function classifyClass(cc: ClassCoverage, findings: number, allMatch: boolean, genericNote = false): CheckOutcome {
  const raw = cc.coverage;
  const named = [...cc.skipped, ...cc.failed.filter((f) => !cc.skipped.includes(f))];
  const skipped = named.filter((s) => !isGenericPage(s));
  // The whitelisted pages are set aside BEFORE the visited-of-planned comparison: they were never owed.
  const gap = raw ? Math.max(0, raw.planned - raw.visited) : 0;
  // A line whose planned count is smaller than the plan already left the generic pages out; nothing more to set aside.
  const lineCountsGeneric = cc.plan === null || raw === null || raw.planned >= cc.plan;
  const allowance = lineCountsGeneric ? Math.max(genericAllowance(named.filter(isGenericPage)), cc.genericPlanned, genericNote && gap <= GENERIC_PAGES.length ? gap : 0) : 0;
  const setAside = Math.min(allowance, gap);
  const cov = raw ? { visited: raw.visited, planned: raw.planned - setAside } : null;
  // The class's own COVERAGE line decides: x of x is complete, whatever the plan counted and whether or not a FINAL block
  // ever printed. Only a class with no line at all, or fewer visited than planned, is short.
  const own = cc.coverageFrom === 'class';
  const short = cov ? cov.visited < cov.planned : true;
  const missingRows = !own && cc.reportedFindings !== null && findings < cc.reportedFindings;
  const coverageComplete = !!cov && !short && skipped.length === 0 && (own || cc.stoppedAt === null);
  const partial = !coverageComplete || missingRows;
  const clean = (allMatch || findings === 0) && findings === 0 && !partial;
  let reason: string;
  if (cc.stoppedAt && !(own && cov && !short)) reason = `Stopped early at ${cc.stoppedAt}.`;
  else if (missingRows) reason = `The final summary counts ${cc.reportedFindings} finding${cc.reportedFindings === 1 ? '' : 's'} for this class, but only ${findings} ${findings === 1 ? 'was' : 'were'} read. Its report section may be missing from the paste.`;
  else if (!cov) reason = 'No coverage count, so this cannot count as a full check.';
  else if (short) reason = `Visited ${cov.visited} of ${cov.planned} pages.`;
  else if (skipped.length) reason = `All ${cov.planned} pages counted, but ${skipped.length} named as skipped or failed.`;
  else reason = `All ${cov.planned} pages visited.`;
  return { clean, coverageComplete, missingRows, partial, findings, coverage: cov, skipped, reason };
}

export interface ClassOutcome {
  course: Course;
  reached: boolean;
  outcome: CheckOutcome | null;
  findings: number;
}

/** One verdict per audited class, in the audit order. Classes the run never reached carry no outcome. */
export function auditOutcomes(parse: AuditParse, audited: Course[]): ClassOutcome[] {
  const count = (id: string) => parse.mentions.filter((m) => m.courseId === id && m.audit?.status !== 'note').length;
  const seen = new Set<string>();
  const list: Course[] = [...audited];
  for (const id of parse.order) if (!list.some((c) => c.id === id)) list.push({ id } as Course);
  return list
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .map((course) => {
      const cc = parse.classes[course.id];
      const findings = count(course.id);
      const reached = !!cc && (cc.reached || cc.coverage !== null) ? true : findings > 0;
      return { course, reached, findings, outcome: reached ? classifyClass(cc ?? blank(course.id), findings, parse.allMatch, parse.genericSkipNote) : null };
    });
}

/** The classes a resumed run still owes: from the one it stopped in (or the first unfinished one) to the end. */
export function remainingCourses(parse: AuditParse, audited: Course[]): Course[] {
  const done = (c: Course) => {
    const cc = parse.classes[c.id];
    return !!cc && cc.coverage !== null && cc.stoppedAt === null;
  };
  const stopIdx = parse.stopped?.courseId ? audited.findIndex((c) => c.id === parse.stopped!.courseId) : -1;
  if (stopIdx >= 0) return audited.slice(stopIdx);
  return audited.filter((c) => !done(c));
}

export interface BulkImport {
  course: Course;
  /** Mention ids of the new items. */
  ids: string[];
}

/** A class the audit lists many new items for while the planner holds almost nothing: one import, not many problems. */
export function bulkImports(parse: AuditParse, courses: Course[], openByCourse: (courseId: string) => number, min = 5): BulkImport[] {
  const out: BulkImport[] = [];
  for (const c of courses) {
    const mine = parse.mentions.filter((m) => m.courseId === c.id && m.audit?.status !== 'note');
    const fresh = mine.filter((m) => m.audit?.status === 'new' && m.date);
    if (fresh.length >= min && fresh.length >= mine.length * 0.8 && openByCourse(c.id) < fresh.length / 2) out.push({ course: c, ids: fresh.map((m) => m.id) });
  }
  return out;
}
