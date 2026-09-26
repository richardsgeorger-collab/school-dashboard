/**
 * The mark, drawn: the golden ring traces itself, then the plus pops into the gap. The one celebratory moment the
 * brand gets, used for "Today's done", a level up, and the payoff at the end of onboarding.
 */
export function HaloDraw({ size = 96 }: { size?: number }) {
  return (
    <svg data-viz="" className="halo-draw" viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden>
      <path className="halo-draw-ring" d="M19.73 9.93A8 8 0 1 1 14.07 4.27" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" pathLength="1" />
      <path className="halo-draw-plus" d="M17.66 3.5v5.7M14.8 6.35h5.7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
