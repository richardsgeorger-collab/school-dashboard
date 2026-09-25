import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SHARED, toDeno } from '../../scripts/sync-shared.mjs';

/** The server copies of tiers, flags, model and meter must match the client's. A drift here means the client
 * would show one limit and the server enforce another. */
describe('shared config on the server', () => {
  const root = join(__dirname, '..', '..');
  for (const [from, to] of SHARED as [string, string][]) {
    it(`${to} matches ${from}`, () => {
      const copy = join(root, 'supabase', 'functions', '_shared', to);
      expect(existsSync(copy), `run: node scripts/sync-shared.mjs`).toBe(true);
      expect(readFileSync(copy, 'utf8')).toBe(toDeno(readFileSync(join(root, from), 'utf8')));
    });
  }
});
