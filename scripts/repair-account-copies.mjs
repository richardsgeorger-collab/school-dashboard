// Repairs one account whose classes exist twice (George, 2026-10-09: the Sept 30 move left a second copy of every
// class; the sign-in to a second account surfaced them). The same fold the app now runs (src/halo/dedupe.ts), applied
// to the server rows, then Halo's latest sync re-applied: an assessment Halo says is handed in or graded is done.
// Prints the before/after table. Nothing is written unless WRITE=1; a JSON backup of every row goes to BACKUP_DIR first.
//   KEYS_ENV=... USER=<uuid> [WRITE=1] [BACKUP_DIR=...] [WIPE_OTHER=<uuid>] npx tsx scripts/repair-account-copies.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { dedupeData } from '../src/halo/dedupe.ts';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const db = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const USER = process.env.USER_ID ?? process.env.USER;
const WRITE = process.env.WRITE === '1';
const BACKUP_DIR = process.env.BACKUP_DIR ?? '/tmp';
if (!USER || !/^[0-9a-f-]{36}$/.test(USER)) throw new Error('USER must be the account id');

const courses = (await db.from('courses').select('id, data, updated_at').eq('user_id', USER).is('deleted_at', null)).data;
const items = (await db.from('items').select('id, data, updated_at').eq('user_id', USER).is('deleted_at', null)).data;
const settingsRow = (await db.from('settings').select('data, updated_at').eq('user_id', USER).single()).data;
const latest = (await db.from('pending_syncs').select('id, payload, created_at, consumed_at').eq('user_id', USER).order('created_at', { ascending: false }).limit(1)).data?.[0] ?? null;
mkdirSync(BACKUP_DIR, { recursive: true });
const backup = `${BACKUP_DIR}/repair-backup-${USER.slice(0, 8)}-${Date.now()}.json`;
writeFileSync(backup, JSON.stringify({ courses, items, settings: settingsRow, latest }, null, 1));
console.log(`backup: ${backup} (${courses.length} courses, ${items.length} items, latest sync ${latest?.created_at ?? '-'})`);

const data = { courses: courses.map((c) => c.data), items: items.map((i) => i.data), settings: settingsRow.data };
// Graded in Halo: a PUBLISHED assessment with a score (a number); handed in: SUBMITTED, or a submittedAt.
const haloDone = (a) => !!a.submittedAt || typeof a.score === 'number' || /GRADED|SUBMITTED|COMPLETED/i.test(a.status ?? '');
const table = (d, label) => {
  console.log(`\n${label}`);
  console.log('class        course id  last synced          Halo done  Halo+ done  copies');
  for (const c of d.courses) {
    const copies = d.courses.filter((x) => (x.haloClassId && x.haloClassId === c.haloClassId) || x.code === c.code).length;
    const pulls = d.settings.haloPulls?.[c.id]?.assessments ?? null;
    const cls = latest?.payload.classes.find((k) => k.id === c.haloClassId);
    const hd = cls ? cls.assessments.filter(haloDone).length : '-';
    const mine = d.items.filter((i) => i.courseId === c.id);
    const pd = cls ? cls.assessments.filter((a) => haloDone(a) && mine.some((i) => i.haloId === a.id && i.status === 'done')).length : mine.filter((i) => i.status === 'done').length;
    console.log(`${c.code.padEnd(12)} ${c.id.slice(0, 8)}   ${pulls ? pulls.slice(0, 16).replace('T', ' ') : 'never'.padEnd(16)}     ${String(hd).padStart(5)}      ${String(pd).padStart(5)}     ${copies}`);
  }
};
table(data, 'BEFORE');

const folded = dedupeData(data);
// Halo's latest word on each kept item: handed in or graded is done, with Halo's time.
const completed = [];
if (latest) {
  const byHalo = new Map(folded.data.items.map((i) => [i.haloId, i]));
  for (const cls of latest.payload.classes) {
    for (const a of cls.assessments) {
      const it = byHalo.get(a.id);
      if (!it || it.status === 'done' || !haloDone(a)) continue;
      it.status = 'done';
      it.completedAt = a.submittedAt ?? latest.payload.exportedAt;
      if (typeof a.score === 'number' && it.score == null) { it.score = a.score; it.scoreSource = 'halo'; }
      it.halo = { status: a.status ?? null, submittedAt: a.submittedAt ?? null, checkedAt: latest.payload.exportedAt };
      it.updatedAt = new Date().toISOString();
      completed.push(`${cls.courseCode} ${a.title}`);
    }
  }
}
console.log(`\nfold: remove ${folded.removedCourses.length} course copies, ${folded.removedItems.length} duplicate items; Halo says done, Halo+ said to do: ${completed.length}`);
for (const t of completed) console.log('  done now:', t);
table(folded.data, 'AFTER');

if (!WRITE) {
  console.log('\n(dry run: set WRITE=1 to apply)');
  process.exit(0);
}
const now = new Date().toISOString();
const up = async (table, rows) => {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 200).map((r) => ({ id: r.id, user_id: USER, data: r, updated_at: r.updatedAt ?? now, deleted_at: null })), { onConflict: 'user_id,id' });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
};
await up('courses', folded.data.courses);
await up('items', folded.data.items);
for (const id of folded.removedItems) await db.from('items').upsert({ id, user_id: USER, data: { id }, updated_at: now, deleted_at: now }, { onConflict: 'user_id,id' });
for (const id of folded.removedCourses) await db.from('courses').upsert({ id, user_id: USER, data: { id }, updated_at: now, deleted_at: now }, { onConflict: 'user_id,id' });
await db.from('settings').update({ data: { ...folded.data.settings, updatedAt: now }, updated_at: now }).eq('user_id', USER);
// Halo's latest sync goes back in the mailbox, so the next open tab applies grades, rubrics and facts to the kept copies.
if (latest && process.env.NO_REQUEUE !== '1') await db.from('pending_syncs').update({ consumed_at: null }).eq('id', latest.id);
console.log(`\nwritten: ${folded.data.courses.length} courses, ${folded.data.items.length} items, ${folded.removedCourses.length} course tombstones, ${folded.removedItems.length} item tombstones${latest && process.env.NO_REQUEUE !== '1' ? '; latest sync re-queued' : ''}`);

// The account that received this student's Halo by mistake: its planner is emptied and its sync key reset.
let OTHER = process.env.WIPE_OTHER;
if (OTHER && OTHER.length < 36) {
  const users = (await db.auth.admin.listUsers({ perPage: 1000 })).data.users.filter((u) => u.id.startsWith(OTHER));
  if (users.length !== 1) throw new Error(`WIPE_OTHER prefix matches ${users.length} users`);
  OTHER = users[0].id;
}
if (OTHER) {
  const oc = (await db.from('courses').select('id').eq('user_id', OTHER).is('deleted_at', null)).data ?? [];
  const oi = (await db.from('items').select('id').eq('user_id', OTHER).is('deleted_at', null)).data ?? [];
  for (const r of oi) await db.from('items').upsert({ id: r.id, user_id: OTHER, data: { id: r.id }, updated_at: now, deleted_at: now }, { onConflict: 'user_id,id' });
  for (const r of oc) await db.from('courses').upsert({ id: r.id, user_id: OTHER, data: { id: r.id }, updated_at: now, deleted_at: now }, { onConflict: 'user_id,id' });
  const os = (await db.from('settings').select('data').eq('user_id', OTHER).maybeSingle()).data;
  if (os) await db.from('settings').update({ data: { ...os.data, haloPulls: {}, lastPull: null, updatedAt: now }, updated_at: now }).eq('user_id', OTHER);
  await db.from('pending_syncs').delete().eq('user_id', OTHER);
  await db.from('sync_keys').delete().eq('user_id', OTHER);
  console.log(`other account ${OTHER.slice(0, 8)}: ${oc.length} courses and ${oi.length} items tombstoned, pulls cleared, pending syncs and sync key removed`);
}
