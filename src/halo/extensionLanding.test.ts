import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The Chrome extension is plain JS outside the app bundle; these pin the rules that lost George's 6:08 AM sync
// (2026-09-30: read Halo, no Halo+ tab open, handed to nobody, and the popup still said "Last synced 6:08 AM").
const bg = readFileSync('extension/background.js', 'utf8');
const dash = readFileSync('extension/content-dash.js', 'utf8');
const drop = readFileSync('supabase/functions/sync-drop/index.ts', 'utf8');
const manifest = JSON.parse(readFileSync('extension/manifest.json', 'utf8')) as { version: string; host_permissions: string[] };

describe('an extension sync always lands', () => {
  it('writes "Last synced" only for a sync that reached the account or an open Halo+ tab', () => {
    const writes = [...bg.matchAll(/lastSyncAt:/g)].length;
    expect(writes).toBe(1);
    const markLanded = bg.slice(bg.indexOf('async function markLanded'), bg.indexOf('async function pingTabs'));
    expect(markLanded).toContain('lastSyncAt: readAt');
  });
  it('sends every sync to the account first, and keeps it when the account cannot be reached', () => {
    const land = bg.slice(bg.indexOf('async function land('));
    expect(land.indexOf('toAccount(payload)')).toBeGreaterThan(-1);
    expect(land.indexOf('toAccount(payload)')).toBeLessThan(land.indexOf('handTo('));
    expect(land).toContain('await set({ waiting: payload })');
    expect(bg).toContain("via: 'extension'");
    expect(manifest.host_permissions.some((h) => h.endsWith('/functions/v1/sync-drop'))).toBe(true);
    expect(manifest.version >= '0.3.0').toBe(true);
  });
  it('tells an open Halo+ tab to take it now, and learns the account from Halo+', () => {
    expect(bg).toContain("{ kind: 'pending' }");
    expect(dash).toContain("kind: 'halo-pending'");
    expect(dash).toContain('school-dashboard:sync-key');
  });
  it('is taken by the server whatever the bookmark switch says, except under the kill switch', () => {
    expect(drop).toContain("body.via === 'extension'");
    expect(drop).toMatch(/fromExtension\s*\?[\s\S]*server_sync_kill[\s\S]*:\s*await db\.rpc\('server_sync_on'/);
    // The newest sync replaces every older one, so a stale one is never applied after it.
    expect(drop).toContain(".delete().eq('user_id', owner.user_id).neq('id', row.id)");
  });
});
