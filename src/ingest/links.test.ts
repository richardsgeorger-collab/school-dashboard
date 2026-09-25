import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem } from '../halo/fixtures';
import { buildLinksPrompt, canLink, findLinks, linksFor, linksFromTool } from './links';

const chm = mkCourse({ id: 'chm', code: 'CHM-113', name: 'General Chemistry I', topics: [{ name: 'Stoichiometry', week: 3, buildsOn: ['moles'] }, { name: 'moles', week: 2, buildsOn: [] }] });
const esg = mkCourse({ id: 'esg', code: 'ESG-162', name: 'Engineering Math', topics: [{ name: 'Dimensional analysis', week: 2, buildsOn: [] }] });
const eng = mkCourse({ id: 'eng', code: 'ENG-105', name: 'English Composition I' });

describe('topics that overlap across classes', () => {
  it('needs two classes with topic maps, lists them by code, and keeps only links whose topics and codes exist', () => {
    expect(canLink([chm, eng])).toBe(false);
    expect(canLink([chm, esg, eng])).toBe(true);
    const prompt = buildLinksPrompt([chm, esg, eng]);
    expect(prompt.user).toContain('CHM-113 (General Chemistry I):\n  - Stoichiometry (week 3)\n  - moles (week 2)');
    expect(prompt.user).not.toContain('ENG-105');
    const links = linksFromTool(
      {
        links: [
          { a_code: 'chm-113', a_topic: 'stoichiometry', b_code: 'ESG-162', b_topic: 'dimensional analysis', note: 'Mole ratios are unit conversions.' },
          { a_code: 'ESG-162', a_topic: 'Dimensional analysis', b_code: 'CHM-113', b_topic: 'Stoichiometry', note: 'same pair, other way round' },
          { a_code: 'CHM-113', a_topic: 'gas laws', b_code: 'ESG-162', b_topic: 'Dimensional analysis', note: 'topic not listed' },
          { a_code: 'CHM-113', a_topic: 'moles', b_code: 'CHM-113', b_topic: 'Stoichiometry', note: 'same class' },
          { a_code: 'PHY-111', a_topic: 'x', b_code: 'ESG-162', b_topic: 'Dimensional analysis', note: 'unknown class' },
        ],
      },
      [chm, esg, eng],
    );
    expect(links).toEqual([{ a: { courseId: 'chm', topic: 'Stoichiometry' }, b: { courseId: 'esg', topic: 'Dimensional analysis' }, note: 'Mole ratios are unit conversions.' }]);
    const item = mkItem({ id: 'i', courseId: 'chm', title: 'Topic 3 Quiz', topic: 'stoichiometry' });
    expect(linksFor(item, links, [chm, esg, eng])).toEqual([{ other: esg, topic: 'Dimensional analysis', note: 'Mole ratios are unit conversions.' }]);
    expect(linksFor(mkItem({ id: 'j', courseId: 'esg', title: 'HW 2', topic: 'Dimensional analysis' }), links, [chm, esg, eng])[0].other.code).toBe('CHM-113');
    expect(linksFor(mkItem({ id: 'k', courseId: 'eng', title: 'Essay' }), links, [chm, esg, eng])).toEqual([]);
  });
  it('runs as one forced tool call', async () => {
    const fetch = (async () => new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-4-5-20251001', content: [{ type: 'tool_use', id: 't', name: 'topic_links', input: { links: [{ a_code: 'CHM-113', a_topic: 'moles', b_code: 'ESG-162', b_topic: 'Dimensional analysis', note: 'Counting by the mole is a unit conversion.' }] } }], stop_reason: 'tool_use', usage: { input_tokens: 5, output_tokens: 5 } }), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof globalThis.fetch;
    const links = await findLinks({ apiKey: 'k', fetch, courses: [chm, esg] });
    expect(links.map((l) => [l.a.topic, l.b.topic])).toEqual([['moles', 'Dimensional analysis']]);
  });
});
