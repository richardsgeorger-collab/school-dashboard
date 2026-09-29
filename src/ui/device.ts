/**
 * What kind of device this is, for the bookmark steps. An iPad in Safari or Chrome can report itself as a Mac
 * ("Macintosh" in the user agent, platform MacIntel); a Mac with a touch screen is an iPad (2026-09-28).
 */
export interface DeviceInfo {
  ua: string;
  platform: string;
  maxTouchPoints: number;
  coarse: boolean;
}

const read = (): DeviceInfo => ({
  ua: typeof navigator === 'undefined' ? '' : navigator.userAgent,
  platform: typeof navigator === 'undefined' ? '' : navigator.platform || '',
  maxTouchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints || 0,
  coarse: typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches,
});

export const isIPad = (d: DeviceInfo = read()): boolean => /iPad/.test(d.ua) || ((/Macintosh/.test(d.ua) || /^Mac/.test(d.platform)) && d.maxTouchPoints > 1);
export const isIPhone = (d: DeviceInfo = read()): boolean => /iPhone|iPod/.test(d.ua);
export const isIOSDevice = (d: DeviceInfo = read()): boolean => isIPad(d) || isIPhone(d);
export const isAndroid = (d: DeviceInfo = read()): boolean => /Android/i.test(d.ua);
/** A touch device where the bookmark is saved and run by hand, never dragged: phones and iPads. */
export const isTouchDevice = (d: DeviceInfo = read()): boolean => isIOSDevice(d) || isAndroid(d) || d.coarse;
/** Chrome on an iPhone or iPad (it runs on Safari's engine and names itself CriOS). */
export const isChromeIOS = (d: DeviceInfo = read()): boolean => isIOSDevice(d) && /CriOS/.test(d.ua);
/** A real Mac: Mac OS and no touch screen. */
export const isMacComputer = (d: DeviceInfo = read()): boolean => (d.platform ? /^Mac/.test(d.platform) : /Macintosh/.test(d.ua)) && !isIPad(d);
