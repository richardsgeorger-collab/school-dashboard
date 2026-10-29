// Before (0.12.5) and after (0.12.6) pictures of the class cards' NEXT box and finished classes, on Halo's Student Home
// stand-in with George-like data: the demo student Maya Torres's six classes (made up), a finished (Post-Class) class,
// a class with a participation post and an in-class exam; full width and 1024px, plain and Better Halo dark.
//   WHICH=before EXT_DIR=<0.12.5 unpacked> [BH_DIR=…] node scripts/shots-onhalo-0126.mjs
//   WHICH=after [BH_DIR=…] node scripts/shots-onhalo-0126.mjs
import { gradesGateway } from './lib/haloPages.mjs';
import { bhPath, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const WHICH = process.env.WHICH === 'before' ? 'before' : 'after';
const OUT = out(`docs/screens/on-halo-0126/${WHICH}`);
const DAY = 864e5;
for (const run of [{ bh: false }, ...(bhPath ? [{ bh: true }] : [])]) {
  const tag = run.bh ? 'bh-dark' : 'plain';
  const b = await openBench({ label: `s126-${WHICH}-${tag}`, bh: run.bh, bhDark: run.bh });
  Object.assign(b.bench.state.gateway, gradesGateway(b.fx));
  try {
    const fx = b.fx;
    const now = Date.now();
    const idx = JSON.parse(JSON.stringify(fx.index));
    // An in-class exam in BIO-181 (Halo's in-person flag), and a finished class on the page.
    const exam = idx.rows.find((r) => r.c === 0 && ['assignment', 'quiz'].includes(r.kind) && Date.parse(r.cdue) > now + DAY && Date.parse(r.cdue) < now + 6 * DAY);
    if (exam) Object.assign(exam, { ns: 1, inp: 1, title: 'Exam 1' });
    b.bench.state.extraCards = [{ slugId: 'ENG-105-O500-20260601', classCode: 'ENG-105-O500', name: 'English Composition I', id: 'demo-eng', stage: 'Post-Class', color: 'var(--lms-colorClassCardPeriwinkleBlue, #7b87c6)' }];
    const snap = JSON.parse(JSON.stringify(fx.snap));
    snap.classes.push({ id: 'demo-course-ENG-105', code: 'ENG-105', cc: 'ENG-105-O500', slug: 'ENG-105-O500-20260601', name: 'English Composition I', g: 93.4, gl: 'A', ga: new Date().toISOString(), col: '#7b87c6' });
    await b.seed({ lastAttemptAt: new Date().toISOString(), haloIndex: idx, haloSnap: snap });
    for (const [w, h] of [[1366, 1500], [1024, 1900]]) {
      const p = await b.page('https://halo.gcu.edu/', { width: w, height: h });
      await until(async () => (await p.locator('[data-haloplus="card-next"]').count()) >= 6, 15000, 200);
      await sleep(2000);
      await p.mouse.move(3, 3);
      await p.screenshot({ path: `${OUT}/${tag}-home-${w}.png` });
      // A close look at three cards.
      const g = p.locator('#Home--main section [class*="MuiGrid-container"]').first();
      const box = await g.boundingBox();
      await p.screenshot({ path: `${OUT}/${tag}-cards-${w}.png`, clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 760) } });
      await p.close();
    }
    console.log(`${WHICH} ${tag}: done`);
  } catch (e) {
    console.log(`${WHICH} ${tag}: ${e.stack || e.message}`);
  } finally {
    await b.close();
  }
}
