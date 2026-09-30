/**
 * Buttons that live in the shell (the top bar's Sync sheet) but are pressed from screens. A ref keeps the screen
 * from needing the shell's state: the shell sets it, the screen calls it.
 */
export const syncPress: { current: (() => void) | null } = { current: null };
/** Closes the Sync sheet: the peek replaces it once Halo's data arrives. */
export const syncClose: { current: (() => void) | null } = { current: null };
