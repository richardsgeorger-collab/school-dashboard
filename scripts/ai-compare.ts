// Before/after on the model: every AI job in Halo+ (scripts/fixtures/ai-jobs.ts) through the app's own prompt
// builders, calls and readers, once per candidate model (and effort), with a side-by-side report: checks passed, valid
// answers, cost, tokens and latency per job. Nothing here is imported by the app.
//
// Two ways to reach the model:
//   - through the deployed gateway (the default): a throwaway admin account, which may name a known model and effort
//     for its own calls (supabase/functions/ai). Needs KEYS_ENV (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
//     SERVICE_ROLE) and nothing else: the API key never leaves the server.
//   - straight to Anthropic with ANTHROPIC_API_KEY.
//
//   KEYS_ENV=... npm run ai:compare                      (Haiku 4.5, Haiku 5.5 low, Haiku 5.5 medium; 2 runs each)
//   KEYS_ENV=... CANDIDATES=4.5,5.5:low RUNS=1 ONLY=announcement npm run ai:compare
//   KEYS_ENV=... LIVE=1 RUNS=1 npm run ai:compare        (the student path: a plain Max throwaway, no model named,
//                                                         so the gateway picks; checks each answer came from MODEL)
//   npm run ai:compare -- --dry                          (no calls: lists the jobs)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ENV } from '../src/env';

// The app's dev path (a key in hand, straight to the model) is what the harness rides; it is only open in a test build.
Object.defineProperty(ENV, 'MODE', { get: () => 'test' });
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage ??= { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear(), key: () => null, length: 0 };

const { HAIKU_4_5, HAIKU_5_5, forModel, MODEL } = await import('../src/ai/model');
const { costOf } = await import('../src/ai/meter');
const { allJobs } = await import('./fixtures/ai-jobs');

interface Candidate {
  label: string;
  model: string;
  effort: 'off' | 'low' | 'medium' | 'high' | null;
}
const NAMED: Record<string, Candidate> = {
  '4.5': { label: 'Haiku 4.5', model: HAIKU_4_5, effort: null },
  '5.5': { label: 'Haiku 5.5 (default effort)', model: HAIKU_5_5, effort: null },
  '5.5:off': { label: 'Haiku 5.5 no thinking', model: HAIKU_5_5, effort: 'off' },
  '5.5:low': { label: 'Haiku 5.5 low', model: HAIKU_5_5, effort: 'low' },
  '5.5:medium': { label: 'Haiku 5.5 medium', model: HAIKU_5_5, effort: 'medium' },
  '5.5:high': { label: 'Haiku 5.5 high', model: HAIKU_5_5, effort: 'high' },
};
const LIVE = process.env.LIVE === '1';
const candidates = LIVE ? [{ label: 'Live (shipped)', model: MODEL, effort: null }] : (process.env.CANDIDATES ?? '4.5,5.5:low,5.5:medium').split(',').map((n) => NAMED[n.trim()] ?? (() => { throw new Error(`unknown candidate ${n}`); })());
const RUNS = Number(process.env.RUNS ?? 2);
const ONLY = process.env.ONLY ?? '';
const dry = process.argv.includes('--dry');
const key = process.env.ANTHROPIC_API_KEY ?? '';

interface Call {
  ms: number;
  usd: number;
  input: number;
  output: number;
  stop: string | null;
  model: string;
  error?: string;
}

// ---- Transport: the app thinks it is calling Anthropic; this carries it to the model under test ----
let gateway: { url: string; anon: string; token: () => Promise<string>; cleanup: () => Promise<number> } | null = null;
async function openGateway() {
  const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV ?? '', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
  const lib = './lib/personas.mjs';
  const { personaKit } = (await import(lib)) as { personaKit: (env: Record<string, string>) => { persona: (kind: string) => Promise<{ session: { access_token: string } }>; cleanup: () => Promise<number> } };
  const kit = personaKit(env);
  const kind = LIVE ? 'max' : 'admin';
  let session = (await kit.persona(kind)).session;
  return {
    url: env.VITE_SUPABASE_URL,
    anon: env.VITE_SUPABASE_ANON_KEY,
    // A fresh throwaway admin when the meter of this one runs out (the side-by-side spends real calls).
    token: async (fresh = false) => {
      if (fresh) session = (await kit.persona(kind)).session;
      return session.access_token as string;
    },
    cleanup: () => kit.cleanup() as Promise<number>,
  } as { url: string; anon: string; token: (fresh?: boolean) => Promise<string>; cleanup: () => Promise<number> };
}

function transport(c: Candidate, kind: string, calls: Call[]): typeof globalThis.fetch {
  return (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const t0 = Date.now();
    let status = 0;
    let answer: { content?: unknown[]; stop_reason?: string; usage?: Record<string, number>; model?: string; error?: { message?: string } } = {};
    if (key) {
      const wire = forModel(c.effort ? { ...body, output_config: { effort: c.effort } } : body, c.model, kind);
      const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(wire) });
      status = res.status;
      answer = await res.json();
    } else {
      const { model: _m, ...request } = body;
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`${gateway!.url}/functions/v1/ai`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${await (gateway!.token as (f?: boolean) => Promise<string>)(attempt > 0 && (status === 402 || status === 429))}`, apikey: gateway!.anon }, body: JSON.stringify({ kind, request, ...(LIVE ? {} : { model: c.model }), ...(c.effort ? { effort: c.effort } : {}) }) });
        status = res.status;
        const j = (await res.json().catch(() => ({}))) as { response?: typeof answer; error?: { message?: string } };
        answer = j.response ?? { error: j.error };
        if (status !== 402 && status !== 429 && status !== 503 && status !== 529) break;
      }
    }
    const usage = answer.usage ?? {};
    calls.push({ ms: Date.now() - t0, usd: costOf(usage, c.model), input: (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0), output: usage.output_tokens ?? 0, stop: answer.stop_reason ?? null, model: answer.model ?? c.model, ...(status >= 400 ? { error: `${status} ${answer.error?.message ?? ''}` } : {}) });
    const out = status >= 400 ? { type: 'error', error: { type: 'api_error', message: answer.error?.message ?? `HTTP ${status}` } } : { id: 'm', type: 'message', role: 'assistant', model: answer.model, content: answer.content ?? [], stop_reason: answer.stop_reason ?? null, usage };
    return new Response(JSON.stringify(out), { status: status >= 400 ? status : 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof globalThis.fetch;
}

interface Row {
  job: string;
  kind: string;
  candidate: string;
  run: number;
  passed: number;
  total: number;
  failures: string[];
  /** The reader took the answer (no throw, no failed call). */
  valid: boolean;
  calls: Call[];
  output: unknown;
}

async function main() {
  const jobs = (await allJobs()).filter((j) => !ONLY || j.name.includes(ONLY) || j.kind === ONLY);
  console.log(`${jobs.length} jobs · ${candidates.map((c) => c.label).join(', ')} · ${RUNS} run(s) each · ${key ? 'straight to Anthropic' : 'through the deployed gateway'}`);
  if (dry) {
    for (const j of jobs) console.log(`  ${j.kind.padEnd(12)} ${j.name} (${j.checks.length} checks)`);
    return;
  }
  if (!key) gateway = await openGateway();
  const rows: Row[] = [];
  const tasks = jobs.flatMap((j) => candidates.flatMap((c) => Array.from({ length: RUNS }, (_, run) => ({ j, c, run }))));
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const { j, c, run } = tasks[next++];
      const calls: Call[] = [];
      let out: unknown = null;
      let failures: string[] = [];
      let valid = true;
      try {
        out = await j.run({ apiKey: 'harness', fetch: transport(c, j.kind, calls) });
        failures = j.checks.map((check) => {
          try {
            return check(out as never);
          } catch (e) {
            return `check threw: ${e instanceof Error ? e.message : String(e)}`;
          }
        }).filter((x): x is string => !!x);
      } catch (e) {
        valid = false;
        failures = [`no usable answer: ${e instanceof Error ? e.message : String(e)}`];
      }
      if (calls.some((x) => x.error)) valid = false;
      const truncated = calls.filter((x) => x.stop === 'max_tokens').length;
      if (truncated) failures.push(`${truncated} call(s) hit max_tokens`);
      if (calls.some((x) => x.stop === 'refusal')) failures.push('refused');
      if (LIVE && calls.some((x) => !x.error && x.model !== MODEL)) failures.push(`answered by ${calls.map((x) => x.model).join(', ')}, not ${MODEL}`);
      rows.push({ job: j.name, kind: j.kind, candidate: c.label, run, passed: j.checks.length - failures.filter((f) => !/max_tokens|refused/.test(f)).length, total: j.checks.length, failures, valid, calls, output: out });
      console.log(`  ${c.label.padEnd(18)} ${j.name}${RUNS > 1 ? ` #${run + 1}` : ''}: ${valid ? '' : 'INVALID '}${Math.max(0, j.checks.length - failures.length)}/${j.checks.length}${failures.length ? ' · ' + failures.join('; ').slice(0, 200) : ''}`);
    }
  };
  await Promise.all(Array.from({ length: Number(process.env.PARALLEL ?? 4) }, worker));
  if (gateway) console.log(`removed ${await gateway.cleanup()} throwaways`);
  if (rows.every((r) => r.calls.every((c) => c.error))) {
    console.log('No call reached the model. No report written.');
    process.exitCode = 1;
    return;
  }
  writeReport(rows, jobs.map((j) => j.name));
}

function writeReport(rows: Row[], order: string[]) {
  const date = new Date().toISOString().slice(0, 10);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  const lines: string[] = [`# AI before/after · ${date}`, '', `Shipped model when run: \`${MODEL}\`. Candidates: ${candidates.map((c) => `${c.label} (\`${c.model}\`${c.effort ? `, effort ${c.effort}` : ''})`).join(', ')}. ${RUNS} run(s) of each job. Made-up classes and posts only (scripts/fixtures/ai-jobs.ts).`, ''];
  lines.push('| Candidate | Checks passed | Valid answers | Hit max_tokens | Cost per call | Cost per job run | Median call |', '|---|---|---|---|---|---|---|');
  for (const c of candidates) {
    const mine = rows.filter((r) => r.candidate === c.label);
    const calls = mine.flatMap((r) => r.calls);
    lines.push(`| ${c.label} | ${sum(mine.map((r) => r.passed))} / ${sum(mine.map((r) => r.total))} | ${mine.filter((r) => r.valid).length} / ${mine.length} | ${calls.filter((x) => x.stop === 'max_tokens').length} | $${(sum(calls.map((x) => x.usd)) / Math.max(1, calls.length)).toFixed(5)} | $${(sum(calls.map((x) => x.usd)) / Math.max(1, mine.length)).toFixed(5)} | ${median(calls.map((x) => x.ms))} ms |`);
  }
  lines.push('', '## By kind of call', '', `| Kind | ${candidates.map((c) => `${c.label}: checks · $/call · tokens in/out · ms`).join(' | ')} |`, `|---|${candidates.map(() => '---').join('|')}|`);
  for (const kind of [...new Set(rows.map((r) => r.kind))]) {
    const cells = candidates.map((c) => {
      const mine = rows.filter((r) => r.kind === kind && r.candidate === c.label);
      const calls = mine.flatMap((r) => r.calls);
      const n = Math.max(1, calls.length);
      return `${sum(mine.map((r) => r.passed))}/${sum(mine.map((r) => r.total))} · $${(sum(calls.map((x) => x.usd)) / n).toFixed(5)} · ${Math.round(sum(calls.map((x) => x.input)) / n)}/${Math.round(sum(calls.map((x) => x.output)) / n)} · ${median(calls.map((x) => x.ms))}`;
    });
    lines.push(`| ${kind} | ${cells.join(' | ')} |`);
  }
  lines.push('', '## Per job', '');
  for (const name of order) {
    lines.push(`### ${name}`, '');
    for (const r of rows.filter((x) => x.job === name)) {
      lines.push(`**${r.candidate}**${RUNS > 1 ? ` #${r.run + 1}` : ''} · ${r.passed}/${r.total}${r.valid ? '' : ' · INVALID'} · $${sum(r.calls.map((x) => x.usd)).toFixed(5)} · ${sum(r.calls.map((x) => x.ms))} ms${r.failures.length ? ` · ${r.failures.join('; ')}` : ''}`, '');
      if (r.run === 0) lines.push('```json', JSON.stringify(r.output, null, 2).slice(0, 2500), '```', '');
    }
  }
  mkdirSync('docs/ai-compare', { recursive: true });
  let out = `docs/ai-compare/${date}.md`;
  for (let n = 2; existsSync(out); n++) out = `docs/ai-compare/${date}-${n}.md`;
  writeFileSync(out, lines.join('\n'));
  writeFileSync(out.replace(/\.md$/, '.json'), JSON.stringify(rows.map(({ output: _o, ...r }) => r), null, 1));
  console.log(`wrote ${out}`);
}

process.on('SIGINT', () => {
  console.log('\nStopped by Ctrl-C before the report was written.');
  process.exit(130);
});
await main();
