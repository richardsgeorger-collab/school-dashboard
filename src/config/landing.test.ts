import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRICES, TRIAL } from './tiers';

/** The landing page is static; this keeps its prices and trial length honest against the one config file. */
describe('landing page', () => {
  const html = readFileSync(join(__dirname, '..', '..', 'public', 'landing', 'index.html'), 'utf8');
  it('quotes the configured prices', () => {
    for (const t of ['plus', 'pro', 'max'] as const) {
      expect(html).toContain(`$${PRICES[t].month.toFixed(2)}`);
      expect(html).toContain(`$${PRICES[t].year} a year`);
    }
  });
  it('states the trial and the disclaimer, and never asks for a password', () => {
    expect(html).toContain(`${TRIAL.days === 7 ? 'seven' : String(TRIAL.days)} days of Max`);
    expect(html).toContain('not affiliated with');
    expect(html).toContain('Never your password');
    expect(html).not.toMatch(/gcu\.edu\/[a-z]*logo|GCU logo/i);
  });
});
