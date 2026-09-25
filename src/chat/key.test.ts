import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

/** A production build: not dev, not test, no VITE_AI_DIRECT. */
async function prodKeyModule() {
  vi.stubEnv('DEV', false);
  vi.stubEnv('MODE', 'production');
  vi.stubEnv('VITE_AI_DIRECT', '');
  vi.resetModules();
  return import('./key');
}

describe('a browser key on a production build', () => {
  it('is deleted on load, never read, never saved', async () => {
    store.set('school-dashboard:anthropic-key', JSON.stringify('sk-ant-old'));
    const key = await prodKeyModule();
    expect(key.loadApiKey()).toBe('');
    expect(key.forgetStrayKey()).toBe(true);
    expect(store.has('school-dashboard:anthropic-key')).toBe(false);
    key.saveApiKey('sk-ant-new');
    expect(store.size).toBe(0);
  });
});
