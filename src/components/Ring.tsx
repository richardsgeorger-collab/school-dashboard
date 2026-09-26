/**
 * One ring, one number. The arc draws itself on load (700ms, off under reduced motion) and fills with a gradient
 * from the accent to the halo, a golden ring; full means done and it says so. `text` puts a value in the middle.
 */
export function Ring({ value, max, label, text, size = 44 }: { value: number; max: number; label?: string; text?: string; size?: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  const offset = c * (1 - pct);
  return (
    <svg data-viz="" className="ring" viewBox="0 0 44 44" width={size} height={size} role="img" aria-label={label ?? `${value} of ${max}`} data-done={max > 0 && value >= max}>
      <defs>
        <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--halo)" />
        </linearGradient>
      </defs>
      <circle className="ring-track" cx="22" cy="22" r={r} />
      <circle className="ring-fill" cx="22" cy="22" r={r} strokeDasharray={c} strokeDashoffset={offset} style={{ '--c': c, '--target': offset } as React.CSSProperties} />
      {text && (
        <text className="ring-text" x="22" y="22" textAnchor="middle" dominantBaseline="central">
          {text}
        </text>
      )}
    </svg>
  );
}
