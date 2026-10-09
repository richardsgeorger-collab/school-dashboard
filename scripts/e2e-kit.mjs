// The help kit (George, 2026-10-08) on a throwaway copy of George's UNV-106 data: his last sync's UNV-106 class is
// handed to a throwaway Max account the way the bookmark hands one over (the review, then Apply), so the assignment,
// its rubric, the topic's resources and the announcements are on file as they are for him. Then "Download help kit" on
// UNV Privacy Slides: the zip is caught, opened here, START-HERE.md printed with the file list. Without the extension
// in this browser every Halo file is listed as a link with the note. Read only for Halo: nothing is fetched from it.
//   KEYS_ENV=... [BASE=http://localhost:4174/school-dashboard/] node scripts/e2e-kit.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { chromium } from 'playwright-core';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const BASE = process.env.BASE ?? 'http://localhost:4174/school-dashboard/';
// The kit is built from George's own class data, so the zip, START-HERE.md and the sheet screenshot stay out of the repo.
const SP = process.env.SCRATCH ?? '/tmp';
const OUT = `${SP}/kit`;
mkdirSync(OUT, { recursive: true });
const ref = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dismiss = async (p) => { for (const sel of ['.ext-setup-sheet button:has-text("Skip for now")', '.joy-card button:has-text("Nice")', '.levelup']) if (await p.locator(sel).count()) await p.locator(sel).first().click().catch(() => undefined); };
const text = async (p, sel) => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const GEORGE = '8c3c8dde-6375-4b46-8955-c49bd64f5e2b';

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  // George's last sync, UNV-106 only, as a fresh export.
  const full = (await db.from('pending_syncs').select('payload').eq('user_id', GEORGE).limit(1)).data[0].payload;
  const unv = full.classes.find((c) => /UNV-106/.test(c.courseCode));
  const payload = { ...full, exportedAt: new Date().toISOString(), classes: [unv], alerts: [], source: 'bookmarklet', auto: false };
  const s = await kit.persona('max');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
  await ctx.addInitScript(({ ses, key }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(ses)); }, { ses: s.session, key: `sb-${ref}-auth-token` });
  await ctx.route('**/functions/v1/**', (r) => r.fulfill({ status: 200, body: '{}' }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}#/now`, { waitUntil: 'load' });
  await p.waitForSelector('.now-head', { timeout: 30000 });
  await sleep(2500);
  await dismiss(p);
  // The hand-over, as the bookmark does it.
  await p.evaluate((pl) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: pl, source: window })), payload);
  await p.waitForSelector('.modal .modal-actions .btn.primary', { timeout: 20000 });
  await (await p.$$('.modal .modal-actions .btn.primary'))[0].click();
  await p.waitForFunction(() => document.querySelector('.modal')?.textContent.includes('Applied'), { timeout: 20000 });
  await p.$$eval('.modal .modal-actions .btn, .modal-close', (els) => (els.find((e) => /Close|Done/.test(e.textContent)) || els[els.length - 1]).click());
  await sleep(2500);
  await dismiss(p);
  const course = (await db.from('courses').select('id, data').eq('user_id', s.id)).data.find((r) => r.data.code === 'UNV-106');
  check(!!course, 'UNV-106 arrived in the throwaway');
  const row = (await db.from('items').select('id, data').eq('user_id', s.id)).data.find((r) => /Privacy/i.test(r.data.title));
  check(!!row && row.data.topic === 'Topic 5: Being a Responsible Digital Citizen' && !!row.data.rubric, `the Privacy Slides item is on file with its topic and rubric (${row?.data.label})`);
  // Open it and build the kit.
  await p.goto(`${BASE}#/class?c=${course.id}`, { waitUntil: 'load' });
  await sleep(2500);
  await dismiss(p);
  await sleep(400);
  await p.locator('main button:has-text("Privacy")').first().click();
  await p.waitForSelector('.modal .sheet', { timeout: 15000 });
  await sleep(800);
  check((await p.locator('.sheet-actions-quiet button:has-text("Download help kit")').count()) === 1, 'the quiet row has Download help kit');
  const [download] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.locator('button:has-text("Download help kit")').click()]);
  await sleep(600);
  await p.screenshot({ path: `${OUT}/1-kit-done.png` });
  const note = await text(p, '.kit-note');
  check(/Help kit saved/.test(note), `done message: "${note}"`);
  const zipPath = `${SP}/${download.suggestedFilename()}`;
  await download.saveAs(zipPath);
  check(download.suggestedFilename() === 'UNV-106 UNV Privacy Slides - help kit.zip', `zip name: ${download.suggestedFilename()}`);
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  const names = Object.keys(zip.files).sort();
  console.log('zip contents:', names.join(', '));
  const start = await zip.file('00-START-HERE.md').async('string');
  writeFileSync(`${OUT}/00-START-HERE.md`, start);
  check(/^# Help kit: UNV Privacy Slides/.test(start), 'START-HERE opens with the assignment');
  check(/rules on AI/.test(start) && start.indexOf('rules on AI') < start.indexOf('For the tutor'), 'the AI policy block comes first');
  check(/Do NOT write the submission/.test(start), 'help-only wording');
  check(/- Worth: \d+ points/.test(start) && /- Due: /.test(start), 'the facts');
  check(/## Instructions \(from Halo\)/.test(start) && /PowerPoint/.test(start), 'the instructions from Halo');
  check(/Format rules named in the instructions: .*Six to seven slides/.test(start), 'word-number slide counts are format rules');
  check(/## Rubric/.test(start) && names.includes('rubric.md'), 'the rubric, and rubric.md');
  check(/UNV-106-RS-T5Walkthrough\.docx/.test(start) && /download files on a computer with the Halo\+ extension/i.test(start), 'without the extension: the topic file is listed with the note');
  check(/lopes\.idm\.oclc\.org/.test(start) && /behind the library/.test(start), 'library readings are links, named as such');
  check(!/Purpose Plan|Topic 6/.test(start), "nothing from other assignments or topics");
  console.log('\n----- 00-START-HERE.md -----\n' + start + '\n----- end -----\n');
  await ctx.close();
} finally {
  await browser.close();
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
