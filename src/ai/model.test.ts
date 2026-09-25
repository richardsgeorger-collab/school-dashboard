import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL } from './model';

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
          // Tests that mock the API echo the request's model back, and some assert on its family; only a *different*
          // model is a violation.
          if (MODEL.startsWith(m[0])) continue;
          offenders.push(`${rel}: ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the one model is a Haiku 4.5 id', () => {
    expect(MODEL).toMatch(/^claude-haiku-4-5/);
  });
});
