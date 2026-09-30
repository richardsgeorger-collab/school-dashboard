/**
 * Fold announcement-made copies of Halo assignments into the Halo item on every account (2026-09-30). The copy's
 * instruction becomes a requirement on Halo's item (ticked if the copy was done), its requirements come along with
 * their ticks, and the copy is removed the way the app removes an item. Backs up every touched row first. Dry run by
 * default; --go writes.   KEYS_ENV=... BACKUP_DIR=... npx tsx scripts/fold-duplicates.ts [--go]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { Item } from '../src/domain/types';
import { foldDuplicates } from '../src/halo/sameAssignment';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV!, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const GO = process.argv.includes('--go');
const admin = createClient(env.VITE_SUPABASE_URL, env.SERVICE_ROLE, { auth: { persistSession: false } });
const now = new Date().toISOString();
const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
let before = 0;
let folded = 0;
const backup: unknown[] = [];
for (const u of list.users) {
  const { data: rows } = await admin.from('items').select('data').eq('user_id', u.id).is('deleted_at', null);
  const items = (rows ?? []).map((r) => r.data as Item);
  const made = items.filter((i) => !i.haloId && i.origin?.kind === 'announcement');
  if (!made.length) continue;
  before += made.length;
  const out = foldDuplicates(items, now);
  const who = (u.email ?? '').replace(/^(.{3}).*@/, '$1…@');
  console.log(`== ${who}: ${made.length} announcement-made items, ${out.pairs.length} are copies of Halo assignments`);
  for (const p of out.pairs) console.log(`   "${p.copy.title}" (${p.copy.dueAt.slice(0, 10)}) → into Halo "${p.into.title}" (${p.into.dueAt.slice(0, 10)}), now ${p.into.requirements?.length ?? 0} requirements`);
  folded += out.pairs.length;
  backup.push({ user: u.id, pairs: out.pairs.map((p) => ({ copy: p.copy, into: items.find((i) => i.id === p.into.id) })) });
  if (!GO || !out.pairs.length) continue;
  for (const i of out.upserts) {
    const r = await admin.from('items').update({ data: i, updated_at: now }).eq('id', i.id).eq('user_id', u.id);
    if (r.error) throw new Error(r.error.message);
  }
  for (const id of out.deletes) {
    const r = await admin.from('items').update({ data: { id }, updated_at: now, deleted_at: now }).eq('id', id).eq('user_id', u.id);
    if (r.error) throw new Error(r.error.message);
  }
}
if (process.env.BACKUP_DIR) {
  mkdirSync(process.env.BACKUP_DIR, { recursive: true });
  writeFileSync(`${process.env.BACKUP_DIR}/fold-duplicates-${now.replace(/[:.]/g, '-')}.json`, JSON.stringify(backup));
}
console.log(`\nBefore: ${before} announcement-made items across all accounts, ${folded} of them copies of a Halo assignment. After: ${before - folded}, 0 copies.${GO ? '' : ' (dry run: nothing written)'}`);
