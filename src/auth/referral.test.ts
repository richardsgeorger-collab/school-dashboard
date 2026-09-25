import { beforeEach, describe, expect, it } from 'vitest';
import { captureRef, pendingRef } from './referral';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
});

describe('invite links', () => {
  it('remembers the code from #/now?ref=CODE and nothing from a plain address', () => {
    captureRef('#/now?ref=A1b2C3d4');
    expect(pendingRef()).toBe('a1b2c3d4');
    store.clear();
    captureRef('#/now?halo=1');
    expect(pendingRef()).toBeNull();
    captureRef('#/you?s=plan&ref=zz99');
    expect(pendingRef()).toBe('zz99');
  });
});
