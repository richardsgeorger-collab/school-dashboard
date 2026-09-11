// Fails when a key-shaped string appears in the built output or the source tree.
// Run by `npm run build` after vite, and importable from tests.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const decodeRole = (jwt) => {
  try {
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8')).role ?? null;
  } catch {
    return null;
  }
};

/** Each pattern names what it catches; `accept` can veto a match (anon-role JWTs are public by design). */
export const PATTERNS = [
  { name: 'Anthropic API key', re: /sk-ant-[A-Za-z0-9_-]{10,}/g },
  { name: 'Supabase service_role key', re: /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, accept: (m) => decodeRole(m) === 'service_role' },
  { name: 'Generic sk- secret', re: /\bsk-(?!ant-)[A-Za-z0-9]{32,}/g },
  { name: 'Private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'Halo bearer token', re: /Bearer [A-Za-z0-9_-]{40,}/g },
];

export function scanText(text, file = '<text>') {
  const findings = [];
  for (const p of PATTERNS) {
    for (const m of text.matchAll(p.re)) {
      if (p.accept && !p.accept(m[0])) continue;
      const line = text.slice(0, m.index).split('\n').length;
      findings.push({ file, line, name: p.name, sample: `${m[0].slice(0, 12)}…` });
    }
  }
  return findings;
}

const SKIP_DIRS = new Set(['node_modules', '.git']);
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.pdf', '.zip', '.mp3', '.webm']);

export function scanTree(roots, cwd = process.cwd()) {
  const findings = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (!SKIP_EXT.has(path.extname(ent.name).toLowerCase())) findings.push(...scanText(fs.readFileSync(full, 'utf8'), path.relative(cwd, full)));
    }
  };
  for (const r of roots) {
    const full = path.resolve(cwd, r);
    if (!fs.existsSync(full)) continue;
    if (fs.statSync(full).isDirectory()) walk(full);
    else findings.push(...scanText(fs.readFileSync(full, 'utf8'), path.relative(cwd, full)));
  }
  return findings;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const roots = process.argv.slice(2);
  const targets = roots.length ? roots : ['dist', 'src', 'scripts', 'public', 'docs', 'supabase', 'index.html', 'README.md'];
  const findings = scanTree(targets);
  if (findings.length) {
    console.error('Key-shaped strings found:');
    for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.name}  ${f.sample}`);
    process.exit(1);
  }
  console.log(`secrets check: clean (${targets.filter((t) => fs.existsSync(t)).join(', ')})`);
}
