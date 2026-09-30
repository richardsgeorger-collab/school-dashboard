import { useEffect } from 'react';
import { useStore } from '../storage/store';
import { foldDuplicates } from './sameAssignment';

/**
 * On a device, the same cleanup the server ran on every account (2026-09-30): an announcement-made copy of a Halo
 * assignment folds into it. Runs whenever the items change, so a copy that arrives from an old device folds too.
 */
export function DuplicateFold() {
  const { data, actions } = useStore();
  useEffect(() => {
    const out = foldDuplicates(data.items, new Date().toISOString());
    if (!out.deletes.length) return;
    for (const i of out.upserts) actions.upsertItem(i);
    for (const id of out.deletes) actions.deleteItem(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.items]);
  return null;
}
