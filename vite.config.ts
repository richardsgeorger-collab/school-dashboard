/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { syncScriptSource } from './src/halo/bookmarklet';
import { HANDOFF_PATH, SYNC_SCRIPT } from './src/halo/handoff';
import { HELP_PAGES, renderHelpIndex, renderHelpPage, renderLlmsTxt, renderSitemap } from './src/help/pages';

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

/**
 * The pages search engines and AI assistants read (2026-09-30): the help pages at real addresses (/help/<slug>/), the
 * sitemap and llms.txt, all from src/help/pages.ts. Emitted on build; served in dev.
 */
function helpSite(base: string): Plugin {
  const files = (): Record<string, string> => ({
    'help/index.html': renderHelpIndex(base),
    ...Object.fromEntries(HELP_PAGES.map((p) => [`help/${p.slug}/index.html`, renderHelpPage(p, base)])),
    'sitemap.xml': renderSitemap(new Date().toISOString().slice(0, 10)),
    'llms.txt': renderLlmsTxt(),
  });
  return {
    name: 'help-site',
    generateBundle() {
      for (const [fileName, source] of Object.entries(files())) this.emitFile({ type: 'asset', fileName, source });
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0].slice(base.length);
        const all = files();
        const hit = all[path] ?? all[`${path.replace(/\/?$/, '/')}index.html`];
        if (!hit || !path) return next();
        res.setHeader('Content-Type', path.endsWith('.xml') ? 'application/xml' : path.endsWith('.txt') ? 'text/plain; charset=utf-8' : 'text/html; charset=utf-8');
        res.end(hit);
      });
    },
  };
}

/**
 * The landing page's full text in the HTML every visitor and crawler receives (2026-09-30), not only after the app's
 * JavaScript runs: after the build, <Landing /> is rendered to HTML inside #root. The app replaces it when it starts.
 * A returning student (signed in, or any #/ address) never sees it: an inline script hides it before first paint.
 */
function prerenderLanding(): Plugin {
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'prerender-landing',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
      root = c.root;
    },
    async closeBundle() {
      const { createServer } = await import('vite');
      const { readFileSync, writeFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const server = await createServer({ root, configFile: false, logLevel: 'error', plugins: [react()], server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', define: { __APP_VERSION__: '"prerender"' } });
      try {
        const { Landing } = (await server.ssrLoadModule('/src/landing/Landing.tsx')) as { Landing: () => unknown };
        // React itself from Node, the same copy the SSR-loaded module uses (dependencies are external there).
        const { renderToStaticMarkup } = await import('react-dom/server');
        const { createElement } = await import('react');
        const markup = renderToStaticMarkup(createElement(Landing as () => null));
        const file = resolve(root, outDir, 'index.html');
        const html = readFileSync(file, 'utf8');
        if (!html.includes('<div id="root"></div>')) throw new Error('prerender: no empty #root in index.html');
        writeFileSync(file, html.replace('<div id="root"></div>', `<div id="root">${markup}</div>`));
      } finally {
        await server.close();
      }
    },
  };
}

const SITE_BASE = process.env.SITE_BASE ?? '/school-dashboard/';

/** Which deploy this is, on every error report: the day and the commit ("2026-09-30.7b2f66d"). */
function appVersion(): string {
  let sha = process.env.GITHUB_SHA?.slice(0, 7) ?? '';
  if (!sha) {
    try {
      sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      sha = 'local';
    }
  }
  return `${new Date().toISOString().slice(0, 10)}.${sha}`;
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('VITE_')) as [string, string][]) };
  const problems = checkPublicEnv(env);
  if (problems.length && mode !== 'test') throw new Error(`Refusing to build:\n- ${problems.join('\n- ')}`);
  return {
    // Two sites from one build step (2026-09-29): haloplus.app at the root (SITE_BASE=/), and the old github.io
    // address under /school-dashboard/, which keeps serving the sync script old bookmarks load and moves students over.
    base: SITE_BASE,
    define: { __APP_VERSION__: JSON.stringify(mode === 'test' ? 'test' : appVersion()) },
    plugins: [react(), haloSyncScript(SITE_BASE, env.VITE_SUPABASE_URL ?? ''), helpSite(SITE_BASE), ...(mode === 'test' ? [] : [prerenderLanding()])],
    build: { target: 'es2022' },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'supabase/tests/**/*.test.ts'],
    },
  };
});
