/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Every VITE_ variable is public: it ships in the bundle. These five are the only ones the app reads, and none of
 * them is a secret. Any other VITE_ variable, or one of these holding something key-shaped, stops the build.
 */
export const PUBLIC_VARS = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_AI_DIRECT', 'VITE_META_PIXEL_ID', 'VITE_VAPID_PUBLIC_KEY'];
const SECRET_SHAPES = [/sk-ant-/, /\bsk_(live|test)_/, /\brk_(live|test)_/, /whsec_/, /-----BEGIN [A-Z ]*PRIVATE KEY/];

export function checkPublicEnv(env: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('VITE_')) continue;
    if (!PUBLIC_VARS.includes(name)) problems.push(`${name} is not one of the public variables; everything VITE_ ships to every browser.`);
    if (SECRET_SHAPES.some((re) => re.test(value))) problems.push(`${name} holds something that looks like a secret key.`);
    // A Supabase JWT with the service_role claim is a server key.
    const payload = value.split('.')[1];
    if (payload) {
      try {
        if (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role === 'service_role') problems.push(`${name} is a Supabase service_role key.`);
      } catch {
        /* not a JWT */
      }
    }
  }
  return problems;
}

export default defineConfig(({ mode }) => {
  const problems = checkPublicEnv({ ...loadEnv(mode, process.cwd(), 'VITE_'), ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('VITE_')) as [string, string][]) });
  if (problems.length && mode !== 'test') throw new Error(`Refusing to build:\n- ${problems.join('\n- ')}`);
  return {
    base: '/school-dashboard/',
    plugins: [react()],
    build: { target: 'es2022' },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'supabase/tests/**/*.test.ts'],
    },
  };
});
