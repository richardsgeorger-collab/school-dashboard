import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The landing page is the app's own screen now (src/landing/Landing.tsx), so its prices come straight from
 * tiers.ts. This keeps the promises on it honest: the trial sentence, the disclaimer, never a password, no GCU marks.
 */
describe('landing page', () => {
  const src = readFileSync(join(__dirname, '..', 'landing', 'Landing.tsx'), 'utf8');
  it('takes its prices and trial length from the config, never from a literal', () => {
    expect(src).toContain("from '../config/tiers'");
    expect(src).toMatch(/PRICES\[p\.tier\]\.month\.toFixed\(2\)/);
    expect(src).toContain('<small> a month</small>');
    expect(src).toContain('{TAX_LINE} · {CANCEL_LINE}');
    expect(src).not.toMatch(/semester|a year/);
    // The welcome gift (2026-09-29): Max free from sign-up, its length from the config, and what happens after.
    expect(src).toContain('Max free for {TRIAL.days} days');
    expect(src).toContain('Free stays free');
    expect(src).not.toMatch(/You choose when it starts|Start it when you're ready/);
    expect(src).toContain('PLAN_LINES');
    expect(src).not.toMatch(/\$\d+\.\d\d/);
  });
  it('states the disclaimer and never asks for a password', () => {
    expect(src).toContain('not affiliated with');
    expect(src).toContain('never asks for your password');
    expect(src).not.toMatch(/gcu\.edu\/[a-z]*logo|GCU logo/i);
  });
  it('the old /landing/ address forwards to the root', () => {
    const old = readFileSync(join(__dirname, '..', '..', 'public', 'landing', 'index.html'), 'utf8');
    expect(old).toContain('http-equiv="refresh"');
  });
});
