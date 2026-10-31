import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The landing page is the app's own screen now (src/landing/Landing.tsx), so its prices come straight from
 * tiers.ts. This keeps the promises on it honest: the trial sentence, the disclaimer, never a password, no GCU marks.
 */
describe('landing page', () => {
  const src = readFileSync(join(__dirname, '..', 'landing', 'Landing.tsx'), 'utf8');
  // 2026-10-23 (George): people see "free for 7 days" and think "money, no thanks". The home page never talks price or
  // trial; the Plans page, one link in the footer, says it all, from the config.
  // 2026-10-30 (George, Loop 302): one exception, asked for: the Max feature says Max's price honestly, from the config,
  // once. Still no trial talk anywhere on the home page.
  it('says nothing about the trial, and one price only: Max on its own feature, from the config', () => {
    const page = src + readFileSync(join(__dirname, '..', 'landing', 'LiveNow.tsx'), 'utf8');
    expect(page).not.toMatch(/\$\d|free trial|No card|days free|Try it free/i);
    expect(page).not.toMatch(/TRIAL\.|PRICES\[/);
    expect(page.match(/PRICES\.max\.month/g)?.length).toBe(1);
    expect(page.match(/a month/g)?.length).toBe(1);
    expect(src).toContain('Try it now');
    expect(src).toContain('href="./plans/"');
    const pages = readFileSync(join(__dirname, '..', 'help', 'pages.ts'), 'utf8');
    expect(pages).toMatch(/PRICES\[t\]\.month\.toFixed\(2\)/);
    expect(pages).toContain('${TRIAL.days} days of use');
    expect(pages).toContain('Free stays free');
    expect(pages).not.toMatch(/semester|a year/);
  });
  it('states the disclaimer and never asks for a password', () => {
    expect(src).toContain('not affiliated with');
    expect(src).toContain('it never asks');
    expect(src).not.toMatch(/gcu\.edu\/[a-z]*logo|GCU logo/i);
  });
  it('the old /landing/ address forwards to the root', () => {
    const old = readFileSync(join(__dirname, '..', '..', 'public', 'landing', 'index.html'), 'utf8');
    expect(old).toContain('http-equiv="refresh"');
  });
});
