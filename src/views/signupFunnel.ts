/** One account in Admin's sign-up-to-first-sync table (admin_signup_funnel, migration 0035). */
export interface SignupRow {
  who: string;
  created_at: string;
  device: 'phone' | 'tablet' | 'laptop' | 'unknown';
  browser: string;
  reached_connect: boolean;
  clicked_store: boolean;
  installed: boolean;
  opened_halo: boolean;
  handoff: boolean;
  on_laptop: boolean;
  landed: boolean;
  classes_now: number;
  last_step_at: string | null;
}

export type StepKey = 'signed_up' | 'reached_connect' | 'clicked_store' | 'installed' | 'opened_halo' | 'landed';

/** The steps in order, as Admin names them. */
export const STEPS: [StepKey, string][] = [
  ['signed_up', 'Signed up'],
  ['reached_connect', 'Reached Connect Halo'],
  ['clicked_store', 'Pressed Add to Chrome'],
  ['installed', 'Extension installed'],
  ['opened_halo', 'Opened Halo'],
  ['landed', 'A sync landed'],
];

const on = (r: SignupRow, k: StepKey) => (k === 'signed_up' ? true : r[k]);

/** How many reached each step: all, on a laptop, on a phone or tablet (the device they signed up on). */
export function funnelTotals(rows: SignupRow[]): Record<StepKey, { all: number; laptop: number; touch: number }> {
  const out = {} as Record<StepKey, { all: number; laptop: number; touch: number }>;
  for (const [k] of STEPS) {
    const hit = rows.filter((r) => on(r, k));
    out[k] = { all: hit.length, laptop: hit.filter((r) => r.device === 'laptop').length, touch: hit.filter((r) => r.device === 'phone' || r.device === 'tablet').length };
  }
  return out;
}

/** Where an account stopped: the first step it did not reach, or null when a sync landed. */
export function droppedAt(r: SignupRow): string | null {
  if (r.landed) return null;
  const k = STEPS.find(([key]) => !on(r, key));
  // A phone that chose to finish on a laptop and never came back says so.
  if (r.handoff && !r.on_laptop) return 'Chose "Finish on my laptop", never opened it there';
  return k ? `Before "${k[1]}"` : 'Before a sync landed';
}
