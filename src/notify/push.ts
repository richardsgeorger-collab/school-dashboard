import { supabase } from '../auth/client';
import { ENV } from '../env';

/**
 * Web push, no vendor: the browser's own subscription, our VAPID key, one row per device. Turning it on asks the
 * browser once; turning it off drops the row and the subscription. Nothing is sent from the browser itself.
 */
export const pushSupported = (): boolean => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export async function registerSw(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(`${ENV.BASE_URL}sw.js`);
  } catch {
    return null;
  }
}

const keyReady = (): boolean => ENV.VAPID_PUBLIC_KEY.length > 0 && !ENV.VAPID_PUBLIC_KEY.includes('PLACEHOLDER');

function toKey(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export const isIos = (): boolean => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
export const isStandalone = (): boolean => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true);

export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker.getRegistration();
  return !!(await reg?.pushManager.getSubscription());
}

export async function enablePush(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pushSupported()) {
    return { ok: false, error: isIos() && !isStandalone() ? 'On iPhone, add the app to your Home Screen first (Share, then Add to Home Screen) and open it from there. Notifications work from the Home Screen app.' : 'This browser cannot receive notifications.' };
  }
  if (!keyReady()) return { ok: false, error: 'Notifications arrive once the server keys are set.' };
  const c = supabase();
  if (!c) return { ok: false, error: 'Accounts are not set up on this build.' };
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, error: 'Notifications were not allowed. You can change that in the browser settings for this site.' };
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(ENV.VAPID_PUBLIC_KEY) as BufferSource }));
  const j = sub.toJSON();
  const { error } = await c.from('push_subscriptions').upsert({ endpoint: sub.endpoint, keys: j.keys ?? {}, user_agent: navigator.userAgent.slice(0, 200) }, { onConflict: 'endpoint' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase()?.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

/** A local notification through the worker, so the student sees what one looks like the moment it is turned on. */
export async function showTest(): Promise<void> {
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification('Today', { body: 'This is what the morning note looks like. 2 due today. First: Chem Lab 3 (CHM-113, 50 pts).', icon: `${ENV.BASE_URL}icon-192.png` });
}
