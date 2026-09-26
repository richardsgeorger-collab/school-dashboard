import { describe, expect, it } from 'vitest';
import { confirmLine, estimateCost, money, needsConfirming } from './readCost';

describe('what reading announcements costs', () => {
  it('says the number before spending it when the backlog is large', () => {
    expect(needsConfirming(3)).toBe(false);
    expect(needsConfirming(34)).toBe(false);
    expect(needsConfirming(180)).toBe(true);
    expect(confirmLine(34)).toBe('34 announcements have never been read for requirements. Reading them costs about $0.20.');
  });

  it('reads as money, and never as a misleading zero', () => {
    expect(money(0)).toBe('$0.00');
    expect(money(0.004)).toBe('under a cent');
    expect(money(0.204)).toBe('$0.20');
    expect(estimateCost(34)).toBeCloseTo(0.204, 3);
  });
});
