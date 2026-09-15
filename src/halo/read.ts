import type Anthropic from '@anthropic-ai/sdk';
import type { Course, DateStr } from '../domain/types';
import type { Mention, MentionKind } from '../record/notes';
import { auditStatusKind, type AuditParse, type AuditStatus, type ClassCoverage } from './audit';
import { resolveCourse } from './normalize';

/** Same model as the coach and the lecture pass. */
export const READ_MODEL = 'claude-sonnet-4-6';
const MAX_CHARS = 120_000;

const STATUSES = ['new', 'changed', 'missing', 'grade', 'overdue', 'announce', 'schedule', 'rubric', 'other'] as const;

export const READ_TOOL = {
  name: 'audit_findings',
  description: 'Everything an agent’s freeform Halo audit reported, as structured findings and per-class coverage.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['classes', 'findings', 'all_match', 'stopped', 'unread'],
    properties: {
      classes: {
        type: 'array',
        description: 'One entry per planner class the audit touched, in the order it reached them.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['code', 'planned_pages', 'visited_pages', 'coverage_visited', 'coverage_planned', 'skipped', 'stopped_at', 'notes'],
          properties: {
            code: { type: 'string', description: 'The planner class code exactly as listed, e.g. "ENG-105", never a section like "ENG-105-ONL4".' },
            planned_pages: { type: ['integer', 'null'], description: 'From the COVERAGE PLAN line, if any.' },
            visited_pages: { type: ['integer', 'null'], description: 'How many VISITED lines (or visited pages) the audit showed for this class.' },
            coverage_visited: { type: ['integer', 'null'], description: 'x from "COVERAGE — visited x of n pages" for this class, if stated.' },
            coverage_planned: { type: ['integer', 'null'], description: 'n from that line, if stated.' },
            skipped: { type: 'array', items: { type: 'string' }, description: 'Pages the audit said it skipped, failed to load, or could not reach, with the reason. Not the generic GCU pages it was told it may skip.' },
            stopped_at: { type: ['string', 'null'], description: 'The page where the audit said it ran out of room in this class, if it did.' },
            notes: { type: 'string', description: 'Anything else worth knowing about this class’s coverage, one short line, or empty.' },
          },
        },
      },
      findings: {
        type: 'array',
        description: 'Every difference the audit reported, one per row or prose statement. Never invent one; never drop one.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['class_code', 'title', 'status', 'due', 'points', 'score', 'note', 'confidence', 'quote', 'gates'],
          properties: {
            class_code: { type: 'string', description: 'The planner class code this belongs to.' },
            title: { type: 'string', description: 'The assignment, quiz, exam, discussion, or announcement title as Halo names it.' },
            status: { type: 'string', enum: [...STATUSES], description: 'new: in Halo, not in the planner. changed: different due date or points. missing: in the planner, not in Halo. grade: a posted score. overdue: Halo flags it late, missing, or reassigned. announce: a deadline change from an announcement. schedule: class meeting days or times differ. rubric: a date or requirement found inside an attached file. other: anything else worth the student’s eye.' },
            due: { type: ['string', 'null'], description: 'YYYY-MM-DD HH:MM in 24-hour Phoenix time when the finding names a due date or time, else null.' },
            points: { type: ['number', 'null'] },
            score: { type: ['number', 'null'], description: 'Points earned when a score is posted, e.g. 19.66 from "19.66/20".' },
            note: { type: 'string', description: 'The short note: the old date, which file, why. Empty when none.' },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'How sure you are that this is what the audit meant.' },
            quote: { type: 'string', description: 'The line or sentence of the paste this came from, verbatim.' },
            gates: { type: 'array', items: { type: 'string' }, description: 'Titles of other items this one must be done before (a topic claim that gates a presentation and an essay). Empty when none.' },
          },
        },
      },
      all_match: { type: 'boolean', description: 'True only if the audit ended by saying everything matched.' },
      stopped: { type: ['object', 'null'], additionalProperties: false, required: ['class_code', 'page'], properties: { class_code: { type: ['string', 'null'] }, page: { type: 'string' } }, description: 'Where the audit said it ran out of room, if it did.' },
      unread: { type: 'array', items: { type: 'string' }, description: 'Lines that look like they carry a finding or coverage fact but could not be structured. Tool noise, headers, and narration do not belong here.' },
    },
  },
} as const;

const SYSTEM = `You read the raw output of a browsing agent that audited a college student's Halo (GCU LMS) account against the student's planner. The output is freeform: headings vary, classes are named inconsistently (section suffixes like "ENG-105-ONL4", or names instead of codes), findings may be pipe-delimited rows or prose, tool narration like "Used Claude in Chrome (41 actions)" is interleaved, dashes vary, sections may be missing. Turn it into structured findings and per-class coverage.
Rules:
- Map every class reference to the planner code given. "ENG-105-ONL4", "ENG 105", and "English Composition" are all ENG-105. Never output a section suffix.
- One finding per reported difference, from rows and from prose alike. Keep the title as Halo names it. Never invent; never drop. A class the planner has no items for, where the audit lists many items as new, is still one finding per item.
- due is Phoenix local time, 24-hour. "9/20 11:59 PM" is 2026-09-20 23:59 when the audit is from fall 2026; use the audit's own dates.
- score: the earned points from "19.66/20"; points: the possible points.
- gates: when the audit says something must be done before other named items (a topic claim that gates a presentation and an essay), list those titles.
- Coverage: per class, the planned page count, visited count, the coverage line's x of n, skipped or failed pages, and where it stopped. If a class has no coverage line, leave those null.
- all_match only when the audit ended with ALL MATCH or clearly said nothing differed for every class.
- unread: only lines that seem to carry a finding or a coverage fact you could not structure. Leave narration and tool noise out.
Answer only through the audit_findings tool.`;

export interface ReadArgs {
  text: string;
  courses: Course[];
  /** The planner's open items for those classes, one line each, so titles can be recognized. */
  planner: string;
  today: DateStr;
}

export function buildReadPrompt({ text, courses, planner, today }: ReadArgs): { system: string; user: string } {
  const classes = courses.map((c) => `${c.code} — ${c.name}`).join('\n');
  const body = text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n[paste truncated]` : text;
  return { system: SYSTEM, user: `Today: ${today}\n\nPlanner classes (use these codes):\n${classes}\n\nPlanner, open items by class:\n${planner || '(none)'}\n\nAudit output, verbatim:\n${body}` };
}

const str = (v: unknown, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
const strs = (v: unknown, max = 30) => (Array.isArray(v) ? v.map((s) => str(s, 300)).filter(Boolean).slice(0, max) : []);

function readDue(s: string): { date: string | null; time: string | null } {
  const m = /(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(s);
  if (!m) return { date: null, time: null };
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${String(Number(m[4])).padStart(2, '0')}:${m[5]}` : null };
}

/** Whatever the model sent, shaped into the same parse the review and the receipts already read. Unknown classes are kept, unmatched. */
export function parseFromTool(raw: unknown, courses: Course[], audited: Course[] = []): AuditParse {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: AuditParse = { mentions: [], same: 0, unread: [], allMatch: o.all_match === true, reported: null, classes: {}, order: [], stopped: null, source: 'claude' };
  const section = (id: string): ClassCoverage => {
    if (!out.classes[id]) out.classes[id] = { courseId: id, plan: null, planPages: [], visited: [], coverage: null, skipped: [], failed: [], stoppedAt: null, verdict: null, reached: true };
    if (!out.order.includes(id)) out.order.push(id);
    return out.classes[id];
  };
  for (const c of Array.isArray(o.classes) ? o.classes : []) {
    const e = (c && typeof c === 'object' ? c : {}) as Record<string, unknown>;
    const course = resolveCourse(str(e.code), courses);
    if (!course) continue;
    const cc = section(course.id);
    cc.plan = int(e.planned_pages) ?? cc.plan;
    const visited = int(e.visited_pages);
    if (visited !== null && cc.visited.length === 0) cc.visited = Array.from({ length: visited }, (_, i) => ({ page: `page ${i + 1}`, items: null }));
    const cv = int(e.coverage_visited);
    const cp = int(e.coverage_planned);
    if (cv !== null && cp !== null) cc.coverage = { visited: cv, planned: cp };
    cc.skipped.push(...strs(e.skipped));
    const stoppedAt = str(e.stopped_at);
    if (stoppedAt) cc.stoppedAt = stoppedAt;
    const notes = str(e.notes);
    if (notes) cc.verdict = notes;
  }
  let n = 0;
  for (const f of Array.isArray(o.findings) ? o.findings : []) {
    const e = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>;
    const title = str(e.title, 200);
    if (!title) continue;
    const statusWord = str(e.status);
    const status: AuditStatus = (STATUSES as readonly string[]).includes(statusWord) ? (statusWord === 'other' ? 'note' : (statusWord as AuditStatus)) : 'note';
    const course = resolveCourse(str(e.class_code), courses) ?? (audited.length === 1 ? audited[0] : null);
    if (course) section(course.id);
    const { date, time } = readDue(str(e.due));
    const kind: MentionKind = auditStatusKind(status, date);
    const confidence = (['high', 'medium', 'low'] as const).find((x) => x === e.confidence) ?? 'medium';
    const quote = str(e.quote, 600) || `${str(e.class_code)} | ${title} | ${statusWord}${e.due ? ` | ${str(e.due)}` : ''}${str(e.note) ? ` | ${str(e.note)}` : ''}`;
    const mention: Mention = { id: `a${++n}`, quote, kind, title, date, time, points: num(e.points), score: status === 'grade' ? num(e.score) : null, confidence, itemId: null, courseId: course?.id ?? null, audit: { status, prefix: null }, note: str(e.note, 300) || undefined, gates: strs(e.gates, 6) };
    out.mentions.push(mention);
  }
  for (const line of strs(o.unread, 60)) {
    out.unread.push(line);
    out.mentions.push({ id: `a${++n}`, quote: line, kind: 'info', title: line.slice(0, 80), date: null, time: null, points: null, score: null, confidence: 'low', itemId: null, courseId: audited.length === 1 ? audited[0].id : null, audit: { status: 'note', prefix: null } });
  }
  const st = o.stopped && typeof o.stopped === 'object' ? (o.stopped as Record<string, unknown>) : null;
  if (st && str(st.page)) {
    const course = resolveCourse(str(st.class_code), courses);
    out.stopped = { courseId: course?.id ?? null, page: str(st.page) };
    if (course) section(course.id).stoppedAt = section(course.id).stoppedAt ?? str(st.page);
  }
  return out;
}

/** One call, the key from this browser, answered through the forced tool. Throws when the model does not answer. */
export async function readAudit(args: ReadArgs & { apiKey: string; audited?: Course[]; fetch?: typeof globalThis.fetch }): Promise<AuditParse> {
  const { default: AnthropicSdk } = await import('@anthropic-ai/sdk');
  const client = new AnthropicSdk({ apiKey: args.apiKey, dangerouslyAllowBrowser: true, maxRetries: args.fetch ? 0 : 1, ...(args.fetch ? { fetch: args.fetch } : {}) });
  const { system, user } = buildReadPrompt(args);
  const response = await client.messages.create({
    model: READ_MODEL,
    max_tokens: 12000,
    system,
    tools: [READ_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: READ_TOOL.name },
    messages: [{ role: 'user', content: user }],
  });
  const use = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!use) throw new Error('The model did not return findings.');
  return parseFromTool(use.input, args.courses, args.audited ?? []);
}

export type LineKind = 'finding' | 'coverage' | 'header' | 'noise' | 'unknown';

/** Each line of the paste labeled by whether the reader used it, for the "what was and wasn't recognized" view. */
export function markLines(text: string, parse: AuditParse): { line: string; kind: LineKind }[] {
  const quotes = parse.mentions.filter((m) => m.audit?.status !== 'note').map((m) => m.quote.toLowerCase().replace(/\s+/g, ' ').trim());
  return text
    .split(/\r?\n/)
    .map((raw) => {
      const line = raw.trim();
      const norm = line.toLowerCase().replace(/\s+/g, ' ');
      if (!line) return { line: raw, kind: 'noise' as LineKind };
      if (/^(used claude in chrome|clicked|navigated|scrolled|reading|opening|let me|i'll|i will|now (i|let)|next,)/i.test(line) || /\(\d+ actions?\)/i.test(line)) return { line: raw, kind: 'noise' };
      if (/^(=+\s*)?(class\s*:|phase \d|=== )/i.test(line) || /^#+\s/.test(line)) return { line: raw, kind: 'header' };
      if (/^(coverage|visited|stopped|final coverage|all match|end of findings|skipped)\b/i.test(line)) return { line: raw, kind: 'coverage' };
      if (quotes.some((q) => q.length > 12 && (norm.includes(q) || q.includes(norm)))) return { line: raw, kind: 'finding' };
      if ((line.match(/\|/g) ?? []).length >= 2) return { line: raw, kind: 'finding' };
      return { line: raw, kind: 'unknown' };
    });
}
