// Feature 5 (0.12.0): how long you have, beside Halo's own due dates: " · in 5h", " · tomorrow", " · in 3 days", in
// Halo's gray, only when Halo+ is sure: the date is exactly Halo's own text, read in Halo's school time zone (from the
// page's own settings), still ahead and within six days, and the work is not handed in. A personal (accommodated) due
// date, when Halo shows one, is the one that counts. Day words are in the student's own time zone.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  const L = globalThis.HaloPlusOnLogic;
  if (!O || !L) return;

  const firstText = (el) => {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return n;
    return null;
  };
  function label(after, at) {
    const tz = (O.view && O.view.tz) || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const words = L.dueIn(at, Date.now(), tz);
    let el = after.nextSibling && after.nextSibling.nodeType === 1 && after.nextSibling.getAttribute('data-haloplus') === 'duein' ? after.nextSibling : null;
    if (!words) return void (el && el.remove());
    if (!el) {
      el = document.createElement('span');
      el.setAttribute('data-haloplus', 'duein');
      el.className = 'text-secondary';
      el.style.cssText = 'white-space:nowrap';
      after.after(el);
    }
    if (el.dataset.words !== words || !el.querySelector('.hp-mark')) {
      el.innerHTML = ` · ${O.esc(words)} ${O.mark()}`;
      el.dataset.words = words;
    }
  }
  function one(p, done) {
    if (done) return p.querySelectorAll('[data-haloplus="duein"]').forEach((n) => n.remove());
    const zone = O.zone();
    if (!zone) return;
    const acc = p.querySelector('[class*="FormattedDateTimeDisplay_dateWithPrefix"]');
    if (acc) {
      const time = p.querySelector('[class*="FormattedDateTimeDisplay_timePart"]');
      const dateText = [...acc.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').trim().replace(/,$/, '');
      const at = time ? L.haloDateTime(`${dateText}, ${(time.textContent || '').trim()}`, zone) : null;
      p.querySelectorAll(':scope > [data-haloplus="duein"]').forEach((n) => n.remove());
      if (at && time) label(time, new Date(at).toISOString());
      return;
    }
    const t = firstText(p);
    const at = t ? L.haloDateTime(t.nodeValue.replace(/\(edited\)$/, ''), zone) : null;
    if (t && at) label(t, new Date(at).toISOString());
  }
  function pass() {
    const cards = O.cards ? O.cards() : [];
    const seen = new Set();
    for (const c of cards) {
      if (!c.due) continue;
      seen.add(c.due);
      one(c.due, c.done);
    }
    // The assignment's own view: "Due on: …" (not once it is handed in), and a quiz's landing page.
    const submitted = /Submitted on /.test(document.body.innerText || '');
    for (const p of document.querySelectorAll('p.text-lg.font-semibold')) {
      const t = firstText(p);
      if (!t || !/^Due on: /.test(t.nodeValue.trim())) continue;
      if (submitted) {
        p.querySelectorAll('[data-haloplus="duein"]').forEach((n) => n.remove());
        continue;
      }
      const at = L.haloDateTime(t.nodeValue.trim().replace(/^Due on: /, ''), O.zone());
      if (at) label(t, new Date(at).toISOString());
    }
    for (const p of document.querySelectorAll('[data-testid="date_time_data_due_date_time"], [data-testid="date_time_data_due_date"]')) if (!seen.has(p)) one(p, false);
  }
  let tick = 0;
  const refresh = () => {
    if (document.visibilityState === 'visible') pass();
  };
  O.feature({
    id: 'duein',
    start() {
      pass();
      document.addEventListener('visibilitychange', refresh);
      // The words change with time ("in 2h" becomes "in 1h"): once a minute while the page is in front and shows any.
      tick = setInterval(() => document.querySelector('[data-haloplus="duein"]') && refresh(), 60_000);
    },
    update() {
      pass();
    },
    stop() {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', refresh);
      document.querySelectorAll('[data-haloplus="duein"]').forEach((n) => n.remove());
    },
  });
})();
