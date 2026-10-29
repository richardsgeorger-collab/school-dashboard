// After Halo confirms a submission (0.12.9, George: "Submitting should feel great immediately"). content-halo.js sees
// Halo's own success toast and has the worker mark the item done at once, on this computer and in the account; this is
// the page's part, on every plan (it is Halo's own data):
// - the submission is remembered for a little while ("just done", in chrome.storage "haloJustDone", Halo's assessment
//   ids and times only), so Student Home ticks it off where it was (the class card's NEXT box) the next time it is seen;
// - a few seconds later, that one class is read again from Halo (one question, not a sync), so the class cards, the
//   week strip and the calendars carry Halo's own new state. If Halo's fresh answer still plainly says it is not turned
//   in, it is asked once more twenty seconds later; if it still says so, Halo is right: the mark is taken back.
// - after an ordinary discussion post or reply (no one assessment to check off), only that class is read again.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  if (!O || !O.cal) return;
  const NOT_IN = /^(ACTIVE|UPCOMING|OVERDUE|IN_PROGRESS)$/; // Halo's word for work not turned in
  const IN = /^(LATE|SUBMITTED|PUBLISHED)$/; // and for work turned in (Halo's own check mark)
  const JUST_MS = 30 * 60_000;

  /** The class an assessment belongs to, from the address or Halo+'s index of the student's classes. */
  function classOf(id, slug) {
    const idx = O.st.haloIndex;
    if (!idx || !Array.isArray(idx.classes)) return null;
    if (slug && idx.classes.some((c) => c.slug === slug)) return slug;
    const row = id && Array.isArray(idx.rows) ? idx.rows.find((r) => r.id === id) : null;
    const c = row ? idx.classes[row.c] : null;
    return c ? c.slug : null;
  }
  async function remember(id, on) {
    try {
      const { haloJustDone } = await chrome.storage.local.get('haloJustDone');
      const keep = Object.fromEntries(Object.entries((haloJustDone && haloJustDone.ids) || {}).filter(([, at]) => Date.now() - at < JUST_MS));
      if (on) keep[id] = Date.now();
      else delete keep[id];
      await chrome.storage.local.set({ haloJustDone: { v: 1, ids: keep } });
    } catch {
      /* the extension was updated under this page */
    }
  }
  /** That one class, read again from Halo; Halo's row for the assessment (or null: Halo did not answer, or has none). */
  async function reread(slug, id) {
    const idx = O.st.haloIndex;
    if (!idx || !slug) return null;
    try {
      const rows = await O.cal.refreshClass(idx, slug);
      return id ? rows.get(id) || null : null;
    } catch {
      O.diag('submitted', { reread: 'no-answer' });
      return null;
    }
  }
  const later = (ms) => new Promise((r) => setTimeout(r, ms));

  window.addEventListener('haloplus:submitted', (e) => {
    if (!O.alive()) return;
    const d = (e && e.detail) || {};
    const id = typeof d.id === 'string' ? d.id : null;
    const slug = classOf(id, d.slug);
    O.diag('submitted', { kind: d.kind || null, known: !!id, cls: !!slug });
    if (id) void remember(id, true);
    // Halo's own pages here that read Halo's answers look again (the submission check, the rubric's links, …).
    O.forget('AssignmentSubmission');
    O.forget('CourseClassAssessment');
    O.soon();
    if (!slug) return;
    void (async () => {
      // Halo saves the submission before it says so; a few seconds let its other services catch up.
      await later(4000);
      let row = await reread(slug, id);
      if (!id || !row || IN.test(row.status || '')) return void O.diag('submitted', { halo: row ? 'turned-in' : 'unknown' });
      if (!NOT_IN.test(row.status || '')) return;
      await later(20_000);
      row = await reread(slug, id);
      if (row && NOT_IN.test(row.status || '')) {
        // Halo, read twice, says it is not turned in: Halo is right.
        O.diag('submitted', { halo: 'not-turned-in' });
        chrome.runtime.sendMessage({ kind: 'submit-undo', id }).catch(() => undefined);
        void remember(id, false);
      }
    })();
  });
  window.addEventListener('haloplus:posted', (e) => {
    if (!O.alive()) return;
    const slug = classOf(null, e && e.detail && e.detail.slug);
    if (!slug) return;
    void later(4000).then(() => reread(slug, null));
  });
})();
