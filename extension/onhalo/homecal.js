// Feature 1 on Student Home. 0.12.2 (George, after testing 0.12.1: the calendar belongs where every student sees it
// without it crowding the page): its own section below Halo's class cards, "Calendar · All classes", in Halo's page
// header style, folding (the fold is kept), a week at a time from this week (1 Week / 2 Weeks kept with "Remember view
// choices"), arrows and This week. The "This week" bar's "Calendar" link scrolls to it. Every class's work on one
// calendar, drawn by calendar.js (chips on their due days in Halo's calendar grid), each class in the colour of the
// stripe on its own card. Only under Halo's Current Classes; Halo's dates, asked of Halo when the section is open (one
// question per class, kept ten minutes on this computer, shared with the class calendars).
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
    // Right after Halo's class list (Halo mounts a new list when its tabs change).
    if (section.nextElementSibling !== h) section.after(h);
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
  async function draw() {
    const h = ensureHost();
    if (!h) return;
    h.hidden = !currentTab();
    if (h.hidden) return;
    // Each card's colour, read while the cards are on the page (kept for the class calendars too).
    await O.cal.readStripes();
    if (!open) return;
    const idx = O.st.haloIndex;
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
    if (!grid.firstElementChild) {
      st.hidden = false;
      st.textContent = 'Getting your due dates from Halo…';
    }
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
      st.hidden = false;
      st.textContent = 'Halo did not send your due dates just now. Fold and open this again in a moment.';
      return;
    }
    st.hidden = true;
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
  function teardown() {
    document.querySelectorAll('[data-haloplus="home-calendar"]').forEach((n) => n.remove());
    lastKey = '';
  }
  O.feature({
    id: 'calendar-home',
    switch: 'calendar',
    routes: ['home'],
    start() {
      if (O.cal) void pass();
    },
    update() {
      if (O.cal) void pass();
    },
    stop() {
      teardown();
      savedP = null;
      offset = 0;
      weeksN = 1;
      open = true;
    },
  });
})();
