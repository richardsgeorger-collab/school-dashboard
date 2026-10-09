import { describe, expect, it } from 'vitest';
import { newerVersion, quietMoment } from './update';

describe('an open tab takes a new build by itself (George, 2026-10-09)', () => {
  it('reloads only for a real, different version, never from a dev or test build', () => {
    expect(newerVersion('2026-10-09.235a236', '2026-10-09.9f1c0aa\n')).toBe(true);
    expect(newerVersion('2026-10-09.235a236', '2026-10-09.235a236')).toBe(false);
    expect(newerVersion('2026-10-09.235a236', '')).toBe(false);
    expect(newerVersion('2026-10-09.235a236', '<!doctype html>')).toBe(false);
    expect(newerVersion('dev', '2026-10-09.9f1c0aa')).toBe(false);
    expect(newerVersion('test', '2026-10-09.9f1c0aa')).toBe(false);
  });
  it('waits for a quiet moment: in view, nothing open over the page, nothing being typed', () => {
    const doc = (over: boolean, active: { tagName: string; isContentEditable?: boolean } | null, vis = 'visible') => ({ visibilityState: vis as DocumentVisibilityState, querySelector: () => (over ? ({} as Element) : null), activeElement: active as Element | null });
    expect(quietMoment(doc(false, null))).toBe(true);
    expect(quietMoment(doc(true, null))).toBe(false);
    expect(quietMoment(doc(false, { tagName: 'TEXTAREA' }))).toBe(false);
    expect(quietMoment(doc(false, { tagName: 'DIV', isContentEditable: true }))).toBe(false);
    expect(quietMoment(doc(false, { tagName: 'BUTTON' }))).toBe(true);
    expect(quietMoment(doc(false, null, 'hidden'))).toBe(false);
  });
});
