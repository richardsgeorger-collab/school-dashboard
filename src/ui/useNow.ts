import { useEffect, useState } from 'react';

/** Date.now(), ticking every `ms` and when the tab comes back into view, so "5 min ago" stays true (2026-10-11). */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const iv = window.setInterval(tick, ms);
    const onShow = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [ms]);
  return now;
}
