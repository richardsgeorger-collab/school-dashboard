import { describe, expect, it } from 'vitest';
import { bookmarkletHref, bookmarkletSource, GATEWAY, HALO_HOST } from './bookmarklet';

const cfg = { dashOrigin: 'https://richardsgeorger-collab.github.io', dashPath: '/school-dashboard/#/settings?halo=1' };

describe('bookmarklet', () => {
  const src = bookmarkletSource(cfg);
  it('is one line of valid JavaScript', () => {
    expect(src.includes('\n')).toBe(false);
    expect(() => new Function(src)).not.toThrow();
    expect(src.includes('//')).toBe(src.includes('https://'));
    expect(src.match(/\/\/(?!gateway|richards|halo)/)).toBeNull();
  });
  it('targets the dashboard origin explicitly and never "*"', () => {
    expect(src).toContain(`var D="${cfg.dashOrigin}"`);
    expect(src).toMatch(/win\.postMessage\(payload,D\)/);
    expect(src).not.toMatch(/postMessage\([^)]*['"]\*['"]/);
    expect(src).toMatch(/e\.origin===D/);
  });
  it('only runs on Halo and only talks to Halo', () => {
    expect(src).toContain(`location.hostname!=="${HALO_HOST}"`);
    expect(src).toContain(`fetch("${GATEWAY}"`);
    expect(src).toContain("fetch('/api/auth/session',{credentials:'include'})");
    const hosts = [...src.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]);
    expect(new Set(hosts)).toEqual(new Set(['gateway.halo.gcu.edu', 'richardsgeorger-collab.github.io']));
  });
  it('contains no token, key, or storage write', () => {
    expect(src).not.toMatch(/Bearer [A-Za-z0-9._-]{20,}/);
    expect(src).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
  });
  it('encodes to a javascript: URL with the hash intact', () => {
    const href = bookmarkletHref(cfg);
    expect(href.startsWith('javascript:')).toBe(true);
    expect(href.slice(11).includes('#')).toBe(false);
    expect(decodeURIComponent(href.slice(11))).toBe(src);
  });
});
