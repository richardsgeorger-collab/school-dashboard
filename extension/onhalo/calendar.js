// Feature 1: all classes on one calendar. Halo's calendar (a class's "Calendar" page) shows one class; Halo+ adds "This
// class | All classes" beside Halo's own "Show 1 Week | 2 Weeks | All", in the same button style, and (0.12.1) a
// "Calendar" tab on Student Home (homecal.js), both drawn here. Every class's work shows on its due day as a chip in
// that class's Halo colour (the colour Halo gives it on Student Home), each opening the item on Halo. The dates are
// Halo's: the student's own due dates, asked of Halo when the view opens (one question per class, kept ten minutes on
// this computer), placed in days in Halo's school time zone. A class Halo does not answer for is left out and named;
// with any doubt about the days on screen, nothing is drawn.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  const L = globalThis.HaloPlusOnLogic;
  if (!O || !L) return;
  const Q = 'query StudentAssessmentDetails($courseClassSlugId:String!,$courseUnitId:String){assessmentGrades:getAllClassGrades(courseClassSlugId:$courseClassSlugId courseUnitId:$courseUnitId){...StudentAssessmentDetails_assessmentGrades}}fragment StudentAssessmentDetails_assessmentGrades on UserCourseClassGrade{grades{...StudentAssessmentDetails_assessmentGrades_grades}}fragment StudentAssessmentDetails_assessmentGrades_grades on UserCourseClassAssessmentGrade{assessment{...StudentAssessmentDetails_assessmentGrades_grades_assessment}userLastSeenDate dueDate accommodatedDueDate id status userQuizAssessment{...StudentAssessmentDetails_assessmentGrades_grades_userQuizAssessment}isEverReassigned history{assignmentSubmissionId comment gradeId status points reassignAttachments{modifiedDate resource{active context createdBy createdDate description embedReady id kind modifiedBy modifiedDate name type url}}userCourseClassAssessmentId}}fragment StudentAssessmentDetails_assessmentGrades_grades_assessment on CourseClassAssessment{id title}fragment StudentAssessmentDetails_assessmentGrades_grades_userQuizAssessment on QuizUserCourseClassAssessment{userQuizId accommodatedDuration}';
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

  // ---- drawing (0.12.1) ----------------------------------------------------------------------------------------------------
  // George, 2026-10-28: the bars across the week were "overwhelming and disorganized". Each item now shows only on its
  // due day, as a small chip in its class's colour: the class code (never cut), a short title (the full one on hover)
  // and Halo's time. Graded work first, then by time; at most five a day and "+N more"; participation folded into one
  // line a day; done work faded with a check; work with no submission in Halo that has passed goes quiet. The grid is
  // Halo's own calendar (its day headers, cells, today's colours, as its stylesheet draws them, on Halo's variables, so
  // Better Halo's themes recolour it as they recolour Halo's).
  const MAX_A_DAY = 5;
  const headHtml = (d, compact) => {
    const k = keyOf(d);
    const wd = WEEK[new Date(`${k}T12:00:00Z`).getUTCDay()];
    return compact ? `<span class="font-semibold">${wd[0]}</span><br><span class="font-extralight">${Number(k.slice(8))}</span>` : `<span class="font-semibold">${wd}, </span><span class="font-extralight">${MONTHS[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(8))}</span>`;
  };
  function chip(i) {
    const tip = `${i.code} · ${i.title} · Due ${i.full}${i.done ? ' · Done' : i.over ? ' · Past due' : ''}`;
    const cls = `hp-chip${i.done ? ' hp-done' : ''}${i.quiet ? ' hp-quiet' : ''}${i.over ? ' hp-over' : ''}`;
    const inner = `<span class="hp-code">${i.done ? '<span class="hp-check" aria-label="Done">✓</span>' : ''}${esc(i.code)}</span><span class="hp-ttl">${esc(i.short)}</span><span class="hp-time">${esc(i.time)}</span>`;
    const style = i.col ? ` style="--c:${esc(i.col)}"` : '';
    return i.href ? `<a class="${cls}" href="${esc(i.href)}" title="${esc(tip)}" data-id="${esc(i.id)}"${style}>${inner}</a>` : `<span class="${cls}" title="${esc(tip)}" data-id="${esc(i.id)}"${style}>${inner}</span>`;
  }
  function dayHtml(d, info, today) {
    const k = keyOf(d);
    let h = '';
    for (const t of (info && info.hol) || []) h += `<div class="hp-hol" title="${esc(t)}">${esc(t)}</div>`;
    const items = (info && info.items) || [];
    items.forEach((i, n) => {
      h += n < MAX_A_DAY ? chip(i) : chip(i).replace(/^<(a|span) class="hp-chip/, '<$1 class="hp-chip hp-extra');
    });
    if (items.length > MAX_A_DAY) h += `<button type="button" class="hp-more" aria-expanded="false">+${items.length - MAX_A_DAY} more</button>`;
    const part = (info && info.part) || [];
    if (part.length) h += `<div class="hp-part"><button type="button" class="hp-ptog" aria-expanded="false">${O.CHEVRON}<span>${part.length} participation</span></button><div class="hp-plist" hidden>${part.map(chip).join('')}</div></div>`;
    return `<div class="hp-day${d === today ? ' hp-today' : ''}" data-day="${k}">${h}</div>`;
  }
  /** Halo's calendar grid for these weeks (arrays of seven day numbers), with each day's chips. */
  function gridHtml(weeks, days, { compact = window.innerWidth <= 1024 } = {}) {
    const today = zoneDay(Date.now(), O.zone());
    return weeks
      .map((w, wi) => `<div class="hp-week"><div class="hp-row hp-heads${wi ? ' hp-later' : ''}">${w.map((d) => `<div class="hp-dh${d === today ? ' hp-today' : ''}">${headHtml(d, compact)}</div>`).join('')}</div><div class="hp-row hp-days">${w.map((d) => dayHtml(d, days.get(keyOf(d)), today)).join('')}</div></div>`)
      .join('');
  }
  // ---- each class's real Halo colour (0.12.2) -----------------------------------------------------------------------------
  // The stripe on top of each class's card on Student Home, as drawn (Halo's own colour, or Better Halo's, whatever the
  // page shows), read there and kept on this computer for the class calendars; per look (plain, or a Better Halo theme),
  // since a theme redraws the stripes. On Halo's white page the bold version of it (logic.js boldColor); under a dark
  // theme as it is. Without a reading, Halo's own colour for the class (the same hash Halo uses).
  const themeKey = () => `${document.documentElement.getAttribute('data-better-halo-theme') || ''}|${document.documentElement.classList.contains('dark') ? 'dark' : 'light'}`;
  const darkTheme = () => !!document.documentElement.getAttribute('data-better-halo-theme') && document.documentElement.classList.contains('dark');
  let stripes = null;
  let stripesKey = '';
  async function loadStripes() {
    const k = themeKey();
    if (stripes && stripesKey === k) return stripes;
    stripesKey = k;
    try {
      const { haloCardColors } = await chrome.storage.local.get('haloCardColors');
      stripes = (haloCardColors && haloCardColors[k]) || {};
    } catch {
      stripes = {};
    }
    return stripes;
  }
  /** A colour as Halo writes it on the card ("#522398" or "var(--lms-colorClassCardPurple)"), as a colour. */
  function ownColor(v) {
    const t = String(v || '').trim();
    if (/^(#[0-9a-f]{6}|rgb)/i.test(t)) return t;
    const m = /^var\((--[\w-]+)(?:,\s*([^)]+))?\)$/.exec(t);
    if (!m) return null;
    const got = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
    return got || (m[2] ? m[2].trim() : null);
  }
  /** Student Home: each card's stripe, by the class it opens. Kept when it changed. */
  async function readStripes() {
    const found = {};
    for (const card of document.querySelectorAll('[class*="CourseCard_cardContainer"]')) {
      const a = card.querySelector('a[href^="/courses/"]');
      const m = a && /^\/courses\/([^/?#]+)/.exec(a.getAttribute('href') || '');
      if (!m) continue;
      const cs = getComputedStyle(card);
      let col = parseFloat(cs.borderTopWidth) >= 2 ? cs.borderTopColor : null;
      // A theme that draws no stripe (Better Halo's): the colour Halo gave the card (its own style on the card).
      if (!col) col = ownColor(card.style.borderTopColor);
      if (col && /^(rgb|#)/.test(col)) found[decodeURIComponent(m[1])] = col;
    }
    if (!Object.keys(found).length) return;
    const k = themeKey();
    const have = await loadStripes();
    if (JSON.stringify(have) === JSON.stringify({ ...have, ...found })) return;
    stripes = { ...have, ...found };
    try {
      const { haloCardColors } = await chrome.storage.local.get('haloCardColors');
      await chrome.storage.local.set({ haloCardColors: { ...(haloCardColors || {}), [k]: stripes } });
    } catch {
      /* this page only */
    }
  }
  function colorOf(c) {
    const real = stripes && stripes[c.slug];
    return L.boldColor(real || c.hex, darkTheme()) || c.col || c.hex;
  }
  /** The index with each class in its colour for the calendar. */
  const colored = (idx) => ({ ...idx, classes: idx.classes.map((c) => ({ ...c, col: colorOf(c) })) });
  function legendHtml(idx, grades) {
    return colored(idx).classes.map((c) => `<span class="hp-key"><span class="hp-dot" style="background:${esc(c.col)}"></span>${esc(c.code || c.cc)}${grades[c.slug] ? '' : ' <span>(Halo did not answer)</span>'}</span>`).join('');
  }
  /** Halo's answers as calendar days: Halo+ check-offs count as done, and work with no submission in Halo goes quiet. */
  function daysFor(idx, grades) {
    const doneIds = new Set();
    const quietIds = new Set();
    for (const i of (O.view && O.view.items) || []) {
      if (!i.h) continue;
      if (i.done === 1) doneIds.add(i.h);
      if (i.ns === 1) quietIds.add(i.h);
    }
    return L.calendarDays(colored(idx), grades, O.zone(), Date.now(), { doneIds, quietIds });
  }
  /** "+N more" and the participation line open in place. */
  function bindGrid(el) {
    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('click', (e) => {
      const more = e.target.closest('.hp-more');
      if (more) {
        const day = more.closest('.hp-day');
        const open = !day.classList.contains('hp-open');
        day.classList.toggle('hp-open', open);
        more.setAttribute('aria-expanded', String(open));
        more.textContent = open ? 'Show less' : `+${day.querySelectorAll('.hp-extra').length} more`;
        return;
      }
      const tog = e.target.closest('.hp-ptog');
      if (tog) {
        const open = tog.getAttribute('aria-expanded') !== 'true';
        tog.setAttribute('aria-expanded', String(open));
        tog.nextElementSibling.hidden = !open;
      }
    });
  }

  // ---- the switch beside Halo's "Show" ------------------------------------------------------------------------------------
  function toggleHtml() {
    const opt = (on, v, label) => `<button type="button" data-hp-cal="${v}" aria-pressed="${on}" class="MuiButtonBase-root MuiButton-root MuiButtonGroup-grouped MuiButtonGroup-groupedHorizontal MuiButton-sizeSmall ${on ? 'MuiButton-contained MuiButton-containedSecondary' : 'MuiButton-outlined MuiButton-outlinedSecondary MuiButtonGroup-groupedOutlined MuiButtonGroup-groupedOutlinedHorizontal'}"><span class="MuiButton-label">${label}</span></button>`;
    return `<div role="group" aria-label="Which classes" class="MuiButtonGroup-root">${opt(!all, 'one', 'This class')}${opt(all, 'all', 'All classes')}</div><span class="text-secondary" style="margin-left:6px;font-size:13px">${O.mark()}</span>`;
  }
  /** Kept for the next visit (feature 14), only while remembering view choices is on: this switch, or `o` (Home's). */
  function remember(o) {
    if (!O.enabled('views')) return;
    try {
      void chrome.storage.local.get('haloViews').then(({ haloViews }) => chrome.storage.local.set({ haloViews: { ...(haloViews || {}), ...(o || { calAll: all }) } }));
    } catch {
      /* the extension was updated under this page */
    }
  }
  // The saved choice is read once per page, and every pass waits for that one read.
  let savedP = null;
  let applied = false;
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
      host.className = 'hp-cal';
      host.innerHTML = '<div class="hp-legend"></div><div class="hp-grid"></div>';
      wrap.after(host);
      bindGrid(host);
    }
    wrap.style.display = 'none';
    const grades = await refresh(idx);
    await loadStripes();
    // Halo redrew its calendar while Halo's answers were coming: start again on the new one.
    if (!paper.isConnected || !host.isConnected) return void (again = true);
    const sig = `${weeks.map((w) => w[0]).join(',')}|${liveAt}|${window.innerWidth <= 1024}|${themeKey()}|${JSON.stringify(stripes)}`;
    const legend = legendHtml(idx, grades);
    const lg = host.querySelector('.hp-legend');
    if (lg.dataset.sig !== legend || !lg.firstElementChild) {
      lg.innerHTML = legend;
      lg.dataset.sig = legend;
    }
    if (sig === lastSig) return;
    lastSig = sig;
    host.querySelector('.hp-grid').innerHTML = gridHtml(weeks, daysFor(idx, grades));
  }
  function clear() {
    document.querySelectorAll('[data-haloplus="calendar-switch"], [data-haloplus="calendar-all"]').forEach((n) => n.remove());
    const wrap = document.getElementById('guide_anchor_dashboard_calendar');
    if (wrap) wrap.style.removeProperty('display');
  }
  // Halo redraws its calendar when the window is resized (compact day headers at 1024px and narrower); so does Halo+.
  let resizeT = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => {
      if (document.querySelector('[data-haloplus="calendar-all"], [data-haloplus="home-calendar"]')) O.soon();
    }, 500);
  });
  O.cal = { refresh, gridHtml, legendHtml, daysFor, bindGrid, loadStripes, readStripes, themeKey, get stripes() { return stripes; }, dayNum, keyOf, zoneDay, saveView: (o) => remember(o) };
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
      lastSig = '';
    },
  });
})();
