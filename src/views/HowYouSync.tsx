import { howYouSync } from '../halo/syncHow';
import { useStore } from '../storage/store';

/** "How you sync: On Halo in Safari, tap 😇 Sync Halo in your Favorites Bar." Only once they have set it up. */
export function HowYouSync({ bare = false }: { bare?: boolean }) {
  const { data } = useStore();
  const how = data.settings.syncHow;
  // A student whose last sync came from the extension (2026-10-08): on a phone the bookmark line read as a chore
  // they had to do; what actually happens is the laptop's extension syncing on its own.
  const line = data.settings.lastPull?.via === 'extension' ? 'The Halo+ extension on your computer syncs every 3 hours by itself while Chrome is open. For fresh data right away, press Sync now in the extension there.' : how ? howYouSync(how) : null;
  if (!line) return null;
  return bare ? <span className="synced-how">{line}</span> : (
    <p className="how-you-sync">
      <b>How you sync:</b> {line}
    </p>
  );
}
