import type { SyncHow } from '../domain/types';
import { isAndroid, isChromeIOS, isIPad, isIPhone } from '../ui/device';
import { BOOKMARK_NAME } from './bookmarkName';

/** The way this device runs the bookmark. */
export function deviceSyncHow(): SyncHow {
  if (isIPad()) return isChromeIOS() ? 'ipad-chrome' : 'ipad-safari';
  if (isIPhone()) return isChromeIOS() ? 'iphone-chrome' : 'iphone-safari';
  if (isAndroid()) return 'android';
  return 'desktop';
}

/** One line: how this student syncs, in their own browser's words. */
export function howYouSync(how: SyncHow | null | undefined): string {
  switch (how) {
    case 'ipad-safari':
      return `On Halo in Safari, tap ${BOOKMARK_NAME} in your Favorites Bar.`;
    case 'ipad-chrome':
      return `On Halo in Chrome, tap the address bar, type Sync Halo, and tap the ${BOOKMARK_NAME} bookmark.`;
    case 'iphone-safari':
      return `On Halo in Safari, open Bookmarks and tap ${BOOKMARK_NAME}.`;
    case 'iphone-chrome':
      return `On Halo in Chrome, tap ⋯, then Bookmarks, then ${BOOKMARK_NAME}.`;
    case 'android':
      return `On Halo, type Sync Halo in the address bar and tap the ${BOOKMARK_NAME} bookmark.`;
    default:
      return `On Halo, click ${BOOKMARK_NAME} in your bookmarks bar.`;
  }
}
