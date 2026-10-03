import { useEffect, useRef, useState } from 'react';
import { reducedMotion } from './JoyHost';

/**
 * A number that counts up to its new value over about 0.8 seconds when it rises, so new XP is seen arriving. A drop,
 * the first render and reduced motion show the number at once.
 */
export function useCountUp(value: number, ms = 800): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (value <= start || reducedMotion() || typeof requestAnimationFrame === 'undefined') return void setShown(value);
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setShown(Math.round(start + (value - start) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}
