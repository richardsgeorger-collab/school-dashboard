// Feature (0.12.2, George): a compact Student Home header, so the class cards sit higher. Halo's header is a flex row
// that may wrap (the "Student home" title, and on the right the school's sponsor logo, Global Credit Union for GCU,
// research 2026-10-27), followed by two lines of text: "Students will see their classes in Halo three days before ..."
// and "Missing a class? View your full schedule.". Compact: the title and the logo on one row (the logo a little
// smaller if it must be, never hidden or covered: it is GCU's sponsor placement), the two lines hidden, and "View your
// full schedule" kept as a small link beside the title (Halo's own link, Halo's link style). Only when Halo's header is
// exactly that shape; if Halo changes it, or the result is not one clean row, the header is left as Halo has it.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  if (!O) return;

  /** Halo's header parts, or null when the page is not the shape this was made for. */
  function parts() {
    const main = document.getElementById('Home--main');
    const header = main && main.querySelector(':scope > header[class*="PageTitle_headerContainer"]');
    if (!header || header.children.length !== 2) return null;
    const [left, right] = header.children;
    const title = left.querySelector(':scope > h1[class*="PageTitle_headerText"]');
    // Halo's <img>, or Better Halo's copy of it (Better Halo swaps the logo for a recoloured <span> under its themes).
    const logo = right.querySelector('img, [data-better-halo-original-img-src]');
    if (!title || !logo || left.querySelector('img')) return null;
    // The two lines: Halo's block between the header and the tabs, holding the class schedule link.
    let info = header.nextElementSibling;
    if (info && (info.tagName !== 'DIV' || info.getAttribute('role') === 'tablist' || !info.querySelector('a[href*="classschedule"]') || info.querySelector('[data-haloplus]'))) info = null;
    return { main, header, left, right, title, logo, info };
  }
  function undo() {
    const main = document.getElementById('Home--main');
    if (main) main.removeAttribute('data-hp-compact');
    const header = main && main.querySelector(':scope > header');
    if (header) {
      header.style.removeProperty('--hp-logo-w');
      header.style.removeProperty('--hp-logo-h');
    }
    document.querySelectorAll('[data-hp-schedule]').forEach((n) => n.removeAttribute('data-hp-schedule'));
    document.querySelectorAll('[data-haloplus="schedule-link"]').forEach((n) => n.remove());
  }
  let failed = false;
  function apply() {
    if (failed) return;
    const p = parts();
    if (!p) return undo();
    const link = p.info && p.info.querySelector('a[href*="classschedule"]');
    if (p.info) p.info.setAttribute('data-hp-schedule', '');
    p.main.setAttribute('data-hp-compact', '');
    let ours = p.left.querySelector('[data-haloplus="schedule-link"]');
    if (link && !ours) {
      ours = document.createElement('a');
      ours.setAttribute('data-haloplus', 'schedule-link');
      ours.href = link.href;
      ours.target = '_blank';
      ours.rel = 'noopener';
      ours.textContent = 'View your full schedule';
      ours.title = 'Your full class schedule, on GCU’s class schedule site (the link Halo shows under the title)';
      p.left.appendChild(ours);
    }
    // One clean row, the logo whole and on top of nothing: otherwise Halo's own header, as it was.
    const t = p.title.getBoundingClientRect();
    const l = p.logo.getBoundingClientRect();
    // Better Halo's copy has a fixed size: a little smaller here, in proportion.
    if (p.logo.tagName !== 'IMG' && !p.logo.dataset.hpW) {
      const w = parseFloat(p.logo.style.width);
      const h = parseFloat(p.logo.style.height);
      if (w > 0 && h > 0) {
        p.logo.dataset.hpW = '1';
        const k = Math.min(1, 44 / h, 260 / w);
        p.header.style.setProperty('--hp-logo-w', `${Math.round(w * k)}px`);
        p.header.style.setProperty('--hp-logo-h', `${Math.round(h * k)}px`);
      }
    }
    const loaded = p.logo.tagName !== 'IMG' || (p.logo.complete && p.logo.naturalWidth > 0);
    if (!loaded) {
      if (!p.logo.dataset.hpWait) {
        p.logo.dataset.hpWait = '1';
        p.logo.addEventListener('load', () => apply(), { once: true });
      }
      return;
    }
    const oneRow = l.top < t.bottom && l.bottom > t.top;
    const whole = l.width > 20 && l.height > 12 && l.right <= window.innerWidth + 1;
    // Nothing on top of the logo (checked while it is on screen).
    const inView = l.top >= 0 && l.bottom <= window.innerHeight;
    const hit = inView ? document.elementFromPoint(l.left + l.width / 2, l.top + l.height / 2) : p.logo;
    const covered = !(hit === p.logo || p.logo.contains(hit) || (hit && hit.closest && p.logo.closest('a') && hit.closest('a') === p.logo.closest('a')));
    if (!oneRow || !whole || covered) {
      failed = true;
      undo();
    }
  }
  O.feature({
    id: 'homeheader',
    routes: ['home'],
    start() {
      failed = false;
      apply();
    },
    update() {
      apply();
    },
    stop() {
      undo();
      failed = false;
    },
  });
})();
