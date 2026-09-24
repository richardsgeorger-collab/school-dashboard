import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Schedule } from '../../domain/schedule';
import type { Item, Requirement } from '../../domain/types';
import { mkCourse, mkData, mkItem } from '../../halo/fixtures';
import { promptFor, type Raw } from './gather';
import { promptKind } from './kind';

/**
 * The four prompts the user asked to see, built from the real shape of their classes. The CHM-113 announcement is the
 * one they described; the UNV-106 and ENG-105 descriptions are their own. Every bug they listed is an assertion.
 */

const TODAY = '2026-09-24';
const at = '2026-09-20T12:00:00.000Z';
const phx = (d: string, t: string) => new Date(`${d}T${t}:00-07:00`).toISOString();
const flags = { inClass: false, group: false, lopesWrite: false, timed: false, practice: false };

const chm = mkCourse({ id: 'chm', code: 'CHM-113', name: 'General Chemistry I-Lecture' });
const esg = mkCourse({ id: 'esg', code: 'ESG-162', name: 'Engineering Mathematics I' });
const eng = mkCourse({ id: 'eng', code: 'ENG-105', name: 'English Composition I' });
const unv = mkCourse({ id: 'unv', code: 'UNV-106', name: 'University On-Campus Success' });

const rule = (id: string, text: string, post: string): Requirement => ({ id, text, dueAt: null, done: false, doneAt: null, gradedOn: true, addedAt: at, scope: 'rule', source: { kind: 'announcement', id: `a-${id}`, title: post, quote: text.toLowerCase(), at } });
const part = (id: string, text: string, post: string, quote: string, done = false): Requirement => ({ id, text, dueAt: null, done, doneAt: null, gradedOn: true, addedAt: at, scope: 'instance', source: { kind: 'announcement', id: `a-${id}`, title: post, quote, at } });

const quiz: Item = {
  ...mkItem({ id: 'chm-q1', courseId: 'chm', title: 'Quiz #1', type: 'homework', points: 50, dueAt: phx('2026-09-25', '08:00') }),
  topic: 'Topic 2: Electronic Structure of Atoms and Periodicity of Elements',
  notes: 'Complete and submit the quiz as directed by the instructor.',
  flags: { ...flags, inClass: true },
};
const chmGraded: Item = { ...mkItem({ id: 'chm-prereq', courseId: 'chm', title: 'CHM113 Prerequisite Concept Assignment', points: 20, dueAt: phx('2026-09-13', '23:59') }), score: 19.66, status: 'done' };

const hw: Item = {
  ...mkItem({ id: 'esg-hw2', courseId: 'esg', title: 'Topic 2 Homework', type: 'homework', points: 35, dueAt: phx('2026-09-27', '23:59') }),
  topic: 'Topic 2: Derivatives and Rates of Change',
  notes: 'Complete the Topic 2 homework problems in zyBooks, sections 2.1 through 2.7. Show your work for problems 2.4.3, 2.5.7 and 2.6.2 and upload a single PDF.',
  requirements: [rule('esg-r1', 'Submit one PDF only, no handwriting', 'Formatting rules'), rule('esg-r2', 'Late work receives zero points', 'Course policies')],
  steps: [{ id: 's1', label: 'Read zyBooks 2.1 to 2.3', done: true }, { id: 's2', label: 'Problems 2.4 to 2.7', done: false }] as never,
};

const draft: Item = {
  ...mkItem({ id: 'eng-draft', courseId: 'eng', title: 'Rhetorical Analysis First Draft', type: 'paper', points: 100, dueAt: phx('2026-10-04', '23:59') }),
  notes:
    'Write a 750-1,000-word rhetorical analysis of the article you selected in Topic 2. Identify the author’s purpose and audience. Explain how the author uses ethos, pathos and logos, with at least one example of each. Evaluate whether the appeals are effective for the intended audience. Include a thesis statement that names the appeals you will analyze. Use at least two scholarly sources in addition to the article. Prepare this assignment according to the guidelines found in the APA Style Guide. This assignment requires submission to LopesWrite.',
  flags: { ...flags, lopesWrite: true },
  rubric: {
    id: 'r',
    name: 'Rhetorical Analysis',
    criteria: [
      { id: 'c1', name: 'Thesis', description: 'Names the appeals and makes an arguable claim about their effect.', points: 20, levels: [] },
      { id: 'c2', name: 'Analysis of appeals', description: 'Each appeal is illustrated and its effect explained.', points: 40, levels: [] },
      { id: 'c3', name: 'Evidence and sources', description: 'Two scholarly sources integrated and cited.', points: 20, levels: [] },
      { id: 'c4', name: 'APA format and mechanics', description: 'Title page, in-text citations, references.', points: 20, levels: [] },
    ],
  } as never,
  requirements: [part('eng-p1', 'Bring a printed copy of your draft to Thursday’s peer review', 'Peer review this week', 'bring a printed copy of your draft to peer review on Thursday')],
};

const dq: Item = {
  ...mkItem({ id: 'unv-dq32', courseId: 'unv', title: 'Topic 3 DQ 2', type: 'discussion', points: 5, dueAt: phx('2026-09-25', '23:59') }),
  notes:
    "In today's rapidly evolving technological landscape, AI tools like ChatGPT, Grammarly, and AI-based research assistants have become increasingly prevalent in the academic and professional worlds. How can leveraging these AI resources help you in creating and achieving your academic, spiritual, and career goals?",
  requirements: [rule('unv-r1', 'Every DQ post must be at least 75 words', 'DQ expectations'), rule('unv-r2', 'Reply to 2 classmates on 2 different days', 'DQ expectations'), part('unv-p1', 'Cite the course reading in APA', 'Replies count', 'cite the reading from the topic resources in apa')],
};
const dqOther: Item = { ...mkItem({ id: 'unv-dq31', courseId: 'unv', title: 'Topic 3 DQ 1', type: 'discussion', points: 5, dueAt: phx('2026-09-23', '23:59') }), requirements: [rule('unv-r3', 'Every DQ post must be at least 75 words', 'DQ expectations')] };
// ENG-105's own discussion rules, on ENG-105's own discussion.
const engDq: Item = { ...mkItem({ id: 'eng-dq21', courseId: 'eng', title: 'Topic 2 DQ 1', type: 'discussion', points: 5, dueAt: phx('2026-09-24', '23:59') }), requirements: [rule('eng-r2', 'Every DQ post must be 150-200 words', 'Discussion expectations'), rule('eng-r3', 'Post 2 peer replies on 3 separate days', 'Discussion expectations')] };

const career: Item = {
  ...mkItem({ id: 'unv-ai', courseId: 'unv', title: 'AI-Assisted Career Reflection', type: 'paper', points: 100, dueAt: phx('2026-09-28', '23:59') }),
  notes:
    'Step 1: Use AI to Generate an Outline. Open a GenAI tool (e.g., ChatGPT, Grammarly) and enter the following prompt: "Create an outline for a one-page reflection on my academic and spiritual goals during college and career goals after graduation." Step 2: Refine the AI-generated outline by providing details about yourself. Using a prompt like the following: "Expand on the outline provided and my personal details to write a one-page reflection on my educational goals during college and career goals after graduation." Step 3: Use the following prompt to add a section: "Add a section to my reflection on how attending college events like my college kick-off meeting can influence my future decisions and support my future goals." Step 5: Below the AI-generated content, create a section titled "My Reflection." Paragraph 1: Write 150 words entirely in your own words. Paragraph 2: Write 50 words entirely in your own words. Citations: At least one APA citation and reference.',
  flags: { ...flags, lopesWrite: true },
};

const data = mkData([chm, esg, eng, unv], [quiz, chmGraded, hw, draft, dq, dqOther, career, engDq]);
// Tonight and tomorrow morning's free time, as the planner sees it.
const schedule = { byItem: {}, capacityByDay: { '2026-09-24': 240, '2026-09-25': 180 }, loadByDay: { '2026-09-24': 90, '2026-09-25': 60 } } as unknown as Schedule;

const raw = (over: Partial<Raw> = {}): Raw => ({ posts: [], lectures: [], pages: [], syllabus: null, ...over });

const chmRaw = raw({
  posts: [
    {
      id: 'ann-q1',
      courseId: 'chm',
      title: 'Quiz #1 this Friday',
      text: 'Quiz #1 is this Friday at the start of class. It is 20 questions and you will have 30 minutes. It covers Chapters 1 and 2. A periodic table will be provided. Bring a calculator; phones are not allowed.',
      publishedAt: phx('2026-09-21', '09:00'),
    },
    { id: 'ann-other', courseId: 'chm', title: 'Office hours', text: 'Office hours move to room 214 this week.', publishedAt: phx('2026-09-22', '09:00') },
  ],
  lectures: [
    {
      courseId: 'chm',
      title: 'Lecture: Measurement and significant figures',
      startedAt: phx('2026-09-14', '10:00'),
      segments: [
        { at: 0, text: 'Okay, let us get started.' },
        { at: 400_000, text: 'Chapter 1 is really about measurement.' },
        { at: 460_000, text: 'Significant figures: when you multiply, keep the fewest significant figures of any measurement.' },
        { at: 520_000, text: 'When you add, it is the fewest decimal places, not significant figures. People mix these up on the quiz every year.' },
        { at: 580_000, text: 'Dimensional analysis is how we convert units, always carry the units through.' },
      ],
    },
    {
      courseId: 'chm',
      title: 'Lecture: Electron configuration',
      startedAt: phx('2026-09-21', '10:00'),
      segments: [
        { at: 900_000, text: 'Chapter 2, electrons fill orbitals in order of increasing energy, the aufbau principle.' },
        { at: 960_000, text: 'Hund’s rule: electrons spread out across degenerate orbitals before pairing.' },
        { at: 1_020_000, text: 'Know how to write the configuration for anything up through krypton, that will be on the quiz.' },
      ],
    },
  ],
  pages: [{ deckTitle: 'Chapter 2: Electronic Structure', deckTag: 'Topic 2', courseId: 'chm', n: 7, text: 'Electron configuration: 1s² 2s² 2p⁶ 3s² 3p⁶ 4s² 3d¹⁰ 4p⁶. Aufbau principle, Pauli exclusion principle, Hund’s rule. Valence electrons determine periodicity.' }],
});

const engRaw = raw({
  posts: [{ id: 'ann-e1', courseId: 'eng', title: 'Rhetorical Analysis draft: what I am looking for', text: 'Your Rhetorical Analysis First Draft should have a clear thesis in the last sentence of your introduction. It must be at least 500 words, not counting the reference page. Include at least one in-text citation. Submit as a .docx file.', publishedAt: phx('2026-09-22', '08:00') }],
  syllabus: 'Course information\n\nTopic 3: Rhetorical Analysis\n\nRhetorical Analysis First Draft: students draft a 750-1,000-word analysis applying ethos, pathos and logos to a selected article. Feedback is given through peer review.',
});

const build = (item: Item, r: Raw, course = chm) => promptFor({ item, course, data, schedule, raw: r, today: TODAY });

describe('the four prompts', () => {
  const quizPrompt = build(quiz, chmRaw);
  const hwPrompt = build(hw, raw(), esg);
  const draftPrompt = build(draft, engRaw, eng);
  const dqPrompt = build(dq, raw(), unv);
  const careerPrompt = build(career, raw(), unv);
  writeFileSync('/tmp/prompt-examples.md', [`# CHM-113 Quiz #1\n\n${quizPrompt}`, `# ESG-162 Topic 2 Homework\n\n${hwPrompt}`, `# ENG-105 Rhetorical Analysis First Draft\n\n${draftPrompt}`, `# UNV-106 Topic 3 DQ 2\n\n${dqPrompt}`, `# UNV-106 AI-Assisted Career Reflection\n\n${careerPrompt}`].join('\n\n---\n\n'));

  it('classifies each by what the work is', () => {
    expect(promptKind(quiz, chm)).toBe('study');
    expect(promptKind(hw, esg)).toBe('major');
    expect(promptKind(draft, eng)).toBe('gened');
    expect(promptKind(dq, unv)).toBe('gened-dq');
    // Mentions AI tools but does not tell the student to use one.
    expect(promptKind(dq, unv)).not.toBe('ai-required');
    expect(promptKind(career, unv)).toBe('ai-required');
  });

  it('pastes the announcement in, with the format the professor gave', () => {
    expect(quizPrompt).toContain('20 questions');
    expect(quizPrompt).toContain('30 minutes');
    expect(quizPrompt).toContain('It covers Chapters 1 and 2.');
    expect(quizPrompt).toContain('A periodic table will be provided.');
    expect(quizPrompt).toContain('Bring a calculator');
    // The office-hours post is not about the quiz.
    expect(quizPrompt).not.toContain('room 214');
  });

  it('puts the announcement above the calendar and says when they disagree', () => {
    expect(quizPrompt).toContain('From the announcement: "It covers Chapters 1 and 2."');
    expect(quizPrompt).toContain("The announcement and the calendar don't say the same thing. Go by the announcement");
  });

  it('gives the grade with its sample size', () => {
    expect(quizPrompt).toContain('1 item graded so far in this class, 98%.');
    expect(quizPrompt).not.toMatch(/I am at \d/);
  });

  it('pastes lecture and slide text in, with dates, and never asks the student to read it out', () => {
    expect(quizPrompt).toContain('fewest decimal places');
    expect(quizPrompt).toContain('Lecture: Measurement and significant figures, at 6:40, Sep 14');
    expect(quizPrompt).toContain('Hund’s rule');
    expect(quizPrompt).toContain('Chapter 2: Electronic Structure, slide 7');
    for (const p of [quizPrompt, hwPrompt, draftPrompt, dqPrompt]) {
      expect(p).not.toMatch(/you cannot|ask me to read|read something out/i);
    }
  });

  it('only includes rules that apply to the work', () => {
    // An in-person quiz: no LopesWrite, no AI detection, no file format, no discussion rules.
    expect(quizPrompt).not.toMatch(/LopesWrite|AI[- ]detect|AI-written|PDF|150-200 words/i);
    // A paper: no peer-reply or DQ word-count rules.
    expect(draftPrompt).not.toMatch(/peer repl|DQ post/i);
    // Homework: the PDF rule applies, the DQ rule does not.
    expect(hwPrompt).toContain('Submit one PDF only, no handwriting');
    expect(hwPrompt).toContain('Late work receives zero points');
    // The DQ gets its own class's word count and reply rules.
    expect(dqPrompt).toContain('Every DQ post must be at least 75 words');
    expect(dqPrompt).toContain('Reply to 2 classmates on 2 different days');
  });

  it('drops the lecturing', () => {
    for (const p of [quizPrompt, hwPrompt, draftPrompt, dqPrompt, careerPrompt]) {
      expect(p).not.toMatch(/must not|worse than useless|leave the work to me|set the work up|Do not hand me/i);
    }
  });

  it('asks each kind for what fits it', () => {
    expect(quizPrompt).toContain('practice worksheet I can print or paste into Google Docs');
    expect(quizPrompt).toContain('about 20 questions');
    expect(quizPrompt).toContain('headed "Answers"');
    expect(quizPrompt).toContain('quiz me one question at a time');
    expect(hwPrompt).toContain('Not the assigned problems themselves.');
    expect(hwPrompt).toContain('check the method line by line');
    expect(draftPrompt).toContain('APA 7');
    expect(draftPrompt).toContain('word-count target for each section that meets the length in the announcement');
    expect(draftPrompt).toContain('APA 7 reference');
    expect(draftPrompt).toContain('[ ] Thesis (20 pts)');
    expect(dqPrompt).toContain('bullet outline');
    expect(careerPrompt).toContain('Create an outline for a one-page reflection');
    expect(careerPrompt).toContain('APA 7 reference and in-text citation for this conversation');
  });

  it('includes what is already done and the announcement requirements, quoted', () => {
    expect(hwPrompt).toContain('- Read zyBooks 2.1 to 2.3');
    expect(draftPrompt).toContain('"bring a printed copy of your draft to peer review on Thursday" (Peer review this week');
    expect(quizPrompt).toContain('## Already done\nNothing yet.');
  });

  it('reads a word count with a thousands separator, and states LopesWrite as a fact rather than a warning', () => {
    expect(draftPrompt).toContain('750–1,000 words.');
    // "000 words" with nothing before it is the old parser splitting "1,000" at the comma.
    expect(draftPrompt).not.toMatch(/(^|[^\d,])000 words/m);
    expect(draftPrompt).toContain('submitted through LopesWrite');
    expect(draftPrompt).not.toMatch(/AI-written|checks for|detect/i);
    // The AI assignment's own-words paragraphs have their own counts; no single word-count rule misstates them.
    expect(careerPrompt).not.toMatch(/^- 150 words$/m);
  });

  it('leaves no empty sections and no one-item part lists', () => {
    for (const p of [quizPrompt, hwPrompt, draftPrompt, dqPrompt, careerPrompt]) expect(p).not.toMatch(/\n\n\n/);
    // The DQ is one question; repeating it as a list of one adds nothing.
    expect(dqPrompt).not.toContain('Every part it asks for');
    expect(dqPrompt).toContain('check it against that list.');
  });

  it('lets the professor’s announcement override the description on length and citations, and says they differ', () => {
    expect(draftPrompt).toContain('Length, from the announcement (Rhetorical Analysis draft: what I am looking for, Sep 22): "It must be at least 500 words, not counting the reference page."');
    expect(draftPrompt).toContain('Citations, from the announcement (Rhetorical Analysis draft: what I am looking for, Sep 22): "Include at least one in-text citation."');
    expect(draftPrompt).toContain('The assignment description says 750–1,000 words. The announcement is more recent, so go by it.');
    expect(draftPrompt).toContain('The assignment description says two sources cited. Go by the announcement.');
    // Neither guessed figure is stated as a rule on its own any more.
    expect(draftPrompt).not.toMatch(/^- 750–1,000 words$/m);
    expect(draftPrompt).not.toMatch(/^- two sources cited$/m);
  });

  it('works out study time from the schedule, and nothing on the morning of an 8 AM quiz', () => {
    // Tonight: 240 capacity minus 90 planned. Friday morning at 8 AM leaves nothing.
    expect(quizPrompt).toContain('I have about 2.5h to study before it.');
  });
});


describe('class rules stay in their own class', () => {
  const engDqPrompt = build(engDq, raw(), eng);
  const unvDqPrompt = build(dq, raw(), unv);
  const draftPrompt = build(draft, engRaw, eng);
  const hwPrompt = build(hw, raw(), esg);

  it('never puts one class’s rule in another class’s prompt', () => {
    // ENG-105's discussion rules are ENG-105's.
    expect(engDqPrompt).toContain('Every DQ post must be 150-200 words');
    expect(engDqPrompt).toContain('Post 2 peer replies on 3 separate days');
    expect(unvDqPrompt).not.toContain('150-200 words');
    expect(unvDqPrompt).not.toContain('3 separate days');
    // UNV-106's are UNV-106's.
    expect(unvDqPrompt).toContain('at least 75 words');
    expect(engDqPrompt).not.toContain('at least 75 words');
    expect(engDqPrompt).not.toContain('2 different days');
    // ESG-162's late policy is ESG-162's.
    expect(hwPrompt).toContain('Late work receives zero points');
    expect(draftPrompt).not.toContain('Late work receives zero points');
    expect(engDqPrompt).not.toContain('Late work receives zero points');
    expect(unvDqPrompt).not.toContain('Late work receives zero points');
  });

  it('holds when two classes post the same rule in near-identical words', () => {
    // Text similarity is never a reason to share: identical wording in two classes stays two separate rules.
    const same = 'Late work receives zero points';
    const unvLate: Item = { ...dqOther, id: 'unv-late', requirements: [rule('unv-late', same, 'UNV policies')] };
    const d = mkData([chm, esg, eng, unv], [quiz, chmGraded, hw, draft, dq, unvLate, career, engDq]);
    const p = promptFor({ item: draft, course: eng, data: d, schedule, raw: engRaw, today: TODAY });
    expect(p).not.toContain(same);
  });

  it('a length posted for another assignment in the same class does not override this one', () => {
    const dqPost = { id: 'ann-dq', courseId: 'eng', title: 'Discussion reminders', text: 'Rhetorical analysis is the focus this week. Every DQ post must be 150-200 words and cite one source.', publishedAt: phx('2026-09-23', '08:00') };
    const p = build(draft, { ...engRaw, posts: [...engRaw.posts, dqPost] }, eng);
    expect(p).toContain('"It must be at least 500 words, not counting the reference page."');
    expect(p).not.toMatch(/Length, from the announcement \(Discussion reminders/);
  });

  it('an announcement in one class can never attach a rule to another class’s work', async () => {
    const { actionsFromTool } = await import('../../halo/actions');
    const post = { id: 'a', courseId: 'eng', forumId: 'f', title: 'ENG post', text: 't', publishedAt: at } as never;
    const out = actionsFromTool({ actions: [{ kind: 'requirement', applies_to: 'unv-dq32', what: 'Every DQ post must be 150-200 words', due: '', time: '', points: 0, graded: true, changes_what_done_means: false, quote: 'every dq post must be 150-200 words', confidence: 'high' }] }, post, data.items, 'America/Phoenix');
    // The id belongs to UNV-106, so it is not accepted; the finding falls back to belonging to the ENG-105 class.
    expect(out.actions[0].itemId).toBeNull();
  });
});
