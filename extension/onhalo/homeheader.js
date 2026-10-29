// Feature: a compact Student Home (0.12.2, own switch "Compact Student Home header"). 0.12.3 (George, after testing
// 0.12.2): search, This week and the class cards start right under Halo's purple bar. Halo's "Student home" title, its
// two schedule lines and its Current Classes / Past Classes tabs are hidden, and the school's sponsor logo (Global
// Credit Union for GCU: its sponsor placement, never hidden) moves into the purple bar, between MESSAGES and the bell,
// on a small white plate so it reads on purple and on a dark theme. Halo's own logo stays in the page, hidden; Halo+
// shows a copy (the same image, the same link). Halo redraws Student Home without reloading (My Classes, the HALO logo,
// back from a class): the hiding is done by Halo+'s stylesheet from a mark on the page's root (which Halo never
// redraws), so a redrawn Student Home is compact from its first frame, and the logo is put back in the bar in the same
// moment Halo draws (a watcher on the page, before the browser paints). Only when the bar and the logo are where Halo
// puts them and the copy shows whole and uncovered; otherwise Student Home is left exactly as Halo has it.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  if (!O) return;
  const ROOT = document.documentElement;
  let on = false;
  let failedFor = null;

  const onHome = () => O.route().kind === 'home';
  /** Halo's sponsor logo on Student Home: its header, image source, words and link; or null. */
  function sponsor() {
    const main = document.getElementById('Home--main');
    const header = main && main.querySelector(':scope > header[class*="PageTitle_headerContainer"]');
    if (!header || header.children.length !== 2) return null;
    const [left, right] = header.children;
    if (!left.querySelector(':scope > h1[class*="PageTitle_headerText"]')) return null;
    const el = right.querySelector('img, [data-better-halo-original-img-src]');
    if (!el) return null;
    const src = el.tagName === 'IMG' ? el.getAttribute('src') : el.getAttribute('data-better-halo-original-img-src');
    const alt = el.tagName === 'IMG' ? el.getAttribute('alt') : el.getAttribute('data-better-halo-original-img-alt');
    const a = el.closest('a');
    if (!src || !/^(https?:|data:image\/|\/)/.test(src)) return null;
    return { header, src, alt: alt || 'Sponsor logo', href: a ? a.getAttribute('href') : null };
  }
  /** Whether an element is, or sits in, a layer fixed over (nearly) the whole window: a pop-up's backdrop. */
  function overlay(el) {
    for (let e = el; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      if (getComputedStyle(e).position !== 'fixed') continue;
      const q = e.getBoundingClientRect();
      if (q.width >= window.innerWidth * 0.9 && q.height >= window.innerHeight * 0.9) return true;
    }
    return false;
  }
  /** The empty space in Halo's purple bar between MESSAGES and the bell. */
  function barSpot() {
    const bar = document.querySelector('#header_main_container header .MuiToolbar-root');
    const spot = bar && [...bar.children].find((c) => c.classList.contains('flex-grow'));
    return spot && bar.querySelector('#guide_anchor_header_alert') ? { bar, spot } : null;
  }
  function placeLogo(s) {
    const b = barSpot();
    if (!b) return null;
    let h = b.spot.querySelector('[data-haloplus="sponsor"]');
    if (!h) {
      h = document.createElement('div');
      h.setAttribute('data-haloplus', 'sponsor');
      b.spot.appendChild(h);
    }
    const key = `${s.src}|${s.href}`;
    if (h.dataset.key !== key) {
      h.dataset.key = key;
      const img = `<img src="${O.esc(s.src)}" alt="${O.esc(s.alt)}">`;
      h.innerHTML = s.href ? `<a href="${O.esc(s.href)}" target="_blank" rel="noopener" title="${O.esc(s.alt)}">${img}</a>` : img;
      h.querySelector('img').addEventListener('load', () => check(), { once: true });
    }
    return h;
  }
  const headerNow = () => {
    const s = sponsor();
    return s ? s.header : null;
  };
  function clear() {
    ROOT.removeAttribute('data-hp-home-compact');
    document.querySelectorAll('[data-haloplus="sponsor"], [data-haloplus="past-link"]').forEach((n) => n.remove());
  }
  /** Shown whole, inside the bar, nothing on top of it; else Student Home goes back to Halo's own. */
  function check() {
    const h = document.querySelector('[data-haloplus="sponsor"]');
    // Halo+'s copy, or Better Halo's themed version of it (Better Halo knows GCU's sponsor logo and swaps it, ours too):
    // that one is drawn for Better Halo's own colours, so it goes without the white plate, at the same height.
    const i = h && h.querySelector('img, [data-better-halo-original-img-src]');
    if (!i || (i.tagName === 'IMG' && !i.complete)) return;
    if (i.tagName !== 'IMG' && !i.dataset.hpSized) {
      const w = parseFloat(i.style.width);
      const ht = parseFloat(i.style.height);
      if (w > 0 && ht > 0) {
        i.dataset.hpSized = '1';
        i.style.setProperty('height', '36px', 'important');
        i.style.setProperty('width', `${Math.round((w * 36) / ht)}px`, 'important');
        i.style.setProperty('margin', '0', 'important');
      }
      h.classList.add('hp-themed');
    }
    const b = barSpot();
    const r = i.getBoundingClientRect();
    const bar = b && b.bar.getBoundingClientRect();
    const hit = r.width ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
    // Over the whole page for a moment (Halo+'s search, a Halo dialog's backdrop): the logo is not hidden, the page is
    // just covered; judged again after (0.12.8; it put Halo's header back for the visit whenever the page changed under
    // an open search).
    if (hit && !h.contains(hit) && overlay(hit)) return;
    const ok = !!bar && (i.tagName !== 'IMG' || i.naturalWidth > 0) && r.width > 20 && r.height > 12 && r.top >= bar.top - 1 && r.bottom <= bar.bottom + 1 && r.right <= window.innerWidth && !!hit && h.contains(hit);
    if (!ok) {
      failedFor = headerNow();
      clear();
    }
  }
  // ---- Past classes (0.12.4) ----------------------------------------------------------------------------------------------
  // With Halo's tabs hidden, one small link after the class list in Halo's link style switches them: "Past classes (2)"
  // opens Halo's own Past Classes view (Halo's tab, clicked), and then reads "Current classes (6)" to come back. The
  // counts are Halo's, from its tabs.
  function tabs() {
    const list = document.querySelector('#Home--main [role="tablist"]');
    const t = list ? [...list.querySelectorAll('[role="tab"]')].filter((x) => !x.hasAttribute('data-haloplus')) : [];
    return t.length >= 2 ? t : null;
  }
  function pastLink() {
    const main = document.getElementById('Home--main');
    const t = tabs();
    const section = main && [...main.querySelectorAll(':scope > section')].pop();
    let l = document.querySelector('[data-haloplus="past-link"]');
    if (!t || !section || !ROOT.hasAttribute('data-hp-home-compact')) {
      if (l) l.remove();
      return;
    }
    const onPast = t[1].getAttribute('aria-selected') === 'true';
    const target = onPast ? t[0] : t[1];
    const text = (target.textContent || '').replace(/\s+/g, ' ').trim();
    const label = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    if (!l) {
      l = document.createElement('div');
      l.setAttribute('data-haloplus', 'past-link');
      l.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const tt = tabs();
        if (!tt) return;
        const past = tt[1].getAttribute('aria-selected') === 'true';
        (past ? tt[0] : tt[1]).click();
      });
    }
    const html = `<button type="button">${O.esc(label)}</button>${O.mark()}`;
    if (l.dataset.html !== html) {
      l.innerHTML = html;
      l.dataset.html = html;
    }
    if (section.nextElementSibling !== l) section.after(l);
  }
  /** Everything in place for the Student Home on screen now, or nothing; quick when it already is. */
  function apply() {
    if (!on) return;
    if (!onHome()) {
      document.querySelectorAll('[data-haloplus="sponsor"]').forEach((n) => n.remove());
      return;
    }
    const s = sponsor();
    if (!s) {
      // Halo's Student Home not drawn yet (between pages): the mark stays, so nothing flashes when it is. A Student Home
      // of another shape (no title, no logo) is left as Halo has it.
      if (document.querySelector('#Home--main > header')) clear();
      return;
    }
    if (failedFor === s.header) return;
    if (!placeLogo(s)) return clear();
    if (!ROOT.hasAttribute('data-hp-home-compact')) ROOT.setAttribute('data-hp-home-compact', '');
    check();
    pastLink();
  }
  // Halo redraws Student Home without a reload: put things back before the browser paints, and only when something is
  // missing (a change that leaves everything in place costs one look).
  const watch = new MutationObserver(() => {
    if (!on || !onHome()) return;
    const h = document.querySelector('[data-haloplus="sponsor"]');
    if (!h || !ROOT.hasAttribute('data-hp-home-compact')) return apply();
    if (!h.classList.contains('hp-themed') && h.querySelector('[data-better-halo-original-img-src]')) check();
    pastLink();
  });
  O.feature({
    id: 'homeheader',
    start() {
      on = true;
      watch.observe(document.body, { childList: true, subtree: true });
      apply();
    },
    update() {
      apply();
    },
    stop() {
      on = false;
      watch.disconnect();
      clear();
      failedFor = null;
    },
  });
})();
