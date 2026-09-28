// After a real sync: what Halo+ shows for each class, read back from the account, beside what the items add up to.
// Needs a keys file OUTSIDE the repo with VITE_SUPABASE_URL and SERVICE_ROLE.
//   KEYS_ENV=/path/to/keys.env node scripts/grades-check.mjs student@email
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const url = env.VITE_SUPABASE_URL, key = env.SERVICE_ROLE, email = process.argv[2];
const h = { apikey: key, Authorization: `Bearer ${key}` };
const users = (await (await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: h })).json()).users;
const uid = users.find((u) => u.email === email)?.id;
if (!uid) throw new Error(`no user ${email}`);
const rows = async (t) => (await (await fetch(`${url}/rest/v1/${t}?user_id=eq.${uid}&deleted_at=is.null&select=data`, { headers: h })).json()).map((r) => r.data);
const [courses, items] = [await rows('courses'), await rows('items')];
for (const c of courses.sort((a, b) => a.code.localeCompare(b.code))) {
  const g = c.haloGrade;
  const shown = g ? (g.letter && g.percent != null ? `${g.letter} (${g.percent.toFixed(1)}%)` : g.letter ?? `${g.percent.toFixed(1)}%`) : 'no Halo grade synced';
  const scored = items.filter((i) => i.courseId === c.id && i.score != null && i.points > 0);
  const e = scored.reduce((n, i) => n + i.score, 0), p = scored.reduce((n, i) => n + i.points, 0);
  console.log(`${c.code.padEnd(14)} Halo+ shows ${shown.padEnd(22)} items add up to ${p ? ((e / p) * 100).toFixed(1) + '%' : '-'} (${scored.length} graded)${g ? ` · synced ${g.at}` : ''}`);
}
