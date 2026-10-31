// The Instagram path (Loop 294, George 2026-10-30): a phone visitor asks for the laptop page by email, once. Plain
// functions (no Deno, no network) so vitest can test them: the address check, the laptop link, the one email, the
// funnel step a client may report, and the keyed hashes (the address itself is never kept).

export const SITE = 'https://haloplus.app';
/** Per IP, per day: a dorm's shared IP can still send a few; a script cannot send many. */
export const PER_IP_DAY = 8;
/** Everyone, per day: a ceiling on the one-off emails, whatever happens. */
export const ALL_DAY = 400;

export const FUNNEL_STEPS = ['visit', 'fold', 'email-focus', 'email', 'email-signup', 'share', 'copy', 'google', 'apple', 'safari', 'app', 'preview', 'home-steps', 'home-screen', 'laptop', 'laptop-store', 'welcome'] as const;
export type FunnelStep = (typeof FUNNEL_STEPS)[number];
const VID = /^[A-Za-z0-9_-]{8,40}$/;
const VIA = ['share', 'copy', 'email', 'reminder', 'direct'];
const DEVICES = ['phone', 'tablet', 'laptop'];

/** A tidy address, or null: one address, no spaces, a dot in the domain, at most 254 characters. */
export function cleanEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  if (e.length > 254 || e.length < 6) return null;
  return /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/.test(e) ? e : null;
}

export const cleanVid = (v: unknown): string | null => (typeof v === 'string' && VID.test(v) ? v : null);

/** The laptop page, tagged so the funnel knows where it came from. */
export type Acct = 'google' | 'apple' | 'email';
export function laptopUrl(via: 'share' | 'copy' | 'email' | 'reminder', src: 'ig' | null, vid: string | null, acct: Acct | null = null): string {
  const q = new URLSearchParams();
  if (src) q.set('src', src);
  q.set('via', via);
  if (vid) q.set('t', vid);
  // Signed up on the phone with Google or Apple: the laptop's welcome tab offers that one tap to sign in.
  if (acct) q.set('acct', acct);
  return `${SITE}/laptop/?${q.toString()}`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The one email. No unsubscribe line: there is nothing to unsubscribe from (it is the only one, and the address is not kept). */
export function laptopEmail(url: string, acct: Acct | null = null): { subject: string; text: string; html: string } {
  const subject = 'Open this on your laptop';
  const how = acct === 'apple' ? 'Continue with Apple' : acct === 'google' ? 'Continue with Google' : 'sign in with your email';
  const lines = acct
    ? ['You’re in! Halo+ has one step left, on your laptop. Open this there:', `In Chrome or Edge it takes about 2 minutes: add Halo+, ${how} (the same account as on your phone), and open Halo. That’s it.`]
    : ['Here’s your Halo+ link. Open this on your laptop:', 'In Chrome or Edge it takes about 2 minutes: add Halo+, make your free account, open Halo. That’s it.'];
  const foot = acct ? 'If it isn’t set up by tomorrow, we’ll send you one reminder. That’s all: no other emails about this.' : 'You asked for this one email on haloplus.app. Just this one: we won’t email you again, and we didn’t keep your address.';
  const text = `${lines[0]}\n\n${url}\n\n${lines[1]}\n\n${foot}`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font:16px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b1d22"><div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px"><p style="margin:0 0 16px;font-weight:800;font-size:20px">Halo+</p><p style="margin:0 0 14px">${esc(lines[0])}</p><p style="margin:20px 0 20px"><a href="${esc(url)}" style="display:inline-block;background:#f2b84b;color:#141414;font-weight:700;text-decoration:none;padding:12px 18px;border-radius:10px">Open Halo+ on my laptop</a></p><p style="margin:0 0 14px">${esc(lines[1])}</p><p style="margin:24px 0 0;font-size:13px;color:#6b7280">${esc(foot)}</p></div></body></html>`;
  return { subject, text, html };
}

/** HMAC-SHA256 under the server's secret, as 64 hex characters: the same input always gives the same hash. */
export async function keyedHash(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The caller's IP as the platform passes it (the first x-forwarded-for hop), or ''. */
export const callerIp = (h: { get(name: string): string | null }): string => (h.get('x-forwarded-for') ?? '').split(',')[0].trim().slice(0, 64);

/**
 * A funnel step a browser reports (no sign-in), as a row, or null when anything is off: a known step, the Instagram
 * source, a browser id, and the optional how (via), device and browser name.
 */
export function funnelRow(b: Record<string, unknown>): { vid: string; step: FunnelStep; src: 'ig'; via: string | null; device: string | null; browser: string | null } | null {
  const vid = cleanVid(b.vid);
  const step = typeof b.step === 'string' && (FUNNEL_STEPS as readonly string[]).includes(b.step) ? (b.step as FunnelStep) : null;
  if (!vid || !step || b.src !== 'ig') return null;
  // The email step is written by laptop-link itself, when the email really went.
  if (step === 'email') return null;
  return {
    vid,
    step,
    src: 'ig',
    via: typeof b.via === 'string' && VIA.includes(b.via) ? b.via : null,
    device: typeof b.device === 'string' && DEVICES.includes(b.device) ? b.device : null,
    browser: typeof b.browser === 'string' ? b.browser.replace(/[^A-Za-z ]/g, '').trim().slice(0, 20) || null : null,
  };
}
