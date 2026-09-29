import { useEffect, useMemo, useRef } from 'react';
import { dropUrl, useSyncKey } from '../halo/serverSync';
import { bookmarkletHref } from '../halo/bookmarklet';
import { BOOKMARK_NAME } from '../halo/bookmarkName';
import { HANDOFF_PATH } from '../halo/handoff';

/**
 * The bookmark's address for this site: a loader that fetches the current sync script on every click. 'full' carries
 * the whole sync as a fallback (dragged to a bar, its size costs nothing); 'short' is the loader alone, a few hundred
 * characters, for pasting into a bookmark on a phone.
 */
export function useBookmarkHref(kind: 'full' | 'short' = 'full'): string {
  // The owner's sync key goes in only while the server path is on for them; otherwise the bookmark is exactly today's.
  const sk = useSyncKey();
  const key = sk?.enabled ? sk.key : undefined;
  return useMemo(() => bookmarkletHref({ dashOrigin: window.location.origin, dashPath: `${import.meta.env.BASE_URL}${HANDOFF_PATH}`, ...(key ? { syncKey: key, dropUrl: dropUrl() } : {}) }, { embed: kind === 'full' }), [kind, key]);
}

/** The draggable 😇 Sync Halo button; its text becomes the bookmark's name. React refuses javascript: hrefs as props, so the address is set on the element. */
export function BookmarkButton({ onClickNote, onDropped }: { onClickNote: (note: string) => void; /** A drag that ended on something that took it (the bookmarks bar). */ onDropped?: () => void }) {
  const href = useBookmarkHref();
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    link.current?.setAttribute('href', href);
  }, [href]);
  return (
    <a
      ref={link}
      className="btn primary halo-drag"
      draggable
      // A drop the browser accepted (the bookmarks bar takes it as a link) ends with a drop effect; a drag let go
      // anywhere else ends with none.
      onDragEnd={(e) => {
        if (e.dataTransfer.dropEffect !== 'none') onDropped?.();
        else onClickNote('Almost: let go of it on the bookmarks bar, just under the address bar.');
      }}
      onClick={(e) => {
        e.preventDefault();
        onClickNote('Drag this button to your bookmarks bar. Clicking it here does nothing; clicking it on Halo does everything.');
      }}
    >
      {BOOKMARK_NAME}
    </a>
  );
}
