import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, TZ } from '../halo/fixtures';
import { buildKit, findAiPolicy, formatRules, needsOwnData, syllabusSection } from './kit';

const course = mkCourse({ id: 'unv', code: 'UNV-106', name: 'University Success', instructors: [{ name: 'Prof. Hannah Lindqvist', email: 'h@example.edu' }] });
const item = mkItem({
  id: 'p',
  courseId: 'unv',
  title: 'Online Privacy & Security (PowerPoint Assignment)',
  label: 'UNV Privacy Slides',
  type: 'project',
  points: 60,
  dueAt: '2026-10-12T23:59:00-07:00',
  topic: 'Topic 5: Being a Responsible Digital Citizen',
  notes: 'Create a 10 slide PowerPoint on online privacy risks. Use APA for sources. See https://www.gcumedia.com/digital-resources/guide.php for the guide.',
  attachments: [{ id: 'att1', resourceId: 'res-1', title: 'Privacy-Template.pptx' }],
  rubric: { id: 'r1', name: 'Rubric', at: '2026-10-01T00:00:00Z', criteria: [{ id: 'c1', name: 'Content', points: 40, description: 'Covers three risks.', levels: [] }, { id: 'c2', name: 'Design', points: 20, description: null, levels: [] }] },
});
const resources = [
  { title: 'Topic 5 Walk-Through', unit: 'Topic 5: Being a Responsible Digital Citizen', files: [{ id: 'res-2', name: 'UNV-106-RS-T5Walkthrough.docx', kind: 'FILE', type: 'course_class_unit_resource' }] },
  { title: 'Everything We Know About You', unit: 'Topic 5: Being a Responsible Digital Citizen', files: [{ id: 'res-3', name: 'https://lopes.idm.oclc.org/login?url=https://fod.infobase.com/x', kind: 'URL', type: 'course_class_unit_resource' }] },
];
const announcements = [{ id: 'a1', title: 'Topic 5 reminders', text: 'Slides are due Sunday. You may use AI tools to brainstorm, but the slides must be your own words.', author: 'Prof. Hannah Lindqvist', publishedAt: '2026-10-06T15:00:00Z' }];
const syllabus = 'Course policies apply.\n\nTopic 5: Being a Responsible Digital Citizen. The Online Privacy & Security PowerPoint asks for ten slides with speaker notes and APA citations.\n\nTopic 6: Purpose Plan. Write a plan.';

describe('the help kit (2026-10-08)', () => {
  const kit = buildKit({ item, course, tz: TZ, lines: [{ id: 'l1', text: 'Cover three privacy risks', tag: 'Halo', done: false, kind: 'ask' }], announcements, resources, syllabusText: syllabus });
  it('names the zip after the class and the short name', () => {
    expect(kit.zipName).toBe('UNV-106 UNV Privacy Slides - help kit.zip');
  });
  it('sorts Halo files from links: attachments and topic files are files; library readings and instruction links are links', () => {
    expect(kit.files.map((f) => [f.name, f.resourceId])).toEqual([
      ['Privacy-Template.pptx', 'res-1'],
      ['UNV-106-RS-T5Walkthrough.docx', 'res-2'],
    ]);
    expect(kit.links.map((f) => f.url)).toEqual(['https://www.gcumedia.com/digital-resources/guide.php', 'https://lopes.idm.oclc.org/login?url=https://fod.infobase.com/x']);
    expect(kit.links[1].why).toMatch(/behind the library/);
  });
  it('START-HERE carries the policy word for word at the top, the facts, the instructions, the what-to-do, the rubric, the syllabus part, the files and why', () => {
    const s = kit.startHere;
    expect(s.indexOf("rules on AI")).toBeLessThan(s.indexOf('For the tutor'));
    expect(s).toContain('"You may use AI tools to brainstorm, but the slides must be your own words."');
    expect(s).toContain('announcement "Topic 5 reminders"');
    expect(s).toContain('allows or asks for AI use');
    expect(s).toContain('Do NOT write the submission');
    expect(s).toContain('- Due: Mon, Oct 12 at 11:59 PM');
    expect(s).toContain('- Worth: 60 points');
    expect(s).toContain('Format rules named in the instructions: 10 slide, PowerPoint, APA');
    expect(s).toContain('- [ ] Cover three privacy risks (Halo)');
    expect(s).toContain('- Content (40 pts): Covers three risks.');
    expect(s).toContain('ten slides with speaker notes');
    expect(s).not.toContain('Topic 6: Purpose Plan');
    expect(s).toContain('- Privacy-Template.pptx: Attached to the assignment in Halo.');
    expect(kit.rubricMd).toContain('## Content (40 pts)');
    expect(kit.announcementsMd).toContain('## Topic 5 reminders');
  });
  it('with no policy anywhere it says so and stays help-only; own-data work tells the tutor to ask', () => {
    const plain = buildKit({ item: { ...item, notes: 'Keep a time log for one week and reflect on it.' }, course, tz: TZ, lines: [], announcements: [], resources: [], syllabusText: null });
    expect(plain.startHere).toContain('No AI policy found, check with your instructor');
    expect(plain.ownData).toBe(true);
    expect(plain.startHere).toContain('Never invent it');
    expect(findAiPolicy([{ title: 'x', text: 'Bring a pencil.' }])).toEqual([]);
    expect(needsOwnData('Summarize the article.')).toBe(false);
    expect(formatRules('Write 1,200 to 1,500 words in APA format.')).toEqual(['1,200 to 1,500 words', 'APA']);
    expect(syllabusSection(syllabus, item)).toContain('ten slides');
    expect(syllabusSection('Nothing relevant here at all.', item)).toBeNull();
  });
});
