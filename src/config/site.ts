/**
 * Where Halo+ lives (2026-09-29). The site moved from GitHub's address to its own domain. The old address keeps
 * serving the sync script (every saved bookmark loads it from there) and hands each student over to the new one,
 * planner and sign-in included. Everything the app builds itself uses the page's own origin; these are for the
 * few places that must name an origin that is not the current page's.
 */
export const CANONICAL_ORIGIN = 'https://haloplus.app';
export const CANONICAL_BASE = '/';
export const LEGACY_ORIGIN = 'https://richardsgeorger-collab.github.io';
export const LEGACY_BASE = '/school-dashboard/';
/** Every origin a Halo+ tab can be on. The sync script hands its export to whichever of these the tab is showing. */
export const KNOWN_ORIGINS = [CANONICAL_ORIGIN, LEGACY_ORIGIN] as const;
export const CANONICAL_URL = `${CANONICAL_ORIGIN}${CANONICAL_BASE}`;
