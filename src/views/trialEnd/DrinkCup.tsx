/** A GCBC-style paper cup with a lid, a sleeve and a straw: it fills, then a little steam rises (reduced motion: just the cup). */
export function DrinkCup({ size }: { size: 'small' | 'large' }) {
  const id = `cup-${size}`;
  return (
    <svg className="drink-cup" data-size={size} viewBox="0 0 120 170" width={size === 'large' ? 124 : 92} height={size === 'large' ? 176 : 130} aria-hidden fill="none">
      <defs>
        <clipPath id={id}>
          <path d="M22 44h76l-9 112a8 8 0 0 1-8 7H39a8 8 0 0 1-8-7L22 44Z" />
        </clipPath>
      </defs>
      <g className="cup-steam">
        <path d="M46 26c-5-6 5-10 0-18" />
        <path d="M60 24c-5-6 5-10 0-18" />
        <path d="M74 26c-5-6 5-10 0-18" />
      </g>
      <path className="cup-straw" d="M66 40 76 4" />
      <g clipPath={`url(#${id})`}>
        <rect className="cup-fill" x="18" y="44" width="84" height="122" />
        <path className="cup-wave" d="M18 60c10-5 20 5 30 0s20-5 30 0 20 5 30 0v10H18Z" />
      </g>
      <path className="cup-body" d="M22 44h76l-9 112a8 8 0 0 1-8 7H39a8 8 0 0 1-8-7L22 44Z" />
      <path className="cup-sleeve" d="M28 86h64l-3 34H31Z" />
      <text className="cup-word" x="60" y="108" textAnchor="middle">
        {size === 'small' ? 'S' : 'L'}
      </text>
      <rect className="cup-lid" x="16" y="34" width="88" height="12" rx="5" />
    </svg>
  );
}
