/**
 * Split classes the old matcher merged (a lab folded into its lecture) on every account, server-side, without a sync.
 * Learns which Halo units, assessments and forums belong to each section from the accounts where that section is its
 * own class, then moves the evidence-backed items and announcements into a restored class. Backs up every row it
 * touches to the scratchpad first. Dry run by default; --go writes.
 *   KEYS_ENV=... BACKUP_DIR=... npx tsx scripts/repair-merged-labs.ts [--go]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { Course, Item } from '../src/domain/types';
import { emptyKnowledge, isMerged, learn, planRepair } from '../src/halo/repairMerged';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV!, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const GO = process.argv.includes('--go');
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
type Post = { id: string; courseId: string; forumId: string | null };

const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
const accounts: { id: string; email: string; courses: Course[]; items: Item[]; posts: Post[] }[] = [];
for (const u of list.users) {
  const { data: cs } = await admin.from('courses').select('data').eq('user_id', u.id).is('deleted_at', null);
  if (!cs?.length) continue;
  const { data: its } = await admin.from('items').select('data').eq('user_id', u.id).is('deleted_at', null);
  const { data: ps } = await admin.from('announcements').select('id, course_id, data').eq('user_id', u.id);
  accounts.push({ id: u.id, email: u.email ?? '', courses: cs.map((r) => r.data as Course), items: (its ?? []).map((r) => r.data as Item), posts: (ps ?? []).map((r) => ({ id: r.id, courseId: r.course_id, forumId: r.data?.forumId ?? null })) });
}
const k = emptyKnowledge();
for (const a of accounts) learn(k, a.courses, a.items, a.posts);
console.log(`learned from ${accounts.length} accounts: ${k.sections.size} sections, ${k.units.size} units, ${k.assessments.size} assessments, ${k.forums.size} forums`);

const now = new Date().toISOString();
const backup: unknown[] = [];
for (const a of accounts) {
  const merged = a.courses.filter(isMerged);
  if (!merged.length) continue;
  const who = a.email.replace(/^(.{3}).*@/, '$1…@');
  console.log(`\n== ${who}: ${a.courses.length} classes, merged: ${merged.map((c) => `${c.code}←${c.haloSlugId}`).join(', ')}`);
  let courses = [...a.courses];
  for (const m of merged) {
    const plan = planRepair(m, a.items, a.posts, k, courses, now);
    if (!plan) { console.log(`   ${m.code}: no evidence for ${m.haloSlugId} on any account; the app asks for one sync`); continue; }
    const moved = a.items.filter((i) => plan.moveItems.includes(i.id));
    console.log(`   ${m.code} → keep "${plan.kept.code} ${plan.kept.name}" + restore "${plan.restored.code} ${plan.restored.name}" (${plan.restored.id.slice(0, 8)}, grade ${plan.restored.haloGrade?.letter ?? '-'}, meetings ${JSON.stringify(plan.restored.meetings.map((x) => `${x.day}@${x.start}`))})`);
    console.log(`     move ${moved.length} items (${moved.filter((i) => i.status === 'done').length} done), ${plan.movePosts.length} announcements; ${plan.unplaced} Halo items unplaced stay`);
    console.log(`     e.g. ${moved.slice(0, 6).map((i) => i.title).join(' | ')}`);
    backup.push({ user: a.id, course: m, items: moved, posts: plan.movePosts });
    courses = [...courses.filter((c) => c.id !== m.id), plan.kept, plan.restored];
    if (!GO) continue;
    const r1 = await admin.from('courses').upsert([plan.kept, plan.restored].map((c) => ({ id: c.id, user_id: a.id, data: c, updated_at: now, deleted_at: null })), { onConflict: 'user_id,id' });
    if (r1.error) throw new Error(`courses: ${r1.error.message}`);
    for (const i of moved) {
      const next = { ...i, courseId: plan.restored.id, updatedAt: now };
      const r = await admin.from('items').update({ data: next, updated_at: now }).eq('id', i.id).eq('user_id', a.id);
      if (r.error) throw new Error(`item ${i.id}: ${r.error.message}`);
    }
    for (const pid of plan.movePosts) {
      const { data: row } = await admin.from('announcements').select('data').eq('id', pid).eq('user_id', a.id).single();
      const r = await admin.from('announcements').update({ course_id: plan.restored.id, data: { ...row!.data, courseId: plan.restored.id }, updated_at: now }).eq('id', pid).eq('user_id', a.id);
      if (r.error) throw new Error(`post ${pid}: ${r.error.message}`);
    }
    console.log('     written');
  }
}
if (process.env.BACKUP_DIR) {
  mkdirSync(process.env.BACKUP_DIR, { recursive: true });
  writeFileSync(`${process.env.BACKUP_DIR}/merged-labs-backup-${now.replace(/[:.]/g, '-')}.json`, JSON.stringify(backup));
}
console.log(GO ? '\nDone.' : '\nDry run: nothing written. Run with --go.');
