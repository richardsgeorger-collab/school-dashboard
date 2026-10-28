// Halo's own look for the stand-in pages (0.12.0 tests): the stand-ins copy the structure of Halo's pages (from Halo's
// public code), and take Halo's real stylesheets and fonts from Halo's public CDN at test time, so a screenshot shows
// Halo+'s additions on Halo as it really looks. Nothing here logs in or reads anyone's data: only the public files
// any visitor's browser downloads (https://halo.gcu.edu/_next/static/...). Kept in .scratch/halo-build.json for a day.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const CACHE = '.scratch/halo-build.json';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

/** Halo's current build: its id, the stylesheets each route loads, and every CSS-module class name in them. */
export async function haloBuild() {
  if (existsSync(CACHE)) {
    const c = JSON.parse(readFileSync(CACHE, 'utf8'));
    if (Date.now() - c.at < 24 * 3_600_000) return withHelpers(c);
  }
  const html = await (await fetch('https://halo.gcu.edu/login', { headers: { 'user-agent': UA } })).text();
  const buildId = /"buildId":"([^"]+)"/.exec(html)?.[1];
  if (!buildId) throw new Error('Halo build not found');
  const bm = await (await fetch(`https://halo.gcu.edu/_next/static/${buildId}/_buildManifest.js`, { headers: { 'user-agent': UA } })).text();
  const self = {};
  new Function('self', bm)(self);
  const manifest = self.__BUILD_MANIFEST;
  const routes = {};
  const cssFiles = new Set();
  for (const [route, files] of Object.entries(manifest)) {
    if (!Array.isArray(files)) continue;
    routes[route] = files.filter((f) => f.endsWith('.css'));
    routes[route].forEach((f) => cssFiles.add(f));
  }
  // The app's own stylesheet (global styles, fonts) comes with _app.
  const appCss = [...html.matchAll(/href="\/_next\/(static\/css\/[^"]+\.css)"/g)].map((m) => m[1]);
  appCss.forEach((f) => cssFiles.add(f));
  const names = {};
  for (const f of cssFiles) {
    const css = await (await fetch(`https://halo.gcu.edu/_next/${f}`, { headers: { 'user-agent': UA } })).text();
    for (const m of css.matchAll(/\.([A-Za-z0-9]+_[A-Za-z0-9]+__[A-Za-z0-9_-]{5})\b/g)) names[m[1].replace(/__[A-Za-z0-9_-]{5}$/, '')] = m[1];
  }
  const c = { at: Date.now(), buildId, routes, appCss, names };
  mkdirSync('.scratch', { recursive: true });
  writeFileSync(CACHE, JSON.stringify(c));
  return withHelpers(c);
}

function withHelpers(c) {
  return {
    ...c,
    /** `<link>`s for a route's stylesheets (with the app's), as Halo's own page has them. */
    links(route) {
      const files = [...new Set([...(c.appCss || []), ...(c.routes[route] || [])])];
      return files.map((f) => `<link rel="stylesheet" href="https://halo.gcu.edu/_next/${f}">`).join('');
    },
    /** The real hashed class for a CSS-module name ("CourseCard_cardContainer" → "CourseCard_cardContainer__ME7dH"). */
    cls(name) {
      return c.names[name] || `${name}__x`;
    },
  };
}
