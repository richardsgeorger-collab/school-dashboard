// The Halo+ mark up close (0.12.1): Halo+'s search field on Student Home, four times its size (CSS zoom on that one
// field), with the mark beside "⌘K", plain and Better Halo dark. WHICH=before EXT_DIR=<0.12.0> | WHICH=after.
import { bhPath, openBench, out, sleep } from './lib/onHaloRun.mjs';

const WHICH = process.env.WHICH === 'before' ? 'before' : 'after';
const OUT = out(`docs/screens/on-halo-0121/${WHICH}`);
for (const run of [{ bh: false }, ...(bhPath ? [{ bh: true }] : [])]) {
  const tag = run.bh ? 'bh-dark' : 'plain';
  const b = await openBench({ label: `mark-${WHICH}-${tag}`, bh: run.bh, bhDark: run.bh });
  try {
    // A sync just tried: no visit sync against the fake Halo (its "Halo sync failed" note is not part of the pictures).
    await b.seed({ lastAttemptAt: new Date().toISOString() });
    const p = await b.page('https://halo.gcu.edu/');
    await sleep(2500);
    const end = p.locator('[data-haloplus="search-bar"]').first();
    await end.evaluate((h) => {
      h.style.zoom = '4';
      h.style.width = '320px';
    });
    await sleep(300);
    await p.setViewportSize({ width: 1600, height: 900 });
    await sleep(300);
    await end.screenshot({ path: `${OUT}/${tag}-mark-closeup.png` });
    console.log(`${WHICH} ${tag}: done`);
  } catch (e) {
    console.log(`${WHICH} ${tag}: ${e.message}`);
  } finally {
    await b.close();
  }
}
