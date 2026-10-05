import type { ExtensionBrowser } from '../config/extension';
import type { Settings } from '../domain/types';

/**
 * Who sees the Chrome extension setup (George, 2026-10-04), once:
 * - desktop Chrome, Edge or Brave with no extension connected yet: the setup ('setup'; Free gets it with a note that
 *   syncing is part of Plus);
 * - desktop Safari or Firefox: one screen saying it needs Chrome, and that the bookmark keeps working ('needs-chrome');
 * - a phone or an iPad: nothing (no extensions there; their own sync setup is unchanged).
 * "Connected" is what "via extension" already means: its version on this computer (written by its Halo+ script), or a
 * sync that arrived from it.
 */
export type ExtSetupKind = 'setup' | 'needs-chrome';

export interface ExtSetupInput {
  settings: Pick<Settings, 'extSetup' | 'lastPull'>;
  browser: ExtensionBrowser | null;
  touch: boolean;
  installed: string | null;
  storeUrl: string | null;
}

export const extConnected = (settings: Pick<Settings, 'lastPull'>, installed: string | null): boolean => !!installed || settings.lastPull?.via === 'extension';

export function extSetupDue({ settings, browser, touch, installed, storeUrl }: ExtSetupInput): ExtSetupKind | null {
  const seen = settings.extSetup;
  if (touch || seen?.shownAt || seen?.skippedAt || seen?.doneAt) return null;
  if (extConnected(settings, installed)) return null;
  if (!browser) return 'needs-chrome';
  return storeUrl ? 'setup' : null;
}
