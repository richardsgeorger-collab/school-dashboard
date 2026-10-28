// What Halo+ on Halo's pages costs the computer and Halo (extension 0.12.0, George: "Measure CPU and network before and
// after on a typical Halo session"). The same scripted session on Halo's stand-in pages (Student Home, a search, a
// class calendar with All classes, a topic page with a rubric opened, the assignment view, a discussion reply of about
// 60 words, the announcements, then one minute idle on Student Home with the tab in front), three ways: no Halo+, Halo+
// 0.11.1 (before), Halo+ 0.12.0 with every feature on (after). Per page, Chrome's own counters (time the page's main
// thread spent running script, layout and style), and every request to Halo (its gateway, its file service, its
// pages, its public files) with sizes. Runs each way RUNS times (default 3) and reports the median.
//   [RUNS=3] [BEFORE_DIR=<0.11.1 unpacked>] node scripts/measure-onhalo.mjs
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { classPage, discussionPage, FORUM_REST, forumState, gradesGateway, onHaloFixture, standIn, topicGateway, topicPage, announcementsPage, FILE_REST, resourceGateway, SUBMIT_REST, participationGateway, countsGateway } from './lib/haloPages.mjs';
import { launch, sleep, until } from './lib/haloStandIn.mjs';

const RUNS = Number(process.env.RUNS ?? 3);
const BEFORE = process.env.BEFORE_DIR ? resolve(process.env.BEFORE_DIR) : null;
const AFTER = resolve('extension');
const fx = onHaloFixture();
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function session(which, ext) {
  const { browser, ctx, proc, load } = await launch('chrome', `measure-${which}`);
  const bench = await standIn(ctx, fx, {
    pages: { '^/courses/[^/]+/forums/discussion/[^/]+$': discussionPage, '^/courses/[^/]+/course-units/[^/]+$': topicPage, '^/courses/[^/]+/announcements/?$': announcementsPage, '^/courses/[^/]+/?$': classPage },
    // Halo answers the class grade too (Halo+ 0.11.1's refresh on Student Home): answered, it is kept for 30 minutes,
    // as on Halo; unanswered, it would be asked again on every visit and count twice.
    gateway: { ...topicGateway(fx), ...gradesGateway(fx), ...resourceGateway(fx), ...participationGateway(), ...countsGateway(fx), GradeOverview: () => ({ gradeOverview: [{ finalGrade: { id: 'fg', finalPoints: 91, gradeValue: 'A-', isPublished: true, maxPoints: 100 } }] }) },
    rest: [FORUM_REST, FILE_REST, SUBMIT_REST],
  });
  await ctx.route('**/functions/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true}' }));
  await ctx.route('https://haloplus.app/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>' }));
  const net = { gateway: 0, rest: 0, pages: 0, cdn: 0, cdnBytes: 0, other: 0 };
  // What the counts are made of: Halo's questions by name, the other requests by where they went.
  const detail = { ops: {}, other: {} };
  ctx.on('requestfinished', async (r) => {
    const u = new URL(r.url());
    const sizes = await r.sizes().catch(() => ({ responseBodySize: 0 }));
    if (u.hostname === 'gateway.halo.gcu.edu' && r.method() === 'POST') {
      let op = '?';
      try {
        op = JSON.parse(r.postData() || '{}').operationName || '?';
      } catch {
        /* not JSON */
      }
      detail.ops[op] = (detail.ops[op] || 0) + 1;
    }
    if (u.hostname === 'gateway.halo.gcu.edu' && r.method() === 'POST') net.gateway += 1;
    else if (u.hostname === 'orchestration.halo.gcu.edu' && r.method() !== 'OPTIONS') net.rest += 1;
    else if (u.hostname === 'halo.gcu.edu' && u.pathname.startsWith('/_next/static/')) {
      net.cdn += 1;
      net.cdnBytes += sizes.responseBodySize || 0;
    } else if (u.hostname === 'halo.gcu.edu' && r.resourceType() === 'document') net.pages += 1;
    else if (!/googleapis|gstatic|esm\.sh/.test(u.hostname) && u.hostname !== 'halo.gcu.edu') {
      net.other += 1;
      let from = '';
      try {
        from = new URL(r.frame().page().url()).hostname || 'a new tab';
      } catch {
        from = 'the extension';
      }
      const where = `${u.protocol === 'chrome-extension:' ? 'the extension\'s own files' : `${u.hostname}${u.pathname.replace(/\/[^/]*$/, '/')}`} from ${from}`;
      detail.other[where] = (detail.other[where] || 0) + 1;
    }
  });
  if (ext) {
    const { worker } = await load(ext);
    await worker.evaluate((x) => chrome.storage.local.set(x), { tier: 'max', lastSyncAt: fx.now, syncKey: 'a'.repeat(48), haloSnap: fx.snap, haloIndex: fx.index, haloUiOn: null, haloFeat: null, haloDrafts: null, haloViews: null, haloPreload: null, haloCounts: null, haloCalLive: null });
    await sleep(1500);
    for (const pg of ctx.pages()) if (/^https:\/\/haloplus\.app|^chrome-extension:/.test(pg.url())) await pg.close().catch(() => undefined);
    await sleep(500);
  }
  // Only the Halo session counts: a fresh install opens Halo+'s welcome tab once, which is not part of using Halo.
  if (process.env.DETAIL) console.log(`${which} install, before the session: ${JSON.stringify(detail.other)}`);
  Object.assign(net, { gateway: 0, rest: 0, pages: 0, cdn: 0, cdnBytes: 0, other: 0 });
  detail.ops = {};
  detail.other = {};
  const cpu = { script: 0, layout: 0, style: 0, task: 0 };
  const perPage = [];
  let idle = null;
  const visit = async (url, act, ms) => {
    const p = await ctx.newPage();
    await p.setViewportSize({ width: 1366, height: 900 });
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Performance.enable');
    await p.goto(url, { waitUntil: 'load' });
    await sleep(1500);
    if (act) await act(p).catch(() => undefined);
    await sleep(ms);
    const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
    cpu.script += m.ScriptDuration;
    cpu.layout += m.LayoutDuration;
    cpu.style += m.RecalcStyleDuration;
    cpu.task += m.TaskDuration;
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    perPage.push(`${parts.length === 0 ? 'home' : parts.length === 2 ? 'class' : parts[2]} ${Math.round(m.TaskDuration * 1000)} ms`);
    return { p, cdp, m };
  };
  const mod = 'Meta';
  const com = fx.payload.classes.find((c) => c.courseCode === 'COM-100');
  const dq = com.discussions[com.discussions.length - 1];
  forumState(bench.state, fx, dq.forumId);
  const mat = fx.payload.classes.find((c) => c.courseCode === 'MAT-250');
  const unit = mat.assessments.find((a) => a.type === 'ASSIGNMENT' && a.points >= 40) ?? mat.assessments[0];
  // Student Home, with a search.
  let v = await visit('https://halo.gcu.edu/', async (p) => {
    await p.keyboard.press(`${mod}+k`);
    await sleep(300);
    await p.keyboard.type('topic 3 quiz', { delay: 30 });
    await sleep(800);
    await p.keyboard.press('Escape');
  }, 6000);
  await v.p.close();
  // A class calendar, All classes.
  v = await visit(`https://halo.gcu.edu/courses/${mat.slugId}`, async (p) => {
    await p.locator('[data-hp-cal="all"]').click({ timeout: 4000 });
  }, 5000);
  await v.p.close();
  // A topic page, a rubric opened, then the assignment view.
  v = await visit(`https://halo.gcu.edu/courses/${mat.slugId}/course-units/${unit.unitId}`, async (p) => {
    const link = p.locator('a[data-testid="print_rubric_link"]').first();
    if (await link.count()) {
      const card = p.locator('[data-testid="assessment_card"]', { has: link });
      if ((await card.locator('button[aria-expanded="false"][data-toggle]').count()) === 1) await card.locator('button[data-toggle]').click();
      await link.hover();
      await link.click({ timeout: 3000 });
    }
    await sleep(1500);
    const open = p.locator('[data-open]').first();
    if (await open.count()) await open.click();
  }, 5000);
  await v.p.close();
  // A discussion: a reply of about 60 words.
  v = await visit(`https://halo.gcu.edu/courses/${com.slugId}/forums/discussion/${dq.forumId}`, async (p) => {
    await until(() => p.evaluate(() => window.__haloEditors === true), 15000, 200);
    await p.locator('[data-testid="post_reply_button"]').first().click();
    await p.locator('.toggleReplyEditor .ProseMirror').first().click();
    await p.keyboard.type('Listening well starts with slowing down and asking a question back before answering. In lab today I tried paraphrasing what my partner said, and we caught a mistake in our titration math because of it. I want to keep doing that this week, especially in group work where it is easy to talk over each other and miss things.', { delay: 12 });
  }, 6000);
  await v.p.close();
  // The announcements.
  v = await visit(`https://halo.gcu.edu/courses/${mat.slugId}/announcements`, null, 5000);
  await v.p.close();
  // One minute idle on Student Home, in front: what runs when the student is doing nothing.
  v = await visit('https://halo.gcu.edu/', null, 3000);
  const m0 = v.m;
  const n0 = { ...net };
  await sleep(60_000);
  const m1 = Object.fromEntries((await v.cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  idle = { task: m1.TaskDuration - m0.TaskDuration, script: m1.ScriptDuration - m0.ScriptDuration, requests: Object.keys(net).reduce((n, k) => (k === 'cdnBytes' ? n : n + (net[k] - n0[k])), 0) };
  await v.p.close();
  await browser.close().catch(() => undefined);
  try {
    proc.kill('SIGKILL');
  } catch {
    /* gone */
  }
  return { cpu, net, idle, detail, perPage };
}

const ways = [['no Halo+', null], ...(BEFORE ? [['Halo+ 0.11.1', BEFORE]] : []), ['Halo+ 0.12.0', AFTER]];
const results = {};
for (const [name, ext] of ways) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const r = await session(name.replace(/\W+/g, ''), ext);
    runs.push(r);
    if (process.env.DETAIL) console.log(`${name} run ${i + 1}: main thread per page ${r.perPage.join(', ')}; Halo's questions ${JSON.stringify(r.detail.ops)}; other requests ${JSON.stringify(r.detail.other)}`);
    console.log(`${name} run ${i + 1}: main thread ${r.cpu.task.toFixed(2)} s (script ${r.cpu.script.toFixed(2)} s), idle minute ${(r.idle.task * 1000).toFixed(0)} ms, Halo gateway ${r.net.gateway}, file service ${r.net.rest}, pages ${r.net.pages}, Halo's public files ${r.net.cdn} (${Math.round(r.net.cdnBytes / 1024)} KB), other ${r.net.other}`);
  }
  results[name] = {
    task: median(runs.map((r) => r.cpu.task)),
    script: median(runs.map((r) => r.cpu.script)),
    layout: median(runs.map((r) => r.cpu.layout + r.cpu.style)),
    idleMs: median(runs.map((r) => r.idle.task * 1000)),
    idleScriptMs: median(runs.map((r) => r.idle.script * 1000)),
    idleRequests: median(runs.map((r) => r.idle.requests)),
    gateway: median(runs.map((r) => r.net.gateway)),
    rest: median(runs.map((r) => r.net.rest)),
    pages: median(runs.map((r) => r.net.pages)),
    cdn: median(runs.map((r) => r.net.cdn)),
    cdnKB: Math.round(median(runs.map((r) => r.net.cdnBytes)) / 1024),
  };
}
console.log(JSON.stringify(results, null, 1));
writeFileSync('.scratch/measure-onhalo.json', JSON.stringify({ at: new Date().toISOString(), runs: RUNS, results }, null, 1));
