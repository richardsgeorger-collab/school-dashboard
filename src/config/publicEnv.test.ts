import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkPublicEnv } from '../../vite.config';

describe('nothing secret can be built into the client', () => {
  it('allows the five public variables with public values', () => {
    expect(checkPublicEnv({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.x', VITE_AI_DIRECT: '1', VITE_META_PIXEL_ID: '123', VITE_VAPID_PUBLIC_KEY: 'BPub', PATH: '/bin' })).toEqual([]);
  });
  it('refuses any other VITE_ variable', () => {
    expect(checkPublicEnv({ VITE_ANTHROPIC_API_KEY: 'x' })).toHaveLength(1);
  });
  it('refuses key-shaped values even under an allowed name', () => {
    expect(checkPublicEnv({ VITE_META_PIXEL_ID: 'sk-ant-api03-abc' })).toHaveLength(1);
    expect(checkPublicEnv({ VITE_VAPID_PUBLIC_KEY: 'sk_live_abc' })).toHaveLength(1);
    const service = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.sig`;
    expect(checkPublicEnv({ VITE_SUPABASE_ANON_KEY: service })).toEqual(['VITE_SUPABASE_ANON_KEY is a Supabase service_role key.']);
  });
  it('the app never reads import.meta.env as a whole object (that inlines every VITE_ variable)', () => {
    const root = join(__dirname, '..');
    for (const f of ['env.ts', 'storage/store.tsx', 'ai/gateway.ts', 'auth/client.ts']) {
      const src = readFileSync(join(root, f), 'utf8')
        .split('\n')
        .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
        .join('\n');
      expect(src, f).not.toMatch(/import\.meta\.env(?![.\w])/);
    }
  });
});
