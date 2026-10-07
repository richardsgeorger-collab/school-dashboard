import { describe, expect, it } from 'vitest';
import { staleText, syncReminder, type ReminderInput } from './syncReminder';

const now = Date.parse('2026-10-06T18:00:00Z');
const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
const base: ReminderInput = { lastAt: ago(1), now, allowed: true, extInstalled: false, autoPlan: true, paused: false };

describe('the sync reminder', () => {
  it('says nothing while the planner is fresh, before a first sync, or on a plan without sync', () => {
    expect(syncReminder(base)).toBeNull();
    expect(syncReminder({ ...base, lastAt: null })).toBeNull();
    expect(syncReminder({ ...base, lastAt: ago(80), allowed: false })).toBeNull();
    // Without the extension, 6 to 24 hours is normal for the bookmark.
    expect(syncReminder({ ...base, lastAt: ago(10) })).toBeNull();
  });
  it('over a day: "Last synced 2 days ago", red from three days', () => {
    expect(syncReminder({ ...base, lastAt: ago(25) })).toEqual({ kind: 'stale', days: 1, red: false });
    expect(syncReminder({ ...base, lastAt: ago(50) })).toEqual({ kind: 'stale', days: 2, red: false });
    expect(syncReminder({ ...base, lastAt: ago(73) })).toEqual({ kind: 'stale', days: 3, red: true });
    expect(staleText(1)).toBe('Last synced a day ago.');
    expect(staleText(2)).toBe('Last synced 2 days ago.');
  });
  it('the extension on this computer and 6 hours without a sync: auto-sync has stopped', () => {
    expect(syncReminder({ ...base, lastAt: ago(5), extInstalled: true })).toBeNull();
    expect(syncReminder({ ...base, lastAt: ago(7), extInstalled: true, paused: true })).toEqual({ kind: 'auto', since: ago(7), red: false, paused: true });
    // A plan without auto-sync: the extension only syncs when asked, so 7 hours is not a stopped auto-sync.
    expect(syncReminder({ ...base, lastAt: ago(7), extInstalled: true, autoPlan: false })).toBeNull();
    // Over a day: one reminder, the one whose button syncs now.
    expect(syncReminder({ ...base, lastAt: ago(30), extInstalled: true })?.kind).toBe('stale');
  });
});
