import { AI_DIRECT_ALLOWED } from '../ai/gateway';
import { isConfigured } from '../auth/client';

/**
 * Whether an AI feature can run on this build at all: through the account when a backend is configured, or, in
 * development, with a key kept on this device. Whether the plan allows it is the gateway's answer, not this one.
 */
export const aiAvailable = (): boolean => isConfigured() || (AI_DIRECT_ALLOWED && loadApiKey() !== '');

/** Development only: the key lives in this browser's localStorage. Same slot the coach used to use. */
export const ANTHROPIC_KEY_SLOT = 'school-dashboard:anthropic-key';

/**
 * On a build that cannot use a browser key (every production build), any key left on this device from the old
 * paste-your-key coach is deleted, not merely ignored: a key in localStorage is readable by any script on the site.
 */
export function forgetStrayKey(): boolean {
  if (AI_DIRECT_ALLOWED) return false;
  try {
    if (localStorage.getItem(ANTHROPIC_KEY_SLOT) === null) return false;
    localStorage.removeItem(ANTHROPIC_KEY_SLOT);
    return true;
  } catch {
    return false;
  }
}

export function loadApiKey(): string {
  if (!AI_DIRECT_ALLOWED) return '';
  try {
    const raw = localStorage.getItem(ANTHROPIC_KEY_SLOT);
    return raw ? (JSON.parse(raw) as string) : '';
  } catch {
    return '';
  }
}

/** Development only: keep a key on this device for the direct-to-Anthropic path. */
export function saveApiKey(key: string): void {
  if (!AI_DIRECT_ALLOWED) return;
  try {
    if (key.trim()) localStorage.setItem(ANTHROPIC_KEY_SLOT, JSON.stringify(key.trim()));
    else localStorage.removeItem(ANTHROPIC_KEY_SLOT);
  } catch {
    /* storage unavailable */
  }
}
