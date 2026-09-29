import { BOOKMARK_NAME } from '../halo/bookmarkName';

/**
 * The iPad steps, drawn: one picture per step with the exact thing to tap circled in gold (numbered when there are
 * two taps), in the same drawn style as the keyboard. HTML, so it follows light and dark. Based on iPadOS 18's
 * Safari and Chrome for iOS; the words beside each picture carry the iPadOS 17 variant where it differs.
 */
/** The address the student is on, as their own address bar shows it. */
const SITE_HOST = typeof window === 'undefined' ? 'haloplus.app' : window.location.host;

export type IPadShot = 'settings' | 'safari-add' | 'safari-edit' | 'chrome-add' | 'chrome-edit' | 'name' | 'address' | 'safari-run' | 'chrome-run';

const Hot = ({ n, children, pill }: { n?: number; children: React.ReactNode; pill?: boolean }) => (
  <span className={`ip-hot${pill ? ' ip-hot-pill' : ''}`}>
    {children}
    {n !== undefined && <i className="ip-n">{n}</i>}
  </span>
);

function Toolbar({ chrome, share, dots, book, url = 'halo.gcu.edu' }: { chrome?: boolean; share?: number; dots?: number; book?: number; url?: string }) {
  return (
    <div className="ip-toolbar">
      {!chrome && <span className="ip-ico">{book !== undefined ? <Hot n={book}>▯▯</Hot> : '▯▯'}</span>}
      <span className="ip-url">{url}</span>
      {!chrome && <span className="ip-ico">{share !== undefined ? <Hot n={share}>⬆︎</Hot> : '⬆︎'}</span>}
      {chrome && <span className="ip-ico">{dots !== undefined ? <Hot n={dots}>⋯</Hot> : '⋯'}</span>}
    </div>
  );
}

export function IPadPicture({ shot }: { shot: IPadShot }) {
  const label: Record<IPadShot, string> = {
    settings: 'The Settings app: Apps, Safari, and the Show Favorites Bar switch circled',
    'safari-add': 'Safari: the Share button, then Add to Favorites, circled',
    'safari-edit': 'Safari: the sidebar button, then Edit in Favorites, circled',
    'chrome-add': 'Chrome: the three dots, then Add to Bookmarks, circled',
    'chrome-edit': 'Chrome: Bookmarks, then pressing and holding the new bookmark, then Edit Bookmark, circled',
    name: `The bookmark's name field, with ${BOOKMARK_NAME} typed in, circled`,
    address: 'The bookmark’s address field, cleared and pasted, circled',
    'safari-run': `Safari on Halo: ${BOOKMARK_NAME} in the Favorites Bar circled, a finger tapping it`,
    'chrome-run': `Chrome on Halo: Sync Halo typed in the address bar, and the ${BOOKMARK_NAME} bookmark in the suggestions circled`,
  };
  return (
    <figure className="ip" data-shot={shot} role="img" aria-label={label[shot]}>
      {shot === 'settings' && (
        <div className="ip-settings">
          <ul className="ip-side">
            <li>General</li>
            <li>Display &amp; Brightness</li>
            <li>
              <Hot n={1} pill>Apps ›</Hot>
            </li>
            <li>Privacy &amp; Security</li>
          </ul>
          <div className="ip-pane">
            <p className="ip-pane-title">Safari</p>
            <p className="ip-row">Search Engine <span>Google ›</span></p>
            <p className="ip-row">
              Show Favorites Bar
              <Hot n={2}>
                <span className="ip-toggle" />
              </Hot>
            </p>
            <p className="ip-row">Block Pop-ups <span className="ip-toggle ip-toggle-on" /></p>
          </div>
        </div>
      )}
      {shot === 'safari-add' && (
        <>
          <Toolbar share={1} url={SITE_HOST} />
          <div className="ip-body">
            <ul className="ip-sheet ip-right">
              <li>Copy</li>
              <li>Add Bookmark</li>
              <li>
                <Hot n={2} pill>Add to Favorites</Hot>
              </li>
              <li>Add to Reading List</li>
            </ul>
          </div>
        </>
      )}
      {shot === 'safari-edit' && (
        <div className="ip-split">
          <ul className="ip-side">
            <li>
              <Hot n={1} pill>▯▯ Sidebar</Hot>
            </li>
            <li className="ip-strong">Bookmarks</li>
            <li className="ip-strong">Favorites</li>
            <li>Halo+ · Now</li>
            <li className="ip-foot">
              <Hot n={2} pill>Edit</Hot>
            </li>
          </ul>
          <div className="ip-pane ip-faint">Tap the Halo+ bookmark to open it.</div>
        </div>
      )}
      {shot === 'chrome-add' && (
        <>
          <Toolbar chrome dots={1} url={SITE_HOST} />
          <div className="ip-body">
            <ul className="ip-sheet ip-right">
              <li>New Tab</li>
              <li>
                <Hot n={2} pill>☆ Add to Bookmarks</Hot>
              </li>
              <li>Bookmarks</li>
              <li>Settings</li>
            </ul>
          </div>
        </>
      )}
      {shot === 'chrome-edit' && (
        <>
          <Toolbar chrome dots={1} />
          <div className="ip-body">
            <ul className="ip-sheet ip-right">
              <li className="ip-strong">Bookmarks</li>
              <li>
                <Hot n={2} pill>Halo+ · Now (press and hold)</Hot>
              </li>
              <li className="ip-menu">
                <Hot n={3} pill>Edit Bookmark</Hot>
              </li>
            </ul>
          </div>
        </>
      )}
      {(shot === 'name' || shot === 'address') && (
        <div className="ip-form">
          <p className="ip-form-title">Edit Bookmark</p>
          <p className="ip-field">
            <small>Name</small>
            {shot === 'name' ? <Hot pill>{BOOKMARK_NAME}</Hot> : BOOKMARK_NAME}
          </p>
          <p className="ip-field">
            <small>Address</small>
            {shot === 'address' ? <Hot pill>javascript:(function(){'{'}…  ← paste</Hot> : `https://${SITE_HOST}/…`}
          </p>
          <p className="ip-form-done">Done</p>
        </div>
      )}
      {shot === 'safari-run' && (
        <>
          <Toolbar />
          <div className="ip-favbar">
            <span className="ip-bm" />
            <span className="ip-bm-target">
              <Hot pill>{BOOKMARK_NAME}</Hot>
              <span className="ip-finger" aria-hidden />
            </span>
            <span className="ip-bm" />
          </div>
          <div className="ip-halo">
            <span>Halo</span>
          </div>
        </>
      )}
      {shot === 'chrome-run' && (
        <>
          <div className="ip-toolbar">
            <span className="ip-url ip-typed">Sync Halo|</span>
            <span className="ip-ico">⋯</span>
          </div>
          <ul className="ip-sheet ip-suggest">
            <li>
              <Hot pill>☆ {BOOKMARK_NAME}</Hot>
              <span className="ip-finger" aria-hidden />
            </li>
            <li className="ip-faint">🔍 sync halo</li>
          </ul>
        </>
      )}
    </figure>
  );
}
