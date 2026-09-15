import type Anthropic from '@anthropic-ai/sdk';
import type { Proposal } from '../record/match';

/** Same model as the coach and the lecture pass. */
export const SUMMARY_MODEL = 'claude-sonnet-4-6';

export type PlanDecision = 'apply' | 'ask';

/** The overview shown above the review: a person telling the student where they stand, not a diff. */
export interface AuditSummary {
  verdict: string;
  matters: string[];
  plan: string;
  needsYou: string[];
  partial: string[];
  decisions: Record<string, PlanDecision>;
  source: 'claude' | 'local';
}

export interface SummaryFinding {
  id: string;
  classCode: string;
  classWord: string;
  status: string;
  title: string;
  quote: string;
  /** What approving the row would do, in words. */
  proposal: string;
  /** The fact itself, from the student's side: "Chem Quiz 1 moved: Sep 20 → Oct 2." Falls back to the proposal. */
  headline?: string;
  kind: Proposal['kind'];
  confidence: string;
  /** Due date the finding names, when it does. */
  date: string | null;
}

export interface SummaryClass {
  code: string;
  word: string;
  outcome: 'clean' | 'partial' | 'findings' | 'not reached';
  reason: string;
  skipped: string[];
}

export interface SummaryInput {
  findings: SummaryFinding[];
  classes: SummaryClass[];
  /** Open items of the audited classes, one line each. */
  planner: string;
}

const APPLY: Proposal['kind'][] = ['update', 'add', 'score'];
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : xs.length === 2 ? `${xs[0]} and ${xs[1]}` : `${xs.slice(0, -1).join(', ')}, and ${xs.at(-1)}`);
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** The overview without a model: counts and the proposals themselves, in plain words. Always available. */
export function localSummary(input: SummaryInput): AuditSummary {
  const real = input.findings.filter((f) => f.status !== 'note');
  const applies = real.filter((f) => APPLY.includes(f.kind));
  const asks = real.filter((f) => !APPLY.includes(f.kind));
  const decisions: Record<string, PlanDecision> = {};
  for (const f of applies) decisions[f.id] = 'apply';
  for (const f of asks) decisions[f.id] = 'ask';
  const byClass = new Map<string, number>();
  for (const f of real) byClass.set(f.classWord, (byClass.get(f.classWord) ?? 0) + 1);
  const top = [...byClass.entries()].sort((a, b) => b[1] - a[1])[0];
  const where = top && byClass.size > 1 && top[1] > 1 ? `, ${top[1]} of them in ${top[0]}` : top && byClass.size === 1 && real.length > 1 ? `, all in ${top[0]}` : '';
  let verdict: string;
  if (real.length === 0) verdict = 'Nothing to fix — your planner matches Halo.';
  else if (applies.length === 0) verdict = `Nothing changes on its own — ${real.length} thing${real.length === 1 ? '' : 's'} need${real.length === 1 ? 's' : ''} your eye${where}.`;
  else verdict = `${real.length <= 3 ? 'Mostly clean' : real.length <= 6 ? 'A few things to fix' : 'Quite a bit changed'} — ${real.length} real problem${real.length === 1 ? '' : 's'}${where}.`;
  const matters = real
    .slice()
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
    .slice(0, 4)
    .map((f) => f.headline ?? f.proposal);
  const plan = applies.length ? `I'll ${list(applies.map((f) => lower(f.proposal)))}.` : 'Nothing will change on its own.';
  const needsYou = asks.map((f) => f.proposal);
  const partial = input.classes.filter((c) => c.outcome === 'partial').map((c) => `${c.word} wasn't fully checked: ${lower(c.reason)}${c.skipped.length ? ` Not checked: ${c.skipped.join('; ')}.` : ''} Don't trust its result yet.`);
  const unreached = input.classes.filter((c) => c.outcome === 'not reached').map((c) => c.word);
  if (unreached.length) partial.push(`${list(unreached)} ${unreached.length === 1 ? "wasn't" : "weren't"} reached yet, so ${unreached.length === 1 ? 'its result isn\'t' : 'their results aren\'t'} in.`);
  return { verdict, matters, plan, needsYou, partial, decisions, source: 'local' };
}

export const SUMMARY_TOOL = {
  name: 'audit_summary',
  description: 'A calm, plain-language overview of what a Halo audit found and what the planner will do about it.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['verdict', 'matters', 'plan', 'needs_you', 'partial', 'decisions'],
    properties: {
      verdict: { type: 'string', description: 'One sentence on the overall state, e.g. "Mostly clean — 3 real problems, 2 of them in Chem."' },
      matters: { type: 'array', items: { type: 'string' }, description: 'Two to four short bullets on what actually matters: real changes and anything the student would get burned by. Not every row.' },
      plan: { type: 'string', description: 'One or two sentences on what will be applied, naming items and dates, e.g. "I\'ll move Chem Quiz 1 to Oct 26 and add the lab rubric deadline you didn\'t have."' },
      needs_you: { type: 'array', items: { type: 'string' }, description: 'Things that cannot be decided alone, one short line each. Empty when none.' },
      partial: { type: 'array', items: { type: 'string' }, description: 'One line per class that came back partial: which pages were not checked and that its result is not trustworthy yet. Empty when none.' },
      decisions: {
        type: 'array',
        description: 'One entry per finding id: apply when it is safe to change the planner as proposed, ask when the student should look first.',
        items: { type: 'object', additionalProperties: false, required: ['id', 'action'], properties: { id: { type: 'string' }, action: { type: 'string', enum: ['apply', 'ask'] } } },
      },
    },
  },
} as const;

const SYSTEM = `You read the results of an audit of a college student's Halo (LMS) account against their planner, and tell them where they stand. You are a calm person, not a report.
Rules:
- Plain words. No jargon, no status codes, no list of every row. Never scold.
- verdict: one sentence. If nothing real changed, say so plainly.
- matters: two to four bullets at most, only what a student would actually get burned by: moved deadlines, new work, posted grades, things Halo flags late. Skip trivia.
- plan: what the planner will apply on its own, naming items and dates. Apply moves, additions, and posted scores that match a planner item. Never apply removals, schedule changes, or anything unmatched on your own; those go to needs_you.
- needs_you: only what truly needs a human look, one line each, with what to check.
- partial: for every class marked partial or not reached, name the pages not checked and say its result is not trustworthy yet.
- decisions: one per finding id given. apply for the plan; ask for needs_you.
Answer only through the audit_summary tool.`;

export function buildSummaryPrompt(input: SummaryInput): { system: string; user: string } {
  const findings = input.findings.length
    ? input.findings.map((f) => `${f.id} · ${f.classCode} (${f.classWord}) · ${f.status} · "${f.title}"${f.date ? ` · ${f.date}` : ''} · ${f.confidence} confidence\n   Halo said: ${f.quote}\n   Proposal (${f.kind}): ${f.proposal}`).join('\n')
    : '(none)';
  const classes = input.classes.map((c) => `${c.code} (${c.word}): ${c.outcome} — ${c.reason}${c.skipped.length ? ` Skipped: ${c.skipped.join('; ')}` : ''}`).join('\n');
  return { system: SYSTEM, user: `Findings (id · class · status · title · date · confidence):\n${findings}\n\nClass coverage:\n${classes}\n\nPlanner, open items of the audited classes:\n${input.planner || '(none)'}` };
}

const str = (v: unknown, max = 400) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const strs = (v: unknown, max: number) => (Array.isArray(v) ? v.map((s) => str(s)).filter(Boolean).slice(0, max) : []);

/** Whatever the model sent, shaped into a summary; missing pieces fall back to the local one so nothing is blank. */
export function summaryFromTool(raw: unknown, input: SummaryInput): AuditSummary {
  const base = localSummary(input);
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const ids = new Set(input.findings.map((f) => f.id));
  const decisions: Record<string, PlanDecision> = { ...base.decisions };
  for (const d of Array.isArray(o.decisions) ? o.decisions : []) {
    const e = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
    if (typeof e.id === 'string' && ids.has(e.id) && (e.action === 'apply' || e.action === 'ask')) decisions[e.id] = e.action;
  }
  // Removals and unmatched rows never apply on their own, whatever the model said.
  for (const f of input.findings) if (!APPLY.includes(f.kind) && decisions[f.id] === 'apply') decisions[f.id] = 'ask';
  return {
    verdict: str(o.verdict) || base.verdict,
    matters: strs(o.matters, 4).length ? strs(o.matters, 4) : base.matters,
    plan: str(o.plan) || base.plan,
    needsYou: strs(o.needs_you, 8),
    partial: strs(o.partial, 8).length ? strs(o.partial, 8) : base.partial,
    decisions,
    source: 'claude',
  };
}

/** One call, the key from this browser, answered through the forced tool. */
export async function summarizeAudit(args: SummaryInput & { apiKey: string; fetch?: typeof globalThis.fetch }): Promise<AuditSummary> {
  const { default: AnthropicSdk } = await import('@anthropic-ai/sdk');
  const client = new AnthropicSdk({ apiKey: args.apiKey, dangerouslyAllowBrowser: true, maxRetries: args.fetch ? 0 : 1, ...(args.fetch ? { fetch: args.fetch } : {}) });
  const { system, user } = buildSummaryPrompt(args);
  const response = await client.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: 1500,
    system,
    tools: [SUMMARY_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: SUMMARY_TOOL.name },
    messages: [{ role: 'user', content: user }],
  });
  const use = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!use) throw new Error('The model did not return a summary.');
  return summaryFromTool(use.input, args);
}
