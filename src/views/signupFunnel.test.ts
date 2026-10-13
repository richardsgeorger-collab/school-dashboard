import { describe, expect, it } from 'vitest';
import { droppedAt, funnelTotals, type SignupRow } from './signupFunnel';

const row = (p: Partial<SignupRow>): SignupRow => ({ who: 'x', created_at: '2026-10-12T20:00:00Z', device: 'laptop', browser: 'Chrome', reached_connect: false, clicked_store: false, installed: false, opened_halo: false, handoff: false, on_laptop: false, landed: false, classes_now: 0, last_step_at: null, ...p });

describe('the sign-up funnel', () => {
  it('counts each step for all, laptops, and phones and tablets', () => {
    const rows = [
      row({ device: 'phone', browser: 'Safari', reached_connect: true }),
      row({ device: 'phone', browser: 'Safari', reached_connect: true, handoff: true }),
      row({ device: 'laptop', reached_connect: true, clicked_store: true, installed: true, opened_halo: true, landed: true, classes_now: 6 }),
      row({ device: 'tablet', browser: 'Safari' }),
    ];
    const t = funnelTotals(rows);
    expect(t.signed_up).toEqual({ all: 4, laptop: 1, touch: 3 });
    expect(t.reached_connect).toEqual({ all: 3, laptop: 1, touch: 2 });
    expect(t.landed).toEqual({ all: 1, laptop: 1, touch: 0 });
  });
  it('says where each account stopped', () => {
    expect(droppedAt(row({ reached_connect: true }))).toBe('Before "Pressed Add to Chrome"');
    expect(droppedAt(row({ device: 'phone', reached_connect: true, handoff: true }))).toBe('Chose "Finish on my laptop", never opened it there');
    expect(droppedAt(row({ landed: true }))).toBeNull();
  });
});
