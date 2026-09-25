// Pays a Stripe test Checkout session with the 4242 test card, headless. Refuses anything that is not a test
// session. Usage: node scripts/e2e-checkout.mjs <checkout-url> <screenshot-dir>
import puppeteer from 'puppeteer-core';
const [url, out = '/tmp'] = process.argv.slice(2);
if (!/cs_test_/.test(url)) throw new Error('Not a test-mode Checkout session; refusing.');
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 1000 });
await page.goto(url, { waitUntil: 'networkidle2' });
// Payment methods may be an accordion; open the card one.
await new Promise((r) => setTimeout(r, 2000));
const cardTab = await page.$('#payment-method-accordion-item-title-card');
if (cardTab) await cardTab.click();
await page.waitForSelector('#cardNumber', { timeout: 20000 });
const fill = async (sel, value) => {
  const el = await page.$(sel);
  if (!el) return false;
  await el.click({ clickCount: 3 });
  await el.type(value, { delay: 20 });
  return true;
};
await fill('#email', 'stripe-test@school-dashboard.invalid');
await fill('#cardNumber', '4242424242424242');
await fill('#cardExpiry', '1234');
await fill('#cardCvc', '123');
await fill('#billingName', 'Test Student');
if (await page.$('#billingCountry')) await page.select('#billingCountry', 'US').catch(() => undefined);
await fill('#billingPostalCode', '85017');
await fill('#billingAddressLine1', '3300 W Camelback Rd');
// The address box suggests completions; take the first, which fills city, state and ZIP.
await new Promise((r) => setTimeout(r, 1500));
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await new Promise((r) => setTimeout(r, 1500));
await fill('#billingLocality', 'Phoenix');
if (await page.$('#billingAdministrativeArea')) await page.select('#billingAdministrativeArea', 'AZ').catch(() => undefined);
// Saving the card with Link asks for a phone number; a test does not want either.
const link = await page.$('#enableStripePass');
if (link && (await link.evaluate((e) => e.checked))) await link.click();
await page.screenshot({ path: `${out}/checkout-filled.png` });
await page.click('button[type="submit"], .SubmitButton');
try {
  await page.waitForFunction(() => !location.host.includes('stripe.com'), { timeout: 60000 });
  console.log('returned to:', page.url().replace(/\?.*$/, '').slice(0, 80), '| checkout param:', new URL(page.url().replace('#/', '')).searchParams.get('checkout') ?? page.url().match(/checkout=(\w+)/)?.[1]);
} catch {
  await page.screenshot({ path: `${out}/checkout-stuck.png`, fullPage: true });
  console.log('did not leave Stripe; errors on page:', await page.$$eval('[role="alert"], .FieldError, .Error', (els) => els.map((e) => e.textContent.trim()).filter(Boolean).join(' | ')));
  process.exitCode = 1;
}
await browser.close();
