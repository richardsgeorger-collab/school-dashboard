import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem, TZ } from '../halo/fixtures';
import { buildKit, findAiPolicy, findPolicyLink, formatRules, kitLine, kitType, needsOwnData, rankResources, syllabusSection } from './kit';

const course = mkCourse({ id: 'unv', code: 'UNV-106', name: 'University Success', instructors: [{ name: 'Prof. Hannah Lindqvist', email: 'h@example.edu' }] });
const item = mkItem({
  id: 'p',
  courseId: 'unv',
  title: 'Online Privacy & Security (PowerPoint Assignment)',
  label: 'UNV Privacy Slides',
  type: 'paper',
  haloType: 'ASSIGNMENT',
  points: 60,
  dueAt: '2026-10-12T23:59:00-07:00',
  topic: 'Topic 5: Being a Responsible Digital Citizen',
  notes: 'Objective:\nCreate a 10 slide PowerPoint on online privacy risks. Use APA for sources. See https://www.gcumedia.com/digital-resources/guide.php for the guide.\nSubmission Requirements:\nSix to seven slides total\nSubmit as a PPTX file via Halo',
  attachments: [{ id: 'att1', resourceId: 'res-1', title: 'Privacy-Template.pptx' }],
  rubric: { id: 'r1', name: 'Rubric', at: '2026-10-01T00:00:00Z', criteria: [{ id: 'c1', name: 'Content', points: 40, description: 'Covers three risks.', levels: [] }, { id: 'c2', name: 'Design', points: 20, description: null, levels: [] }] },
});
const unit = 'Topic 5: Being a Responsible Digital Citizen';
const resources = [
  { title: 'Topic 5 Walk-Through', unit, description: '<p>Read the attached Topic 5 Walk-Through. This resource will assist you with the Topic 5 assignment.</p>', files: [{ id: 'res-2', name: 'UNV-106-RS-T5Walkthrough.docx', kind: 'FILE', type: 'course_class_unit_resource' }] },
  { title: 'Title IX Document', unit, description: '<p>Read and refer to this document for Topic 5 Discussion Question 1.</p>', files: [{ id: 'res-9', name: 'UNV-103-RS-Title IX Curriculum Module 2022.docx', kind: 'FILE', type: 'course_class_unit_resource' }] },
  { title: 'Title IX', unit, description: '<p>Read "Title IX," by Cohen, from Salem Press Encyclopedia (2023).</p>', files: [{ id: 'res-10', name: 'https://lopes.idm.oclc.org/login?url=https://search.ebscohost.com/t9', kind: 'URL', type: 'course_class_unit_resource' }] },
  { title: 'Everything We Know About You', unit, description: '<p>Read "Everything We Know About You," by Java Films (2021).</p>', files: [{ id: 'res-3', name: 'https://lopes.idm.oclc.org/login?url=https://fod.infobase.com/x', kind: 'URL', type: 'course_class_unit_resource' }] },
  { title: 'Digital Privacy in a World of High-Tech Surveillance', unit, description: '<p>Read "Digital Privacy…," by Shaw (2023).</p>', files: [{ id: 'res-4', name: 'https://lopes.idm.oclc.org/login?url=https://search.ebscohost.com/dp', kind: 'URL', type: 'course_class_unit_resource' }] },
  { title: 'University Success Guide: Finding Your Purpose', unit, description: '<p>Read Chapter 3.</p>', files: [{ id: 'res-5', name: 'https://www.gcumedia.com/digital-resources/usg.php', kind: 'URL', type: 'course_class_unit_resource' }] },
];
const siblings = [
  { title: 'UNV-106 Purpose Plan: Academic, Spiritual, and Career', label: 'UNV Purpose Plan' },
  { title: 'AI-Assisted Career Reflection', label: 'UNV Career Reflection' },
  { title: 'Topic 5 DQ 1', label: 'UNV DQ 5.1' },
];
const announcements = [
  { id: 'a1', title: 'Hello class, We are more than halfway through class!', text: 'This week you have 2 DQs to answer, participation points to earn, and a PowerPoint presentation to create. Attached is a step by step guide.', author: 'Prof. Hannah Lindqvist', publishedAt: '2026-10-01T19:44:24Z', resources: [{ id: 'forum-7', name: 'UNV-106-RS-T5Walkthrough (1).docx', kind: 'FILE', type: 'forum_resource' }] },
  { id: 'a2', title: 'Topic 5 reminders', text: 'Slides are due Sunday. You may use AI tools to brainstorm, but the slides must be your own words.', author: 'Prof. Hannah Lindqvist', publishedAt: '2026-10-06T15:00:00Z' },
];
const syllabus = [
  'Course policies apply.',
  'Topic 3 readings\n\nRead "AI in the Workplace," by Chen, from Harvard Business Review (2024).',
  'AI-Assisted Career Reflection\n\nUse an AI tool of your choice to draft three career questions, then reflect on its answers in 500 words. Submit as a Word document.',
  'Artificial Intelligence Policy\n\nStudents may use generative AI tools for brainstorming and outlining. Submitting AI-generated text as your own work is prohibited. See GCUStudentAIStatement.pdf in the course materials.',
  'Topic 5: Being a Responsible Digital Citizen\n\nOnline Privacy & Security (PowerPoint Assignment): ten slides with speaker notes and APA citations.\n\nBring the pie chart from the Excel Assignment.',
  'Topic 6: Purpose Plan. Write a plan.',
].join('\n\n');

describe('the help kit (2026-10-08, second pass 2026-10-09)', () => {
  const kit = buildKit({ item, course, tz: TZ, lines: [{ id: 'l1', text: 'Cover three privacy risks', tag: 'Halo', done: false, kind: 'ask' }, { id: 'l2', text: 'Completed Excel Assignment (A17) — pie chart is embedded in this PowerPoint', tag: 'syllabus', done: false, kind: 'pre' }, { id: 'l3', text: 'Read Topic 5 Walk-Through', tag: 'syllabus', done: false, kind: 'pre' }], announcements, resources, syllabusText: syllabus, siblings });
  it('names the zip after the class and the short name', () => {
    expect(kit.zipName).toBe('UNV-106 UNV Privacy Slides - help kit.zip');
  });
  it('ranks topic files: the attachment and the Walk-Through are files (the announcement copy in reserve); another course\'s Title IX file and the DQ\'s Title IX reading stay out', () => {
    expect(kit.files.map((f) => [f.name, f.resourceId, f.altIds])).toEqual([
      ['Privacy-Template.pptx', 'res-1', []],
      ['UNV-106-RS-T5Walkthrough.docx', 'res-2', ['forum-7']],
    ]);
    const names = kit.links.map((f) => f.name);
    expect(names).not.toContain('Title IX');
    expect(names).not.toContain('Title IX Document');
    expect(names[0]).toBe('Digital Privacy in a World of High-Tech Surveillance');
    expect(names).toContain('Everything We Know About You');
    expect(kit.links.find((f) => f.name === 'Everything We Know About You')?.why).toMatch(/behind the library/);
    expect(kit.links.map((f) => f.url)).toContain('https://www.gcumedia.com/digital-resources/guide.php');
    expect(rankResources(resources, item, course, siblings).map((r) => r.resource.title)).toEqual(expect.arrayContaining(['Everything We Know About You', 'University Success Guide: Finding Your Purpose']));
    expect(rankResources(resources, item, course, siblings).slice(0, 2).map((r) => r.resource.title)).toEqual(['Topic 5 Walk-Through', 'Digital Privacy in a World of High-Tech Surveillance']);
  });
  it('START-HERE: only real AI rules, word for word, plus the statement the syllabus names; never the reading list or another assignment', () => {
    const s = kit.startHere;
    expect(s.indexOf('rules on AI')).toBeLessThan(s.indexOf('For the tutor'));
    expect(s).toContain('"You may use AI tools to brainstorm, but the slides must be your own words."');
    expect(s).toContain('"Students may use generative AI tools for brainstorming and outlining."');
    expect(s).toContain('"Submitting AI-generated text as your own work is prohibited."');
    expect(s).not.toContain('AI in the Workplace');
    expect(s).not.toContain('Use an AI tool of your choice');
    expect(s).toContain("The school's AI statement: GCUStudentAIStatement.pdf");
    expect(s).toContain('Read these before helping');
  });
  it('START-HERE: the facts with the real type, the full instructions and format rules, tasks apart from things to bring in, the rubric, the syllabus part for this assignment only', () => {
    const s = kit.startHere;
    expect(s).toContain('- Type: Presentation (Halo lists it as an Assignment)');
    expect(s).toContain('- Due: Mon, Oct 12 at 11:59 PM');
    expect(s).toContain('- Worth: 60 points');
    expect(s).toContain('Format rules named in the instructions: 10 slide, PowerPoint, APA, Six to seven slides, PPTX');
    expect(s).toContain('Submit as a PPTX file via Halo');
    expect(s).toContain('- [ ] Cover three privacy risks (Halo)');
    expect(s).toContain('- [ ] Read Topic 5 Walk-Through (syllabus)');
    expect(s).toContain('## Bring in from earlier work');
    expect(s).toContain('- Bring in your completed Excel Assignment (A17) — pie chart is embedded in this PowerPoint (syllabus)');
    expect(s).not.toContain('- [ ] Completed Excel Assignment');
    expect(s).toContain('- Content (40 pts): Covers three risks.');
    expect(s).toContain('ten slides with speaker notes');
    expect(s).toContain('Bring the pie chart from the Excel Assignment');
    expect(s).not.toContain('Topic 6: Purpose Plan');
    expect(s).not.toContain('draft three career questions');
    expect(s).toContain('- UNV-106-RS-T5Walkthrough.docx: From the same topic in Halo');
    expect(s).toContain('Announcements that apply');
    expect(kit.announcementsMd).toContain('Attached: UNV-106-RS-T5Walkthrough (1).docx');
    expect(kit.rubricMd).toContain('## Content (40 pts)');
  });
  it('with no policy anywhere it says so and stays help-only; own-data work tells the tutor to ask', () => {
    const plain = buildKit({ item: { ...item, notes: 'Keep a time log for one week and reflect on it.' }, course, tz: TZ, lines: [], announcements: [], resources: [], syllabusText: null });
    expect(plain.startHere).toContain('No AI policy found, check with your instructor');
    expect(plain.ownData).toBe(true);
    expect(plain.startHere).toContain('Never invent it');
    expect(findAiPolicy([{ title: 'x', text: 'Bring a pencil.', kind: 'assignment' }])).toEqual([]);
    expect(findAiPolicy([{ title: 'x', text: 'Read "AI in Business" by Lee. The AI-Assisted Career Reflection is due Friday.', kind: 'announcement' }])).toEqual([]);
    expect(findAiPolicy([{ title: 'syl', text: 'Topic 2\n\nStudents may use AI to check grammar.', kind: 'syllabus' }])).toEqual([]);
    expect(findAiPolicy([{ title: 'syl', text: 'Generative AI Use\n\nStudents may use AI to check grammar.', kind: 'syllabus' }])).toEqual([{ quote: 'Students may use AI to check grammar.', source: 'syl' }]);
    expect(findPolicyLink(['See https://www.gcu.edu/sites/default/files/GCUStudentAIStatement.pdf for the rules.'])).toBe('https://www.gcu.edu/sites/default/files/GCUStudentAIStatement.pdf');
    expect(findPolicyLink(['Nothing here.'])).toBeNull();
    expect(needsOwnData('Summarize the article.')).toBe(false);
    expect(formatRules('Write 1,200 to 1,500 words in APA format.')).toEqual(['1,200 to 1,500 words', 'APA']);
  });
  it('the syllabus part needs a confident match, and stops before another assignment', () => {
    expect(syllabusSection(syllabus, item, siblings)).toContain('ten slides');
    expect(syllabusSection(syllabus, item, siblings)).not.toContain('Purpose Plan');
    expect(syllabusSection('Topic 5 has a PowerPoint about something.\n\nThe Online Time Tracking (Excel Assignment) asks for a chart.', item, siblings)).toBeNull();
    expect(syllabusSection('Nothing relevant here at all.', item, siblings)).toBeNull();
    expect(syllabusSection(syllabus, { title: 'AI-Assisted Career Reflection', label: 'UNV Career Reflection', topic: 'Topic 3' }, siblings)).toContain('draft three career questions');
  });
  it('the type and the bring-in wording', () => {
    expect(kitType({ title: 'Final Video Reflection', notes: '', type: 'project', haloType: 'ASSIGNMENT' })).toBe('Video (Halo lists it as an Assignment)');
    expect(kitType({ title: 'Topic 6 Quiz', notes: '', type: 'quiz', haloType: 'QUIZ' })).toBe('Quiz');
    expect(kitType({ title: 'Essay 2', notes: 'Write 800 words.', type: 'paper', haloType: null })).toBe('Paper');
    expect(kitLine({ id: 'x', text: 'Career goals from AI-Assisted Career Reflection (A13)', tag: 'syllabus', done: false, kind: 'pre' })).toBe('Bring in your career goals from AI-Assisted Career Reflection (A13)');
    expect(kitLine({ id: 'x', text: 'Read the Walk-Through', tag: 'syllabus', done: false, kind: 'pre' })).toBe('Read the Walk-Through');
  });
});
