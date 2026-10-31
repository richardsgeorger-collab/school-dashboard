import { useEffect, useState } from 'react';
import { supabase } from '../auth/client';

/**
 * The trust line by every main button (Loop 302, George 2026-10-30): "Takes 10 seconds. Free. Join GCU students already
 * using it." With a number only when it is the live, real one: public_student_count() counts real students (no test
 * accounts, no admins) and rounds down on the server; shown from 20. Pre-rendered without the number (no window then).
 */
let cached: Promise<number | null> | null = null;
export function studentCount(): Promise<number | null> {
  if (cached) return cached;
  cached = (async () => {
    try {
      const c = supabase();
      if (!c) return null;
      const { data, error } = await c.rpc('public_student_count');
      return !error && typeof data === 'number' && data >= 20 ? data : null;
    } catch {
      return null;
    }
  })();
  return cached;
}

export function useStudentCount(): number | null {
  const [n, setN] = useState<number | null>(null);
  useEffect(() => {
    let on = true;
    void studentCount().then((v) => on && setN(v));
    return () => {
      on = false;
    };
  }, []);
  return n;
}

/**
 * Users on the Chrome Web Store (its dashboard, read by George 2026-10-30: 212 installs). The Web Store counts installs we
 * cannot query, so this is set by hand; raise it when the dashboard does. The line shows the larger of this and the live
 * count of accounts, and says "hundreds" only from 200, so it is never more than true.
 */
export const STORE_USERS = 212;
const said = (n: number): string => (n >= 200 ? 'hundreds of' : `${n}+`);
export const trustText = (n: number | null): string => {
  const best = Math.max(n ?? 0, STORE_USERS);
  return `Free. Join ${best >= 20 ? `${said(best)} ` : ''}GCU students already using it.`;
};

export function Trust({ className = 'lp-trust' }: { className?: string }) {
  const n = useStudentCount();
  return (
    <p className={className}>
      <b>Takes 10 seconds.</b> {trustText(n)}
    </p>
  );
}
