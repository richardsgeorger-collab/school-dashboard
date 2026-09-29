import { BOOKMARK_NAME } from '../halo/bookmarkName';

/**
 * The bookmarks-bar shortcut, drawn: the bottom-left of a keyboard with the three keys in gold and labelled, pressing
 * down together on a loop (still under reduced motion). A Mac shows ⌘ Command, Shift, B; Windows shows Ctrl, Shift, B.
 */
type Key = { label: string; sub?: string; w?: number; hot?: boolean };

export function ShortcutKeyboard({ mac }: { mac: boolean }) {
  const top: Key[] = [{ label: 'Shift', w: 2.2, hot: true }, { label: 'Z' }, { label: 'X' }, { label: 'C' }, { label: 'V' }, { label: 'B', hot: true }, { label: 'N' }, { label: 'M' }];
  const bottom: Key[] = mac
    ? [{ label: 'fn' }, { label: 'control', w: 1.2 }, { label: 'option', w: 1.2 }, { label: '⌘', sub: 'command', w: 1.5, hot: true }, { label: '', w: 4.2 }]
    : [{ label: 'Ctrl', w: 1.5, hot: true }, { label: '⊞', w: 1.1 }, { label: 'Alt', w: 1.2 }, { label: '', w: 5.3 }];
  const row = (keys: Key[]) => (
    <div className="kb-row">
      {keys.map((k, i) => (
        <span key={i} className="kb-key" data-hot={k.hot ? 'true' : undefined} style={{ flexGrow: k.w ?? 1 }}>
          <b>{k.label}</b>
          {k.sub && <small>{k.sub}</small>}
        </span>
      ))}
    </div>
  );
  return (
    <figure className="kb" role="img" aria-label={mac ? 'Keyboard: hold Command and Shift, then tap B' : 'Keyboard: hold Ctrl and Shift, then tap B'}>
      {row(top)}
      {row(bottom)}
    </figure>
  );
}

/** Chrome's menu, drawn: the three dots, then Bookmarks and lists, then Show bookmarks bar. */
export function ChromeMenuPicture() {
  return (
    <figure className="chrome-menu" role="img" aria-label="Chrome's menu: the three dots at the top right, then Bookmarks and lists, then Show bookmarks bar">
      <div className="cm-toolbar">
        <span className="cm-url" />
        <span className="cm-dots" data-hot="true">⋮</span>
      </div>
      <div className="cm-menus">
        <ul className="cm-menu">
          <li>New tab</li>
          <li>History</li>
          <li data-hot="true">Bookmarks and lists ›</li>
          <li>Downloads</li>
        </ul>
        <ul className="cm-menu cm-sub">
          <li>Bookmark this tab</li>
          <li data-hot="true">Show bookmarks bar</li>
          <li>Bookmark manager</li>
        </ul>
      </div>
    </figure>
  );
}

/**
 * Halo with the bookmark in the bar, drawn: Halo's page under the browser's toolbar, and 😇 Sync Halo in the bookmarks
 * bar circled in gold, with a pointer that moves to it and taps, on a loop (it rests on the bookmark under reduced
 * motion). The same drawing sits on the screen before Halo opens and on the waiting screen after, so the student sees
 * the one thing to do both times.
 */
export function HaloBarPicture() {
  return (
    <figure className="hb" role="img" aria-label={`Halo in the browser, with ${BOOKMARK_NAME} in the bookmarks bar circled and a pointer clicking it`}>
      <div className="hb-toolbar">
        <span className="hb-dot" />
        <span className="hb-dot" />
        <span className="hb-dot" />
        <span className="hb-url">halo.gcu.edu</span>
      </div>
      <div className="hb-bar">
        <span className="hb-bm" />
        <span className="hb-bm" />
        <span className="hb-target">
          <b>{BOOKMARK_NAME}</b>
          <span className="hb-ring" aria-hidden />
          <svg className="hb-pointer" viewBox="0 0 24 24" width="26" height="26" aria-hidden>
            <path d="M5 2.5 L5 19 L9.3 15 L12.2 21.4 L15 20.2 L12.2 13.9 L18 13.6 Z" />
          </svg>
        </span>
        <span className="hb-bm hb-bm-short" />
      </div>
      <div className="hb-page">
        <div className="hb-head">
          <span className="hb-logo">Halo</span>
          <span className="hb-line" />
        </div>
        <div className="hb-cards">
          <span className="hb-card" />
          <span className="hb-card" />
          <span className="hb-card" />
        </div>
      </div>
    </figure>
  );
}
