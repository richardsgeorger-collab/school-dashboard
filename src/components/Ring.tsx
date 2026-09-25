/** One ring, one number. Progress for the day; full means done, and it says so in colour. */
export function Ring({ value, max, label }: { value: number; max: number; label?: string }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <svg className="ring" viewBox="0 0 44 44" role="img" aria-label={label ?? `${value} of ${max}`} data-done={max > 0 && value >= max}>
      <circle className="ring-track" cx="22" cy="22" r={r} />
      <circle className="ring-fill" cx="22" cy="22" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - pct)} />
    </svg>
  );
}
