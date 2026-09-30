import { supabase } from '../auth/client';
import { announceDb, type StoredAnnouncement } from './announce';

/**
 * The announcements themselves, mirrored to the account. Posts arrive with a sync and lived only in the browser
 * that synced, so the phone's Inbox was empty until the phone ran its own bookmark. With the ledger mirrored too,
 * a post pulled here already carries what it asked and whether it was read. Only ever adds; a sync on any device
 * still replaces a post's own content the way it always did.
 */
interface Stub {
  id: string;
  updated_at: string;
  course_id?: string;
}
interface Row extends Stub {
  course_id: string;
  data: StoredAnnouncement;
  published_at: string | null;
}

export function planPostsSync(local: StoredAnnouncement[], remote: Stub[]): { pullIds: string[]; push: StoredAnnouncement[] } {
  const localById = new Map(local.map((a) => [a.id, a]));
  const remoteIds = new Set(remote.map((r) => r.id));
  // A post the account has filed under another class is pulled again: the lab repair of 2026-09-30 moved a merged
  // lab's announcements to the lab's own class on the server, and a device that already had them kept the old class.
  const moved = (r: Stub) => !!r.course_id && localById.get(r.id)?.courseId !== undefined && localById.get(r.id)!.courseId !== r.course_id;
  return { pullIds: remote.filter((r) => !localById.has(r.id) || moved(r)).map((r) => r.id), push: local.filter((a) => !remoteIds.has(a.id)) };
}

const toRow = (a: StoredAnnouncement) => ({ id: a.id, course_id: a.courseId, data: a, published_at: a.publishedAt ?? null, updated_at: a.pulledAt });

async function client() {
  const c = supabase();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session ? c : null;
}

/** Bring the account's posts here and this device's posts to the account. Returns how many arrived. */
export async function syncPosts(courseIds: Set<string>): Promise<number> {
  const c = await client();
  if (!c) return 0;
  const { data: stubs, error } = await c.from('announcements').select('id, updated_at, course_id');
  if (error || !stubs) return 0;
  const local = (await announceDb.list().catch(() => [] as StoredAnnouncement[])).filter((a) => courseIds.has(a.courseId));
  const plan = planPostsSync(local, stubs as Stub[]);
  let pulled = 0;
  for (let i = 0; i < plan.pullIds.length; i += 50) {
    const { data: rows } = await c.from('announcements').select('id, course_id, data, published_at, updated_at').in('id', plan.pullIds.slice(i, i + 50));
    for (const r of (rows ?? []) as Row[]) {
      // A post for a class this device does not have yet waits for the course mirror; it is not lost, just not shown.
      if (!r.data || !courseIds.has(r.course_id)) continue;
      await announceDb.put({ ...r.data, courseId: r.course_id });
      pulled++;
    }
  }
  for (let i = 0; i < plan.push.length; i += 50) await c.from('announcements').upsert(plan.push.slice(i, i + 50).map(toRow), { onConflict: 'user_id,id' });
  return pulled;
}
