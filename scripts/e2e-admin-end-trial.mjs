// Admin → End a test account's free week now (George, 2026-10-10): works on an account marked Test, refuses a real one.
//   KEYS_ENV=... node scripts/e2e-admin-end-trial.mjs
import { readFileSync } from 'node:fs';
import { personaKit } from './lib/personas.mjs';

const env = Object.fromEntries(readFileSync(process.env.KEYS_ENV, 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const kit = personaKit(env);
const db = kit.db;
const checks = [];
const check = (ok, line) => { checks.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); };
try {
  const boss = await kit.persona('admin');
  const bossC = (await kit.signIn(boss.email)).c;
  const tester = await kit.persona('trial-1d');
  const real = await kit.persona('trial-1d');
  // Personas are test-by-rule (their address); "real" is forced real for this check.
  await bossC.rpc('admin_set_test', { uid: real.id, test: false });
  const before = (await db.from('profiles').select('trial_ends_at').eq('user_id', tester.id).single()).data;
  check(Date.parse(before.trial_ends_at) > Date.now(), 'the test account is mid-trial');
  const r1 = (await bossC.rpc('admin_end_trial', { p_email: tester.email.toUpperCase() })).data;
  const after = (await db.from('profiles').select('trial_ends_at, trial_started_at').eq('user_id', tester.id).single()).data;
  check(r1?.ok === true && Date.parse(after.trial_ends_at) < Date.now() && !!after.trial_started_at, `ended now (${r1?.why ?? 'ok'}); ends_at ${after.trial_ends_at}`);
  const state = (await (await kit.signIn(tester.email)).c.rpc('intro_offer_state')).data;
  check(state?.eligible === true, `that account may now take the $2.99 offer (${JSON.stringify(state)})`);
  const r2 = (await bossC.rpc('admin_end_trial', { p_email: real.email })).data;
  const realAfter = (await db.from('profiles').select('trial_ends_at').eq('user_id', real.id).single()).data;
  check(r2?.ok === false && /Not a test account/.test(r2?.why ?? '') && Date.parse(realAfter.trial_ends_at) > Date.now(), `a real account is refused: "${r2?.why}"`);
  const r3 = (await bossC.rpc('admin_end_trial', { p_email: 'nobody@example.invalid' })).data;
  check(r3?.ok === false && /No account/.test(r3?.why ?? ''), `an unknown email: "${r3?.why}"`);
  const student = (await kit.signIn(tester.email)).c;
  const r4 = await student.rpc('admin_end_trial', { p_email: real.email });
  check(!!r4.error && /admins only/.test(r4.error.message), 'a student cannot call it');
} finally {
  console.log(`removed ${await kit.cleanup()} throwaways`);
}
console.log(checks.every(Boolean) ? 'PASS' : 'FAIL');
process.exit(checks.every(Boolean) ? 0 : 1);
