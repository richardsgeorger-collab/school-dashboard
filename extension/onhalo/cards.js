// Halo's assessment cards (the topic page and the syllabus use the same card, research 2026-10-27), read once for every
// feature that sits on them: the title, Halo's own done check, the status, the due date, the instructions, and which
// assessment it is (from Halo's own rubric link, else the one assessment in this class and topic with that title).
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  if (!O) return;
  const DONE = /^(LATE|SUBMITTED|PUBLISHED)$/;
  function idFor(card, title) {
    const link = card.querySelector('a[data-testid="print_rubric_link"]');
    const m = link && /\/rubrics\/([^/?#]+)/.exec(link.getAttribute('href') || '');
    if (m) return decodeURIComponent(m[1]);
    const r = O.route();
    const idx = O.st.haloIndex;
    if (!idx || !Array.isArray(idx.rows) || !r.slug) return null;
    const k = idx.classes.findIndex((c) => c.slug === r.slug);
    const same = idx.rows.filter((x) => x.c === k && x.title === title && ['assignment', 'quiz', 'discussion', 'participation', 'lti'].includes(x.kind) && (!r.unit || x.unit === r.unit));
    return same.length === 1 ? same[0].id : null;
  }
  /** The cards on the page, each { card, title, done, status, due, desc, block, id }. */
  function cards(root = document) {
    return [...root.querySelectorAll('[data-testid="assessment_card"]')]
      .filter((card) => !card.closest('[data-haloplus]') && card.querySelector('[data-testid="assessment_title"]'))
      .map((card) => {
        const title = (card.querySelector('[data-testid="assessment_title"]').textContent || '').trim();
        const chip = card.querySelector('[data-testid="status"]');
        const status = chip ? chip.getAttribute('aria-label') || '' : '';
        const check = !!card.querySelector('[class*="CheckIcon_checkIcon"]');
        const desc = card.querySelector('[data-testid="description"]');
        const block = desc ? desc.closest('div.px-0') || desc.parentElement.parentElement : null;
        return { card, title, status, done: check || DONE.test(status), known: check || !!chip, due: card.querySelector('[data-testid="date_time_data_due_date"]'), desc, block, id: idFor(card, title) };
      });
  }
  O.cards = cards;
})();
