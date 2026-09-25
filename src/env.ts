/**
 * Build-time settings. Every variable is read by its literal name, never through `import.meta.env` as a whole:
 * touching the whole object makes Vite inline every VITE_ variable present at build time into the public bundle,
 * so one mistakenly prefixed secret would ship to every browser. Only the five names below can ever reach the
 * client, and `vite.config.ts` refuses to build if any other VITE_ variable is set.
 *
 * Under plain Node (the AI harness imports app code) there is no import.meta.env; each read then fails and is
 * treated as unset. Getters, so tests can stub values after import.
 */
const read = (get: () => unknown): string => {
  try {
    const v = get();
    return typeof v === 'string' ? v : v === true ? 'true' : '';
  } catch {
    return '';
  }
};

export const ENV = {
  get DEV(): boolean {
    return read(() => import.meta.env.DEV) === 'true';
  },
  get MODE(): string {
    return read(() => import.meta.env.MODE) || 'production';
  },
  get BASE_URL(): string {
    return read(() => import.meta.env.BASE_URL) || '/';
  },
  get AI_DIRECT(): boolean {
    return read(() => import.meta.env.VITE_AI_DIRECT) === '1';
  },
  get SUPABASE_URL(): string {
    return read(() => import.meta.env.VITE_SUPABASE_URL);
  },
  get SUPABASE_ANON_KEY(): string {
    return read(() => import.meta.env.VITE_SUPABASE_ANON_KEY);
  },
  get META_PIXEL_ID(): string {
    return read(() => import.meta.env.VITE_META_PIXEL_ID);
  },
  get VAPID_PUBLIC_KEY(): string {
    return read(() => import.meta.env.VITE_VAPID_PUBLIC_KEY);
  },
};
