// Feature 21 (0.12.0): the rubric on the page. Halo's "View Rubric" opens the rubric in a new tab (research 2026-10-27),
// so each card with one gets a folded "Rubric" under its instructions, closed until the student opens it; opening it
// asks Halo for the same rubric its own page shows (Halo's AssessmentRubric query) and lists it the way Halo's list
// view does: criteria in order with their points and description, levels from the top down, the total. Nothing is
// asked of Halo until it is opened; if Halo does not answer, it says so and Halo's own link is still there.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  if (!O) return;
  const Q = 'query AssessmentRubric($assessmentId:String!){assessmentRubric:getCourseClassAssessmentById(id:$assessmentId){...AssessmentRubric_assessmentRubric}}fragment AssessmentRubric_assessmentRubric on CourseClassAssessment{id title description points rubric{...AssessmentRubric_assessmentRubric_rubric}}fragment AssessmentRubric_assessmentRubric_rubric on Rubric{id name id criteria{...AssessmentRubric_assessmentRubric_rubric_criteria}}fragment AssessmentRubric_assessmentRubric_rubric_criteria on RubricCriterion{id name description points sequence achievementLevels{...AssessmentRubric_assessmentRubric_rubric_criteria_achievementLevels}}fragment AssessmentRubric_assessmentRubric_rubric_criteria_achievementLevels on RubricAchievementLevel{cellId description name points sequence value}';
  const esc = O.esc;
  // Halo's own expand chevron (MUI ChevronRight), turned down when open.
  const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"></path></svg>';
  O.CHEVRON = CHEVRON;
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const bySeq = (a, b) => (Number(a.sequence) || 0) - (Number(b.sequence) || 0);
  /** Halo's list view of a rubric (its EmbeddedRubric component), in Halo's own utility classes. */
  function listHtml(rubric) {
    const crit = [...(rubric.criteria || [])].sort(bySeq);
    const total = round2(crit.reduce((n, c) => n + (Number(c.points) || 0), 0));
    return `${crit
      .map((c) => {
        const levels = [...(c.achievementLevels || [])].sort(bySeq).reverse();
        return `<div class="border-t border-grayE0 pt-3 mt-3"><div class="flex items-center justify-between"><h5 class="font-semibold text-sm">${esc(c.name || `Criteria ${c.sequence}`)}</h5><span class="text-secondary text-sm">${round2(c.points)} points</span></div>
<h6 class="font-semibold text-xs mt-2">Criteria Description</h6><p class="pt-1 pb-3 text-sm">${esc(c.description || '')}</p>${levels
          .map((l) => `<div class="pb-2"><div class="px-3 py-3 bg-grayF2 rounded"><div class="flex w-full"><h5 class="font-semibold flex-grow pb-2 text-sm">${esc(`${l.sequence}. ${l.name || ''}`)}</h5><span class="text-secondary text-sm">${round2(l.points)} points</span></div><p class="text-sm">${esc(l.description || '')}</p></div></div>`)
          .join('')}</div>`;
      })
      .join('')}<div class="pt-3 mt-1" data-testid="hp-rubric-total"><span class="font-semibold mr-2 text-sm">Total</span><span class="text-secondary font-normal text-sm">${total} points</span></div>`;
  }
  const done = new WeakSet();
  function add(c) {
    if (done.has(c.card) || !c.block || !c.card.querySelector('a[data-testid="print_rubric_link"]') || !c.id) return;
    done.add(c.card);
    const box = document.createElement('div');
    box.setAttribute('data-haloplus', 'rubric');
    box.className = 'px-0 sm:px-5 py-2 mx-5 sm:mx-0';
    box.innerHTML = `<div class="flex items-center text-xs text-secondary"><button type="button" class="hp-fold text-xs text-secondary" aria-expanded="false">${CHEVRON}<span>Rubric</span></button><span style="margin-left:6px">${O.mark()}</span></div><div class="hp-body" hidden></div>`;
    c.block.after(box);
    const btn = box.querySelector('.hp-fold');
    const body = box.querySelector('.hp-body');
    btn.addEventListener('click', async () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      body.hidden = !open;
      if (!open || body.dataset.loaded) return;
      body.innerHTML = '<p class="text-sm text-secondary pt-2">Loading the rubric from Halo…</p>';
      try {
        const d = await O.ask('AssessmentRubric', Q, { assessmentId: c.id }, 10 * 60_000);
        const r = d && d.assessmentRubric && d.assessmentRubric.rubric;
        if (!r || !Array.isArray(r.criteria) || !r.criteria.length) throw new Error('no rubric');
        body.innerHTML = listHtml(r);
        body.dataset.loaded = '1';
        O.count('rubric-open');
      } catch {
        body.innerHTML = '<p class="text-sm text-secondary pt-2">Halo did not send the rubric just now. View Rubric above opens Halo’s own.</p>';
      }
    });
  }
  O.feature({
    id: 'rubric',
    routes: ['unit', 'syllabus'],
    start() {
      this.update();
    },
    update() {
      for (const c of O.cards()) add(c);
    },
    stop() {
      document.querySelectorAll('[data-haloplus="rubric"]').forEach((n) => n.remove());
    },
  });
  O.rubricHtml = listHtml;
})();
