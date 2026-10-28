// Feature 9 (0.12.0): participation on the discussion page. "This week: posted Mon, Wed · 1 more day needed", under the
// prompt, only when Halo itself states the class's rule (its participation policy: days a week, posts a day) and the
// week (the topic's participation dates), and Halo counts the student's posts across every forum of the class (its
// participation query: what Halo's own participation feedback is built from). Days are Halo's days (its school time
// zone). It says "posted", not "counted": which posts count is the instructor's call, often after the week.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  const L = globalThis.HaloPlusOnLogic;
  if (!O || !L) return;
  const Q = 'query StudentParticipation($courseClassId:String!,$userId:String!,$startDate:String!,$endDate:String!){participationPosts(courseClassId:$courseClassId,userId:$userId,startDate:$startDate,endDate:$endDate){posts{id publishDate}date}}';
  let fresh = false;
  let busy = false;
  let lastText = null;

  function windowFor(k) {
    const idx = O.st.haloIndex;
    const now = Date.now();
    const weeks = idx.rows.filter((r) => r.c === k && r.kind === 'participation' && r.start && r.cdue).filter((r) => Date.parse(r.start) <= now && now <= Date.parse(r.cdue));
    // Exactly one participation week now, or Halo+ is not sure which week it is.
    return weeks.length === 1 ? { start: weeks[0].start, end: weeks[0].cdue } : null;
  }
  async function pass() {
    if (busy) return;
    busy = true;
    try {
      const r = O.route();
      const idx = O.st.haloIndex;
      const k = idx && Array.isArray(idx.classes) ? idx.classes.findIndex((c) => c.slug === r.slug) : -1;
      const cls = k >= 0 ? idx.classes[k] : null;
      const meta = document.querySelector('#scrollRef_dq_description [class*="DiscussionDescriptionCard_discussionHeaderMeta"]');
      const win = cls && cls.part && cls.id ? windowFor(k) : null;
      const z = O.zone();
      if (!meta || !win || !z) return clear();
      const s = await O.haloSession();
      if (!s.user) return clear();
      const d = await O.ask('StudentParticipation', Q, { courseClassId: cls.id, userId: s.user, startDate: new Date(win.start).toISOString(), endDate: new Date(win.end).toISOString() }, fresh ? 0 : 5 * 60_000);
      fresh = false;
      const list = d && d.participationPosts;
      if (!Array.isArray(list)) return clear();
      const dates = list.flatMap((e) => (e && Array.isArray(e.posts) ? e.posts : [])).map((p) => p && p.publishDate).filter(Boolean);
      const text = L.participationLine(dates, win.start, win.end, cls.part.days, z, cls.part.posts);
      if (!text) return clear();
      let el = document.querySelector('[data-haloplus="participation"]');
      if (!el) {
        el = document.createElement('div');
        el.setAttribute('data-haloplus', 'participation');
        el.className = 'text-sm text-secondary';
        el.style.cssText = 'margin:2px 0 0;padding:0 20px';
        meta.after(el);
        O.count('participation-shown');
      }
      if (lastText !== text || !el.isConnected) {
        el.innerHTML = `${O.esc(text)} <span style="margin-left:2px">${O.mark()}</span>`;
        el.title = `Halo asks for posts on ${cls.part.days} days a week${cls.part.posts > 1 ? `, ${cls.part.posts} a day` : ''}. Posted, not yet counted: your instructor marks which posts count.`;
        lastText = text;
      }
    } catch {
      clear();
    } finally {
      busy = false;
    }
  }
  function clear() {
    document.querySelectorAll('[data-haloplus="participation"]').forEach((n) => n.remove());
    lastText = null;
  }
  // A post went through (Halo's own message): ask again, once.
  const seenToast = new WeakSet();
  function watchPosts() {
    for (const t of document.querySelectorAll('.Toastify')) {
      if (!/Discussion (post|response) has been submitted/.test(t.textContent || '') || seenToast.has(t.firstElementChild || t)) continue;
      seenToast.add(t.firstElementChild || t);
      fresh = true;
      setTimeout(() => void pass(), 1500);
    }
  }
  O.feature({
    id: 'participation',
    routes: ['discussion'],
    start() {
      void pass();
    },
    update() {
      watchPosts();
      if (!document.querySelector('[data-haloplus="participation"]')) void pass();
    },
    stop() {
      clear();
    },
  });
})();
