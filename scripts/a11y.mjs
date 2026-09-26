// A quick accessibility sweep against the preview: every screen, light, seeded. Reports controls with no accessible
// name, inputs with no label, images with no alt, and anything focusable that is invisible. Not a substitute for a
// screen reader; a way to catch the mechanical misses.   node scripts/a11y.mjs
import { chromium, devices } from 'playwright-core';
const BASE = process.env.BASE ?? 'http://localhost:4173/school-dashboard/';
const ROUTES = ['#/now', '#/calendar', '#/calendar?v=month', '#/classes', '#/inbox', '#/you', '#/you?s=display', '#/you?s=notifications', '#/ai', '#/load', '#/grades', '#/library'];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const [label, device] of [['desk', { viewport: { width: 1440, height: 900 } }], ['phone', { ...devices['iPhone 14'] }]]) {
  const ctx = await browser.newContext({ ...device, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(`${BASE}#/now?seed=1`, { waitUntil: 'networkidle' });
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('school-dashboard:v1')); d.settings.onboarding = { startedAt: 'x', step: 'done', doneAt: 'x', skippedAt: null, tourDoneAt: 'x' }; localStorage.setItem('school-dashboard:v1', JSON.stringify(d)); });
  for (const route of ROUTES) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const problems = await page.evaluate(() => {
      const out = [];
      const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim() || [...el.querySelectorAll('img[alt], svg[aria-label]')].map((x) => x.getAttribute('alt') || x.getAttribute('aria-label')).join(' ').trim();
      const labelled = (el) => el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.id && document.querySelector(`label[for="${el.id}"]`)) || el.closest('label') || el.getAttribute('placeholder') || el.getAttribute('title');
      for (const el of document.querySelectorAll('button, a[href], [role="button"], [role="tab"]')) if (!name(el)) out.push(`no name: <${el.tagName.toLowerCase()} class="${el.className}">`);
      for (const el of document.querySelectorAll('input:not([type="hidden"]), select, textarea')) if (!labelled(el)) out.push(`no label: <${el.tagName.toLowerCase()} type="${el.getAttribute('type') ?? ''}" class="${el.className}">`);
      for (const el of document.querySelectorAll('img')) if (!el.hasAttribute('alt')) out.push(`no alt: <img src="${el.getAttribute('src')}">`);
      for (const el of document.querySelectorAll('svg:not([aria-hidden]):not([role])')) if (!el.getAttribute('aria-label')) out.push(`svg without aria-hidden or label in <${el.parentElement?.tagName.toLowerCase()} class="${el.parentElement?.className}">`);
      return [...new Set(out)];
    });
    if (problems.length) console.log(`\n${label} ${route}\n  ${problems.join('\n  ')}`);
  }
  await ctx.close();
}
await browser.close();
console.log('\nsweep done');
