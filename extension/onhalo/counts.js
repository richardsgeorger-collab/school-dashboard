// Feature 26 (0.12.0): counts on the class card buttons. The Calendar button and the three small buttons under it
// (announcements, gradebook, discussions) are Better Halo's, not Halo's (research 2026-10-27), and Better Halo already
// puts a count on them when it can. So Halo+ adds a count only where Better Halo's are missing (none on the page a few
// seconds after its buttons appear), and takes its own away if Better Halo's show up. The numbers are Halo's own, from
// the two questions Halo's class sidebar asks, read the way the sidebar reads them: announcements; the gradebook;
// discussions = discussion questions plus instructor discussions. Nothing below 1, "99+" above 99. Asked at most once
// in five minutes (Halo's own sidebar asks every five minutes).
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  if (!O) return;
  const Q_FORUM = 'query SidebarForumNotifications($classId:String!,$filters:FilterInputGQL){classes:getForumNotifications(classId:$classId,filter:$filters){forumTypes{DQ{classes{count}}IDQ{classes{count}}CQ{classes{count}}GROUP{classes{count}}ANNOUNCEMENTS{classes{count}}}}}';
  const Q_GRADES = 'query SidebarGradebookNotifications($slugId:String!){gradebook:getGradingNotifications(slugId:$slugId){...on NotificationCount{count}}}';
  const FILTERS = { fetchOnlyCounts: true, forumFilters: [{ forumType: 'DQ' }, { forumType: 'IDQ' }, { forumType: 'CLASS_QUESTIONS' }, { forumType: 'TEAM_FORUM' }, { forumType: 'ANNOUNCEMENT' }] };
  const SETTLE_MS = 6000;
  let firstSeen = 0;
  let counts = null;
  let asking = null;
  let tries = 0;

  const int = (v) => {
    const n = parseInt(v == null ? '0' : String(v), 10);
    return Number.isFinite(n) ? n : null;
  };
  const one = (ft, key) => {
    const c = ft && ft[key] && Array.isArray(ft[key].classes) ? ft[key].classes[0] : null;
    return int(c ? c.count : '0');
  };
  async function fetchCounts(idx) {
    try {
      const { haloCounts } = await chrome.storage.local.get('haloCounts');
      if (haloCounts && Date.now() - haloCounts.at < 5 * 60_000) return { bySlug: haloCounts.bySlug, failed: 0 };
    } catch {
      /* ask Halo */
    }
    const bySlug = {};
    let failed = 0;
    for (const c of idx.classes) {
      if (!c.id) continue;
      try {
        const f = await O.ask('SidebarForumNotifications', Q_FORUM, { classId: c.id, filters: FILTERS }, 5 * 60_000);
        const g = await O.ask('SidebarGradebookNotifications', Q_GRADES, { slugId: c.slug }, 5 * 60_000);
        const top = f && (Array.isArray(f.classes) ? f.classes[0] : f.classes);
        const ft = top && top.forumTypes;
        const dq = one(ft, 'DQ');
        const idq = one(ft, 'IDQ');
        const ann = one(ft, 'ANNOUNCEMENTS');
        const gb = g && g.gradebook ? int((Array.isArray(g.gradebook) ? g.gradebook[0] : g.gradebook).count) : null;
        if (!ft || dq == null || idq == null || ann == null || gb == null) continue;
        bySlug[c.slug] = { announcements: ann, gradebook: gb, discussion: dq + idq };
      } catch {
        /* this class: nothing, and asked again soon */
        failed += 1;
      }
    }
    // Kept five minutes only when Halo answered for every class (0.12.9): a miss is never remembered as "nothing new".
    if (!failed) {
      try {
        await chrome.storage.local.set({ haloCounts: { at: Date.now(), bySlug } });
      } catch {
        /* kept for this page */
      }
    }
    return { bySlug, failed };
  }
  const label = (n) => (n > 99 ? '99+' : String(n));
  const CSS = 'position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--hp-badge-bg);color:var(--hp-badge-fg);font:600 11px/18px var(--hp-font);text-align:center;pointer-events:none;box-sizing:border-box';
  function clear() {
    document.querySelectorAll('[data-haloplus="count"], [data-haloplus="count-mark"]').forEach((n) => n.remove());
  }
  async function pass() {
    const buttons = document.querySelectorAll('.better-halo-icon-button[data-section]');
    if (!buttons.length) return clear();
    // Better Halo's own counts are on the page: they are Halo's numbers already, and two counts would be noise.
    if (document.querySelector('.better-halo-notification-badge')) return clear();
    if (!firstSeen) firstSeen = Date.now();
    if (Date.now() - firstSeen < SETTLE_MS) return void setTimeout(() => O.soon(), SETTLE_MS - (Date.now() - firstSeen) + 50);
    const idx = O.st.haloIndex;
    if (!idx || !Array.isArray(idx.classes)) return clear();
    if (!counts) {
      const got = await (asking || (asking = fetchCounts(idx)));
      asking = null;
      counts = got.bySlug;
      // Halo did not answer for some class: asked again in a while (three times at most on this page).
      if (got.failed && tries < 3) {
        tries += 1;
        setTimeout(() => {
          counts = null;
          O.soon();
        }, 8000 * tries);
      }
    }
    if (document.querySelector('.better-halo-notification-badge')) return clear();
    for (const b of buttons) {
      const sec = b.getAttribute('data-section');
      if (!['announcements', 'gradebook', 'discussion'].includes(sec)) continue;
      const m = /\/courses\/([^/]+)/.exec(new URL(b.getAttribute('href') || '', location.origin).pathname);
      const n = m && counts[decodeURIComponent(m[1])] ? counts[decodeURIComponent(m[1])][sec] : null;
      let el = b.querySelector('[data-haloplus="count"]');
      if (!(n > 0)) {
        if (el) el.remove();
        continue;
      }
      if (!el) {
        el = document.createElement('span');
        el.setAttribute('data-haloplus', 'count');
        el.setAttribute('style', CSS);
        if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
        b.appendChild(el);
      }
      if (el.textContent !== label(n)) el.textContent = label(n);
      el.setAttribute('aria-label', `(${n} new, from Halo; added by Halo+)`);
      el.title = `${n} new on Halo · Added by Halo+`;
      const row = b.parentElement;
      if (row && !row.querySelector('[data-haloplus="count-mark"]')) {
        const mk = document.createElement('span');
        mk.setAttribute('data-haloplus', 'count-mark');
        mk.className = 'text-secondary';
        mk.style.cssText = 'font-size:12px;align-self:center;margin-left:4px';
        mk.innerHTML = O.mark();
        row.appendChild(mk);
      }
    }
  }
  O.feature({
    id: 'counts',
    routes: ['home'],
    start() {
      void pass();
    },
    update() {
      void pass();
    },
    stop() {
      clear();
      firstSeen = 0;
    },
  });
})();
