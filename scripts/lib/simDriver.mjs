// Runs one step of the Simulator driver (safari/SimDriver, Loop 308): Apple's UI testing taps through the Simulator's
// Settings or Safari. Returns the on-screen list it printed, and whether the step passed.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve('safari/SimDriver');
const DD = process.env.SIM_DD ?? resolve('.scratch/dd-simdriver');
let built = false;

export function simDriver(sim, { app = 'settings', taps = [], fresh = false } = {}) {
  if (!existsSync(`${DIR}/SimDriver.xcodeproj`)) execFileSync('xcodegen', [], { cwd: DIR, stdio: 'ignore' });
  const args = [built ? 'test-without-building' : 'test', '-scheme', 'SimDriver', '-destination', `id=${sim}`, '-derivedDataPath', DD];
  // TEST_RUNNER_<NAME> reaches the test as <NAME> only from xcodebuild's own environment.
  const env = { ...process.env, TEST_RUNNER_APP: app, TEST_RUNNER_TAPS: taps.join('>'), TEST_RUNNER_FRESH: fresh ? '1' : '0' };
  const r = spawnSync('xcodebuild', args, { cwd: DIR, env, encoding: 'utf8', maxBuffer: 64 << 20 });
  built = true;
  const out = `${r.stdout}${r.stderr}`;
  const m = out.match(/LIST>>>\n([\s\S]*?)\n<<<LIST/);
  const fail = out.match(/error: -\[Driver testStep\] : (.*)/);
  return { ok: r.status === 0, list: m ? m[1].split('\n') : [], why: fail ? fail[1] : r.status === 0 ? '' : out.slice(-1500) };
}
