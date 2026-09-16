/**
 * What the AI features cost, measured, not guessed: every call records the tokens the API reported, by month and kind.
 * Kept in this browser only. Prices are editable so the number stays honest when Anthropic's list changes.
 */
export type UsageKind = 'class_plan' | 'term_plan' | 'lecture' | 'tutor' | 'brief' | 'draft' | 'method' | 'links' | 'study' | 'quiz' | 'coach' | 'audit' | 'needs' | 'other';

export interface UsageRow {
  month: string;
  kind: string;
  model: string;
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Dollars per million tokens. */
export interface Prices {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/** Sonnet-class list prices as of this build; edit in Settings when they change. */
export const DEFAULT_PRICES: Prices = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };

export const USAGE_SLOT = 'school-dashboard:ai-usage';
export const PRICES_SLOT = 'school-dashboard:ai-prices';

export interface ApiUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const store = (): Store | null => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

export const monthOf = (at: Date | string): string => {
  const d = typeof at === 'string' ? new Date(at) : at;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function loadUsage(s: Store | null = store()): UsageRow[] {
  try {
    const raw = s?.getItem(USAGE_SLOT);
    const rows = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(rows) ? (rows as UsageRow[]) : [];
  } catch {
    return [];
  }
}

const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Add one call's reported usage to its month-and-kind row. */
export function recordUsage(kind: UsageKind | string, model: string, usage: ApiUsage | null | undefined, at: Date | string = new Date(), s: Store | null = store()): UsageRow[] {
  const rows = loadUsage(s);
  const month = monthOf(at);
  let row = rows.find((r) => r.month === month && r.kind === kind && r.model === model);
  if (!row) {
    row = { month, kind, model, calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    rows.push(row);
  }
  row.calls += 1;
  row.input += n(usage?.input_tokens);
  row.output += n(usage?.output_tokens);
  row.cacheRead += n(usage?.cache_read_input_tokens);
  row.cacheWrite += n(usage?.cache_creation_input_tokens);
  // Keep a year: older months fall off.
  const keep = rows.filter((r) => r.month >= monthOf(new Date(new Date(at).getTime() - 366 * 86_400_000)));
  try {
    s?.setItem(USAGE_SLOT, JSON.stringify(keep));
  } catch {
    // Storage full or blocked: the number is a convenience, never a blocker.
  }
  return keep;
}

export interface UsageTotals {
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const totals = (rows: UsageRow[]): UsageTotals => rows.reduce((t, r) => ({ calls: t.calls + r.calls, input: t.input + r.input, output: t.output + r.output, cacheRead: t.cacheRead + r.cacheRead, cacheWrite: t.cacheWrite + r.cacheWrite }), { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

/** Dollars, from tokens and prices per million. */
export const costOf = (t: UsageTotals, p: Prices): number => (t.input * p.input + t.output * p.output + t.cacheRead * p.cacheRead + t.cacheWrite * p.cacheWrite) / 1_000_000;

export function loadPrices(s: Store | null = store()): Prices {
  try {
    const raw = s?.getItem(PRICES_SLOT);
    const p = raw ? (JSON.parse(raw) as Partial<Prices>) : {};
    return { ...DEFAULT_PRICES, ...p };
  } catch {
    return DEFAULT_PRICES;
  }
}

export function savePrices(p: Prices, s: Store | null = store()): void {
  try {
    s?.setItem(PRICES_SLOT, JSON.stringify(p));
  } catch {
    // Same: a convenience.
  }
}

export const fmtDollars = (d: number): string => (d < 0.005 ? '$0.00' : d < 1 ? `$${d.toFixed(2)}` : `$${d.toFixed(2)}`);

/** Rows for a month, grouped by kind for the table in Settings. */
export function byKind(rows: UsageRow[], month: string): (UsageTotals & { kind: string })[] {
  const out = new Map<string, UsageTotals & { kind: string }>();
  for (const r of rows) {
    if (r.month !== month) continue;
    const t = out.get(r.kind) ?? { kind: r.kind, calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    t.calls += r.calls;
    t.input += r.input;
    t.output += r.output;
    t.cacheRead += r.cacheRead;
    t.cacheWrite += r.cacheWrite;
    out.set(r.kind, t);
  }
  return [...out.values()].sort((a, b) => costOf(b, DEFAULT_PRICES) - costOf(a, DEFAULT_PRICES));
}
