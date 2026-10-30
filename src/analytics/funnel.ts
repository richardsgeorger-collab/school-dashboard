import { reportUrl } from '../monitor/report';
import { deviceAndBrowser } from '../ui/device';

/**
 * The Instagram path's steps, counted before anyone has an account (Loop 294, George 2026-10-30): an Instagram visit,
 * the phone option used (share, copy, email, app), the laptop page opened, the welcome tab after the install. Each goes
 * to the report function (no sign-in) as kind "funnel", once per browser and step, with a random id that lives only in
 * this browser. Only for visitors who came from Instagram; nothing else is sent. Admin: admin_ig_funnel.
 */
export type FunnelStep = 'visit' | 'share' | 'copy' | 'app' | 'welcome';
const VID = 'school-dashboard:vid';
const SENT = 'school-dashboard:funnel';

/** This browser's random id (16 url-safe characters), made once. */
export function visitorId(): string {
  try {
    const have = localStorage.getItem(VID);
    if (have && /^[A-Za-z0-9_-]{8,40}$/.test(have)) return have;
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const id = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    localStorage.setItem(VID, id);
    return id;
  } catch {
    return '';
  }
}

/** Sends one step, once per browser. Never throws, never blocks. */
export function funnel(step: FunnelStep, o: { via?: string } = {}): void {
  try {
    const url = reportUrl();
    const vid = visitorId();
    if (!url || !vid) return;
    const sent = new Set((localStorage.getItem(SENT) ?? '').split(',').filter(Boolean));
    if (sent.has(step)) return;
    sent.add(step);
    localStorage.setItem(SENT, [...sent].join(','));
    const { device, browser } = deviceAndBrowser();
    void fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'funnel', vid, step, src: 'ig', via: o.via, device, browser }), keepalive: true }).catch(() => undefined);
  } catch {
    /* storage or network off: not counted */
  }
}

/** The laptop page on this site, tagged for the funnel (the same shape laptop-link emails). */
export function laptopLink(via: 'share' | 'copy', fromIg: boolean): string {
  const q = new URLSearchParams();
  if (fromIg) q.set('src', 'ig');
  q.set('via', via);
  const vid = fromIg ? visitorId() : '';
  if (vid) q.set('t', vid);
  const base = typeof window === 'undefined' ? 'https://haloplus.app/' : `${window.location.origin}${import.meta.env.BASE_URL ?? '/'}`;
  return `${base}laptop/?${q.toString()}`;
}

/** The laptop-link function's address. */
export const laptopLinkUrl = (): string => reportUrl().replace(/\/report$/, '/laptop-link');
