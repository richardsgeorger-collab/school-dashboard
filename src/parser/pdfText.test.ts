import { describe, expect, it } from 'vitest';
import { linesFromTextItems, stripFooters } from './pdfText';

describe('linesFromTextItems', () => {
  it('groups items on the same baseline and orders them left to right', () => {
    const lines = linesFromTextItems([
      { str: 'Sep 8 - Dec 20', x: 400, y: 700.1, width: 80 },
      { str: 'CHM-113', x: 50, y: 700, width: 40 },
      { str: '3 Credits', x: 200, y: 699.9, width: 50 },
      { str: 'General Chemistry I-Lecture', x: 50, y: 720, width: 150 },
    ]);
    expect(lines).toEqual(['General Chemistry I-Lecture', 'CHM-113 3 Credits Sep 8 - Dec 20']);
  });

  it('joins touching runs without inserting a space', () => {
    const lines = linesFromTextItems([
      { str: 'Speci', x: 50, y: 100, width: 30 },
      { str: 'fic', x: 80.2, y: 100, width: 15 },
      { str: 'gravity', x: 100, y: 100, width: 40 },
    ]);
    expect(lines).toEqual(['Specific gravity']);
  });

  it('ignores empty items', () => {
    expect(linesFromTextItems([{ str: ' ', x: 0, y: 10, width: 1 }, { str: 'A', x: 0, y: 20, width: 5 }])).toEqual(['A']);
  });
});

describe('stripFooters', () => {
  it('removes GCU page footers', () => {
    expect(
      stripFooters([
        'Week 1 Participation',
        'Page 3 Grand Canyon University 2026 © Prepared on: Sep 9, 2026, 11:44 AM',
        'Start Date & Time Due Date & Time Points',
      ]),
    ).toEqual(['Week 1 Participation', 'Start Date & Time Due Date & Time Points']);
  });
});
