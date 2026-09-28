import { describe, expect, it } from 'vitest';
import { clampDetail, cleanLine, detailFor, LINE_WORDS, shortLine, tooLong } from './shortLine';

// George's real stored requirements (2026-09-28), as the reader wrote them before it was asked for a short line.
const REAL = [
  "Use the attached Connections_Presentation_Guide and APA_Guide/APA_Template to create your Chemistry Connections Presentation.",
  "Go to the Discussion Forum thread titled 'Chemistry Connections Topic' and post a reply using your chosen Chemistry Connections Topic as the title.",
  "Download and use 'ESG 162L - Lab Instructions - Day 3.docx' and 'ESG 162L - Lab Instructions - Day 3.pdf' as reference for this week's lab.",
  "Upload lab notebook images for Week 2 as a single PDF (pages in correct order; use an app like CamScanner) by the due date shown in Halo.",
  'Respond to at least two peers per day for three days this week (minimum six total responses across DQ1, DQ2, or both). Each response must be substantive.',
  'Note: All Activity assignments (including Topic 2 Activity and beyond) have an extension through Friday of Week 15 (2026-12-20), allowing rework to improve scores.',
];

describe('the line a requirement shows by default', () => {
  it('for a line stored before the reader wrote short ones: files, quotes, brackets and second sentences go, and it stops at a clause, never far past ten words', () => {
    const got = REAL.map(shortLine);
    for (const s of got) {
      expect(s.split(/\s+/).length).toBeLessThanOrEqual(LINE_WORDS + 2);
      expect(s).not.toMatch(/\.docx|\.pdf|_Guide|[()"]|…/);
    }
    expect(got[0]).toBe('Use the files to create your Chemistry Connections Presentation');
    expect(got[2]).toBe("Download and use the files as reference for this week's lab");
    expect(got[3]).toBe('Upload lab notebook images for Week 2 as a single PDF');
    // What goes back to the reader for a proper rewrite: cleaned, never cut.
    expect(tooLong(cleanLine(REAL[1]))).toBe(true);
    expect(cleanLine(REAL[4])).toBe('Respond to at least two peers per day for three days this week');
  });
  it('leaves a line that is already short alone', () => {
    expect(shortLine('Bring a calculator to the quiz')).toBe('Bring a calculator to the quiz');
    expect(shortLine('Reply to 2 classmates on 2 different days.')).toBe('Reply to 2 classmates on 2 different days');
  });
});

describe('the explanation on tap', () => {
  it('is two or three sentences, and says the own date when there is one', () => {
    expect(clampDetail('One. Two. Three. Four.')).toBe('One. Two. Three.');
    const d = detailFor({ text: REAL[3], dueAt: '2026-09-26T06:59:00.000Z' }, 'America/Phoenix');
    expect(d).toContain('Upload lab notebook images for Week 2 as a single PDF (pages in correct order');
    expect(d).toContain('Due Fri, Sep 25');
    expect(detailFor({ text: 'Bring a calculator', detail: 'Quiz 1 is Friday in class. Any scientific calculator works, not a graphing one.', dueAt: null }, 'America/Phoenix')).toBe('Quiz 1 is Friday in class. Any scientific calculator works, not a graphing one.');
  });
});
