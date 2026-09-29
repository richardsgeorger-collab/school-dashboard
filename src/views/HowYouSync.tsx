import { howYouSync } from '../halo/syncHow';
import { useStore } from '../storage/store';

/** "How you sync: On Halo in Safari, tap 😇 Sync Halo in your Favorites Bar." Only once they have set it up. */
export function HowYouSync({ bare = false }: { bare?: boolean }) {
  const { data } = useStore();
  const how = data.settings.syncHow;
  if (!how) return null;
  return bare ? <span className="synced-how">{howYouSync(how)}</span> : (
    <p className="how-you-sync">
      <b>How you sync:</b> {howYouSync(how)}
    </p>
  );
}
