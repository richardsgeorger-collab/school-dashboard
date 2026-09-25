import { AI_DIRECT_ALLOWED } from '../ai/gateway';
import { isConfigured } from '../auth/client';

/**
 * Whether an AI feature can run on this build at all: through the account when a backend is configured, or, in
 * development, with a key kept on this device. Whether the plan allows it is the gateway's answer, not this one.
 */
export const aiAvailable = (): boolean => isConfigured() || (AI_DIRECT_ALLOWED && loadApiKey() !== '');

/** Development only: the key lives in this browser's localStorage. Same slot the coach used to use. */
export const ANTHROPIC_KEY_SLOT = 'school-dashboard:anthropic-key';

export function loadApiKey(): string {
  try {
    const raw = localStorage.getItem(ANTHROPIC_KEY_SLOT);
    return raw ? (JSON.parse(raw) as string) : '';
  } catch {
    return '';
  }
}

/** Development only: keep a key on this device for the direct-to-Anthropic path. */
export function saveApiKey(key: string): void {
  try {
    if (key.trim()) localStorage.setItem(ANTHROPIC_KEY_SLOT, JSON.stringify(key.trim()));
    else localStorage.removeItem(ANTHROPIC_KEY_SLOT);
  } catch {
    /* storage unavailable */
  }
}
