/**
 * The accent presets. Gold is the halo and the default for everyone; a Max account may pick another. Each preset
 * is one block of tokens in looks.css under [data-accent='id'], light and dark. The swatches here are for the
 * picker only; the CSS is the truth on screen.
 */
export const ACCENTS = [
  { id: 'gold', name: 'Gold', light: '#dfa321', dark: '#f2b84b' },
  { id: 'blue', name: 'Blue', light: '#3f7fee', dark: '#6fa0ff' },
  { id: 'green', name: 'Green', light: '#2f9e5b', dark: '#5ccf8a' },
  { id: 'rose', name: 'Rose', light: '#e0507a', dark: '#ff8fb0' },
  { id: 'violet', name: 'Violet', light: '#7b5cf0', dark: '#a996ff' },
  { id: 'teal', name: 'Teal', light: '#1f9aa8', dark: '#5fd3df' },
] as const;
export type AccentId = (typeof ACCENTS)[number]['id'];
export const DEFAULT_ACCENT: AccentId = 'gold';
export const isAccent = (v: unknown): v is AccentId => ACCENTS.some((a) => a.id === v);

/**
 * The accent to show: the chosen one only while the account has the feature (Max, or the Max trial). When the trial
 * ends the choice is kept but gold comes back; choose Max again and it returns.
 */
export function accentToShow(chosen: AccentId | undefined, allowed: boolean): AccentId {
  return allowed && chosen && isAccent(chosen) ? chosen : DEFAULT_ACCENT;
}

/** Apply a preset to an element (the document, or a preview box). Gold clears the attribute: it is the default. */
export function applyAccent(el: HTMLElement, accent: AccentId): void {
  if (accent === DEFAULT_ACCENT) delete el.dataset.accent;
  else el.dataset.accent = accent;
}
