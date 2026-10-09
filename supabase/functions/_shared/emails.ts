// The emails a student can get, as text (George, 2026-10-09): the day before the free week ends, and a sync broken
// for three days. Pure: no Deno, no network, so the words are tested. Every one carries a one-click unsubscribe.
export interface Rendered {
  subject: string;
  text: string;
  html: string;
}

const SITE = 'https://haloplus.app';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function wrap(subject: string, paragraphs: string[], cta: { label: string; url: string } | null, unsubUrl: string): Rendered {
  const text = [...paragraphs, cta ? `${cta.label}: ${cta.url}` : '', '', `Don't want these emails? One click: ${unsubUrl}`, 'Account emails (password resets, receipts) still arrive.'].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n\n');
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f7f9;font:16px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b1d22"><div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:28px"><p style="margin:0 0 16px;font-weight:800;font-size:20px">Halo+</p>${paragraphs.map((p) => `<p style="margin:0 0 14px">${esc(p)}</p>`).join('')}${cta ? `<p style="margin:20px 0 8px"><a href="${cta.url}" style="display:inline-block;background:#f2b84b;color:#141414;font-weight:700;text-decoration:none;padding:12px 18px;border-radius:10px">${esc(cta.label)}</a></p>` : ''}<p style="margin:24px 0 0;font-size:13px;color:#6b7280">Don't want these emails? <a href="${unsubUrl}" style="color:#6b7280">Unsubscribe in one click</a>. Account emails (password resets, receipts) still arrive.</p></div></body></html>`;
  return { subject, text, html };
}

const dateOf = (iso: string | null | undefined, tz = 'America/Phoenix'): string => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return 'tomorrow';
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: tz }).format(d);
};

/** The email for one outbox row, or null for a kind this build does not know. */
export function renderEmail(kind: string, meta: Record<string, unknown>, unsubUrl: string, tz = 'America/Phoenix'): Rendered | null {
  if (kind === 'trial_ending') {
    const when = dateOf(typeof meta.ends_at === 'string' ? meta.ends_at : null, tz);
    return wrap(
      'Your free week of Halo+ Max ends tomorrow',
      [
        `Your free week ends ${when}. After that Halo+ goes back to Free: Halo sync pauses and the study tools lock. Everything you have stays, and nothing charges unless you choose a plan.`,
        'To keep it: Max is $7.99 a month (everything you had this week), Plus is $4.99 (auto-sync, grades and announcements, no study tools). Cancel anytime.',
        "Or stay on Free. That's fine too.",
      ],
      { label: 'See the plans', url: `${SITE}/#/you?s=plan` },
      unsubUrl,
    );
  }
  if (kind === 'sync_broken') {
    const days = typeof meta.days === 'number' ? meta.days : Number(meta.days) || 3;
    return wrap(
      `Halo+ hasn't heard from Halo in ${days} days`,
      [
        `Your last sync was ${dateOf(typeof meta.last_at === 'string' ? meta.last_at : null, tz)}. Until the next one, due dates and grades in Halo+ are as they were then.`,
        'To fix it: open halo.gcu.edu and log in, then open Halo+ and press Sync. With the Chrome extension, syncs run on their own again once Halo is logged in.',
        "You'll get this once; not again unless it is fixed and breaks again.",
      ],
      { label: 'Open Halo+', url: `${SITE}/#/now` },
      unsubUrl,
    );
  }
  return null;
}

/** The unsubscribe token for one account: HMAC-SHA256 of the user id under the cron secret, hex. */
export async function unsubToken(userId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(userId));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

export const unsubUrlFor = async (base: string, userId: string, secret: string): Promise<string> => `${base}/functions/v1/email-unsub?u=${encodeURIComponent(userId)}&t=${await unsubToken(userId, secret)}`;
