import { BOOKMARK_NAME } from '../halo/bookmarkName';

/**
 * Small drawn pictures for saving and running the bookmark by touch: Safari and Chrome on iPad and iPhone, and
 * Chrome on Android. Drawn in HTML so they follow light and dark; the one thing to tap is in gold.
 */
export type TouchBrowser = 'safari' | 'chrome-ios' | 'android';
export type TouchShot = 'add' | 'edit' | 'run';

const Bar = ({ right }: { right: React.ReactNode }) => (
  <div className="tp-bar">
    <span className="tp-url">halo.gcu.edu</span>
    {right}
  </div>
);

export function TouchPicture({ browser, shot }: { browser: TouchBrowser; shot: TouchShot }) {
  const label = { add: 'Saving this page as a bookmark', edit: 'Changing the bookmark’s name and address', run: `Running ${BOOKMARK_NAME} on Halo` }[shot];
  return (
    <figure className="tp" role="img" aria-label={label}>
      {shot === 'add' && browser === 'safari' && (
        <>
          <Bar right={<span className="tp-btn" data-hot="true" aria-hidden>⬆︎</span>} />
          <ul className="tp-sheet">
            <li>Copy</li>
            <li data-hot="true">Add Bookmark</li>
            <li>Add to Favorites</li>
          </ul>
        </>
      )}
      {shot === 'add' && browser === 'chrome-ios' && (
        <>
          <Bar right={<span className="tp-btn" data-hot="true">⋯</span>} />
          <ul className="tp-sheet">
            <li>New Tab</li>
            <li data-hot="true">Add to Bookmarks</li>
            <li>Bookmarks</li>
          </ul>
        </>
      )}
      {shot === 'add' && browser === 'android' && (
        <>
          <Bar right={<span className="tp-btn" data-hot="true">⋮</span>} />
          <ul className="tp-sheet tp-row">
            <li>→</li>
            <li data-hot="true">☆</li>
            <li>⤓</li>
            <li>ⓘ</li>
          </ul>
        </>
      )}
      {shot === 'edit' && (
        <div className="tp-form">
          <p className="tp-title">Edit Bookmark</p>
          <span className="tp-field">
            <small>Name</small>{BOOKMARK_NAME}
          </span>
          <span className="tp-field" data-hot="true">
            <small>Address</small>javascript:(function()… <em>paste here</em>
          </span>
        </div>
      )}
      {shot === 'run' && browser === 'safari' && (
        <>
          <Bar
            right={
              <span className="tp-btn" data-hot="true" aria-label="Bookmarks">
                {/* Safari's bookmarks button: an open book. */}
                <svg viewBox="0 0 20 16" width="16" height="13" aria-hidden className="pic-glyph">
                  <path d="M10 3.5C8 2 5 1.6 1.5 2v11c3.5-.4 6.5 0 8.5 1.5M10 3.5c2-1.5 5-1.9 8.5-1.5v11c-3.5-.4-6.5 0-8.5 1.5M10 3.5v11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                </svg>
              </span>
            }
          />
          <ul className="tp-sheet">
            <li>Favorites</li>
            <li data-hot="true">{BOOKMARK_NAME}</li>
          </ul>
        </>
      )}
      {shot === 'run' && browser === 'chrome-ios' && (
        <>
          <Bar right={<span className="tp-btn" data-hot="true">⋯</span>} />
          <ul className="tp-sheet">
            <li>Bookmarks ›</li>
            <li data-hot="true">{BOOKMARK_NAME}</li>
          </ul>
        </>
      )}
      {shot === 'run' && browser === 'android' && (
        <>
          <div className="tp-bar">
            <span className="tp-url" data-hot="true">Sync Halo</span>
          </div>
          <ul className="tp-sheet">
            <li data-hot="true">☆ {BOOKMARK_NAME}</li>
          </ul>
        </>
      )}
    </figure>
  );
}
