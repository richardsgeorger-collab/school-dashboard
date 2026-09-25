// The prompt panel in the running app: an announcement that names the hero item is synced in, then "Prompt for this"
// is opened and its text read, to prove the material reaches the prompt through the real async path.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 1400 });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.setRequestInterception(true);
page.on('request', (req) => (req.url().startsWith('https://api.anthropic.com/') ? req.abort() : req.continue()));

await page.goto(`${BASE}#/now?seed=1`, { waitUntil: 'networkidle0' });
await sleep(600);
const hero = await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('school-dashboard:v1'));
  const title = document.querySelector('.hero-title, .hero h2, .hero-card h2')?.textContent?.trim() ?? '';
  const item = raw.items.find((i) => i.label === title) ?? null;
  const course = item ? raw.courses.find((c) => c.id === item.courseId) : null;
  return item ? { title: item.title, label: item.label, courseId: item.courseId, code: course.code, name: course.name, type: item.type } : null;
});
console.log('hero item:', hero?.code, hero?.title, `(${hero?.type})`);

const post = { id: 'ann-prompt', forumId: 'f1', title: `${hero.title}: what to know`, content: `<p>${hero.title} covers Chapters 1 and 2. It is 20 questions in 30 minutes. A periodic table will be provided. Bring a calculator.</p>`, publishedAt: new Date(Date.now() - 86400000).toISOString(), modifiedAt: null, author: 'Dr. Awad', mustAcknowledge: false, acknowledged: false, resources: [] };
const payload = { kind: 'halo-export', version: 1, build: 'e2e', exportedAt: new Date().toISOString(), source: 'bookmarklet', classes: [{ id: `h-${hero.courseId}`, slugId: 'X', classCode: `${hero.code}-X`, courseCode: hero.code, name: hero.name, instructors: [], startDate: null, endDate: null, stage: 'CURRENT', modality: 'ONGROUND', credits: 3, assessments: [], announcements: [post], resources: [], discussions: [], messages: [] }], alerts: [], problems: [] };
await page.evaluate((p) => window.dispatchEvent(new MessageEvent('message', { origin: 'https://halo.gcu.edu', data: p, source: window })), payload);
await page.waitForSelector('.modal .modal-actions', { timeout: 8000 });
await sleep(900);
await page.$$eval('.modal .modal-actions .btn', (els) => (els.find((e) => /Close|Cancel|Done/.test(e.textContent)) ?? els[0]).click());
await sleep(500);

const opened = await page.$$eval('.hero-actions .btn, .hero .btn', (els) => { const b = els.find((e) => /Prompt for this/.test(e.textContent)); if (!b) return false; b.click(); return true; });
await page.waitForFunction(() => !/Reading your class material/.test(document.querySelector('.panel-body')?.textContent ?? 'x'), { timeout: 8000 }).catch(() => {});
await sleep(300);
const text = await page.$eval('.panel-prompt', (e) => e.textContent).catch(() => '');
console.log('panel opened:', opened, '| characters:', text.length);
console.log('announcement pasted in:', text.includes('covers Chapters 1 and 2'));
console.log('no "read it out":', !/you cannot|read something out/i.test(text));
console.log('no lecturing:', !/must not|worse than useless|leave the work to me/i.test(text));
console.log('\n--- first 900 characters of the rendered prompt ---\n' + text.slice(0, 900));
await browser.close();
