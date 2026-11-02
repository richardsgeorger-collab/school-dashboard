// Halo+ for Safari (Loop 308): makes safari/build/ from extension/, the one source for Chrome, Edge and Safari. The Xcode
// project (safari/Halo+/) points at safari/build/ and runs this script before every build, so a Chrome change lands
// in Safari on the next build with nothing copied by hand.
//
// What differs from the Chrome folder:
//   - background.js is bundled into one plain script (Apple's converter flags a module background as unsupported);
//   - the manifest has no "type": "module" and names the lowest Safari it supports.
//
//   node scripts/build-safari.mjs           → safari/build/ (what ships)
//   SAFARI_TEST=1 node scripts/build-safari.mjs → the same, pointed at the local Halo stand-in (scripts/lib/safariBench.mjs):
//     Halo at http://127.0.0.1:4180, its gateway at :4181, orchestration at :4182, Halo+'s server at :4183, plus a probe
//     that reports the page to the bench. Never uploaded: scripts/safari-testflight.mjs refuses a build with 127.0.0.1 in it.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { buildSync } from 'esbuild';

const SRC = 'extension';
const OUT = 'safari/build';
const TEST = process.env.SAFARI_TEST === '1';
export const TEST_HOSTS = {
  'https://halo.gcu.edu': 'http://127.0.0.1:4180',
  'https://gateway.halo.gcu.edu': 'http://127.0.0.1:4181',
  'https://orchestration.halo.gcu.edu': 'http://127.0.0.1:4182',
  'https://kiacmspgvntzwngijibr.supabase.co': 'http://127.0.0.1:4183',
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
cpSync(SRC, OUT, { recursive: true, filter: (p) => !/(^|\/)(README\.md|\.DS_Store)$/.test(p) });

// One plain background script: config.js, halo-model.js and onhalo/logic.js inlined.
buildSync({ entryPoints: [join(SRC, 'background.js')], bundle: true, format: 'iife', target: 'safari16', outfile: join(OUT, 'background.js'), allowOverwrite: true, legalComments: 'none', logLevel: 'error' });
rmSync(join(OUT, 'config.js'));

const m = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));
m.background = { service_worker: 'background.js' };
m.browser_specific_settings = { safari: { strict_min_version: '17.0' } };
// Safari lists the name and description in its Settings and the App Store: no school's name in them (George, Loop 308).
m.name = 'Halo+';
m.short_name = 'Halo+';
m.description = "Search every Halo class, see what's next and your grade on every class, and open rubrics in place. Free on Halo LMS.";
// Safari asks the student to allow each site: only the two that matter. Halo+'s server answers the extension's own
// origin (CORS), so it needs no permission, and the old github.io address is Chrome's past, not Safari's.
m.host_permissions = ['https://halo.gcu.edu/*', 'https://haloplus.app/*'];
for (const cs of m.content_scripts) cs.matches = cs.matches.filter((u) => !u.includes('github.io'));

if (TEST) {
  const swap = (s) => Object.entries(TEST_HOSTS).reduce((t, [a, b]) => t.split(a).join(b), s);
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  for (const f of walk(OUT).filter((f) => /\.(js|html)$/.test(f))) writeFileSync(f, swap(readFileSync(f, 'utf8')));
  // The sync script's own "are we on Halo?" check is by host name: the stand-in's host.
  {
    const f = join(OUT, 'sync-inject.js');
    writeFileSync(f, readFileSync(f, 'utf8').split('location.hostname!=="halo.gcu.edu"').join('location.hostname!=="127.0.0.1"'));
  }
  Object.assign(m, JSON.parse(swap(JSON.stringify(m))));
  // The stand-in's own ports (gateway, orchestration, Halo+'s server) are other origins: allowed too.
  m.host_permissions.push('http://127.0.0.1/*');
  // Safari's match patterns take no port: the stand-in's pages match by host.
  for (const cs of m.content_scripts) cs.matches = cs.matches.map((u) => u.replace(/^http:\/\/127\.0\.0\.1:\d+\//, 'http://127.0.0.1/'));
  for (const w of m.web_accessible_resources) w.matches = w.matches.map((u) => u.replace(/^http:\/\/127\.0\.0\.1:\d+\//, 'http://127.0.0.1/'));
  m.host_permissions = [...new Set(m.host_permissions.map((u) => u.replace(/^http:\/\/127\.0\.0\.1:\d+\//, 'http://127.0.0.1/')))];
  m.name = 'Halo+ (test)';
  cpSync('scripts/lib/safari-probe.js', join(OUT, 'safari-probe.js'));
  // Safari's tab search takes no port either: the background's Halo tab searches look on the stand-in's host.
  {
    const bgf = join(OUT, 'background.js');
    let code = readFileSync(bgf, 'utf8').split('url: `${HALO}*`').join("url: 'http://127.0.0.1/*'");
    // What the student's-tab search saw, for the bench (test build only).
    code = code.replace(/(const tabs = await within\(chrome\.tabs\.query\(\{ url: 'http:\/\/127\.0\.0\.1\/\*', active: true \}\)[^;]*;)/, "$1 chrome.storage.local.set({ __tabs: JSON.stringify(tabs.map((t) => ({ id: t.id, u: t.url, s: t.status, a: t.active, d: t.discarded, w: t.windowId }))) });");
    // And what Safari answered when the sync's script was put into Halo's page.
    code = code.replace('chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["sync-inject.js"], world: "MAIN" })', 'chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["sync-inject.js"], world: "MAIN" }).then((r) => (chrome.storage.local.set({ __inject: JSON.stringify(r).slice(0, 300) }), r), (e) => { chrome.storage.local.set({ __inject: "error: " + String(e && e.message || e) }); throw e; })');
    writeFileSync(bgf, code);
  }
  // The background's own errors, kept where the probe can read them (Safari's console is out of a script's reach).
  const bg = join(OUT, 'background.js');
  writeFileSync(bg, `try { chrome.storage.local.set({ __bgStart: new Date().toISOString() }); self.addEventListener('error', (e) => chrome.storage.local.set({ __bgError: String(e.message) + ' @' + e.lineno + ':' + e.colno })); self.addEventListener('unhandledrejection', (e) => chrome.storage.local.set({ __bgReject: String(e.reason && (e.reason.stack || e.reason)) })); } catch (e) {}\ntry {\n${readFileSync(bg, 'utf8')}\n} catch (e) { chrome.storage.local.set({ __bgError: String(e && (e.stack || e)) }); }\n`);
  for (const cs of m.content_scripts) cs.js.push('safari-probe.js');
}
writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(m, null, 2)}\n`);

const files = readdirSync(OUT, { recursive: true }).filter((f) => statSync(join(OUT, f)).isFile());
if (!TEST && files.some((f) => /\.(js|json|html)$/.test(f) && readFileSync(join(OUT, f), 'utf8').includes('127.0.0.1:418'))) throw new Error('a test address in the Safari build');
console.log(`safari/build ${TEST ? '(test, local stand-in) ' : ''}from ${relative('.', SRC)}: ${files.length} files, version ${m.version}`);
if (!existsSync('safari/build/background.js')) process.exit(1);
