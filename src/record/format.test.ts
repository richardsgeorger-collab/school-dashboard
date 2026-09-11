import { describe, expect, it } from 'vitest';
import { fmtBytes, fmtDuration, hoursOfAudio, snippets, wordCount } from './format';

describe('recording formatting', () => {
  it('formats sizes and durations', () => {
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(13 * 1024 * 1024)).toBe('13 MB');
    expect(fmtBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
    expect(fmtBytes(120 * 1024 ** 3)).toBe('120.0 GB');
    expect(fmtDuration(0)).toBe('0:00');
    expect(fmtDuration(75 * 60_000 + 3000)).toBe('1:15:03');
    expect(fmtDuration(9 * 60_000)).toBe('9:00');
  });
  it('knows how much lecture fits: 24 kbps is about 11 MB an hour', () => {
    expect(hoursOfAudio(11 * 1024 * 1024)).toBeCloseTo(1.07, 1);
    expect(Math.round(hoursOfAudio(120 * 1024 ** 3))).toBe(11930);
  });
  it('counts words and cuts snippets around hits', () => {
    expect(wordCount('  he moved the quiz  to Friday ')).toBe(6);
    expect(wordCount('')).toBe(0);
    const text = 'Today we cover stoichiometry. The quiz moves to Friday. Also read chapter four before the quiz.';
    const s = snippets(text, 'QUIZ', 12);
    expect(s.length).toBe(2);
    expect(s[0]).toMatch(/quiz moves to/);
    expect(s[0].startsWith('…')).toBe(true);
    expect(snippets(text, '')).toEqual([]);
  });
});

describe('imported audio helpers', () => {
  it('names the mime type from the file or its extension', async () => {
    const { audioMime, isAudioFile, memoTitle } = await import('./format');
    expect(audioMime('lecture.m4a')).toBe('audio/mp4');
    expect(audioMime('lecture.M4A', '')).toBe('audio/mp4');
    expect(audioMime('lecture.mp3')).toBe('audio/mpeg');
    expect(audioMime('lecture.wav', 'audio/x-wav')).toBe('audio/x-wav');
    expect(audioMime('lecture.bin')).toBe('audio/mpeg');
    expect(isAudioFile('x.m4a')).toBe(true);
    expect(isAudioFile('x.pdf')).toBe(false);
    expect(isAudioFile('x', 'audio/mp4')).toBe(true);
    expect(memoTitle('CHM-113', '2026-09-15')).toBe('CHM-113 — Sep 15');
  });
});
