// Feature 1 on Student Home (0.12.1, George 2026-10-28: "add a CALENDAR tab on Student Home next to Halo's CURRENT
// CLASSES / PAST CLASSES tabs, in the exact same tab style. That's the main home for it."). A "Calendar" tab at the end
// of Halo's own tab row, made from Halo's own tab button (its classes copied from Halo's tabs, so Halo's look and Better
// Halo's restyling both apply). Open, it shows every class's work on one calendar (calendar.js draws it: chips on their
// due days in Halo's calendar grid), a week or two at a time, from this week; Halo's class list is hidden while it is
// open and Halo's own tabs bring it back. The last tab and 1 Week / 2 Weeks are kept for the next visit while
// "Remember view choices" is on. Halo's dates: asked of Halo when the tab opens (one question per class, kept ten
// minutes on this computer, shared with the class calendars).
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  if (!O) return;
  const ARROW_L = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"></path></svg>';
  const ARROW_R = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"></path></svg>';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let active = false;
  let weeksN = 2;
  let offset = 0;
  let swapped = [];
  let savedP = null;
  let applied = false;
  let lastKey = '';
  let busy = false;
  let again = false;

  const main = () => document.getElementById('Home--main');
  const tablist = () => {
    const m = main();
    return m && m.querySelector('[role="tablist"]');
  };
  const haloTabs = (list) => [...list.querySelectorAll('[role="tab"]:not([data-haloplus])')];

  // ---- the tab ------------------------------------------------------------------------------------------------------------
  /** Halo's tab classes, read from Halo's own tabs (the selected one's and the others'). */
  function tabClasses(list) {
    const tabs = haloTabs(list);
    const on = O.cssClass('Tab_activeTab');
    const off = O.cssClass('Tab_tab');
    const sel = tabs.find((b) => (on && b.classList.contains(on)) || (!swapped.length && b.getAttribute('aria-selected') === 'true')) || tabs[0];
    const other = tabs.find((b) => b !== sel);
    const activeCls = sel ? sel.className : '';
    const inactiveCls = other ? other.className : on && off ? activeCls.replace(on, off) : activeCls;
    return { activeCls, inactiveCls };
  }
  function ensureTab() {
    const list = tablist();
    if (!list || !haloTabs(list).length) return null;
    let b = list.querySelector('[data-haloplus="home-tab"]');
    const { activeCls, inactiveCls } = tabClasses(list);
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('data-haloplus', 'home-tab');
      b.innerHTML = `<span class="MuiButton-label"><span data-testid="hp_calendar_tab">Calendar</span>${O.mark()}</span>`;
      list.appendChild(b);
    }
    const want = active ? activeCls : inactiveCls;
    if (want && b.className !== want) b.className = want;
    b.setAttribute('aria-selected', String(active));
    b.tabIndex = active ? 0 : -1;
    return b;
  }

  // ---- open and close -----------------------------------------------------------------------------------------------------
  function open(save = true) {
    const list = tablist();
    const m = main();
    if (!list || !m) return;
    if (!active) {
      swapped = haloTabs(list).map((b) => ({ b, sel: b.getAttribute('aria-selected'), tab: b.getAttribute('tabindex') }));
      for (const { b } of swapped) {
        b.setAttribute('aria-selected', 'false');
        b.setAttribute('tabindex', '-1');
      }
    }
    active = true;
    m.setAttribute('data-hp-tab', 'calendar');
    ensureTab();
    if (save) O.cal.saveView({ homeTab: 'calendar' });
    O.count('calendar-all', false);
    lastKey = '';
    void pass();
  }
  function close(save = true) {
    if (!active) return;
    active = false;
    // Halo's own tabs as they were (React then moves the selection itself if another tab was chosen).
    for (const { b, sel, tab } of swapped) {
      if (!b.isConnected) continue;
      if (sel != null) b.setAttribute('aria-selected', sel);
      if (tab != null) b.setAttribute('tabindex', tab);
    }
    swapped = [];
    const m = main();
    if (m) m.removeAttribute('data-hp-tab');
    const h = document.querySelector('[data-haloplus="home-calendar"]');
    if (h) h.hidden = true;
    ensureTab();
    if (save) O.cal.saveView({ homeTab: 'classes' });
  }
  function onClick(e) {
    const t = e.target && e.target.closest && e.target.closest('#Home--main [role="tablist"] [role="tab"]');
    if (!t) return;
    if (t.getAttribute('data-haloplus') === 'home-tab') return void (active || open());
    close();
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
    return `<button type="button" class="hp-arrow" data-hp-move="-1" aria-label="Previous week">${ARROW_L}</button><button type="button" class="hp-arrow" data-hp-move="1" aria-label="Next week">${ARROW_R}</button><span class="hp-range">${label(first)} – ${label(last)}, ${O.cal.keyOf(last).slice(0, 4)}</span>${offset ? '<button type="button" data-hp-move="0" class="MuiButtonBase-root MuiButton-root MuiButton-outlined MuiButton-outlinedSecondary MuiButton-sizeSmall"><span class="MuiButton-label">This week</span></button>' : ''}<span class="hp-sp"></span><span class="text-secondary text-sm">Show</span><span class="hp-group" role="group" aria-label="How many weeks">${btn(weeksN === 1, 1, '1 Week')}${btn(weeksN === 2, 2, '2 Weeks')}</span>${O.mark()}`;
  }
  function ensureHost() {
    const m = main();
    const list = tablist();
    if (!m || !list) return null;
    let h = m.querySelector(':scope > [data-haloplus="home-calendar"]');
    if (!h) {
      h = document.createElement('div');
      h.setAttribute('data-haloplus', 'home-calendar');
      h.className = 'MuiPaper-root py-6 px-4 MuiPaper-elevation3 MuiPaper-rounded';
      h.style.marginBottom = '28px';
      h.innerHTML = '<div class="hp-bar"></div><div class="hp-cal"><div class="hp-legend"></div><div class="hp-status" hidden></div><div class="hp-grid"></div></div>';
      h.addEventListener('click', (e) => {
        const mv = e.target.closest('[data-hp-move]');
        if (mv) {
          const n = Number(mv.getAttribute('data-hp-move'));
          offset = n === 0 ? 0 : offset + n;
          lastKey = '';
          return void pass();
        }
        const wk = e.target.closest('[data-hp-weeks]');
        if (wk) {
          weeksN = Number(wk.getAttribute('data-hp-weeks')) === 1 ? 1 : 2;
          O.cal.saveView({ homeWeeks: weeksN });
          lastKey = '';
          void pass();
        }
      });
      O.cal.bindGrid(h.querySelector('.hp-cal'));
    }
    // Below Halo's tabs (and Halo+'s search, when it is there), above Halo's class list.
    const section = m.querySelector(':scope > section');
    if (section && h.nextElementSibling !== section) section.before(h);
    else if (!section && !h.isConnected) (list.closest('.better-halo-tabs-wrapper') || list).after(h);
    return h;
  }
  async function draw() {
    if (!active) {
      const h0 = document.querySelector('[data-haloplus="home-calendar"]');
      if (h0) h0.hidden = true;
      return;
    }
    const h = ensureHost();
    const idx = O.st.haloIndex;
    if (!h) return;
    h.hidden = !active;
    if (!active) return;
    const mon = thisMonday();
    if (mon == null || !idx || !Array.isArray(idx.classes) || !idx.classes.length) {
      h.querySelector('.hp-bar').innerHTML = '';
      h.querySelector('.hp-grid').innerHTML = '';
      const st = h.querySelector('.hp-status');
      st.hidden = false;
      st.textContent = 'Halo+ shows the calendar once it has synced your classes.';
      return;
    }
    const first = mon + offset * 7;
    const weeks = Array.from({ length: weeksN }, (_, w) => [0, 1, 2, 3, 4, 5, 6].map((i) => first + w * 7 + i));
    const bar = h.querySelector('.hp-bar');
    const barNow = barHtml(weeks[0][0], weeks[weeks.length - 1][6]);
    if (bar.dataset.html !== barNow) {
      bar.innerHTML = barNow;
      bar.dataset.html = barNow;
    }
    const st = h.querySelector('.hp-status');
    const grid = h.querySelector('.hp-grid');
    if (!grid.firstElementChild) {
      st.hidden = false;
      st.textContent = 'Getting your due dates from Halo…';
    }
    const grades = await O.cal.refresh(idx);
    if (!h.isConnected || !active) return;
    const key = `${first}|${weeksN}|${window.innerWidth <= 1024}|${Object.keys(grades).filter((k) => grades[k]).length}|${JSON.stringify(Object.values(grades).map((g) => (g ? g.size : -1)))}`;
    const legend = O.cal.legendHtml(idx, grades);
    const lg = h.querySelector('.hp-legend');
    if (lg.dataset.html !== legend) {
      lg.innerHTML = legend;
      lg.dataset.html = legend;
    }
    if (!Object.values(grades).some(Boolean)) {
      grid.innerHTML = '';
      st.hidden = false;
      st.textContent = 'Halo did not send your due dates just now. Open this tab again in a moment.';
      return;
    }
    st.hidden = true;
    if (key === lastKey && grid.firstElementChild) return;
    lastKey = key;
    grid.innerHTML = O.cal.gridHtml(weeks, O.cal.daysFor(idx, grades));
  }
  /** Nothing to show without Halo+'s list of the classes (the last sync's index): no tab at all. */
  const hasIndex = () => {
    const idx = O.st.haloIndex;
    return !!(idx && Array.isArray(idx.classes) && idx.classes.length);
  };
  async function pass() {
    if (busy) return void (again = true);
    busy = true;
    try {
      if (!hasIndex()) {
        if (active || document.querySelector('[data-haloplus="home-tab"]')) teardown();
        return;
      }
      await saved();
      if (!ensureTab()) return;
      await draw();
    } finally {
      busy = false;
      if (again) {
        again = false;
        void pass();
      }
    }
  }
  // The kept tab and weeks, read once per visit to Student Home.
  function saved() {
    if (!savedP)
      savedP = (async () => {
        try {
          return (await chrome.storage.local.get('haloViews')).haloViews || {};
        } catch {
          return {};
        }
      })();
    return savedP.then((v) => {
      if (applied || !tablist()) return;
      applied = true;
      if (!O.enabled('views')) return;
      if (v.homeWeeks === 1 || v.homeWeeks === 2) weeksN = v.homeWeeks;
      if (v.homeTab === 'calendar' && !active) open(false);
    });
  }
  function teardown() {
    close(false);
    document.querySelectorAll('[data-haloplus="home-tab"], [data-haloplus="home-calendar"]').forEach((n) => n.remove());
    savedP = null;
    applied = false;
    lastKey = '';
    offset = 0;
    weeksN = 2;
  }
  function stop() {
    teardown();
    document.removeEventListener('click', onClick, true);
  }
  O.feature({
    id: 'calendar-home',
    switch: 'calendar',
    routes: ['home'],
    start() {
      if (!O.cal) return;
      document.addEventListener('click', onClick, true);
      void pass();
    },
    update() {
      if (O.cal) void pass();
    },
    stop,
  });
})();
