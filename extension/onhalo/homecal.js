// Feature 1 on Student Home. 0.12.2 (George, after testing 0.12.1: the calendar belongs where every student sees it
// without it crowding the page): its own section below Halo's class cards, "Calendar · All classes", in Halo's page
// header style, folding (the fold is kept), a week at a time from this week (1 Week / 2 Weeks kept with "Remember view
// choices"), arrows and This week. The "This week" bar's "Calendar" link scrolls to it. Every class's work on one
// calendar, drawn by calendar.js (chips on their due days in Halo's calendar grid), each class in the colour of the
// stripe on its own card. Only under Halo's Current Classes; Halo's dates, asked of Halo on Student Home (one question
// per class, kept ten minutes on this computer, shared with the class calendars).
// 0.12.3 (George: "make the calendar seen"): a slim week strip right under the This week bar, seven small day boxes
// (Monday to Sunday) with a dot in its class's colour for each thing due that day (hollow once done), today marked;
// a day opens the calendar below on that day's week, scrolls to it and marks the day. About one line tall.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  if (!O) return;
  const ARROW_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"></path></svg>';
  const ARROW_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"></path></svg>';
  // Halo's own "Event" icon (its class calendar's page title).
  const EVENT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"></path></svg>';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let open = true;
  let weeksN = 1;
  let offset = 0;
  let savedP = null;
  let lastKey = '';
  let busy = false;
  let again = false;

  const main = () => document.getElementById('Home--main');
  /** Halo's Current Classes tab is the one shown (the calendar is about the current classes). */
  function currentTab() {
    const m = main();
    const list = m && m.querySelector('[role="tablist"]');
    const first = list && list.querySelector('[role="tab"]');
    return !!(first && first.getAttribute('aria-selected') === 'true');
  }
  const hasIndex = () => {
    const idx = O.st.haloIndex;
    return !!(idx && Array.isArray(idx.classes) && idx.classes.length);
  };

  // ---- the section --------------------------------------------------------------------------------------------------------
  function headHtml() {
    return `<button type="button" class="hp-sec-head" aria-expanded="${open}" aria-controls="hp-home-cal-body"><span class="hp-sec-icon">${EVENT}</span><h2 class="hp-sec-title">Calendar <span class="hp-sec-sub">· All classes</span></h2><span class="hp-sec-mark">${O.mark()}</span><span class="hp-sec-chev">${O.CHEVRON}</span></button>`;
  }
  function ensureHost() {
    const m = main();
    const section = m && [...m.querySelectorAll(':scope > section')].pop();
    if (!section) return null;
    let h = m.querySelector(':scope > [data-haloplus="home-calendar"]');
    if (!h) {
      h = document.createElement('div');
      h.setAttribute('data-haloplus', 'home-calendar');
      h.id = 'hp-home-calendar';
      h.className = 'hp-sec';
      h.innerHTML = `${headHtml()}<div class="hp-sec-body MuiPaper-root py-6 px-4 MuiPaper-elevation3 MuiPaper-rounded" id="hp-home-cal-body"${open ? '' : ' hidden'}><div class="hp-bar"></div><div class="hp-cal"><div class="hp-legend"></div><div class="hp-status" hidden></div><div class="hp-grid"></div></div></div>`;
      h.addEventListener('click', (e) => {
        if (e.target.closest('.hp-sec-head')) return void setOpen(!open, true);
        const mv = e.target.closest('[data-hp-move]');
        if (mv) {
          const n = Number(mv.getAttribute('data-hp-move'));
          offset = n === 0 ? 0 : offset + n;
          lastKey = '';
          return void pass();
        }
        const wk = e.target.closest('[data-hp-weeks]');
        if (wk) {
          weeksN = Number(wk.getAttribute('data-hp-weeks')) === 2 ? 2 : 1;
          O.cal.saveView({ homeWeeks: weeksN });
          lastKey = '';
          void pass();
        }
      });
      // The "This week" bar's Calendar link opens it if folded (the bar scrolls to it).
      h.addEventListener('hp-open', () => {
        if (!open) setOpen(true, true);
      });
      O.cal.bindGrid(h.querySelector('.hp-cal'));
    }
    // Right after Halo's class list (Halo mounts a new list when its tabs change), after the "Past classes" link when
    // the compact Student Home has one there.
    const past = section.nextElementSibling && section.nextElementSibling.getAttribute('data-haloplus') === 'past-link' ? section.nextElementSibling : null;
    const at = past || section;
    if (at.nextElementSibling !== h) at.after(h);
    return h;
  }
  function setOpen(v, save) {
    open = v;
    const h = document.querySelector('[data-haloplus="home-calendar"]');
    if (h) {
      h.querySelector('.hp-sec-head').setAttribute('aria-expanded', String(open));
      h.querySelector('.hp-sec-body').hidden = !open;
    }
    if (save)
      try {
        void chrome.storage.local.set({ haloCalFold: { open, at: new Date().toISOString() } });
      } catch {
        /* this page only */
      }
    if (open) {
      O.count('calendar-all', false);
      lastKey = '';
      void pass();
    }
  }

  // ---- the week strip (0.12.3) ------------------------------------------------------------------------------------------------
  const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const MAX_DOTS = 5;
  function stripHtml(mon, days) {
    const today = O.cal.zoneDay(Date.now(), O.zone());
    const boxes = WEEK.map((w, i) => {
      const d = mon + i;
      const k = O.cal.keyOf(d);
      const items = ((days.get(k) || {}).items || []).filter((x) => !x.quiet);
      const open = items.filter((x) => !x.done).length;
      const dots = items.slice(0, MAX_DOTS).map((x) => `<i class="${x.done ? 'hp-dd' : ''}" style="--c:${O.esc(x.col || '')}" title="${O.esc(`${x.code} · ${x.title}${x.done ? ' · done' : ''}`)}"></i>`).join('');
      const more = items.length > MAX_DOTS ? `<b>+${items.length - MAX_DOTS}</b>` : '';
      const said = items.length ? `${open ? `${open} due` : 'all done'}${items.length - open && open ? `, ${items.length - open} done` : ''}` : 'nothing due';
      return `<button type="button" class="hp-sd${d === today ? ' hp-sd-today' : ''}" data-day="${k}" aria-label="${w} ${Number(k.slice(8))}: ${said}. Open the calendar on this day."><span class="hp-sd-d"><span class="hp-sd-w">${w}</span> ${Number(k.slice(8))}</span><span class="hp-sd-dots">${dots}${more}</span></button>`;
    }).join('');
    return `${boxes}<span class="hp-sd-mark">${O.mark()}</span>`;
  }
  function ensureStrip() {
    const week = document.querySelector('[data-haloplus="week"]');
    let st = document.querySelector('[data-haloplus="week-strip"]');
    if (!week) {
      if (st) st.remove();
      return null;
    }
    if (!st) {
      st = document.createElement('div');
      st.setAttribute('data-haloplus', 'week-strip');
      st.setAttribute('role', 'group');
      st.setAttribute('aria-label', 'This week on the calendar');
      st.addEventListener('click', (e) => {
        const b = e.target.closest('[data-day]');
        if (b) goTo(b.getAttribute('data-day'));
      });
    }
    if (week.nextElementSibling !== st) week.after(st);
    return st;
  }
  /** The calendar below, open on the week of `day`, scrolled into view, the day marked for a moment. */
  function goTo(day) {
    const mon = thisMonday();
    if (mon == null) return;
    const d = O.cal.dayNum(day);
    offset = Math.floor((d - mon) / 7);
    O.count('calendar-all', false);
    if (!open) setOpen(true, true);
    lastKey = '';
    const settle = async () => {
      while (busy) await new Promise((r) => setTimeout(r, 40));
      await pass();
    };
    void settle().then(() => {
      const h = document.querySelector('[data-haloplus="home-calendar"]');
      if (!h) return;
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      h.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
      const cell = h.querySelector(`.hp-day[data-day="${day}"]`);
      if (cell) {
        cell.classList.add('hp-flash');
        setTimeout(() => cell.classList.remove('hp-flash'), 1800);
      }
    });
  }

  // ---- the calendar -------------------------------------------------------------------------------------------------------
  function thisMonday() {
    const today = O.cal.zoneDay(Date.now(), O.zone());
    if (today == null) return null;
    const wd = new Date(`${O.cal.keyOf(today)}T12:00:00Z`).getUTCDay();
    return today - ((wd + 6) % 7);
  }
  const label = (d) => {
    const k = O.cal.keyOf(d);
    return `${MONTHS[Number(k.slice(5, 7)) - 1]} ${Number(k.slice(8))}`;
  };
  function barHtml(first, last) {
    const btn = (on, v, text) => `<button type="button" data-hp-weeks="${v}" aria-pressed="${on}" class="MuiButtonBase-root MuiButton-root MuiButton-sizeSmall ${on ? 'MuiButton-contained MuiButton-containedSecondary' : 'MuiButton-outlined MuiButton-outlinedSecondary'}"><span class="MuiButton-label">${text}</span></button>`;
    return `<button type="button" class="hp-arrow" data-hp-move="-1" aria-label="Previous week">${ARROW_L}</button><button type="button" class="hp-arrow" data-hp-move="1" aria-label="Next week">${ARROW_R}</button><span class="hp-range">${label(first)} – ${label(last)}, ${O.cal.keyOf(last).slice(0, 4)}</span>${offset ? '<button type="button" data-hp-move="0" class="MuiButtonBase-root MuiButton-root MuiButton-outlined MuiButton-outlinedSecondary MuiButton-sizeSmall"><span class="MuiButton-label">This week</span></button>' : ''}<span class="hp-sp"></span><span class="text-secondary text-sm">Show</span><span class="hp-group" role="group" aria-label="How many weeks">${btn(weeksN === 1, 1, '1 Week')}${btn(weeksN === 2, 2, '2 Weeks')}</span>`;
  }
  /** The section's one line of status, written only when it changes. */
  function say(st, text) {
    if (st.textContent !== text) st.textContent = text;
    if (st.hidden) st.hidden = false;
  }
  async function draw() {
    const h = ensureHost();
    if (!h) return;
    h.hidden = !currentTab();
    const strip = h.hidden ? null : ensureStrip();
    if (h.hidden) {
      document.querySelectorAll('[data-haloplus="week-strip"]').forEach((n) => n.remove());
      return;
    }
    // Each card's colour, read while the cards are on the page (kept for the class calendars too).
    await O.cal.readStripes();
    const idx = O.st.haloIndex;
    if (strip) {
      const mon0 = thisMonday();
      const g0 = await O.cal.refresh(idx);
      if (mon0 != null && Object.values(g0).some(Boolean) && strip.isConnected) {
        const html = stripHtml(mon0, O.cal.daysFor(idx, g0));
        if (strip.dataset.html !== html) {
          strip.innerHTML = html;
          strip.dataset.html = html;
        }
      }
    }
    if (!open) return;
    const mon = thisMonday();
    const st = h.querySelector('.hp-status');
    const grid = h.querySelector('.hp-grid');
    if (mon == null) return;
    const first = mon + offset * 7;
    const weeks = Array.from({ length: weeksN }, (_, w) => [0, 1, 2, 3, 4, 5, 6].map((i) => first + w * 7 + i));
    const bar = h.querySelector('.hp-bar');
    const barNow = barHtml(weeks[0][0], weeks[weeks.length - 1][6]);
    if (bar.dataset.html !== barNow) {
      bar.innerHTML = barNow;
      bar.dataset.html = barNow;
    }
    if (!grid.firstElementChild) say(st, 'Getting your due dates from Halo…');
    const grades = await O.cal.refresh(idx);
    if (!h.isConnected || !open) return;
    const legend = O.cal.legendHtml(idx, grades);
    const lg = h.querySelector('.hp-legend');
    if (lg.dataset.html !== legend) {
      lg.innerHTML = legend;
      lg.dataset.html = legend;
    }
    if (!Object.values(grades).some(Boolean)) {
      grid.innerHTML = '';
      say(st, 'Halo did not send your due dates just now. Asking again in a moment…');
      return;
    }
    if (!st.hidden) st.hidden = true;
    const key = `${first}|${weeksN}|${window.innerWidth <= 1024}|${O.cal.themeKey()}|${JSON.stringify(O.cal.stripes)}|${JSON.stringify(Object.values(grades).map((g) => (g ? g.size : -1)))}`;
    if (key === lastKey && grid.firstElementChild) return;
    lastKey = key;
    grid.innerHTML = O.cal.gridHtml(weeks, O.cal.daysFor(idx, grades));
  }
  async function pass() {
    if (busy) return void (again = true);
    busy = true;
    try {
      if (!hasIndex()) return void teardown();
      await saved();
      await draw();
    } finally {
      busy = false;
      if (again) {
        again = false;
        void pass();
      }
    }
  }
  // The fold and the weeks, read once per visit to Student Home.
  function saved() {
    if (!savedP)
      savedP = (async () => {
        try {
          const { haloViews, haloCalFold } = await chrome.storage.local.get(['haloViews', 'haloCalFold']);
          if (haloCalFold && typeof haloCalFold.open === 'boolean') open = haloCalFold.open;
          if (O.enabled('views') && haloViews && (haloViews.homeWeeks === 1 || haloViews.homeWeeks === 2)) weeksN = haloViews.homeWeeks;
        } catch {
          /* defaults */
        }
      })();
    return savedP;
  }
  /** The This week bar was (re)placed (Halo redrew Student Home): the strip goes back under it. */
  function onWeek() {
    if (O.cal) void pass();
  }
  function teardown() {
    document.querySelectorAll('[data-haloplus="home-calendar"], [data-haloplus="week-strip"]').forEach((n) => n.remove());
    lastKey = '';
  }
  O.feature({
    id: 'calendar-home',
    switch: 'calendar',
    routes: ['home'],
    start() {
      document.addEventListener('haloplus-week-placed', onWeek);
      if (O.cal) void pass();
    },
    update() {
      if (O.cal) void pass();
    },
    stop() {
      document.removeEventListener('haloplus-week-placed', onWeek);
      teardown();
      savedP = null;
      offset = 0;
      weeksN = 1;
      open = true;
    },
  });
})();
