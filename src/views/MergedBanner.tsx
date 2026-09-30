import { mergedClasses } from '../halo/repairMerged';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { syncPress } from '../ui/presses';

/**
 * For an account the server could not repair (no other account knew the merged section): one sync brings the hidden
 * classes back. Shown on Now and Classes only, and gone once no class is still linked to another course's section.
 */
export function MergedBanner() {
  const { data } = useStore();
  const { route } = useRoute();
  if (route !== 'now' && route !== 'classes') return null;
  if (mergedClasses(data.courses).length === 0) return null;
  return (
    <div className="legacy-notice merged-banner" role="status">
      <p>We fixed a bug that hid some of your classes. Sync once to bring them back.</p>
      <button type="button" className="btn small primary" onClick={() => syncPress.current?.()}>
        Sync
      </button>
    </div>
  );
}
