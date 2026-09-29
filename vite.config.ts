/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { syncScriptSource } from './src/halo/bookmarklet';
import { HANDOFF_PATH, SYNC_SCRIPT } from './src/halo/handoff';

/**
 * The site serves the current Halo sync script beside the app (halo-sync.js). The Sync Halo bookmark is only a
 * loader for it, so a bookmark saved in September still runs December's code. Emitted on build; served in dev.
 */
function haloSyncScript(base: string, supabaseUrl: string): Plugin {
  // The server path's address, from the public Supabase URL; empty on a build without accounts (no server path).
  const dropUrl = supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/sync-drop` : '';
  const body = () => syncScriptSource(`${base}${HANDOFF_PATH}`, dropUrl);
  return {
    name: 'halo-sync-script',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: SYNC_SCRIPT, source: body() });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if ((req.url ?? '').split('?')[0] !== `${base}${SYNC_SCRIPT}`) return next();
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(body());
      });
    },
  };
}

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

const SITE_BASE = process.env.SITE_BASE ?? '/school-dashboard/';

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('VITE_')) as [string, string][]) };
  const problems = checkPublicEnv(env);
  if (problems.length && mode !== 'test') throw new Error(`Refusing to build:\n- ${problems.join('\n- ')}`);
  return {
    // Two sites from one build step (2026-09-29): haloplus.app at the root (SITE_BASE=/), and the old github.io
    // address under /school-dashboard/, which keeps serving the sync script old bookmarks load and moves students over.
    base: SITE_BASE,
    plugins: [react(), haloSyncScript(SITE_BASE, env.VITE_SUPABASE_URL ?? '')],
    build: { target: 'es2022' },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'supabase/tests/**/*.test.ts'],
    },
  };
});
