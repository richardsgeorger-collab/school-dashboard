import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * What a pasted link shows is the first thing most students ever see of Halo+. The tags live in index.html, outside
 * React, because link crawlers never run the app; this keeps them present, consistent, and pointing at files that ship.
 */
const html = readFileSync('index.html', 'utf8');
const SITE = 'https://richardsgeorger-collab.github.io/school-dashboard/';
const meta = (attr: 'name' | 'property', key: string) => html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`))?.[1] ?? null;

describe('share and search metadata', () => {
  it('has a title, a description under 320 characters, and a canonical address', () => {
    expect(html).toContain('<title>Halo+: the planner built for Halo</title>');
    const d = meta('name', 'description') ?? '';
    expect(d.length).toBeGreaterThan(60);
    expect(d.length).toBeLessThan(320);
    expect(d).toContain('not affiliated with GCU');
    expect(html).toContain(`<link rel="canonical" href="${SITE}" />`);
  });
  it('the Open Graph and Twitter cards agree and point at a share image that ships', () => {
    expect(meta('property', 'og:title')).toBe('Halo+: the planner built for Halo');
    expect(meta('name', 'twitter:title')).toBe(meta('property', 'og:title'));
    expect(meta('property', 'og:url')).toBe(SITE);
    expect(meta('property', 'og:image')).toBe(`${SITE}og.png`);
    expect(meta('name', 'twitter:image')).toBe(meta('property', 'og:image'));
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(meta('property', 'og:image:width')).toBe('1200');
    expect(meta('property', 'og:image:height')).toBe('630');
    expect(existsSync('public/og.png')).toBe(true);
    // PNG header and the 1200×630 size from the IHDR chunk.
    const png = readFileSync('public/og.png');
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });
  it('structured data names the product and says it is independent', () => {
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '{}';
    const data = JSON.parse(ld);
    expect(data['@type']).toBe('SoftwareApplication');
    expect(data.name).toBe('Halo+');
    expect(data.description).toContain('not affiliated with Grand Canyon University');
  });
  it('robots and the sitemap ship and agree with the site address', () => {
    expect(readFileSync('public/robots.txt', 'utf8')).toContain(`Sitemap: ${SITE}sitemap.xml`);
    const map = readFileSync('public/sitemap.xml', 'utf8');
    expect(map).toContain(`<loc>${SITE}</loc>`);
    expect(map).toContain(`<loc>${SITE}privacy.html</loc>`);
  });
});
