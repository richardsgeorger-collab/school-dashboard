import { describe, expect, it } from 'vitest';
import { acceptedFile, downmix, pieces, progressLine, RATE, wav } from './audioFile';

describe('lecture files to text', () => {
  it('takes MP4, M4A, MP3 and WAV, by name or type', () => {
    for (const name of ['Lecture.mp4', 'memo.M4A', 'class.mp3', 'a.wav']) expect(acceptedFile({ name, type: '' })).toBe(true);
    expect(acceptedFile({ name: 'x', type: 'video/mp4' })).toBe(true);
    expect(acceptedFile({ name: 'notes.pdf', type: 'application/pdf' })).toBe(false);
    expect(acceptedFile({ name: 'clip.mov', type: 'video/quicktime' })).toBe(false);
  });
  it('averages stereo into mono', () => {
    expect([...downmix([new Float32Array([1, 0]), new Float32Array([0, 1])])]).toEqual([0.5, 0.5]);
  });
  it('writes a valid 16 kHz mono WAV', async () => {
    const b = wav(new Float32Array([0, 1, -1]));
    const v = new DataView(await b.arrayBuffer());
    expect(b.size).toBe(44 + 6);
    expect(v.getUint32(24, true)).toBe(RATE);
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getInt16(46, true)).toBe(0x7fff);
    expect(v.getInt16(48, true)).toBe(-0x8000);
  });
  it('cuts 75 minutes into 5-minute pieces, and a short tail joins the last one', () => {
    const p = pieces(new Float32Array(10 * 75 * 60), 10, 300);
    expect(p.length).toBe(15);
    expect(p.every((x) => x.length === 3000)).toBe(true);
    const q = pieces(new Float32Array(10 * (600 + 10)), 10, 300);
    expect(q.map((x) => x.length)).toEqual([3000, 3100]);
  });
  it('says how long is left', () => {
    expect(progressLine('transcribing', 170)).toBe('Transcribing, about 3 minutes left');
    expect(progressLine('transcribing', 50)).toBe('Transcribing, less than a minute left');
    expect(progressLine('transcribing', null)).toBe('Transcribing…');
    expect(progressLine('reading', null)).toBe('Pulling the audio out of the file…');
  });
});
