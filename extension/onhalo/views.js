// Feature 14 (0.12.0): Halo forgets the calendar's "Show 1 Week | 2 Weeks | All" on every visit (it starts at 2 Weeks,
// research 2026-10-27). Halo+ remembers the student's last choice on this computer and picks it again in Halo's own
// buttons when the calendar opens. View choices only: never where the page was scrolled, never "where you were".
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  if (!O) return;
  const SEL = '[data-testid^="dashboard_calendar_num_weeks_"]';
  let applied = false;
  async function get() {
    try {
      return (await chrome.storage.local.get('haloViews')).haloViews || {};
    } catch {
      return {};
    }
  }
  function onClick(e) {
    // Only the student's own clicks (Halo+'s own click is not "trusted").
    if (!e.isTrusted) return;
    const b = e.target && e.target.closest && e.target.closest(SEL);
    if (!b) return;
    const v = b.getAttribute('data-testid').replace('dashboard_calendar_num_weeks_', '');
    void get().then((h) => chrome.storage.local.set({ haloViews: { ...h, calWeeks: v } }).catch(() => undefined));
  }
  let path = location.pathname;
  async function pass() {
    // Another class's calendar (Halo moves between classes without a reload): pick the choice again there.
    if (path !== location.pathname) {
      path = location.pathname;
      applied = false;
    }
    if (applied) return;
    const btns = document.querySelectorAll(`#calendar-container ${SEL}`);
    if (btns.length !== 3) return;
    applied = true;
    const { calWeeks } = await get();
    if (!calWeeks) return;
    const want = document.querySelector(`#calendar-container [data-testid="dashboard_calendar_num_weeks_${calWeeks}"]`);
    if (!want || /MuiButton-contained/.test(want.className)) return;
    want.click();
    O.count('views-applied');
  }
  O.feature({
    id: 'views',
    routes: ['class'],
    start() {
      applied = false;
      document.addEventListener('click', onClick, true);
      void pass();
    },
    update() {
      void pass();
    },
    stop() {
      document.removeEventListener('click', onClick, true);
      applied = false;
    },
  });
})();
