/**
 * Small line drawings for empty states, in the ink of the page with one gold detail, so an empty screen is a
 * pause and an invitation rather than a blank. All four share one stroke and one scale.
 */
export type Art = 'halo' | 'calendar' | 'inbox' | 'classes';

export function Illustration({ art }: { art: Art }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg data-viz="" className="illo" viewBox="0 0 120 80" width="120" height="80" aria-hidden>
      {art === 'halo' && (
        <>
          <path d="M92 41A32 32 0 1 1 69 13" {...common} strokeWidth="2.2" />
          <path d="M84 8v14M77 15h14" stroke="var(--halo)" strokeWidth="3" strokeLinecap="round" />
          <path d="M42 46h26M42 54h18" {...common} opacity="0.5" />
        </>
      )}
      {art === 'calendar' && (
        <>
          <rect x="22" y="14" width="76" height="56" rx="6" {...common} />
          <path d="M22 30h76M40 8v12M80 8v12" {...common} />
          {[0, 1, 2, 3, 4].map((c) =>
            [0, 1].map((r) => <circle key={`${c}${r}`} cx={36 + c * 12} cy={42 + r * 14} r="2" fill="currentColor" opacity="0.35" />),
          )}
          <circle cx="60" cy="42" r="5" fill="var(--halo)" />
        </>
      )}
      {art === 'inbox' && (
        <>
          <path d="M20 40V60a6 6 0 0 0 6 6h68a6 6 0 0 0 6-6V40" {...common} />
          <path d="M20 40h22l4 8h28l4-8h22" {...common} />
          <path d="M30 40l8-24h44l8 24" {...common} />
          <path d="M48 26h24M52 34h16" {...common} opacity="0.5" />
          <circle cx="88" cy="18" r="6" fill="var(--halo)" />
        </>
      )}
      {art === 'classes' && (
        <>
          <rect x="16" y="20" width="26" height="40" rx="4" {...common} />
          <rect x="47" y="20" width="26" height="40" rx="4" {...common} />
          <rect x="78" y="20" width="26" height="40" rx="4" {...common} />
          <path d="M22 30h14M53 30h14M84 30h14" {...common} opacity="0.5" />
          <circle cx="60" cy="48" r="4" fill="var(--halo)" />
        </>
      )}
    </svg>
  );
}
