import { describe, expect, it } from 'vitest';
import { evaluateSupport } from './support';

const chrome = { userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0 Safari/537.36', brands: ['Chromium', 'Google Chrome'], hasMediaRecorder: true, opus: true, hasSpeech: true, hasIdb: true };

describe('support detection', () => {
  it('is happy on Chrome with everything present', () => {
    const s = evaluateSupport(chrome);
    expect(s.ok).toBe(true);
    expect(s.chrome).toBe(true);
    expect(s.reason).toBeNull();
  });
  it('names the missing piece in plain words', () => {
    expect(evaluateSupport({ ...chrome, hasSpeech: false }).reason).toMatch(/no live speech recognition/);
    expect(evaluateSupport({ ...chrome, opus: false }).reason).toMatch(/cannot record Opus/);
    expect(evaluateSupport({ ...chrome, hasIdb: false }).reason).toMatch(/Storage is unavailable/);
  });
  it('warns on Safari, Edge, and Firefox', () => {
    const safari = { ...chrome, userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15', brands: undefined };
    expect(evaluateSupport(safari).chrome).toBe(false);
    expect(evaluateSupport(safari).reason).toMatch(/Built and tested for Chrome/);
    const edge = { ...chrome, userAgent: chrome.userAgent + ' Edg/152.0', brands: ['Chromium', 'Microsoft Edge'] };
    expect(evaluateSupport(edge).chrome).toBe(false);
    const firefox = { ...chrome, userAgent: 'Mozilla/5.0 (Macintosh) Gecko/20100101 Firefox/145.0', brands: undefined, hasSpeech: false };
    expect(evaluateSupport(firefox).ok).toBe(false);
  });
});
