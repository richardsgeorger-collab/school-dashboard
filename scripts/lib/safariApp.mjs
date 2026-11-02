// Builds and installs Halo+ for Safari (Loop 308): the iOS Simulator app, or the Mac app. `test`: the build pointed at
// the local stand-in (lib/safariBench.mjs). Products in .scratch/dd-safari (never in the repo).
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export const PROJECT = resolve('safari/Halo+');
export const DD = resolve('.scratch/dd-safari');
export const EXT_ID = 'app.haloplus.HaloPlus.Extension';
export const APP_ID = 'app.haloplus.HaloPlus';

export function buildApp({ platform = 'ios', test = true, team = process.env.APPLE_TEAM_ID } = {}) {
  const scheme = platform === 'ios' ? 'Halo+ (iOS)' : 'Halo+ (macOS)';
  const sign = platform === 'ios' ? ['CODE_SIGNING_ALLOWED=NO'] : team ? [`DEVELOPMENT_TEAM=${team}`, 'CODE_SIGN_STYLE=Automatic', '-allowProvisioningUpdates'] : ['CODE_SIGN_IDENTITY=-'];
  const args = ['-scheme', scheme, ...(platform === 'ios' ? ['-sdk', 'iphonesimulator', '-destination', 'generic/platform=iOS Simulator'] : []), '-configuration', 'Debug', '-derivedDataPath', DD, ...sign, `SAFARI_TEST=${test ? 1 : 0}`, 'build'];
  const r = spawnSync('xcodebuild', args, { cwd: PROJECT, encoding: 'utf8', maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`xcodebuild failed:\n${(r.stdout + r.stderr).split('\n').filter((l) => /error|BUILD/.test(l)).slice(-20).join('\n')}`);
  return platform === 'ios' ? `${DD}/Build/Products/Debug-iphonesimulator/Halo+.app` : `${DD}/Build/Products/Debug/Halo+.app`;
}

export function simInstall(sim, app) {
  execFileSync('xcrun', ['simctl', 'install', sim, app]);
}
export function simOpen(sim, url) {
  execFileSync('xcrun', ['simctl', 'openurl', sim, url]);
}
export function simShot(sim, file) {
  execFileSync('xcrun', ['simctl', 'io', sim, 'screenshot', file], { stdio: 'ignore' });
}
/** A Simulator of this kind made for these tests (kept between runs), booted. */
export function simDevice(name = 'HaloPlus iPhone', type = 'iPhone 17 Pro') {
  const list = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', '-j'], { encoding: 'utf8' }));
  let dev = Object.values(list.devices).flat().find((d) => d.name === name && d.isAvailable);
  if (!dev) {
    const runtime = Object.keys(list.devices).filter((k) => /iOS/.test(k)).sort().pop();
    const udid = execFileSync('xcrun', ['simctl', 'create', name, type, runtime], { encoding: 'utf8' }).trim();
    dev = { udid, state: 'Shutdown' };
  }
  if (dev.state !== 'Booted') {
    spawnSync('xcrun', ['simctl', 'boot', dev.udid]);
    execFileSync('xcrun', ['simctl', 'bootstatus', dev.udid, '-b'], { stdio: 'ignore' });
  }
  return dev.udid;
}

/**
 * Safari in the test Simulator with no tabs: quit, and its saved tabs removed (Safari on a phone keeps every tab, and
 * old test pages kept running and taking the bench's commands). Only ever the test Simulator's own Safari.
 */
export function simFreshSafari(sim) {
  spawnSync('xcrun', ['simctl', 'terminate', sim, 'com.apple.mobilesafari']);
  const home = execFileSync('xcrun', ['simctl', 'getenv', sim, 'HOME'], { encoding: 'utf8' }).trim();
  for (const dir of [`${home}/Library/Safari`]) spawnSync('/bin/sh', ['-c', `rm -f "${dir}"/SafariTabs.db* "${dir}"/BrowserState.db*`]);
}
