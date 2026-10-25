import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { forModel, HAIKU_4_5, HAIKU_5_5, KNOWN_MODELS, MODEL, pricesFor } from './model';
import { costOf } from './meter';

/**
 * The rule: one model, named in one place. This walks every code directory and fails on any other model string,
 * so a stray `claude-sonnet` in a new file cannot ship. Docs and the plan are allowed to mention models by name.
 */
const ROOT = join(__dirname, '..', '..');
const CODE_DIRS = ['src', 'scripts', 'supabase', 'extension', 'landing'];
const ALLOWED_FILES = new Set(['src/ai/model.ts', 'supabase/functions/_shared/model.ts']);
const MODEL_STRING = /claude-[a-z][a-z0-9.-]*\d[a-z0-9.-]*/g;

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx|js|mjs|cjs|json|sql|html|css)$/.test(name)) yield p;
  }
}

describe('one model, named once', () => {
  it('no other model string appears anywhere in the codebase', () => {
    const offenders: string[] = [];
    for (const dir of CODE_DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file);
        if (ALLOWED_FILES.has(rel)) continue;
        const text = readFileSync(file, 'utf8');
        for (const m of text.matchAll(MODEL_STRING)) {
          // Tests that mock the API echo a model back, and some assert on its family; only a model the gateway does
          // not know is a violation.
          if (KNOWN_MODELS.some((k) => k.startsWith(m[0]))) continue;
          offenders.push(`${rel}: ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the one model is a known Haiku', () => {
    expect(KNOWN_MODELS).toContain(MODEL);
    expect(MODEL).toMatch(/^claude-haiku-/);
  });
});

describe('a request made right for its model (Haiku 5.5 migration guide, 2026-10-25)', () => {
  const base = { model: 'x', max_tokens: 4000, temperature: 0, top_p: 0.9, top_k: 5, system: [], tools: [{ name: 't', input_schema: {} }], tool_choice: { type: 'tool', name: 't' }, messages: [{ role: 'user', content: 'hi' }] };
  it('Haiku 5.5: no sampling settings, an effort, a larger cap; a forced tool call does not think', () => {
    const w = forModel(base, HAIKU_5_5, 'announcement');
    expect(w).not.toHaveProperty('temperature');
    expect(w).not.toHaveProperty('top_p');
    expect(w).not.toHaveProperty('top_k');
    expect(w).not.toHaveProperty('thinking');
    expect(w.model).toBe(HAIKU_5_5);
    expect((w.output_config as { effort: string }).effort).toMatch(/^(low|medium|high)$/);
    expect(w.max_tokens).toBe(6000);
  });
  it("Haiku 5.5: Haiku 4.5's budgeted thinking becomes adaptive at medium or more", () => {
    const w = forModel({ ...base, tool_choice: { type: 'auto' }, thinking: { type: 'enabled', budget_tokens: 2000 } }, HAIKU_5_5, 'tutor');
    expect(w.thinking).toEqual({ type: 'adaptive' });
    expect(['medium', 'high']).toContain((w.output_config as { effort: string }).effort);
  });
  it("Haiku 5.5 'off': thinking disabled at low effort; a call that asks to think still thinks", () => {
    const w = forModel({ ...base, tool_choice: { type: 'auto' }, output_config: { effort: 'off' } }, HAIKU_5_5, 'coach');
    expect(w.thinking).toEqual({ type: 'disabled' });
    expect(w.output_config).toEqual({ effort: 'low' });
    const t = forModel({ ...base, tool_choice: { type: 'auto' }, output_config: { effort: 'off' }, thinking: { type: 'enabled', budget_tokens: 2000 } }, HAIKU_5_5, 'coach');
    expect(t.thinking).toEqual({ type: 'adaptive' });
    expect(t.output_config).toEqual({ effort: 'medium' });
  });
  it('Haiku 5.5: a request ending on an assistant turn (a prefill, refused) ends on a user turn', () => {
    const w = forModel({ ...base, messages: [{ role: 'user', content: 'go' }, { role: 'assistant', content: '{"a":' }] }, HAIKU_5_5);
    const m = w.messages as { role: string; content: string }[];
    expect(m[m.length - 1].role).toBe('user');
    expect(m[m.length - 1].content).toContain('{"a":');
  });
  it('Haiku 4.5 (the rollback): no effort, adaptive back to a budget, sampling kept, cap as asked', () => {
    const w = forModel({ ...base, output_config: { effort: 'low' }, thinking: { type: 'adaptive' } }, HAIKU_4_5);
    expect(w).not.toHaveProperty('output_config');
    expect(w.thinking).toEqual({ type: 'enabled', budget_tokens: 2000 });
    expect(w.temperature).toBe(0);
    expect(w.max_tokens).toBe(4000);
  });
  it('prices each call by the model that answered, with Haiku 5.5 long prompts at the long-prompt list', () => {
    const u = { input_tokens: 10_000, output_tokens: 1_000 };
    expect(costOf(u, HAIKU_4_5)).toBeCloseTo(0.015, 6);
    expect(costOf(u, HAIKU_5_5)).toBeCloseTo(0.0015, 6);
    expect(pricesFor(HAIKU_5_5, 100_001).input).toBe(0.5);
    expect(costOf({ input_tokens: 150_000, output_tokens: 2_000 }, HAIKU_5_5)).toBeCloseTo(0.08, 6);
  });
});
