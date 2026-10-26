import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The rules behind 0.7.6 (George, 2026-10-21: "the core thing cannot fail even 10% of the time"). The extension is plain
// JS outside the app bundle, so these read its source. A Windows student's first sync sat silent for half an hour in a
// Halo tab that never answered; scheduled syncs stalled on 9 computers in October; one laptop sent a dead key 58 times.
const bg = readFileSync('extension/background.js', 'utf8');
const dash = readFileSync('extension/content-dash.js', 'utf8');
const popup = readFileSync('extension/popup.js', 'utf8');
const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8')) as { version: string; permissions: string[]; host_permissions: string[] };
const fn = (name: string) => {
  const i = bg.indexOf(`async function ${name}(`);
  const j = bg.indexOf('\nasync function ', i + 10);
  return bg.slice(i, j === -1 ? undefined : j);
};

describe('a sync never waits forever', () => {
  it('reads Halo in a tab of its own unless the student is on Halo right now and it answers', () => {
    const t = fn('studentTab');
    expect(t).toContain('active: true');
    expect(t).toContain('win.focused');
    expect(t).toMatch(/within\(chrome\.tabs\.sendMessage\(t\.id, \{ kind: 'ping' \}\), 3000/);
    expect(fn('readHalo')).toContain('tab = await quietTab()');
  });
  it('puts a time limit on every call into a tab, and keeps the worker alive from the first moment', () => {
    expect(fn('quietTab')).toMatch(/within\(chrome\.tabs\.create/);
    expect(fn('readHalo')).toMatch(/await within\(ensureRelay\(tab\.id\), 10_000/);
    const run = fn('runSync');
    expect(run.indexOf('setInterval(() => void chrome.runtime.getPlatformInfo(), 5000)')).toBeLessThan(run.indexOf('readHalo('));
    expect(run).toContain('clearInterval(alive)');
  });
  it('does not count time the computer slept as Halo going quiet', () => {
    expect(fn('readHalo')).toMatch(/if \(now - tick > 30_000\) state\.lastProgressAt \+= now - tick;/);
  });
  it('reloads Halo and tries once more on its own before saying anything', () => {
    const run = fn('runSync');
    // Not on a Halo visit's quiet sync (0.11.0): that one never reloads the page the student is reading.
    expect(run).toMatch(/if \(!r\.payload && r\.retry && !visit\) \{[\s\S]*readHalo\(\{ fresh: true \}\)/);
    expect(bg).toMatch(/const retryable = \(raw\) => \/stopped answering\|did not answer\|No tab with id\|Frame with ID/);
  });
  it('ends every run in words, whatever went wrong, so no page waits forever', () => {
    const run = fn('runSync');
    expect(run).toContain('} catch (e) {');
    expect(run).toMatch(/await failed\(explain\(why\), auto, \{ first, visit \}\)/);
  });
  it('replaces a stuck run instead of joining it when Halo+ asks again', () => {
    expect(bg).toMatch(/msg\.kind === 'page-sync'[\s\S]{0,600}if \(state\.running && Date\.now\(\) - state\.lastProgressAt > STUCK_MS\) state\.running = false;/);
  });
  it('waits for a browser window instead of failing when there is none (Windows background mode)', () => {
    expect(fn('runSync')).toContain("Object.assign(end, { outcome: 'skipped', cause: 'no-window' })");
    expect(bg).toContain('chrome.windows.onCreated.addListener');
  });
  it('counts and resumes a sync the browser cut off', () => {
    expect(bg).toContain("cause: 'interrupted'");
    expect(bg).toMatch(/if \(runningSetup && runKey && resumedRun !== runKey/);
  });
});

describe('a refusal is not repeated forever', () => {
  it('drops a key the account no longer has, and waits for Halo+ to hand over the new one', () => {
    expect(fn('toAccount')).toMatch(/if \(r\.status === 401\) \{\s+await chrome\.storage\.local\.remove\('syncKey'\);\s+return \{ ok: false, kind: 'no-key' \};/);
  });
  it('stops the schedule on a plan without auto-sync', () => {
    expect(fn('toAccount')).toMatch(/if \(r\.status === 403 && j && j\.plan\) \{[\s\S]*chrome\.alarms\.clear\(ALARM\)/);
  });
});

describe('back to Halo+ (George, 2026-10-21)', () => {
  it('brings Halo+ to the front after the first sync, opening it if needed, and after the install', () => {
    expect(fn('finish')).toMatch(/if \(first && !auto\) \{\s+await focusDash\(\);\s+await setupState\('done'\);/);
    expect(fn('focusDash')).toContain('chrome.tabs.create({ url: `${DASH_ORIGIN}/#/now`, active: true })');
    // From Halo+'s own setup (a Halo+ tab open) back to Halo+; from the Web Store, the welcome tab (0.11.0).
    expect(bg).toMatch(/if \(d\.reason === 'install'\) \{\s+await sleep\(800\);[\s\S]{0,400}else await focusDash\(\);/);
  });
  it('the popup says "Syncing your classes…", then "Done! Back to Halo+"', () => {
    expect(popup).toContain("'Syncing your classes…'");
    expect(popup).toContain("['Back to Halo+', 'dash', false]");
    expect(fn('setupState')).toContain('await showPopup()');
  });
  it('Reload Halo from the page reloads the student\'s Halo and syncs in a fresh tab', () => {
    expect(dash).toContain("kind: 'reload-sync'");
    expect(bg).toMatch(/msg\.kind === 'reload-sync'[\s\S]{0,400}chrome\.tabs\.reload/);
  });
});

describe('no new permissions', () => {
  it('asks for exactly what 0.7.5 asked for', () => {
    expect(manifest.permissions).toEqual(['alarms', 'storage', 'unlimitedStorage', 'scripting', 'tabs']);
    expect(manifest.host_permissions).toEqual(['https://halo.gcu.edu/*', 'https://haloplus.app/*', 'https://richardsgeorger-collab.github.io/*', 'https://kiacmspgvntzwngijibr.supabase.co/functions/v1/sync-drop', 'https://kiacmspgvntzwngijibr.supabase.co/functions/v1/report']);
  });
  it('reports runs through the report function it already reaches', () => {
    expect(bg).toMatch(/kind: 'sync-run'/);
    expect(fn('logRun')).toContain('fetch(REPORT_URL');
  });
});

describe('Free syncs whenever it is on Halo (0.11.0)', () => {
  it('a Halo visit syncs quietly when nothing tried in 30 minutes, with an account, never a reload or a badge', () => {
    expect(bg).toContain('const VISIT_MS = 30 * 60_000;');
    expect(bg).toMatch(/if \(lastAttemptAt && Date\.now\(\) - new Date\(lastAttemptAt\)\.getTime\(\) < VISIT_MS\) return;[\s\S]{0,120}runSync\(\{ auto: false, quiet: true, visit: true \}\)/);
    expect(bg).toMatch(/if \(!syncKey \|\| state\.running/);
    expect(fn('failed')).toMatch(/if \(visit\) return;/);
  });
  it('a Web Store install opens the welcome tab; one from Halo+ goes back to Halo+', () => {
    // The install is counted before the open tabs get their scripts (the link an open Halo+ tab makes needs the row).
    expect(bg).toMatch(/const source = dash\.length \? 'site' : 'store';\s+if \(d\.reason === 'install'\) await reportInstall\(source\);[\s\S]{0,700}chrome\.tabs\.create\(\{ url: WELCOME_URL, active: true \}\)[\s\S]{0,80}else await focusDash\(\);/);
    expect(bg).toContain("const WELCOME_URL = `${DASH_ORIGIN}/#/welcome?src=store`;");
  });
});

