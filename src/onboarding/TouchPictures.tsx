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
          <Bar right={<span className="tp-btn" data-hot="true">📖</span>} />
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
