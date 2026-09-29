import { useEffect, useState } from 'react';
import { BOOKMARK_NAME } from '../halo/bookmarkName';
import { useSyncKey } from '../halo/serverSync';
import { isChromeIOS } from '../ui/device';
import { useBookmarkHref } from '../views/BookmarkButton';
import { IPadPicture } from './IPadPictures';

/**
 * The iPad's own setup (George, 2026-09-29): the student stays on the iPad the whole time, one step per screen, a
 * picture on every step with the exact button circled. Safari is easier (its Favorites Bar makes syncing one tap),
 * so Chrome gets a gentle nudge to Safari with a one-tap way over, and full Chrome steps for anyone who stays.
 */
export type IPadScreen = 'i-safari' | 'i-bar' | 'i-copy' | 'i-add' | 'i-edit' | 'i-name' | 'i-paste' | 'i-test' | 'i-wait';
export const IPAD_SAFARI: IPadScreen[] = ['i-bar', 'i-copy', 'i-add', 'i-edit', 'i-name', 'i-paste', 'i-test', 'i-wait'];
export const IPAD_CHROME: IPadScreen[] = ['i-safari', 'i-copy', 'i-add', 'i-edit', 'i-name', 'i-paste', 'i-test', 'i-wait'];
export const ipadScreens = (): IPadScreen[] => (isChromeIOS() ? IPAD_CHROME : IPAD_SAFARI);

/** iOS opens an x-safari-https:// link in Safari, from Chrome or any other app. */
export const inSafari = (href: string): string => href.replace(/^(https?):\/\//, 'x-safari-$1://');

const WAIT_MS = 60_000;

function Big({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="btn primary block onboard-big" onClick={onClick}>
      {label}
    </button>
  );
}

function Back({ show, onClick }: { show: boolean; onClick: () => void }) {
  return show ? (
    <p className="hint">
      <button type="button" className="hero-inline" onClick={onClick}>
        Back
      </button>
    </p>
  ) : null;
}
const openHalo = () => window.open('https://halo.gcu.edu/', '_blank', 'noopener');

export function IPadHalo({ screen, show, onPaste, onTested }: { screen: IPadScreen; show: (s: IPadScreen) => void; onPaste: () => void; onTested: () => void }) {
  const chrome = isChromeIOS();
  const screens = chrome ? IPAD_CHROME : IPAD_SAFARI;
  const n = screens.indexOf(screen) + 1;
  const total = screens.length - 1;
  const next = () => show(screens[Math.min(screens.length - 1, screens.indexOf(screen) + 1)]);
  const back = () => show(screens[Math.max(0, screens.indexOf(screen) - 1)]);
  const href = useBookmarkHref('short');
  const [copied, setCopied] = useState(false);
  const [copyErr, setCopyErr] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      setCopyErr(false);
    } catch {
      setCopyErr(true);
    }
  };
  const eyebrow = screen !== 'i-wait' && screen !== 'i-safari' ? <p className="eyebrow">iPad setup · {chrome ? 'Chrome' : 'Safari'} · step {n - (chrome ? 1 : 0)} of {total - (chrome ? 1 : 0)}</p> : null;
  if (screen === 'i-wait') return <IPadWaiting chrome={chrome} onPaste={onPaste} redo={() => show('i-copy')} back={back} />;
  return (
    <section className="onboard-step ipad-step" aria-label={`iPad setup: ${screen}`}>
      {eyebrow}
      {screen === 'i-safari' && (
        <>
          <h1 className="onboard-title">Safari makes this easier on iPad.</h1>
          <p className="onboard-text">Safari has a Favorites Bar, so syncing is one tap. In Chrome it takes a few taps each time. Either works.</p>
          <div className="ipad-safari">
            <a className="btn primary block onboard-big" href={inSafari(window.location.href)}>
              Open this page in Safari
            </a>
            <p className="hint">Log in there with the same account and you pick up right here.</p>
          </div>
          <p className="hint">
            <button type="button" className="hero-inline" onClick={next}>
              Stay in Chrome
            </button>
          </p>
        </>
      )}
      {screen === 'i-bar' && (
        <>
          <h1 className="onboard-title">Turn on the Favorites Bar.</h1>
          <ol className="phone-steps">
            <li>Open the <b>Settings</b> app.</li>
            <li>
              Tap <b>Apps</b>, then <b>Safari</b>. <span className="muted">(On iPadOS 17, Safari is in the main list.)</span>
            </li>
            <li>
              Turn on <b>Show Favorites Bar</b>, then come back here.
            </li>
          </ol>
          <IPadPicture shot="settings" />
          <Big label="It's on" onClick={next} />
        </>
      )}
      {screen === 'i-copy' && (
        <>
          <h1 className="onboard-title">Copy the bookmark code.</h1>
          <p className="onboard-text">It is what makes {BOOKMARK_NAME} work. You paste it in two steps from now.</p>
          <button type="button" className={`btn primary block onboard-big${copied ? ' ipad-copied' : ''}`} onClick={() => void copy()} aria-live="polite">
            {copied ? 'Copied ✓' : 'Copy bookmark code'}
          </button>
          {copyErr && (
            <>
              <p className="hint" role="alert">
                The iPad did not allow copying. Press and hold the box, tap Select All, then Copy.
              </p>
              <textarea className="halo-paste" readOnly value={href} rows={4} onFocus={(e) => e.currentTarget.select()} />
            </>
          )}
          {(copied || copyErr) && <Big label="Next" onClick={next} />}
          <Back show={screens.indexOf(screen) > 0} onClick={back} />
        </>
      )}
      {screen === 'i-add' && (
        <>
          <h1 className="onboard-title">{chrome ? 'Bookmark this page.' : 'Save this page to Favorites.'}</h1>
          <ol className="phone-steps">
            {chrome ? (
              <>
                <li>
                  Tap <b>⋯</b> at the top right.
                </li>
                <li>
                  Tap <b>Add to Bookmarks</b>.
                </li>
              </>
            ) : (
              <>
                <li>
                  Tap <b>Share</b>, the square with an arrow at the top right.
                </li>
                <li>
                  Tap <b>Add to Favorites</b>, then <b>Save</b>.
                </li>
              </>
            )}
          </ol>
          <IPadPicture shot={chrome ? 'chrome-add' : 'safari-add'} />
          <Big label="Done" onClick={next} />
          <Back show={screens.indexOf(screen) > 0} onClick={back} />
        </>
      )}
      {screen === 'i-edit' && (
        <>
          <h1 className="onboard-title">Open that bookmark to edit it.</h1>
          <ol className="phone-steps">
            {chrome ? (
              <>
                <li>
                  Tap <b>⋯</b>, then <b>Bookmarks</b>.
                </li>
                <li>Press and hold the Halo+ bookmark you just saved.</li>
                <li>
                  Tap <b>Edit Bookmark</b>.
                </li>
              </>
            ) : (
              <>
                <li>
                  Tap the <b>sidebar</b> button at the top left, then <b>Bookmarks</b>, then <b>Favorites</b>.
                </li>
                <li>
                  Tap <b>Edit</b> at the bottom, then tap the Halo+ bookmark you just saved.
                </li>
              </>
            )}
          </ol>
          <IPadPicture shot={chrome ? 'chrome-edit' : 'safari-edit'} />
          <Big label="It's open" onClick={next} />
          <Back show={screens.indexOf(screen) > 0} onClick={back} />
        </>
      )}
      {screen === 'i-name' && (
        <>
          <h1 className="onboard-title">Rename it {BOOKMARK_NAME}.</h1>
          <p className="onboard-text">Clear the name and type Sync Halo. The 😇 is optional.</p>
          <IPadPicture shot="name" />
          <Big label="Renamed" onClick={next} />
          <Back show={screens.indexOf(screen) > 0} onClick={back} />
        </>
      )}
      {screen === 'i-paste' && (
        <>
          <h1 className="onboard-title">Paste the code as its address.</h1>
          <ol className="phone-steps">
            <li>
              Tap the address and clear it with the <b>ⓧ</b>.
            </li>
            <li>
              Press and hold in the empty field and tap <b>Paste</b>.
            </li>
            <li>
              Tap <b>{chrome ? 'Done' : 'Done'}</b> to save.
            </li>
          </ol>
          <IPadPicture shot="address" />
          <Big label="Saved" onClick={next} />
          <p className="hint">
            <button type="button" className="hero-inline" onClick={() => show('i-copy')}>
              Copy the code again
            </button>
          </p>
        </>
      )}
      {screen === 'i-test' && (
        <>
          <h1 className="onboard-title">{chrome ? `Test it: on Halo, tap the address bar, type Sync Halo, and tap the ${BOOKMARK_NAME} bookmark.` : `Test it: open Halo, then tap ${BOOKMARK_NAME} in your Favorites Bar.`}</h1>
          <IPadPicture shot={chrome ? 'chrome-run' : 'safari-run'} />
          <p className="onboard-text">Halo opens in a new tab. Log in there if it asks.</p>
          <Big
            label="Open Halo"
            onClick={() => {
              onTested();
              openHalo();
              next();
            }}
          />
          <Back show={screens.indexOf(screen) > 0} onClick={back} />
        </>
      )}
    </section>
  );
}

/** Waiting on the iPad: the same picture, and after a minute the likely fix for this browser. */
function IPadWaiting({ chrome, onPaste, redo, back }: { chrome: boolean; onPaste: () => void; redo: () => void; back: () => void }) {
  const [late, setLate] = useState(false);
  const sk = useSyncKey();
  const direct = !!sk?.enabled;
  useEffect(() => {
    let ms = WAIT_MS;
    try {
      ms = Number(localStorage.getItem('school-dashboard:onboard-wait-ms')) || WAIT_MS;
    } catch {
      /* storage unavailable */
    }
    const t = setTimeout(() => setLate(true), ms);
    return () => clearTimeout(t);
  }, []);
  return (
    <section className="onboard-step onboard-wait ipad-step" aria-label="Waiting for Halo">
      <IPadPicture shot={chrome ? 'chrome-run' : 'safari-run'} />
      <h1 className="onboard-title wait-title">Waiting for your sync…</h1>
      <p className="onboard-text">{chrome ? `Go to your Halo tab, tap the address bar, type Sync Halo, and tap the ${BOOKMARK_NAME} bookmark.` : `Go to your Halo tab and tap ${BOOKMARK_NAME} in your Favorites Bar.`}</p>
      {direct ? (
        <p className="hint">Halo+ opens by itself with your classes, usually within 20 seconds.</p>
      ) : (
        <p className="hint">
          Halo will show a box with a <b>Copy</b> button. Tap Copy, come back to this tab, and{' '}
          <button type="button" className="hero-inline" onClick={onPaste}>
            paste it here
          </button>
          . This page moves on by itself.
        </p>
      )}
      {late && (
        <div className="fixes" role="status">
          <p className="fixes-head">Nothing yet? For {chrome ? 'Chrome' : 'Safari'} on iPad it is usually one of these:</p>
          <ul>
            {chrome ? (
              <li>
                <b>No bookmark in the suggestions.</b> Type Sync Halo and wait a second for the row with the ☆ star; the search rows below it do not run it.
              </li>
            ) : (
              <li>
                <b>No Favorites Bar under the address bar.</b> Settings, Apps, Safari, turn on Show Favorites Bar, then reload Halo.
              </li>
            )}
            <li>
              <b>It just opened this page.</b> The address was not swapped for the code.{' '}
              <button type="button" className="hero-inline" onClick={redo}>
                Copy the code and swap it again
              </button>
            </li>
            <li>
              <b>Not logged in to Halo.</b> Log in at halo.gcu.edu first, then run it again.
            </li>
            <li>
              <b>Halo showed a box with a Copy button.</b> Tap Copy, then{' '}
              <button type="button" className="hero-inline" onClick={onPaste}>
                paste it here
              </button>
            </li>
            {!chrome && (
              <li>
                <b>Nothing happens at all.</b> Settings, Apps, Safari, Advanced: JavaScript must be on.
              </li>
            )}
          </ul>
        </div>
      )}
      <p className="hint">
        <button type="button" className="hero-inline" onClick={back}>
          Back
        </button>
      </p>
    </section>
  );
}
