import { describe, expect, it } from 'vitest';
import { mkCourse, mkItem } from '../halo/fixtures';
import { starterAsk, starterPrompt, theLine } from './starter';

const eng = mkCourse({ id: 'eng', code: 'ENG-105', name: 'English Composition I' });
const plan = { asks: 'A 1,200-word rhetorical analysis of one artifact from the topic list: identify the audience, the purpose, and ethos, pathos, and logos.', startBy: null, minutes: null, milestones: ['Pick the artifact', 'Outline', 'Draft', 'Cite in APA'], prerequisites: [], flags: { lopesWrite: true, timed: false, group: false, inPerson: false }, topics: ['rhetorical appeals'], feeds: null, sources: [{ kind: 'slide' as const, label: 'Rhetorical Appeals deck, slides 4–11', href: '#/x' }], citations: [], model: 'm', at: '', inputHash: 'h' };
const brief = { asks: ['Analyze one artifact.'], rubric: [{ criterion: 'Thesis', points: 20, how: 'A clear arguable claim about the artifact.' }, { criterion: 'Appeals', points: 30, how: 'Ethos, pathos, and logos each identified with evidence.' }], steps: [], at: '', source: 'claude' as const };

describe('the starter prompt', () => {
  it('loads what it asks for, what earns points, the material, and the line, and never asks for the work', () => {
    const item = mkItem({ id: 'ra', courseId: 'eng', title: 'Final Draft of a Rhetorical Analysis', type: 'paper', points: 175, plan, brief });
    const p = starterPrompt({ item, course: eng, nextStep: 'Pick the artifact', flagged: ['Know the three appeals'] });
    expect(p).toContain('Help me get this paper started: "Final Draft of a Rhetorical Analysis" for ENG-105 English Composition I.');
    expect(p).toContain('What it asks for: A 1,200-word rhetorical analysis');
    expect(p).toContain('- Thesis (20 pts): A clear arguable claim about the artifact.');
    expect(p).toContain('My class material that covers it: Rhetorical Appeals deck, slides 4–11.');
    expect(p).toContain('My professor called this exam material: Know the three appeals.');
    expect(p).toContain('The step I am on: Pick the artifact.');
    expect(p).toContain('Do not write any of it for me.');
    expect(p).not.toMatch(/write (the|my) (essay|paper|post) for me/i);
  });
  it('says the right thing for each kind of work and falls back to the description when there is no plan', () => {
    expect(theLine('homework')).toContain('Do not solve anything for me');
    expect(theLine('exam')).toContain('Quiz me');
    expect(theLine('discussion')).toContain('Do not write any of it');
    const bare = mkItem({ id: 'hw', courseId: 'eng', title: 'HW 3', type: 'homework', brief: { ...brief, asks: ['Problems 1 to 12 from chapter 4.'], rubric: [] } });
    const p = starterPrompt({ item: bare, course: eng });
    expect(p).toContain('What it asks for: Problems 1 to 12 from chapter 4.');
    expect(p).not.toContain('What earns points');
    expect(p).not.toContain('My class material');
    expect(starterAsk(bare)).toBe('Help me work through this problem set: "HW 3". Where should I begin?');
  });
});
