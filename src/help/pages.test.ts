import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HELP_PAGES, helpUrl, renderHelpIndex, renderHelpPage, renderLlmsTxt, renderSitemap, SITE } from './pages';

const ld = (html: string) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

describe('help pages', () => {
  it('6 to 8 pages, each at its own clean address', () => {
    expect(HELP_PAGES.length).toBeGreaterThanOrEqual(6);
    expect(HELP_PAGES.length).toBeLessThanOrEqual(8);
    expect(new Set(HELP_PAGES.map((p) => p.slug)).size).toBe(HELP_PAGES.length);
    for (const p of HELP_PAGES) expect(p.slug).toMatch(/^[a-z0-9-]+$/);
  });
  it.each(HELP_PAGES.map((p) => [p.slug, p] as const))('%s: titles and descriptions fit search results', (_, p) => {
    expect(p.title.length).toBeLessThanOrEqual(80);
    expect(p.description.length).toBeGreaterThan(60);
    expect(p.description.length).toBeLessThanOrEqual(160);
    expect(p.faq.length).toBeGreaterThanOrEqual(3);
  });
  it.each(HELP_PAGES.map((p) => [p.slug, p] as const))('%s: canonical, not-affiliated line, SoftwareApplication and FAQPage that match the page', (_, p) => {
    const html = renderHelpPage(p);
    expect(html).toContain(`<link rel="canonical" href="${helpUrl(p.slug)}" />`);
    expect(html).toContain('not affiliated with, endorsed by, or connected to Grand Canyon University');
    const blocks = ld(html);
    expect(blocks.find((b) => b['@type'] === 'SoftwareApplication')?.name).toBe('Halo+');
    const faq = blocks.find((b) => b['@type'] === 'FAQPage');
    // Google only accepts FAQ structured data that is visible on the page, word for word.
    const shown = [...html.matchAll(/<dt>([^<]+)<\/dt><dd>([^<]+)<\/dd>/g)].map((m) => [unescape(m[1]), unescape(m[2])]);
    expect(faq.mainEntity.map((q: { name: string; acceptedAnswer: { text: string } }) => [q.name, q.acceptedAnswer.text])).toEqual(shown);
    // Every other help page is linked, so a crawler that lands on one finds them all.
    for (const o of HELP_PAGES) if (o.slug !== p.slug) expect(html).toContain(`href="/help/${o.slug}/"`);
  });
  it('the answer comes before Halo+ on every page', () => {
    for (const p of HELP_PAGES) {
      const html = renderHelpPage(p);
      expect(html.indexOf('class="short"')).toBeLessThan(html.indexOf('Where Halo+ fits'));
      // Pages whose question is about Halo+ itself (Halo vs Halo+, is it safe) name it; the rest answer without it.
      if (!/Halo\+|planner/.test(p.title)) expect(p.short).not.toMatch(/Halo\+/);
    }
  });
  it('the index lists every page', () => {
    const html = renderHelpIndex();
    for (const p of HELP_PAGES) expect(html).toContain(`href="/help/${p.slug}/"`);
  });
  it('the sitemap and llms.txt list every page; the landing footer links them', () => {
    const map = renderSitemap('2026-09-30');
    const llms = renderLlmsTxt();
    expect(map).toContain(`<loc>${SITE}</loc>`);
    expect(map).toContain(`<loc>${SITE}help/</loc>`);
    for (const p of HELP_PAGES) {
      expect(map).toContain(`<loc>${helpUrl(p.slug)}</loc>`);
      expect(llms).toContain(helpUrl(p.slug));
    }
    expect(llms).toMatch(/^# Halo\+\n\n> /);
    expect(llms).toContain('not affiliated');
    expect(readFileSync('src/landing/Landing.tsx', 'utf8')).toContain('HELP_PAGES.map');
  });
});
