import { describe, expect, it } from 'vitest';
import { deviceAndBrowser } from './device';

const d = (ua: string, platform = '', maxTouchPoints = 0) => ({ ua, platform, maxTouchPoints, coarse: false });

describe('deviceAndBrowser', () => {
  it('reads the real sign-ups of the last two weeks', () => {
    expect(deviceAndBrowser(d('Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1'), false)).toEqual({ device: 'phone', browser: 'Safari' });
    expect(deviceAndBrowser(d('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1 Ddg/'), false)).toEqual({ device: 'phone', browser: 'DuckDuckGo' });
    expect(deviceAndBrowser(d('Mozilla/5.0 (iPhone; CPU iPhone OS 27_2_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/154.0.8037.55 Mobile/15E148 Safari/6'), false)).toEqual({ device: 'phone', browser: 'Chrome iOS' });
    expect(deviceAndBrowser(d('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.2 Safari/605.1.15', 'MacIntel'), false)).toEqual({ device: 'laptop', browser: 'Safari' });
    expect(deviceAndBrowser(d('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36', 'MacIntel'), false)).toEqual({ device: 'laptop', browser: 'Chrome' });
    expect(deviceAndBrowser(d('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0'), false)).toEqual({ device: 'laptop', browser: 'Edge' });
    expect(deviceAndBrowser(d('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36 OPR/136.0.0.0'), false)).toEqual({ device: 'laptop', browser: 'Opera' });
    expect(deviceAndBrowser(d('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36'), true)).toEqual({ device: 'laptop', browser: 'Brave' });
  });
  it('an iPad that says it is a Mac is a tablet', () => {
    expect(deviceAndBrowser(d('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15', 'MacIntel', 5), false).device).toBe('tablet');
  });
});
