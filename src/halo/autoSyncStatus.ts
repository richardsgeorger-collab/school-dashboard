/**
 * What the Chrome extension says about auto-sync on this computer (0.5.1, 2026-10-02). Its Halo+ content script keeps
 * it in localStorage and posts it to the page; only "paused because Halo was logged out" is ever there.
 */
export const EXT_STATUS_SLOT = 'school-dashboard:ext-status';

export interface AutoPaused {
  why: 'logged-out';
  at: string;
}

export function readAutoPaused(raw: string | null): AutoPaused | null {
  if (!raw) return null;
  try {
    const p = (JSON.parse(raw) as { autoPaused?: AutoPaused | null }).autoPaused;
    return p && p.why === 'logged-out' && typeof p.at === 'string' ? p : null;
  } catch {
    return null;
  }
}
