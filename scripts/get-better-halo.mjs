// Better Halo for the on-Halo tests (Loop 311): its current build from the Chrome Web Store (the public download every
// Chrome uses), unpacked at .scratch/better-halo (git-ignored; never copied into the repo, never shipped). The folder
// Chrome adds to a store download (_metadata) is removed, since Chrome will not load an unpacked folder that has it.
//   node scripts/get-better-halo.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ID = 'goofpkaenamaankebgoegfghpkaolchj';
const OUT = resolve(process.env.BH_DIR || '.scratch/better-halo');
const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=154.0&acceptformat=crx2,crx3&x=id%3D${ID}%26uc`;
const r = await fetch(url, { redirect: 'follow' });
if (!r.ok) throw new Error(`the Web Store answered ${r.status}`);
const crx = Buffer.from(await r.arrayBuffer());
mkdirSync('.scratch', { recursive: true });
const file = resolve('.scratch/better-halo.crx');
writeFileSync(file, crx);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
// A .crx is a zip with a header in front: unzip reads past it (and says so).
try {
  execFileSync('unzip', ['-q', '-o', file, '-d', OUT], { stdio: 'pipe' });
} catch (e) {
  if (!existsSync(join(OUT, 'manifest.json'))) throw e;
}
rmSync(join(OUT, '_metadata'), { recursive: true, force: true });
const m = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));
console.log(`Better Halo ${m.version} at ${OUT}`);
