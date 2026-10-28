// Feature 1 (0.12.0): all classes on Halo's calendar. Halo's calendar (a class's "Calendar" page) shows one class; Halo+
// adds "This class | All classes" beside Halo's own "Show 1 Week | 2 Weeks | All", in the same button style. All
// classes draws the same days Halo is showing, with Halo's own calendar styles, every class's work in that class's
// Halo colour (the colour Halo gives it on Student Home), each bar opening the item on Halo. The dates are Halo's: the
// student's own due dates, asked of Halo when the view opens (one question per class, kept ten minutes on this
// computer), bucketed
// into days in Halo's school time zone, the bar from the start day to the due day, as Halo draws its own. A class
// Halo does not answer for is left out and named; with any doubt about the days on screen, nothing is drawn.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  const L = globalThis.HaloPlusOnLogic;
  if (!O || !L) return;
  const Q = 'query StudentAssessmentDetails($courseClassSlugId:String!,$courseUnitId:String){assessmentGrades:getAllClassGrades(courseClassSlugId:$courseClassSlugId courseUnitId:$courseUnitId){...StudentAssessmentDetails_assessmentGrades}}fragment StudentAssessmentDetails_assessmentGrades on UserCourseClassGrade{grades{...StudentAssessmentDetails_assessmentGrades_grades}}fragment StudentAssessmentDetails_assessmentGrades_grades on UserCourseClassAssessmentGrade{assessment{...StudentAssessmentDetails_assessmentGrades_grades_assessment}userLastSeenDate dueDate accommodatedDueDate id status userQuizAssessment{...StudentAssessmentDetails_assessmentGrades_grades_userQuizAssessment}isEverReassigned history{assignmentSubmissionId comment gradeId status points reassignAttachments{modifiedDate resource{active context createdBy createdDate description embedReady id kind modifiedBy modifiedDate name type url}}userCourseClassAssessmentId}}fragment StudentAssessmentDetails_assessmentGrades_grades_assessment on CourseClassAssessment{id title}fragment StudentAssessmentDetails_assessmentGrades_grades_userQuizAssessment on QuizUserCourseClassAssessment{userQuizId accommodatedDuration}';
  const NEED = ['WeeklyCalendar_calendarWrapper', 'sizes_calendarRow', 'DayHeader_header', 'ContentRow_contentRowWrapper', 'ContentRow_contentRow', 'DayContent_content', 'ContentRow_eventContainer', 'WeeklyCalendar_eventBar', 'AssessmentBar_customEventBar', 'WeeklyCalendar_eventInner', 'AssessmentBar_assessmentBarContent', 'AssessmentBar_assessmentBarLeft', 'AssessmentBar_assessmentBarTitle'];
  const DONE = /^(LATE|SUBMITTED|PUBLISHED)$/;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const esc = O.esc;
  let all = false;
  let live = null;
  let liveAt = 0;
  let loading = null;
  let lastSig = '';

  // ---- the days Halo shows ---------------------------------------------------------------------------------------------
  // A day key ("2026-10-21") as a whole number of days and back; midnight UTC, so the two always round-trip.
  const dayNum = (k) => Date.parse(`${k}T00:00:00Z`) / 86_400_000;
  const keyOf = (n) => new Date(n * 86_400_000).toISOString().slice(0, 10);
  const zoneDay = (t, z) => {
    const k = L.dayOf(t, z);
    return k ? dayNum(k) : null;
  };
  /**
   * Halo's visible weeks as day numbers, read from its own day headers ("Tue, Oct 27", or "T" and "27" at 1024px and
   * narrower), placed in the class's own dates. Null when any header cannot be read for certain.
   */
  function haloWeeks(wrap, cls) {
    const z = O.zone();
    const lo = cls && cls.start ? zoneDay(Date.parse(cls.start) - 14 * 86_400_000, z) : null;
    const hi = cls && cls.end ? zoneDay(Date.parse(cls.end) + 14 * 86_400_000, z) : null;
    if (lo == null || hi == null) return null;
    const rows = [...wrap.children].map((w) => [...(w.firstElementChild ? w.firstElementChild.children : [])]);
    if (!rows.length || rows.some((r) => r.length !== 7)) return null;
    const weeks = [];
    for (const r of rows) {
      const first = (r[0].textContent || '').replace(/\s+/g, ' ').trim();
      let m = /^([A-Z][a-z]{2}), ([A-Z][a-z]{2}) (\d{1,2})$/.exec(first);
      let start = null;
      if (m) {
        const cands = [];
        for (let d = lo; d <= hi; d++) {
          const k = keyOf(d);
          if (MONTHS[Number(k.slice(5, 7)) - 1] === m[2] && Number(k.slice(8)) === Number(m[3]) && WEEK[new Date(`${k}T12:00:00Z`).getUTCDay()] === m[1]) cands.push(d);
        }
        if (cands.length === 1) start = cands[0];
      } else if ((m = /^([A-Z]),? ?(\d{1,2})$/.exec(first.replace(/\s/g, '')))) {
        const cands = [];
        for (let d = lo; d <= hi; d++) {
          const k = keyOf(d);
          if (Number(k.slice(8)) === Number(m[2]) && WEEK[new Date(`${k}T12:00:00Z`).getUTCDay()][0] === m[1]) cands.push(d);
        }
        // Each following header must agree: seven days in a row.
        const ok = cands.filter((c) => r.every((cell, i) => Number((/(\d{1,2})\s*$/.exec(cell.textContent || '') || [])[1]) === Number(keyOf(c + i).slice(8))));
        if (ok.length === 1) start = ok[0];
      }
      if (start == null) return null;
      weeks.push([0, 1, 2, 3, 4, 5, 6].map((i) => start + i));
    }
    for (let i = 1; i < weeks.length; i++) if (weeks[i][0] !== weeks[i - 1][0] + 7) return null;
    return weeks;
  }

  // ---- the data ------------------------------------------------------------------------------------------------------------
  // The answers are kept ten minutes on this computer (chrome.storage), so moving between Halo's pages asks nothing new.
  async function kept(idx) {
    try {
      const { haloCalLive } = await chrome.storage.local.get('haloCalLive');
      if (!haloCalLive || Date.now() - haloCalLive.at > 10 * 60_000 || haloCalLive.index !== idx.at) return null;
      const out = {};
      for (const [slug, rows] of Object.entries(haloCalLive.grades)) out[slug] = rows ? new Map(rows.map((r) => [r.assessment.id, r])) : null;
      liveAt = haloCalLive.at;
      return out;
    } catch {
      return null;
    }
  }
  async function refresh(idx) {
    if (loading) return loading;
    if (live && Date.now() - liveAt < 10 * 60_000) return live;
    const k = await kept(idx);
    if (k) return (live = k);
    loading = (async () => {
      const out = {};
      for (const c of idx.classes) {
        try {
          const d = await O.ask('StudentAssessmentDetails', Q, { courseClassSlugId: c.slug, courseUnitId: null }, 10 * 60_000);
          const g = (d.assessmentGrades && d.assessmentGrades[0] && d.assessmentGrades[0].grades) || null;
          if (!Array.isArray(g)) throw new Error('no grades');
          out[c.slug] = new Map(g.filter((x) => x && x.assessment && x.assessment.id).map((x) => [x.assessment.id, x]));
        } catch {
          out[c.slug] = null;
        }
      }
      live = out;
      liveAt = Date.now();
      loading = null;
      try {
        const grades = Object.fromEntries(Object.entries(out).map(([slug, m]) => [slug, m ? [...m.values()].map((r) => ({ assessment: { id: r.assessment.id }, dueDate: r.dueDate || null, status: r.status || null })) : null]));
        await chrome.storage.local.set({ haloCalLive: { at: liveAt, index: idx.at, grades } });
      } catch {
        /* kept for this page only */
      }
      return out;
    })();
    return loading;
  }

  // ---- drawing ----------------------------------------------------------------------------------------------------------------
  function events(idx, grades, z) {
    const out = [];
    idx.classes.forEach((c, k) => {
      const g = grades[c.slug];
      if (!g) return;
      for (const r of idx.rows) {
        if (r.c !== k || !['assignment', 'quiz', 'discussion', 'participation', 'lti'].includes(r.kind) || !r.start) continue;
        const row = g.get(r.id);
        // Halo draws the bar to the student's own due date, else the class's; never the accommodated one.
        const due = (row && row.dueDate) || r.cdue;
        const s = zoneDay(r.start, z);
        const e = due ? zoneDay(due, z) : null;
        if (s == null || e == null || s > e) continue;
        out.push({ c, title: r.title, href: r.href, due, s, e, done: !!(row && DONE.test(row.status || '')) });
      }
    });
    const seen = new Set();
    for (const c of idx.classes)
      for (const h of c.hol || []) {
        const key = `${h.t}|${h.s}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const s = zoneDay(h.s, z);
        if (s != null) out.push({ holiday: true, title: h.t, s, e: s + Math.max(0, (h.n || 1) - 1) });
      }
    out.sort((a, b) => (a.holiday ? 1 : 0) - (b.holiday ? 1 : 0) || String(a.due || '').localeCompare(String(b.due || '')) || a.title.localeCompare(b.title));
    return out;
  }
  function draw(host, weeks, idx, grades) {
    const z = O.zone();
    const K = Object.fromEntries(NEED.concat(['HeaderRow_currentDay', 'ContentRow_currentDay', 'HeaderRow_borderBottom', 'sizes_radiusTopLeft', 'sizes_radiusTopRight', 'AssessmentBar_holidayBar', 'AssessmentBar_pointer', 'OverflowTooltip_overflowStyles']).map((n) => [n, O.cssClass(n) || '']));
    const dur = (n) => O.cssClass(`WeeklyCalendar_duration${n}`) || '';
    const off = (n) => (n ? O.cssClass(`WeeklyCalendar_offset${n}`) || '' : '');
    const today = zoneDay(Date.now(), z);
    const evs = events(idx, grades, z);
    const compact = window.innerWidth <= 1024;
    const head = (d) => {
      const k = keyOf(d);
      const wd = WEEK[new Date(`${k}T12:00:00Z`).getUTCDay()];
      const md = `${MONTHS[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(8))}`;
      return compact ? `<span class="font-semibold">${wd[0]}</span><br><span class="font-extralight">${Number(k.slice(8))}</span>` : `<span class="font-semibold">${wd}, </span><span class="font-extralight">${md}</span>`;
    };
    let html = '';
    weeks.forEach((w, wi) => {
      html += `<div><div class="${K.sizes_calendarRow}">${w.map((d, i) => `<div class="${K.DayHeader_header}${d === today ? ` ${K.HeaderRow_currentDay}` : ''}${wi === 0 && i === 0 ? ` ${K.sizes_radiusTopLeft}` : ''}${wi === 0 && i === 6 ? ` ${K.sizes_radiusTopRight}` : ''}${wi > 0 ? ` ${K.HeaderRow_borderBottom}` : ''}">${head(d)}</div>`).join('')}</div>`;
      html += `<div class="${K.ContentRow_contentRowWrapper}"><div><div class="${K.sizes_calendarRow} ${K.ContentRow_contentRow}">${w.map((d) => `<div class="${K.DayContent_content}${d === today ? ` ${K.ContentRow_currentDay}` : ''}"></div>`).join('')}</div><div class="${K.ContentRow_eventContainer}"><div>`;
      for (const ev of evs) {
        if (ev.e < w[0] || ev.s > w[6]) continue;
        const a = Math.max(ev.s, w[0]) - w[0];
        const b = Math.min(ev.e, w[6]) - w[0];
        const col = ev.holiday ? null : ev.c.col || ev.c.hex;
        const style = col ? `border-left:8px solid ${col};border-right:8px solid ${col};background:color-mix(in srgb, ${col} 16%, var(--hp-surface))` : '';
        const tip = ev.holiday ? ev.title : `${ev.c.code || ev.c.cc} · ${ev.title} · Due ${z ? L.haloFormat(Date.parse(ev.due), z) : ''}`;
        const inner = `<div class="${K.AssessmentBar_customEventBar} ${K.WeeklyCalendar_eventInner} ${ev.holiday ? K.AssessmentBar_holidayBar : ''} ${K.AssessmentBar_pointer}"${style ? ` style="${style}"` : ''}><div class="${K.AssessmentBar_assessmentBarContent}"><div class="${K.AssessmentBar_assessmentBarLeft}"><div class="${K.AssessmentBar_assessmentBarTitle}"><div class="${K.OverflowTooltip_overflowStyles} min-w-0" role="presentation">${ev.done ? '✓ ' : ''}${ev.holiday ? '' : `<b>${esc(ev.c.code || ev.c.cc)}</b> · `}${esc(ev.title)}</div></div></div></div></div>`;
        const cls = `${K.WeeklyCalendar_eventBar} ${dur(b - a + 1)} ${off(a)} relative`;
        html += ev.href ? `<div><a class="${cls}" style="display:block;text-decoration:none;color:inherit" href="${esc(ev.href)}" title="${esc(tip)}">${inner}</a></div>` : `<div><div class="${cls}" title="${esc(tip)}">${inner}</div></div>`;
      }
      html += '</div></div></div></div></div>';
    });
    host.querySelector('.hp-grid').innerHTML = html;
  }

  // ---- the switch beside Halo's "Show" ------------------------------------------------------------------------------------
  function toggleHtml() {
    const opt = (on, v, label) => `<button type="button" data-hp-cal="${v}" aria-pressed="${on}" class="MuiButtonBase-root MuiButton-root MuiButtonGroup-grouped MuiButtonGroup-groupedHorizontal MuiButton-sizeSmall ${on ? 'MuiButton-contained MuiButton-containedSecondary' : 'MuiButton-outlined MuiButton-outlinedSecondary MuiButtonGroup-groupedOutlined MuiButtonGroup-groupedOutlinedHorizontal'}"><span class="MuiButton-label">${label}</span></button>`;
    return `<div role="group" aria-label="Which classes" class="MuiButtonGroup-root">${opt(!all, 'one', 'This class')}${opt(all, 'all', 'All classes')}</div><span class="text-secondary" style="margin-left:6px;font-size:13px">${O.mark()}</span>`;
  }
  function remember() {
    if (!O.enabled('views')) return;
    try {
      void chrome.storage.local.get('haloViews').then(({ haloViews }) => chrome.storage.local.set({ haloViews: { ...(haloViews || {}), calAll: all } }));
    } catch {
      /* the extension was updated under this page */
    }
  }
  // The saved choice is read once per page, and every pass waits for that one read.
  let savedP = null;
  let applied = false;
  let cssTries = 0;
  function saved() {
    if (!savedP)
      savedP = (async () => {
        try {
          const { haloViews } = await chrome.storage.local.get('haloViews');
          return !!(haloViews && haloViews.calAll === true);
        } catch {
          return false;
        }
      })();
    return savedP.then((v) => {
      // Applied once per page, and only while remembering view choices is on.
      if (!applied && v && O.enabled('views')) all = true;
      applied = true;
    });
  }

  // One pass at a time; a change during a pass runs one more after it.
  let busy = false;
  let again = false;
  async function pass() {
    if (busy) return void (again = true);
    busy = true;
    try {
      await draw1();
    } finally {
      busy = false;
      if (again) {
        again = false;
        void pass();
      }
    }
  }
  async function draw1() {
    const paper = document.getElementById('calendar-container');
    const wrap = paper && paper.querySelector('#guide_anchor_dashboard_calendar');
    const row = paper && paper.firstElementChild;
    const idx = O.st.haloIndex;
    if (!paper || !wrap || !row || !idx || !Array.isArray(idx.classes) || idx.classes.length < 2) return clear();
    if (NEED.some((n) => !O.cssClass(n))) {
      // Halo's calendar stylesheet can still be on its way: look again shortly, a few times, then leave it.
      if (cssTries < 6) {
        cssTries += 1;
        setTimeout(() => O.soon(), 1200);
      }
      return clear();
    }
    await saved();
    let sw = row.querySelector('[data-haloplus="calendar-switch"]');
    if (!sw) {
      sw = document.createElement('div');
      sw.setAttribute('data-haloplus', 'calendar-switch');
      sw.className = 'flex items-center ml-4';
      row.appendChild(sw);
      sw.addEventListener('click', (e) => {
        const b = e.target.closest('[data-hp-cal]');
        if (!b) return;
        all = b.getAttribute('data-hp-cal') === 'all';
        remember();
        if (all) O.count('calendar-all', false);
        lastSig = '';
        void pass();
      });
    }
    // Redrawn only when the choice changes (Better Halo restyles Halo's buttons, so the HTML is not a fair test).
    if (sw.dataset.state !== (all ? 'all' : 'one') || sw.querySelectorAll('[data-hp-cal]').length !== 2) {
      sw.innerHTML = toggleHtml();
      sw.dataset.state = all ? 'all' : 'one';
    }
    let host = paper.querySelector('[data-haloplus="calendar-all"]');
    if (!all) {
      wrap.style.removeProperty('display');
      if (host) host.remove();
      return;
    }
    const r = O.route();
    const cls = idx.classes.find((c) => c.slug === r.slug);
    const weeks = haloWeeks(wrap, cls);
    if (!weeks) {
      wrap.style.removeProperty('display');
      if (host) host.remove();
      return;
    }
    if (!host) {
      host = document.createElement('div');
      host.setAttribute('data-haloplus', 'calendar-all');
      host.innerHTML = `<div class="hp-legend flex flex-wrap items-center text-sm text-secondary" style="gap:4px 14px;margin:0 0 10px"></div><div class="${O.cssClass('WeeklyCalendar_calendarWrapper')} hp-grid"></div>`;
      wrap.after(host);
    }
    wrap.style.display = 'none';
    const grades = await refresh(idx);
    // Halo redrew its calendar while Halo's answers were coming: start again on the new one.
    if (!paper.isConnected || !host.isConnected) return void (again = true);
    const sig = `${weeks.map((w) => w[0]).join(',')}|${liveAt}|${window.innerWidth <= 1024}`;
    const legend = idx.classes.map((c) => `<span class="inline-flex items-center" style="gap:6px"><span style="width:10px;height:10px;border-radius:50%;background:${c.col || c.hex};display:inline-block"></span>${esc(c.code || c.cc)}${grades[c.slug] ? '' : ' <span>(Halo did not answer)</span>'}</span>`).join('');
    const lg = host.querySelector('.hp-legend');
    if (lg.dataset.sig !== legend || !lg.firstElementChild) {
      lg.innerHTML = legend;
      lg.dataset.sig = legend;
    }
    if (sig === lastSig) return;
    lastSig = sig;
    draw(host, weeks, idx, grades);
  }
  function clear() {
    document.querySelectorAll('[data-haloplus="calendar-switch"], [data-haloplus="calendar-all"]').forEach((n) => n.remove());
    const wrap = document.getElementById('guide_anchor_dashboard_calendar');
    if (wrap) wrap.style.removeProperty('display');
  }
  O.feature({
    id: 'calendar',
    routes: ['class'],
    start() {
      void pass();
    },
    update() {
      void pass();
    },
    stop() {
      clear();
      all = false;
      savedP = null;
      applied = false;
      cssTries = 0;
      lastSig = '';
    },
  });
})();
