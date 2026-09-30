// The per-code timetable that used to live here (George's own six classes) gave every account his meeting times.
// A class's days and start now come from its Halo section code (src/halo/section.ts); nothing here is per course.

/** Validated categorical order (light surface). Assign in this order, never cycle. */
export const PALETTE = ['#D95D39', '#2F6FDB', '#1F9E89', '#7A5AD0', '#C9459A', '#B8860B', '#5A6B7C', '#8A5A2B'];

/** Dark-surface counterparts, validated against #171B21. */
export const DARK_VARIANT: Record<string, string> = {
  '#D95D39': '#D4603A',
  '#2F6FDB': '#3B78E0',
  '#1F9E89': '#1E9A85',
  '#7A5AD0': '#7F62D6',
  '#C9459A': '#C2479A',
  '#B8860B': '#A8800F',
};

export function courseColor(hex: string, dark: boolean): string {
  return dark ? DARK_VARIANT[hex.toUpperCase()] ?? DARK_VARIANT[hex] ?? hex : hex;
}
