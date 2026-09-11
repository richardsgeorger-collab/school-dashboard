import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scanText, scanTree } from './secrets.mjs';

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role: string) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', role, exp: 2000000000 })}.${'x'.repeat(43)}`;

describe('secrets scanner', () => {
  it('catches an Anthropic key and a service_role JWT built at runtime', () => {
    const key = ['sk', 'ant', `api03-${'a'.repeat(40)}`].join('-');
    expect(scanText(`const k = "${key}";`).map((f) => f.name)).toEqual(['Anthropic API key']);
    expect(scanText(jwt('service_role')).map((f) => f.name)).toEqual(['Supabase service_role key']);
    expect(scanText(`Authorization: Bearer ${'Q'.repeat(60)}`).map((f) => f.name)).toEqual(['Halo bearer token']);
  });
  it('lets the public anon key and the patterns themselves through', () => {
    expect(scanText(jwt('anon'))).toEqual([]);
    expect(scanText(fs.readFileSync('scripts/secrets.mjs', 'utf8'), 'scripts/secrets.mjs')).toEqual([]);
    expect(scanText("'Bearer '+s.authToken")).toEqual([]);
  });
  it('finds nothing in the source tree, docs, scripts, or the built output', () => {
    const findings = scanTree(['src', 'scripts', 'public', 'docs', 'supabase', 'index.html', 'README.md', 'dist']);
    expect(findings).toEqual([]);
  });
});
