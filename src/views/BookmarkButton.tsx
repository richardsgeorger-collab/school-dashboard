import { useEffect, useMemo, useRef } from 'react';
import { bookmarkletHref } from '../halo/bookmarklet';
import { HANDOFF_PATH } from '../halo/handoff';

/** The bookmark's address for this site: a loader that fetches the current sync script on every click. */
export function useBookmarkHref(): string {
  return useMemo(() => bookmarkletHref({ dashOrigin: window.location.origin, dashPath: `${import.meta.env.BASE_URL}${HANDOFF_PATH}` }), []);
}

/** The draggable Sync Halo button. React refuses javascript: hrefs as props, so the address is set on the element. */
export function BookmarkButton({ onClickNote }: { onClickNote: (note: string) => void }) {
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
      onClick={(e) => {
        e.preventDefault();
        onClickNote('Drag this button to your bookmarks bar. Clicking it here does nothing; clicking it on Halo does everything.');
      }}
    >
      Sync Halo
    </a>
  );
}
