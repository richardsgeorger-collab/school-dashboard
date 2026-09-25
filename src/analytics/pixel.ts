import { ENV } from '../env';

/**
 * Meta Pixel, for the ad → sign-up → connect Halo → upgrade funnel. Loads only when a real id is configured;
 * otherwise every call is a no-op. Standard events where Meta has one, a custom one for the Halo connection.
 */
type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean };
declare global {
  interface Window {
    fbq?: Fbq;
  }
}

const ready = (): boolean => ENV.META_PIXEL_ID.length > 0 && !ENV.META_PIXEL_ID.includes('PLACEHOLDER');

export function initPixel(): void {
  if (!ready() || typeof window === 'undefined' || window.fbq) return;
  const f: Fbq = (...args: unknown[]) => {
    (f.queue ??= []).push(args);
  };
  window.fbq = f;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);
  f('init', ENV.META_PIXEL_ID);
  f('track', 'PageView');
}

export type PixelEvent = 'Lead' | 'CompleteRegistration' | 'StartTrial' | 'Subscribe' | 'HaloConnected';
const CUSTOM: PixelEvent[] = ['HaloConnected'];

export function pixel(event: PixelEvent, params?: Record<string, unknown>): void {
  if (!ready() || typeof window === 'undefined' || !window.fbq) return;
  window.fbq(CUSTOM.includes(event) ? 'trackCustom' : 'track', event, params ?? {});
}

/** Fire once per device, for events that only mean something the first time. */
export function pixelOnce(event: PixelEvent, params?: Record<string, unknown>): void {
  const slot = `school-dashboard:pixel:${event}`;
  try {
    if (localStorage.getItem(slot)) return;
    localStorage.setItem(slot, '1');
  } catch {
    /* storage unavailable: fire anyway */
  }
  pixel(event, params);
}
