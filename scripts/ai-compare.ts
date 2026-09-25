// Before/after on Haiku: runs every fixture through the app's own prompt builders and readers against the model
// the product ships (src/ai/model.ts), and optionally a baseline model named in BASELINE_MODEL, then writes a
// side-by-side report with pass counts, tokens, cost and latency. Needs ANTHROPIC_API_KEY. Nothing here is
// imported by the app.
//
//   ANTHROPIC_API_KEY=... npm run ai:compare
//   ANTHROPIC_API_KEY=... BASELINE_MODEL=<older model id> npm run ai:compare
//   npm run ai:compare -- --dry     (no calls: prints the fixtures and the prompt sizes)
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { costOf } from '../src/ai/meter';
import { MODEL } from '../src/ai/model';
import { MAX_TOKENS } from '../src/config/tiers';
import { reviveJsonStrings } from '../src/ai/client';
import { ACTIONS_TOOL, actionsFromTool, buildActionsPrompt } from '../src/halo/actions';
import { buildNotesPrompt, NOTES_TOOL, notesFromTool } from '../src/record/summarize';
import { ACTION_FIXTURES, COURSES, ITEMS, LECTURE_FIXTURES, TZ } from './fixtures/ai';

const key = process.env.ANTHROPIC_API_KEY ?? '';
const dry = process.argv.includes('--dry');
const models = [MODEL, ...(process.env.BASELINE_MODEL ? [process.env.BASELINE_MODEL] : [])];
const baselinePrices = (process.env.BASELINE_PRICES ?? '3,15').split(',').map(Number);

interface Row {
  model: string;
  fixture: string;
  kind: 'announcement' | 'lecture';
  passed: number;
  total: number;
  failures: string[];
  ms: number;
  usd: number;
  tokens: { in: number; out: number };
  output: unknown;
}

async function call(model: string, kind: keyof typeof MAX_TOKENS, system: { text: string; cache?: boolean }[] | string, user: string, tool: { name: string; input_schema: unknown; description?: string }) {
  const blocks = typeof system === 'string' ? [{ type: 'text', text: system }] : system.map((b) => ({ type: 'text', text: b.text, ...(b.cache ? { cache_control: { type: 'ephemeral' } } : {}) }));
  const body = { model, max_tokens: MAX_TOKENS[kind], system: blocks, tools: [tool], tool_choice: { type: 'tool', name: tool.name }, messages: [{ role: 'user', content: user }] };
  const t0 = Date.now();
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body) });
  const json = (await res.json()) as { content?: { type: string; input?: unknown }[]; usage?: { input_tokens: number; output_tokens: number }; error?: { message: string } };
  if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
  const use = json.content?.find((b) => b.type === 'tool_use');
  const usage = json.usage ?? { input_tokens: 0, output_tokens: 0 };
  const usd = model === MODEL ? costOf(usage) : (usage.input_tokens * baselinePrices[0] + usage.output_tokens * baselinePrices[1]) / 1_000_000;
  // The same revival the app's wrapper applies, so the harness measures what students get; the raw answer is kept too.
  return { input: reviveJsonStrings(use?.input ?? null), raw: use?.input ?? null, ms: Date.now() - t0, usd, tokens: { in: usage.input_tokens, out: usage.output_tokens } };
}

async function main() {
  const rows: Row[] = [];
  console.log(`fixtures: ${ACTION_FIXTURES.length} announcements, ${LECTURE_FIXTURES.length} lecture · models: ${models.join(', ')}`);
  for (const f of ACTION_FIXTURES) {
    const p = buildActionsPrompt(f.post, COURSES.find((c) => c.id === f.post.courseId)!, ITEMS, TZ);
    if (dry) {
      console.log(`  ${f.name}: system ${p.system.reduce((n, b) => n + b.text.length, 0)} chars, user ${p.user.length} chars, ${f.expect.length} checks`);
      continue;
    }
    for (const model of models) {
      try {
        const r = await call(model, 'announcement', p.system, p.user, ACTIONS_TOOL);
        const { actions, summary } = actionsFromTool(r.input, f.post, ITEMS, TZ);
        const failures = f.expect.map((e) => e(actions, summary)).filter((x): x is string => !!x);
        rows.push({ model, fixture: f.name, kind: 'announcement', passed: f.expect.length - failures.length, total: f.expect.length, failures, ms: r.ms, usd: r.usd, tokens: r.tokens, output: { summary, actions: actions.map((a) => ({ kind: a.kind, itemId: a.itemId, text: a.text, dueAt: a.dueAt, points: a.points, quote: a.source.quote })), ...(failures.length ? { raw: r.raw } : {}) } });
        console.log(`  ${model} · ${f.name}: ${f.expect.length - failures.length}/${f.expect.length}${failures.length ? ' · ' + failures.join('; ') : ''}`);
      } catch (e) {
        rows.push({ model, fixture: f.name, kind: 'announcement', passed: 0, total: f.expect.length, failures: [`call failed: ${e instanceof Error ? e.message : String(e)}`], ms: 0, usd: 0, tokens: { in: 0, out: 0 }, output: null });
        console.log(`  ${model} · ${f.name}: failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  for (const f of LECTURE_FIXTURES) {
    const p = buildNotesPrompt({ course: f.course, lectureDate: f.lectureDate, items: ITEMS, transcript: f.transcript, tz: TZ, deckOutline: null });
    if (dry) {
      console.log(`  ${f.name}: system ${p.system.length} chars, user ${p.user.length} chars, ${f.expect.length} checks`);
      continue;
    }
    for (const model of models) {
      try {
        const r = await call(model, 'lecture', p.system, p.user, NOTES_TOOL);
        const notes = notesFromTool(r.input, model);
        const failures = f.expect.map((e) => e(notes)).filter((x): x is string => !!x);
        rows.push({ model, fixture: f.name, kind: 'lecture', passed: f.expect.length - failures.length, total: f.expect.length, failures, ms: r.ms, usd: r.usd, tokens: r.tokens, output: failures.length ? { shaped: notes, raw: r.raw } : notes });
        console.log(`  ${model} · ${f.name}: ${f.expect.length - failures.length}/${f.expect.length}${failures.length ? ' · ' + failures.join('; ') : ''}`);
      } catch (e) {
        rows.push({ model, fixture: f.name, kind: 'lecture', passed: 0, total: f.expect.length, failures: [`call failed: ${e instanceof Error ? e.message : String(e)}`], ms: 0, usd: 0, tokens: { in: 0, out: 0 }, output: null });
      }
    }
  }
  if (dry) return;
  if (!key) {
    console.log('No ANTHROPIC_API_KEY set; nothing was called. Use --dry to see the fixtures.');
    return;
  }
  // A run where no call reached the model is not a score. Say why and write nothing.
  const failedCalls = rows.filter((r) => r.failures.some((f) => f.startsWith('call failed')));
  if (failedCalls.length === rows.length) {
    console.log(`No call reached the model (${failedCalls[0]?.failures[0] ?? 'unknown'}). No report written.`);
    process.exitCode = 1;
    return;
  }
  const date = new Date().toISOString().slice(0, 10);
  mkdirSync('docs/ai-compare', { recursive: true });
  const lines: string[] = [`# AI before/after · ${date}`, '', `Models: ${models.join(' vs ')}`, ''];
  lines.push('| Model | Checks passed | Cost | Median latency |', '|---|---|---|---|');
  for (const model of models) {
    const mine = rows.filter((r) => r.model === model);
    const passed = mine.reduce((n, r) => n + r.passed, 0);
    const total = mine.reduce((n, r) => n + r.total, 0);
    const usd = mine.reduce((n, r) => n + r.usd, 0);
    const ms = mine.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(mine.length / 2)] ?? 0;
    lines.push(`| ${model} | ${passed} / ${total} | $${usd.toFixed(4)} | ${ms} ms |`);
  }
  lines.push('', '## Per fixture', '');
  for (const f of [...ACTION_FIXTURES.map((x) => x.name), ...LECTURE_FIXTURES.map((x) => x.name)]) {
    lines.push(`### ${f}`, '');
    for (const r of rows.filter((x) => x.fixture === f)) {
      lines.push(`**${r.model}** · ${r.passed}/${r.total} · $${r.usd.toFixed(4)} · ${r.ms} ms${r.failures.length ? ` · ${r.failures.join('; ')}` : ''}`, '', '```json', JSON.stringify(r.output, null, 2).slice(0, 4000), '```', '');
    }
  }
  // A second run on the same day never overwrites the first: before/after pairs stay side by side.
  let out = `docs/ai-compare/${date}.md`;
  for (let n = 2; existsSync(out); n++) out = `docs/ai-compare/${date}-${n}.md`;
  writeFileSync(out, lines.join('\n'));
  console.log(`wrote ${out}`);
}

// A run cut short says so, instead of ending with no report and no reason.
let finished = false;
process.on('SIGINT', () => {
  console.log('\nStopped by Ctrl-C before the report was written. Run it again and leave the terminal alone until it says "wrote docs/ai-compare/…".');
  process.exit(130);
});
process.on('beforeExit', () => {
  if (!finished) console.log('Stopped early: nothing was left to wait for before the report was written.');
});
process.on('unhandledRejection', (e) => {
  console.log('Stopped on an error:', e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
void main().then(() => {
  finished = true;
});
