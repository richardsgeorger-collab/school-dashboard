// Feature 23 (0.12.0): last feedback where it matters. Under the instructions of work still open on a topic page, folded,
// the instructor's comment on the same assignment from an earlier topic ("Topic 6 DQ 2" for "Topic 7 DQ 2"), word for
// word as Halo has it. Only when the match is clear (logic.js: same series and Halo type, the most recent earlier one
// with a comment, never two candidates at once); otherwise nothing. Reading the comment this way does not mark it
// seen in Halo (only Halo's own feedback view does). At most two cards per page, each asking Halo at most twice.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  const L = globalThis.HaloPlusOnLogic;
  if (!O || !L) return;
  const Q_GRADES = 'query StudentAssessmentDetails($courseClassSlugId:String!,$courseUnitId:String){assessmentGrades:getAllClassGrades(courseClassSlugId:$courseClassSlugId courseUnitId:$courseUnitId){...StudentAssessmentDetails_assessmentGrades}}fragment StudentAssessmentDetails_assessmentGrades on UserCourseClassGrade{grades{...StudentAssessmentDetails_assessmentGrades_grades}}fragment StudentAssessmentDetails_assessmentGrades_grades on UserCourseClassAssessmentGrade{assessment{...StudentAssessmentDetails_assessmentGrades_grades_assessment}userLastSeenDate dueDate accommodatedDueDate id status userQuizAssessment{...StudentAssessmentDetails_assessmentGrades_grades_userQuizAssessment}isEverReassigned history{assignmentSubmissionId comment gradeId status points reassignAttachments{modifiedDate resource{active context createdBy createdDate description embedReady id kind modifiedBy modifiedDate name type url}}userCourseClassAssessmentId}}fragment StudentAssessmentDetails_assessmentGrades_grades_assessment on CourseClassAssessment{id title}fragment StudentAssessmentDetails_assessmentGrades_grades_userQuizAssessment on QuizUserCourseClassAssessment{userQuizId accommodatedDuration}';
  const Q_FB = 'query AssessmentFeedback($assessmentId:String!,$userId:String!){assessmentFeedback:getGradeForUserCourseClassAssessment(courseClassAssessmentId:$assessmentId,userId:$userId){id gradedDate finalComment{comment}}}';
  const MAX_CARDS = 2;
  const done = new WeakSet();

  function typeOf(id) {
    const idx = O.st.haloIndex;
    const r = idx && Array.isArray(idx.rows) ? idx.rows.find((x) => x.id === id) : null;
    return r ? r.type : null;
  }
  async function find(c) {
    const type = typeOf(c.id);
    const me = L.seriesOf(c.title, type);
    if (!me || !type) return null;
    const slug = O.route().slug;
    const d = await O.ask('StudentAssessmentDetails', Q_GRADES, { courseClassSlugId: slug, courseUnitId: null }, 10 * 60_000);
    const grades = (d && d.assessmentGrades && d.assessmentGrades[0] && d.assessmentGrades[0].grades) || [];
    // The earlier ones of the same series and type that Halo has graded, most recent first.
    const cands = grades
      .filter((g) => g && g.assessment && g.assessment.id !== c.id && g.status === 'PUBLISHED' && typeOf(g.assessment.id) === type)
      .map((g) => ({ id: g.assessment.id, title: g.assessment.title, s: L.seriesOf(g.assessment.title, type) }))
      .filter((x) => x.s && x.s.key === me.key && x.s.n < me.n)
      .sort((a, b) => b.s.n - a.s.n);
    const s = await O.haloSession();
    if (!s.user) return null;
    let tried = 0;
    for (const n of [...new Set(cands.map((x) => x.s.n))]) {
      const at = cands.filter((x) => x.s.n === n);
      if (at.length !== 1 || tried >= 2) return null;
      tried += 1;
      const f = await O.ask('AssessmentFeedback', Q_FB, { assessmentId: at[0].id, userId: s.user }, 30 * 60_000);
      const comment = f && f.assessmentFeedback && f.assessmentFeedback.finalComment && f.assessmentFeedback.finalComment.comment;
      const clean = comment ? O.cleanHtml(comment) : '';
      if (clean.replace(/<[^>]+>/g, '').trim()) return { title: at[0].title, html: clean };
    }
    return null;
  }
  const misses = new WeakMap();
  async function add(c) {
    done.add(c.card);
    let fb = null;
    try {
      fb = await find(c);
    } catch {
      // Halo did not answer this time (0.12.9): asked again in a while, three times at most, never left at that.
      const n = (misses.get(c.card) || 0) + 1;
      misses.set(c.card, n);
      if (n <= 3)
        setTimeout(() => {
          done.delete(c.card);
          O.soon();
        }, 4000 * n);
      return;
    }
    if (!fb || !c.block || !c.card.isConnected) return;
    const box = document.createElement('div');
    box.setAttribute('data-haloplus', 'feedback');
    box.className = 'px-0 sm:px-5 py-2 mx-5 sm:mx-0';
    box.innerHTML = `<div class="flex items-center text-xs text-secondary"><button type="button" class="hp-fold text-xs text-secondary" aria-expanded="false">${O.CHEVRON || '›'}<span>Last feedback · ${O.esc(fb.title)}</span></button><span style="margin-left:6px">${O.mark()}</span></div><div class="hp-body my-2 text-sm leading-relaxed text-main" hidden><div class="px-3 py-3 bg-grayF2 rounded">${fb.html}</div></div>`;
    const after = c.card.querySelector('[data-haloplus="rubric"]') || c.block;
    after.after(box);
    const btn = box.querySelector('.hp-fold');
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      box.querySelector('.hp-body').hidden = !open;
      if (open) O.count('feedback-open');
    });
  }
  function pass() {
    let n = 0;
    for (const c of O.cards()) {
      if (n >= MAX_CARDS) break;
      if (c.done || done.has(c.card) || !c.id || !c.block || !L.seriesOf(c.title, typeOf(c.id))) continue;
      n += 1;
      void add(c);
    }
  }
  O.feature({
    id: 'feedback',
    routes: ['unit'],
    start() {
      pass();
    },
    update() {
      pass();
    },
    stop() {
      document.querySelectorAll('[data-haloplus="feedback"]').forEach((n) => n.remove());
    },
  });
})();
