import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';

/**
 * The Halo+ Chrome extension on the Web Store (live 2026-10-01). The address is an Admin setting (app_settings
 * 'extension_url', Admin → Chrome extension), so it can change without a deploy; this is the fallback until it loads,
 * and what the pre-rendered landing page carries.
 */
export const EXTENSION_URL: string | null = 'https://chromewebstore.google.com/detail/halo+/dookepepmkkakmepjabldmgfmfhfcmnn';

const CACHE = 'school-dashboard:extension-url';
const VERSION_KEY = 'school-dashboard:ext-version';

export type ExtensionBrowser = 'Chrome' | 'Edge' | 'Brave';

/**
 * Which browser can install it: desktop Chrome, Edge or Brave only (George, 2026-10-01). Never a phone or an iPad
 * (no extensions there), never Firefox or Safari, and not Opera or other Chromium browsers we have not tested.
 */
export function extensionBrowser(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent, opts: { brave?: boolean; touchMac?: boolean } = {}): ExtensionBrowser | null {
  if (/Android|iPhone|iPad|iPod|Mobile|CriOS|EdgiOS|FxiOS/i.test(ua)) return null;
  if (opts.touchMac) return null; // an iPad asking for the desktop site says Macintosh
  if (/OPR\/|Opera|Vivaldi|YaBrowser|SamsungBrowser|Firefox\//i.test(ua)) return null;
  if (/Edg\//.test(ua)) return 'Edge';
  if (!/Chrome\//.test(ua)) return null;
  return opts.brave ? 'Brave' : 'Chrome';
}

function detectBrowser(): ExtensionBrowser | null {
  if (typeof navigator === 'undefined') return null;
  const brave = !!(navigator as Navigator & { brave?: unknown }).brave;
  const touchMac = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  return extensionBrowser(navigator.userAgent, { brave, touchMac });
}

/** The extension's version on this computer, when it is installed (its content script writes it on Halo+ pages). */
export function installedVersion(): string | null {
  try {
    return localStorage.getItem(VERSION_KEY);
  } catch {
    return null;
  }
}

/**
 * Everything a screen needs to offer the extension: the store address (Admin's, else the fallback), the browser it
 * would install into (null: do not offer it here), and whether it is already installed. Read once per screen, so an
 * offer does not vanish mid-step.
 */
export function useExtension(): { url: string | null; browser: ExtensionBrowser | null; installed: string | null; offer: boolean } {
  const [url, setUrl] = useState<string | null>(() => {
    try {
      return localStorage.getItem(CACHE) || EXTENSION_URL;
    } catch {
      return EXTENSION_URL;
    }
  });
  const [browser] = useState(detectBrowser);
  const [installed] = useState(installedVersion);
  useEffect(() => {
    let live = true;
    void supabase()
      ?.rpc('app_setting', { p_key: 'extension_url' })
      .then(({ data, error }) => {
        if (!live || error) return;
        const v = typeof data === 'string' && /^https:\/\//.test(data) ? data : null;
        setUrl(v);
        try {
          if (v) localStorage.setItem(CACHE, v);
          else localStorage.removeItem(CACHE);
        } catch {
          /* storage unavailable */
        }
      });
    return () => {
      live = false;
    };
  }, []);
  return { url, browser, installed, offer: !!url && !!browser && !installed };
}
