import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';
import { ENV } from '../env';
import { isHaloExport } from './handoff';
import type { HaloExport } from './types';

/**
 * The bookmark's second way home (2026-09-28): on iPad and phones the export goes to the student's pending slot on
 * the server, and this app picks it up. The key that lets a bookmark drop it off is the student's own; it is only put
 * in a bookmark while the server path is switched on for them, so everyone else keeps today's bookmark exactly.
 */
/** Where the app leaves the account's sync key for the Chrome extension on this computer. */
export const SYNC_KEY_SLOT = 'school-dashboard:sync-key';

export const dropUrl = (): string => (ENV.SUPABASE_URL ? `${ENV.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/sync-drop` : '');

export interface SyncKey {
  key: string;
  enabled: boolean;
}

let cached: Promise<SyncKey | null> | null = null;

/** The account's key and whether the server path is on for it. Null signed out, offline, or on a build without accounts. */
export function loadSyncKey(force = false): Promise<SyncKey | null> {
  if (cached && !force) return cached;
  const c = supabase();
  if (!c) return Promise.resolve(null);
  cached = (async () => {
    const { data: s } = await c.auth.getSession();
    if (!s.session) return null;
    const { data, error } = await c.rpc('my_sync_key');
    if (error || !data) return null;
    const d = data as { key?: string; enabled?: boolean };
    return typeof d.key === 'string' ? { key: d.key, enabled: !!d.enabled } : null;
  })().catch(() => null);
  return cached;
}

export async function resetSyncKey(): Promise<SyncKey | null> {
  const c = supabase();
  if (!c) return null;
  const { data, error } = await c.rpc('reset_sync_key');
  if (error || !data) return null;
  const d = data as { key: string; enabled: boolean };
  cached = Promise.resolve({ key: d.key, enabled: !!d.enabled });
  return cached;
}

export function useSyncKey(): SyncKey | null {
  const [k, setK] = useState<SyncKey | null>(null);
  useEffect(() => {
    let live = true;
    void loadSyncKey().then((v) => live && setK(v));
    return () => {
      live = false;
    };
  }, []);
  return k;
}

/** The newest sync waiting in the slot, if any. */
export async function takePending(): Promise<HaloExport | null> {
  const c = supabase();
  if (!c) return null;
  const { data: s } = await c.auth.getSession();
  if (!s.session) return null;
  const { data, error } = await c.from('pending_syncs').select('id, payload').is('consumed_at', null).order('created_at', { ascending: false }).limit(1);
  if (error || !data || data.length === 0) return null;
  const row = data[0] as { id: string; payload: unknown };
  // Taken the moment it is handed to the review, as a tab handoff is: closing the review drops it, as it always has.
  await c.rpc('take_pending_sync', { sync_id: row.id });
  // The extension's syncs keep their name (and its quiet apply); anything else came from the bookmark.
  if (!isHaloExport(row.payload)) return null;
  const p = row.payload as HaloExport;
  return { ...p, source: p.source === 'extension' ? 'extension' : 'bookmarklet' };
}
