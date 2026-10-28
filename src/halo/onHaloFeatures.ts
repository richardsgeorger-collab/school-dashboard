/**
 * What Halo+ adds on Halo's own pages (extension 0.12.0, George 2026-10-27), each with its own switch under "Show
 * Halo+ on Halo pages", here in You and in the extension's popup, so a student can turn any one off. Plus and Max (the
 * trial is Max); Free keeps the This week panel, the pill, the class lines and grades, and sees none of these switches.
 * The same ids and words as extension/onhalo/features.js (onHaloFeatures.test.ts checks).
 */
export const ON_HALO_FEATURES = [
  ['search', 'Search all your classes (Ctrl+K)'],
  ['next', 'Next item on each class card'],
  ['drafts', 'Keep drafts of your posts'],
  ['words', 'Word count in the reply box'],
  ['rubric', 'View Rubric opens on the page'],
  ['duein', 'How long you have, beside due dates'],
  ['calendar', 'All classes on one calendar'],
  ['topic', 'Topic progress'],
  ['submit', 'Submission check'],
  ['participation', 'Participation this week'],
  ['files', 'Open files on the page'],
  ['feedback', 'Last feedback under the instructions'],
  ['counts', 'New counts on class card buttons'],
  ['links', 'Clickable links in announcements'],
  ['views', 'Remember view choices'],
  ['preload', 'Open your next pages faster'],
] as const;

export type OnHaloFeature = (typeof ON_HALO_FEATURES)[number][0];

/** A switch's words on this computer: search's shortcut is ⌘K on a Mac. */
export function featureLabel(label: string): string {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return mac ? label.replace('(Ctrl+K)', '(⌘K)') : label;
}

/** The first extension with these features: the switches show only with it on this computer. */
export const ON_HALO_SINCE = '0.12.0';

/** "0.12.1" is at least "0.12.0"; anything unreadable is not. */
export function versionAtLeast(v: string | null | undefined, min: string): boolean {
  const a = String(v ?? '').split('.').map(Number);
  const b = min.split('.').map(Number);
  if (a.length < 2 || a.some((x) => !Number.isFinite(x))) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}
