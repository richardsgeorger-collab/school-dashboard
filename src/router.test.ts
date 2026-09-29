import { describe, expect, it } from 'vitest';
import { parseHash, TAB_OF, TABS } from './router';

describe('routes', () => {
  it('has exactly six tabs and every screen belongs to one', () => {
    expect(TABS).toEqual(['now', 'calendar', 'study', 'classes', 'inbox', 'you']);
    for (const tab of Object.values(TAB_OF)) expect(TABS).toContain(tab);
  });
  it('keeps old addresses working', () => {
    expect(parseHash('#/settings?halo=1').route).toBe('you');
    expect(parseHash('#/settings?halo=1').params.get('halo')).toBe('1');
    expect(parseHash('#/news?a=x').route).toBe('inbox');
    expect(parseHash('#/plan').route).toBe('load');
    expect(parseHash('#/record').route).toBe('library');
    expect(parseHash('').route).toBe('home');
    expect(parseHash('#/').route).toBe('home');
    expect(parseHash('#/home').route).toBe('home');
    expect(parseHash('#/signup').route).toBe('start');
    expect(parseHash('#access_token=abc&type=magiclink').route).toBe('now');
    expect(parseHash('#/nonsense').route).toBe('now');
    // The AI screens before loop 110 land on the tool that replaced each, with their parameters.
    expect(parseHash('#/ai').route).toBe('study');
    expect(parseHash('#/tutor?c=x&t=moles').route).toBe('ask');
    expect(parseHash('#/tutor?c=x&t=moles').params.get('t')).toBe('moles');
    expect(parseHash('#/quiz?c=x').route).toBe('practice');
    expect(parseHash('#/study?c=x&k=cards').route).toBe('study');
    for (const r of ['study', 'ask', 'practice', 'check'] as const) expect(TAB_OF[r]).toBe('study');
  });
});
