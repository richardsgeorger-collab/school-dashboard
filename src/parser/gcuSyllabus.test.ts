import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGcuSyllabus } from './gcuSyllabus';

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.txt`, import.meta.url), 'utf8').split('\n');

const byTitle = (p: ReturnType<typeof parseGcuSyllabus>, title: string) => {
  const a = p.assessments.find((x) => x.title === title);
  if (!a) throw new Error(`missing assessment ${title}`);
  return a;
};

describe('parseGcuSyllabus', () => {
  it('parses CHM-113 course header, instructors, topics and every assessment', () => {
    const p = parseGcuSyllabus(fixture('chm113'));
    expect(p.code).toBe('CHM-113');
    expect(p.name).toBe('General Chemistry I-Lecture');
    expect(p.credits).toBe(3);
    expect(p.termStart).toBe('2026-09-08');
    expect(p.termEnd).toBe('2026-12-20');
    expect(p.instructors).toEqual([
      { name: 'Ryan Yamaguchi', email: 'Ryan.Yamaguchi@my.gcu.edu' },
      { name: 'Sri Subramanium', email: 'Sri.Subramanium@gcu.edu' },
    ]);
    expect(p.topics).toHaveLength(7);
    expect(p.topics[1]).toEqual({
      n: 2,
      title: 'Electronic Structure of Atoms and Periodicity of Elements',
      start: '2026-09-21',
      end: '2026-10-04',
      maxPoints: 95,
    });
    expect(p.assessments).toHaveLength(47);

    const quiz = byTitle(p, 'Quiz #1');
    expect(quiz.opensAt).toBe('2026-09-25T00:00:00-07:00');
    expect(quiz.dueAt).toBe('2026-09-25T08:00:00-07:00');
    expect(quiz.points).toBe(50);
    expect(quiz.traits).toEqual(['Not Submitted in Halo']);
    expect(quiz.topic).toBe('Topic 2: Electronic Structure of Atoms and Periodicity of Elements');
    expect(quiz.description).toBe('Complete and submit the quiz as directed by the instructor.');

    const w1 = byTitle(p, 'Week 1 Participation');
    expect(w1.points).toBe(10);
    expect(w1.dueAt).toBe('2026-09-13T23:59:00-07:00');
    expect(w1.description).toBe('');
    expect(w1.traits).toEqual([]);

    expect(byTitle(p, 'Exam 2').points).toBe(200);
    expect(byTitle(p, 'Practice Quiz 1').description).toMatch(/^Complete and submit the practice quiz in ALEKS\./);
    expect(p.warnings).toEqual([]);
  });

  it('checks topic max points against summed assessment points', () => {
    for (const name of ['chm113', 'chm113l', 'eng105', 'esg162', 'esg162l', 'unv106']) {
      const p = parseGcuSyllabus(fixture(name));
      expect(p.warnings, name).toEqual([]);
    }
  });

  it('parses ENG-105 time limits, in-class due times and page-split rows', () => {
    const p = parseGcuSyllabus(fixture('eng105'));
    expect(p.code).toBe('ENG-105');
    expect(p.credits).toBe(4);
    expect(p.instructors).toHaveLength(3);
    expect(p.assessments).toHaveLength(21);
    const apa = byTitle(p, 'APA Quiz 1');
    expect(apa.timeLimit).toBe('1 hr');
    expect(apa.traits).toEqual(['Timed']);
    expect(apa.points).toBe(20);
    const final = byTitle(p, 'Final Draft of a Rhetorical Analysis (On-Ground)');
    expect(final.dueAt).toBe('2026-10-09T12:45:00-07:00');
    expect(final.points).toBe(210);
    expect(final.traits).toEqual(['Not Submitted in Halo']);
    const draft = byTitle(p, 'First Draft of a Rhetorical Analysis (On-Ground)');
    expect(draft.description).not.toMatch(/Attachments/);
    expect(draft.description).not.toMatch(/\.docx/);
  });

  it('parses ESG-162L group traits', () => {
    const p = parseGcuSyllabus(fixture('esg162l'));
    expect(p.code).toBe('ESG-162L');
    expect(p.assessments).toHaveLength(28);
    expect(byTitle(p, 'CLC - Mathematical Analysis Lab 1').traits).toEqual(['Group']);
    expect(byTitle(p, 'CLC – Engineering Design Report and Demo 2').points).toBe(150);
  });

  it('parses ESG-162 and CHM-113L', () => {
    const esg = parseGcuSyllabus(fixture('esg162'));
    expect(esg.assessments).toHaveLength(41);
    expect(byTitle(esg, 'Software Installation').traits).toEqual(['Not Submitted in Halo']);
    expect(byTitle(esg, 'Software Installation').points).toBe(0);
    const lab = parseGcuSyllabus(fixture('chm113l'));
    expect(lab.assessments).toHaveLength(29);
    expect(byTitle(lab, 'Benchmark - Lab Practical Exam').traits).toEqual(['Not Submitted in Halo', 'Benchmark']);
    expect(byTitle(lab, 'Formal Lab Report').traits).toEqual(['Requires LopesWrite']);
  });

  it('parses the short UNV-106 term', () => {
    const p = parseGcuSyllabus(fixture('unv106'));
    expect(p.termEnd).toBe('2026-10-25');
    expect(p.assessments).toHaveLength(32);
    expect(byTitle(p, 'Topic 1 DQ 1').points).toBe(5);
    expect(byTitle(p, 'Topic 1 Quiz').timeLimit).toBe('1 hr');
    expect(byTitle(p, 'UNV-106 Purpose Plan: Academic, Spiritual, and Career').points).toBe(140);
  });

  it('rejects non-GCU text', () => {
    expect(() => parseGcuSyllabus(['Hello', 'World'])).toThrow(/course header not found/);
  });
});
