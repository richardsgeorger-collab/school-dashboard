// Is the deployed AI function reachable from a browser? The Inbox was dark for days because its preflight answered
// 500 and nothing checked it: the e2e scripts talk to Anthropic directly and never touch the function. This asks
// the live function the two things a browser asks before any real call, and needs no secrets.
//   node scripts/live-check.mjs            (SUPABASE_URL defaults to the project)
import process from 'node:process';
const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'https://kiacmspgvntzwngijibr.supabase.co').replace(/\/$/, '');
const origin = 'https://haloplus.app';
let failed = 0;
const check = (ok, line) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); if (!ok) failed++; };
for (const fn of ['ai', 'stripe-checkout', 'stripe-portal']) {
  const pre = await fetch(`${url}/functions/v1/${fn}`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type,apikey' } }).catch((e) => ({ status: 0, headers: new Headers(), error: String(e) }));
  const acao = pre.headers.get('access-control-allow-origin');
  const allowHeaders = (pre.headers.get('access-control-allow-headers') ?? '').toLowerCase();
  check(pre.status === 204 && acao === '*' && ['authorization', 'apikey', 'content-type'].every((h) => allowHeaders.includes(h)), `${fn} preflight: ${pre.status} allow-origin=${acao ?? '-'} allow-headers=${allowHeaders || '-'}`);
  const post = await fetch(`${url}/functions/v1/${fn}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' }).catch((e) => ({ status: 0, text: async () => String(e) }));
  const body = await post.text();
  // No auth header: the relay answers 401 before the function runs. That still proves the function exists and is deployed.
  check(post.status === 401 && body.includes('authorization'), `${fn} no-auth POST: ${post.status} ${body.slice(0, 80)}`);
}
// The calendar feed (2026-10-01) is read by Google and Apple Calendar with no sign-in: deployed without JWT checks, an
// unknown link answers the function's own 404, not the relay's 401.
{
  const r = await fetch(`${url}/functions/v1/calendar/${'0'.repeat(48)}.ics`).catch((e) => ({ status: 0, text: async () => String(e) }));
  const body = await r.text();
  check(r.status === 404 && body.includes('calendar link'), `calendar feed, unknown link: ${r.status} ${body.slice(0, 60)}`);
}
// The Sync Halo bookmark is a loader for the site's halo-sync.js; if that file stops being served, every bookmark
// silently falls back to the copy embedded the day it was saved. Every bookmark saved before 2026-09-29 loads it from
// the old github.io address, so that one must always answer; haloplus.app is checked once it is live.
const probe = (site) => fetch(`${site}?v=${Date.now()}`).then(async (r) => ({ status: r.status, type: r.headers.get('content-type') ?? '', text: await r.text() })).catch((e) => ({ status: 0, type: '', text: String(e) }));
const scriptCheck = async (site, required) => {
  let script = await probe(site);
  // Right after a deploy the CDN can still answer with the previous site for a minute; give it three chances.
  for (let i = 0; i < 3 && script.status !== 200 && required; i++) {
    await new Promise((r) => setTimeout(r, 20000));
    script = await probe(site);
  }
  if (!required && script.status === 0) return console.log(`note ${site}: not reachable yet (DNS or HTTPS not set up); not a failure until it is`);
  const build = (script.text.match(/^\/\* Halo\+ sync script, build (\S+)\./) ?? [])[1];
  let parses = false;
  try {
    new Function(script.text);
    parses = true;
  } catch {
    /* reported below */
  }
  check(script.status === 200 && script.type.includes('javascript') && !!build && parses && script.text.includes("kind:'halo-export'") && script.text.includes('https://haloplus.app'), `${site}: ${script.status} ${script.type || '-'} build=${build ?? '-'} ${parses ? 'parses' : 'does not parse'}, hands off to haloplus.app`);
};
await scriptCheck('https://richardsgeorger-collab.github.io/school-dashboard/halo-sync.js', true);
await scriptCheck('https://haloplus.app/halo-sync.js', false);
console.log(failed ? `${failed} check(s) failed` : 'live functions reachable from a browser, sync script served');
process.exit(failed ? 1 : 0);
