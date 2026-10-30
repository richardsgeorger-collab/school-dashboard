import { beforeEach, describe, expect, it } from 'vitest';
import { captureSource, pendingSource } from './source';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
});

describe('the sign-up source', () => {
  it('remembers the market from the QR address, and nothing it does not know', () => {
    captureSource('#/start?src=market');
    expect(pendingSource()).toBe('market');
    store.clear();
    captureSource('#/start?src=flyer');
    expect(pendingSource()).toBeNull();
    captureSource('#/now?ref=abc');
    expect(pendingSource()).toBeNull();
  });
  it('is case-insensitive and survives other parameters', () => {
    captureSource('#/start?ref=x&src=MARKET');
    expect(pendingSource()).toBe('market');
  });
  it('Instagram: ?src=ig (or ?ref=ig) in the query, kept over the welcome tab\'s src=store (Loop 294)', () => {
    captureSource('', '?src=ig');
    expect(pendingSource()).toBe('ig');
    captureSource('#/welcome?src=store', '');
    expect(pendingSource()).toBe('ig');
    store.clear();
    captureSource('', '?ref=ig');
    expect(pendingSource()).toBe('ig');
    store.clear();
    captureSource('#/welcome?src=store', '');
    expect(pendingSource()).toBe('store');
    captureSource('', '?ref=igloo');
    expect(pendingSource()).toBe('store');
  });
});
