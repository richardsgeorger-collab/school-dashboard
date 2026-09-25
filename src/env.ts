/**
 * Build-time settings. Vite replaces `import.meta.env` in the browser; under plain Node (the AI harness and other
 * scripts that import app code) there is no such object, so this never throws and every value is simply unset
 * there. Read lazily so tests can stub values after import.
 */
// Written as the literal `import.meta.env` so Vite can replace it and Vitest can stub it; under Node it is undefined.
const raw = (): Record<string, string | boolean | undefined> => (import.meta.env as Record<string, string | boolean | undefined> | undefined) ?? {};
const str = (k: string): string => {
  const v = raw()[k];
  return typeof v === 'string' ? v : '';
};

export const ENV = {
  get DEV(): boolean {
    return raw().DEV === true;
  },
  get MODE(): string {
    return str('MODE') || 'production';
  },
  get BASE_URL(): string {
    return str('BASE_URL') || '/';
  },
  get AI_DIRECT(): boolean {
    return str('VITE_AI_DIRECT') === '1';
  },
  get SUPABASE_URL(): string {
    return str('VITE_SUPABASE_URL');
  },
  get SUPABASE_ANON_KEY(): string {
    return str('VITE_SUPABASE_ANON_KEY');
  },
  get META_PIXEL_ID(): string {
    return str('VITE_META_PIXEL_ID');
  },
  get VAPID_PUBLIC_KEY(): string {
    return str('VITE_VAPID_PUBLIC_KEY');
  },
};
