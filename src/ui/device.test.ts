import { describe, expect, it } from 'vitest';
import { isChromeIOS, isIPad, isMacComputer, isTouchDevice } from './device';

const d = (ua: string, platform: string, maxTouchPoints: number) => ({ ua, platform, maxTouchPoints, coarse: false });
const IPAD_SAFARI_DESKTOP = d('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 'MacIntel', 5);
const IPAD_CHROME = d('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1', 'iPad', 5);
const IPAD_CHROME_DESKTOP = d('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1', 'MacIntel', 5);
const MAC = d('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', 'MacIntel', 0);

describe('telling an iPad from a Mac', () => {
  it('an iPad that says it is a Mac is an iPad, because it has a touch screen', () => {
    expect(isIPad(IPAD_SAFARI_DESKTOP)).toBe(true);
    expect(isIPad(IPAD_CHROME_DESKTOP)).toBe(true);
    expect(isMacComputer(IPAD_SAFARI_DESKTOP)).toBe(false);
    expect(isTouchDevice(IPAD_SAFARI_DESKTOP)).toBe(true);
  });
  it('Chrome on iPad is iPad and Chrome', () => {
    expect(isIPad(IPAD_CHROME)).toBe(true);
    expect(isChromeIOS(IPAD_CHROME)).toBe(true);
    expect(isChromeIOS(IPAD_CHROME_DESKTOP)).toBe(true);
  });
  it('a Mac without touch is a Mac computer', () => {
    expect(isIPad(MAC)).toBe(false);
    expect(isMacComputer(MAC)).toBe(true);
    expect(isTouchDevice(MAC)).toBe(false);
  });
});
