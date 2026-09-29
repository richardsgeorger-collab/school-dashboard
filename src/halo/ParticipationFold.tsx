import { useEffect } from 'react';
import { useAccount } from '../auth/AccountContext';
import { foldParticipation } from '../domain/participation';
import { useStore } from '../storage/store';

/**
 * Runs the participation clean-up whenever the data settles: an item an announcement made that is really
 * participation becomes a line on that week's participation item, and the separate item goes (through the normal
 * save and delete, so the account gets the change too). Nothing to do is the common case and costs one pass.
 */
export function ParticipationFold() {
  const { data, actions, sync } = useStore();
  const { auth } = useAccount();
  const settled = !auth.session || sync.status === 'synced' || sync.status === 'error' || sync.status === 'off';
  useEffect(() => {
    if (!settled) return;
    const f = foldParticipation(data.items, data.settings.timezone, new Date().toISOString());
    if (f.deletedIds.length === 0) return;
    for (const u of f.upserts) actions.upsertItem(u);
    for (const id of f.deletedIds) actions.deleteItem(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.items, settled]);
  return null;
}
