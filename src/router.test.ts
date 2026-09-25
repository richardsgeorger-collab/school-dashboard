import { describe, expect, it } from 'vitest';
import { parseHash, TAB_OF, TABS } from './router';

describe('routes', () => {
  it('has exactly five tabs and every screen belongs to one', () => {
    expect(TABS).toEqual(['now', 'calendar', 'classes', 'inbox', 'you']);
    for (const tab of Object.values(TAB_OF)) expect(TABS).toContain(tab);
  });
  it('keeps old addresses working', () => {
    expect(parseHash('#/settings?halo=1').route).toBe('you');
    expect(parseHash('#/settings?halo=1').params.get('halo')).toBe('1');
    expect(parseHash('#/news?a=x').route).toBe('inbox');
    expect(parseHash('#/plan').route).toBe('load');
    expect(parseHash('#/record').route).toBe('library');
    expect(parseHash('').route).toBe('now');
    expect(parseHash('#/nonsense').route).toBe('now');
  });
});
