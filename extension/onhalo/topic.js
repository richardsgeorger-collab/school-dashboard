// Feature 7 (0.12.0): topic progress, "3 of 5 done" beside Halo's "Max Points" on a topic page. Done is Halo's own check
// (late, submitted or published: the same rule as Halo's check mark), or checked off in Halo+ by the student. Shown
// only once Halo has drawn every card's status; if any card's state is unknown, nothing.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  if (!O) return;
  function halodone(title) {
    const v = O.view;
    const r = O.route();
    if (!v || !r.slug) return false;
    const cls = v.classes.find((c) => c.slug === r.slug);
    if (!cls) return false;
    const same = v.items.filter((i) => i.c === cls.key && (i.ht || i.t) === title);
    return same.length === 1 && same[0].done === 1;
  }
  // The count last shown on each topic page (this visit): one more done since (a submission just now, 0.12.9), and the
  // count ticks up in Halo+ gold for a moment, here or when Halo's submission view closes back to the topic.
  const lastDone = new Map();
  function pass() {
    const host = document.querySelector('[class*="CourseUnitHeader_topicContainer"]');
    const meta = host && [...host.children].find((el) => /Max Points:/.test(el.textContent || ''));
    const list = document.getElementById('assessments');
    let el = document.querySelector('[data-haloplus="topic"]');
    const cards = list ? O.cards(list) : [];
    const ready = meta && cards.length && !document.querySelector('#assessments [data-testid="spinner"]') && cards.every((c) => c.known);
    if (!ready) return void (el && el.remove());
    const done = cards.filter((c) => c.done || halodone(c.title)).length;
    const text = `${done} of ${cards.length} done`;
    if (!el) {
      el = document.createElement('div');
      el.setAttribute('data-haloplus', 'topic');
      el.className = 'flex items-center pl-6';
      meta.appendChild(el);
    }
    if (el.dataset.text !== text || !el.firstElementChild) {
      // One more done on this page (a submission just now, 0.12.9): the count ticks up in Halo+ gold for a moment.
      const path = location.pathname;
      const up = lastDone.has(path) && done > lastDone.get(path);
      lastDone.set(path, done);
      el.innerHTML = `<span class="text-secondary text-sm md:text-sm ml:text-lg truncate" style="display:inline-block">${text}</span><span class="text-secondary" style="margin-left:5px;font-size:13px;line-height:1">${O.mark()}</span>`;
      el.dataset.text = text;
      if (up) {
        el.classList.remove('hp-tick');
        void el.offsetWidth;
        el.classList.add('hp-tick');
      }
    }
  }
  O.feature({
    id: 'topic',
    routes: ['unit'],
    start() {
      pass();
    },
    update() {
      pass();
    },
    stop() {
      document.querySelectorAll('[data-haloplus="topic"]').forEach((n) => n.remove());
    },
  });
})();
