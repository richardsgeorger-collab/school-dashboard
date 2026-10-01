import { describe, expect, it } from 'vitest';
import { extensionBrowser } from './extension';

const UA = {
  chromeMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0',
  opera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

describe('who is offered the extension', () => {
  it('desktop Chrome, Edge and Brave', () => {
    expect(extensionBrowser(UA.chromeMac)).toBe('Chrome');
    expect(extensionBrowser(UA.chromeWin)).toBe('Chrome');
    expect(extensionBrowser(UA.edge)).toBe('Edge');
    expect(extensionBrowser(UA.chromeMac, { brave: true })).toBe('Brave');
  });
  it('never Safari, Firefox, Opera, a phone or an iPad (even one asking for the desktop site)', () => {
    for (const ua of [UA.safari, UA.firefox, UA.opera, UA.androidChrome, UA.iphoneChrome, UA.ipad]) expect(extensionBrowser(ua)).toBeNull();
    expect(extensionBrowser(UA.chromeMac, { touchMac: true })).toBeNull();
  });
});
