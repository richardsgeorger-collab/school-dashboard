// Is the deployed AI function reachable from a browser? The Inbox was dark for days because its preflight answered
// 500 and nothing checked it: the e2e scripts talk to Anthropic directly and never touch the function. This asks
// the live function the two things a browser asks before any real call, and needs no secrets.
//   node scripts/live-check.mjs            (SUPABASE_URL defaults to the project)
import process from 'node:process';
const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'https://kiacmspgvntzwngijibr.supabase.co').replace(/\/$/, '');
const origin = 'https://richardsgeorger-collab.github.io';
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
console.log(failed ? `${failed} check(s) failed` : 'live functions reachable from a browser');
process.exit(failed ? 1 : 0);
