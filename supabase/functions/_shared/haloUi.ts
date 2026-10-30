// A Halo+-on-Halo moment from the extension (0.8.0): the card shown, closed, clicked, the pill or a class line clicked.
// Counted per student per day in usage_events through bump_usage_for; the student comes from the sync key.
// deno-lint-ignore-file no-explicit-any
const EVENTS = ['card-shown', 'card-closed', 'card-click', 'pill-click', 'pill-hover', 'class-click', 'box-click', 'box-shown', 'badge-click', 'next-shown', 'sync-click',
  // "This week" on Halo's Student Home (0.10.0): shown, opened, collapsed, a row opened on Halo, "Open in Halo+", a check-off and
  // its undo, "Show all".
  'week-shown', 'week-open', 'week-close', 'week-row', 'week-plus', 'week-check', 'week-undo', 'week-more', 'locked-peek', 'grade-refresh', 'grade-refresh-failed',
  // Halo+ on Halo's pages (0.12.0): search opened and used, "Next" clicked, a draft offered and restored, the word
  // minimum shown, a rubric opened, all classes on the calendar, a view choice picked again, a submission confirmed, a
  // wrong file type flagged, last feedback opened, participation shown, a file opened on the page, page code fetched ahead.
  'search-open', 'search-go', 'next-click', 'draft-offer', 'draft-restore', 'words-shown', 'rubric-open', 'calendar-all', 'views-applied', 'submit-shown', 'wrongtype-shown', 'feedback-open', 'participation-shown', 'file-open', 'preload-done',
  // Max from Halo (0.12.12): the heads-up on an assignment's page shown and "Unlock with Max" pressed, back from
  // checkout with Max on, the free week's end note shown and its two buttons.
  'locked-box', 'locked-unlock', 'max-on', 'trial-note', 'trial-note-keep', 'trial-note-later',
  // What-if on Halo's Gradebook (0.12.14): turned on or off, a letter in the next-exam line tapped.
  'whatif-on', 'whatif-off', 'whatif-next'];

export async function recordHaloUi(db: any, b: Record<string, unknown>): Promise<{ ok: boolean; why?: string }> {
  const event = typeof b.event === 'string' ? b.event : '';
  if (!EVENTS.includes(event)) return { ok: false, why: 'event' };
  const key = typeof b.key === 'string' ? b.key.slice(0, 128) : '';
  if (!key) return { ok: false, why: 'key' };
  const user = ((await db.from('sync_keys').select('user_id').eq('key', key).maybeSingle()).data?.user_id as string | undefined) ?? null;
  if (!user) return { ok: false, why: 'unknown key' };
  const { error } = await db.rpc('bump_usage_for', { p_user: user, p_key: `halo:${event}` });
  return { ok: !error, why: error?.message };
}
