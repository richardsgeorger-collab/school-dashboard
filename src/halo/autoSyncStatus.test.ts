import { describe, expect, it } from 'vitest';
import { readAutoPaused } from './autoSyncStatus';

describe('what the extension says about auto-sync', () => {
  it('reads a pause for a logged-out Halo, and nothing else', () => {
    expect(readAutoPaused(JSON.stringify({ autoPaused: { why: 'logged-out', at: '2026-10-03T04:21:01Z' } }))).toEqual({ why: 'logged-out', at: '2026-10-03T04:21:01Z' });
    expect(readAutoPaused(JSON.stringify({ autoPaused: null }))).toBeNull();
    expect(readAutoPaused(JSON.stringify({ autoPaused: { why: 'other', at: 'x' } }))).toBeNull();
    expect(readAutoPaused('not json')).toBeNull();
    expect(readAutoPaused(null)).toBeNull();
  });
});
