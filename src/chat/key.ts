/** The Anthropic key lives in this browser's localStorage only. Same slot the coach uses. */
export const ANTHROPIC_KEY_SLOT = 'school-dashboard:anthropic-key';

export function loadApiKey(): string {
  try {
    const raw = localStorage.getItem(ANTHROPIC_KEY_SLOT);
    return raw ? (JSON.parse(raw) as string) : '';
  } catch {
    return '';
  }
}
