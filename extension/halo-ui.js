// Halo+ on Halo. Calm, small, and only when it helps (0.9.0, George, 2026-10-23: 0.8.0's card "looks like an ad").
// - Halo's home page: a pill in the corner. Dark with gold text by default ("Next: Quiz #2 tomorrow"); gold "N due
//   today" when graded work is due today; red only for graded work overdue or due within 3 hours; green "✓ All caught
//   up" when nothing graded is due today or tomorrow. Hover: at most 3 rows under small headers, the participation
//   line, "See all in Halo+".
// - The peek: the first Halo home visit each day, the pill slides out wider for about 6 seconds with one line, "Next up:
//   Quiz #2 · tomorrow · 50 pts", then shrinks back. Hovering keeps it open, clicking opens that item in Halo+, a small
//   × shows on hover. It peeks again only for one thing that matters since the last look (a graded date moved, a new
//   requirement on a 20+ point item, graded work now due within 3 hours), at most 3 times a day, and not again that day
//   after two closes without a click. Never on the first run.
// - A small gray line under each of Halo's class cards; gold only for a real extra requirement, red only for graded work
//   overdue. Participation never drives any of it.
// - An assignment on Halo (a unit page, a quiz): what announcements added, or a date an announcement moved, if any.
// - After a submission anywhere on Halo: a peek, "Nice. Next up: …".
// From the student's own Halo+ data on this computer (halo-model.js); nothing is sent anywhere but the worker's counts.
// Everything sits in its own shadow root; anything that cannot find its place does nothing. Halo must never break.
(function () {
  const alive = () => {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  };
  const prev = globalThis.__haloPlusUi;
  if (prev && prev.alive()) return;
  globalThis.__haloPlusUi = { alive };
  const M = globalThis.HaloPlusModel;
  if (!M) return;
  const ORIGIN = 'https://haloplus.app';
  const PEEK_MS = 6000;
  const guard = (fn) =>
    function (...a) {
      try {
        return fn.apply(this, a);
      } catch {
        return undefined;
      }
    };

  // ---- state ---------------------------------------------------------------------------------------------------------
  let st = { haloSnap: null, haloLive: null, haloDone: null, haloUi: null, haloUiOn: null, haloBase: null, tier: null };
  let view = null;
  const KEYS = ['haloSnap', 'haloLive', 'haloDone', 'haloUi', 'haloUiOn', 'haloBase', 'tier'];
  const load = async () => {
    try {
      st = await chrome.storage.local.get(KEYS);
    } catch {
      /* the extension was updated under this page */
    }
    view = M.merge(st.haloSnap, st.haloLive, st.haloDone);
  };
  const save = (patch) => {
    Object.assign(st, patch);
    chrome.storage.local.set(patch).catch(() => undefined);
  };
  // The worker's counts for Admin keep 0.8.0's names: "card" is the peek now.
  const count = (event) => chrome.runtime.sendMessage({ kind: 'halo-ui', event }).catch(() => undefined);
  /** On unless turned off, in the popup or in Halo+ (whichever was changed last). */
  const showing = () => {
    if (!view) return false;
    const local = st.haloUiOn;
    if (local && (!view.showAt || local.at > view.showAt)) return local.on !== false;
    return view.show !== false;
  };
  const free = () => !view || view.plan === 'free' || !['plus', 'max'].includes(st.tier);
  const today = () => M.dayOf(Date.now(), view.tz);
  /** Today's memory: peeked, how many re-peeks, closes without a click, what was flagged as due soon. */
  const ui = () => {
    const u = st.haloUi || {};
    if (u.day === today()) return { ...u };
    return { day: today(), first: false, reopens: 0, closes: 0, flagged: [] };
  };
  const repeekOk = (u) => (u.reopens || 0) < 3 && (u.closes || 0) < 2;

  // ---- where we are ----------------------------------------------------------------------------------------------------
  function route() {
    const p = location.pathname;
    if (/^\/(login|auth|admin|halo-admin)(\/|$)/.test(p)) return { kind: 'none' };
    if (p === '/' || p === '') return { kind: 'home' };
    let m = /^\/courses\/([^/]+)\/course-units\/([^/]+)/.exec(p);
    if (m) return { kind: 'unit', slug: decodeURIComponent(m[1]), unit: decodeURIComponent(m[2]) };
    m = /^\/quiz\/([^/]+)/.exec(p);
    if (m) return { kind: 'quiz', id: decodeURIComponent(m[1]) };
    return { kind: 'other' };
  }

  // ---- the layer: the pill (and its peek) and the hover list, in one shadow root on <html> -----------------------------
  // The pill is always dark, on Halo's light and dark pages alike: a small calm object, not a banner.
  const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap { --bg: #16191e; --bg2: #20242b; --ink: #f1f3f5; --ink2: #b9c1cb; --ink3: #8b95a1; --line: rgba(255,255,255,.10); --gold: #f2b84b; --green: #5fd393; --red: #e5484d;
  font: 13px/1.35 Inter, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--ink); -webkit-font-smoothing: antialiased; }
.pill { position: fixed; bottom: 18px; right: 18px; z-index: 2147483000; display: inline-flex; align-items: center; gap: 8px; height: 34px; max-width: 280px;
  padding: 0 14px 0 11px; border-radius: 999px; border: 1px solid var(--line); background: var(--bg); color: var(--gold); cursor: pointer;
  font: 600 13px/1 Inter, -apple-system, "Segoe UI", Roboto, sans-serif; box-shadow: 0 6px 18px rgba(0,0,0,.22);
  transition: max-width .45s cubic-bezier(.2,.8,.2,1), background-color .2s, color .2s; overflow: hidden; white-space: nowrap; }
.pill[data-side="left"] { right: auto; left: 18px; }
.pill:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.mark { width: 12px; height: 12px; border-radius: 50%; border: 2px solid currentColor; flex: none; opacity: .95; }
.pill[data-tone="gold"] { background: var(--gold); color: #17130a; border-color: transparent; }
.pill[data-tone="red"] { background: var(--red); color: #fff; border-color: transparent; }
.pill[data-tone="green"] { color: var(--green); }
.pill[data-tone="muted"] { color: var(--ink2); }
.pill [data-part="green"] { color: var(--green); }
.pill [data-part="gold"] { color: var(--gold); }
.pill .dot { color: var(--ink3); }
.txt { overflow: hidden; text-overflow: ellipsis; }
.long { display: none; }
.pill[data-peek] { max-width: min(560px, calc(100vw - 36px)); }
.pill[data-peek] .short { display: none; }
.pill[data-peek] .long { display: inline; }
.pill[data-peek][data-tone="gold"] { background: var(--bg); color: var(--gold); border-color: var(--line); }
.x { display: none; margin: 0 -6px 0 2px; width: 22px; height: 22px; border-radius: 50%; border: 0; background: transparent; color: inherit; opacity: .7; font: 600 15px/1 Inter, sans-serif; cursor: pointer; flex: none; }
.pill[data-peek]:hover .x, .pill[data-peek]:focus-within .x { display: inline-block; }
.x:hover { opacity: 1; background: rgba(255,255,255,.12); }
.tip { position: fixed; bottom: 60px; right: 18px; width: 320px; max-width: calc(100vw - 36px); z-index: 2147483000; background: var(--bg); border: 1px solid var(--line);
  border-radius: 12px; box-shadow: 0 14px 40px rgba(0,0,0,.28); padding: 10px 12px 10px; }
.tip[data-side="left"] { right: auto; left: 18px; }
.tip h3 { margin: 8px 0 4px; font-size: 10.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: var(--ink3); }
.tip h3:first-child { margin-top: 0; }
.tip h3[data-late] { color: var(--red); }
.tip ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.tip li { display: grid; gap: 1px; }
.tip li .l { color: var(--ink); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tip li .m { color: var(--ink3); font-size: 12px; }
.tip h3[data-late] + ul .m { color: var(--red); }
.tip .none { margin: 0; color: var(--ink2); }
.tip .clear { margin: 0 0 2px; color: var(--ink2); font-size: 12px; }
.tip .clear b { color: var(--ink); font-weight: 700; }
.tip .clear span { color: var(--green); font-weight: 700; }
.tip .part { margin: 10px 0 0; padding-top: 8px; border-top: 1px solid var(--line); color: var(--ink2); font-size: 12px; }
.tip .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 10px 0 0; padding-top: 8px; border-top: 1px solid var(--line); font-size: 12px; color: var(--ink3); }
.tip a, .tip button { color: var(--gold); font: 600 12px/1.2 Inter, sans-serif; text-decoration: none; background: none; border: 0; padding: 0; cursor: pointer; }
.tip a:hover, .tip button:hover { text-decoration: underline; }
@media (prefers-reduced-motion: reduce) { .pill { transition: none; } }
`;
  let host = null;
  let root = null;
  function layer() {
    if (host && host.isConnected) return root;
    host = document.createElement('div');
    host.setAttribute('data-haloplus', 'layer');
    host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483000;';
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style><div class="wrap"></div>`;
    document.documentElement.appendChild(host);
    return root;
  }
  const wrap = () => layer().querySelector('.wrap');
  function clearLayer() {
    if (host) host.remove();
    host = null;
    root = null;
    peeking = null;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /** The pill's corner: bottom right, unless a Halo button sits there; then bottom left. */
  function pillSide() {
    const clickable = (x, y) =>
      document.elementsFromPoint(x, y).some((el) => !(host && host.contains(el)) && el.closest && el.closest('button, a, input, select, textarea, [role="button"]'));
    const y = window.innerHeight - 35;
    if (!clickable(window.innerWidth - 80, y) && !clickable(window.innerWidth - 30, y)) return 'right';
    if (!clickable(80, y) && !clickable(30, y)) return 'left';
    return 'right';
  }
  const openHaloPlus = (target, via) => {
    count(via === 'card' || via === 'next' ? 'card-click' : via === 'pill' ? 'pill-click' : via === 'class' ? 'class-click' : 'box-click');
    window.open(M.link(ORIGIN, target, via), '_blank', 'noopener');
  };

  // ---- the pill and its peek ---------------------------------------------------------------------------------------------
  /** { p, via, clicked, timer, hover } while the pill is out. */
  let peeking = null;
  function pillEl() {
    const w = wrap();
    let el = w.querySelector('.pill');
    if (el) return el;
    el = document.createElement('div');
    el.className = 'pill';
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.innerHTML = '<span class="mark" aria-hidden="true"></span><span class="txt short"></span><span class="txt long"></span><button class="x" type="button" aria-label="Close" title="Close">×</button>';
    w.appendChild(el);
    const go = (e) => {
      if (e.target && e.target.closest && e.target.closest('.x')) return;
      if (peeking) {
        peeking.clicked = true;
        const { p, via } = peeking;
        endPeek(false);
        hideTip();
        return openHaloPlus(p && p.key ? p : null, via === 'next' ? 'next' : 'card');
      }
      openHaloPlus(null, 'pill');
    };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), go(e)));
    el.querySelector('.x').addEventListener('click', (e) => {
      e.stopPropagation();
      endPeek(true);
    });
    el.addEventListener('mouseenter', () => {
      if (peeking) {
        peeking.hover = true;
        clearTimeout(peeking.timer);
      } else showTip();
    });
    el.addEventListener('mouseleave', () => {
      hideTip();
      if (peeking) {
        peeking.hover = false;
        peeking.timer = setTimeout(guard(() => endPeek(false)), 1500);
      }
    });
    el.addEventListener('focus', () => !peeking && showTip());
    el.addEventListener('blur', hideTip);
    return el;
  }
  function renderPill() {
    if (!view) return;
    const r = route().kind;
    if (r !== 'home' && !peeking) return;
    const el = pillEl();
    const now = Date.now();
    const p = free() ? { tone: 'muted', text: `Halo+ · synced ${M.syncedDay(view)}` } : M.pill(view, now);
    el.dataset.tone = peeking ? peeking.p.tone || 'calm' : p.tone;
    el.dataset.side = pillSide();
    // "✓ Today's done · 2 due tomorrow": the check green, the count gold.
    const short = el.querySelector('.short');
    if (p.parts) short.innerHTML = p.parts.map((x) => `<span data-part="${x.tone}">${esc(x.text)}</span>`).join('<span class="dot"> · </span>');
    else short.textContent = p.text;
    el.querySelector('.long').textContent = peeking ? peeking.p.text : '';
    if (peeking) el.dataset.peek = '';
    else delete el.dataset.peek;
    el.setAttribute('aria-label', peeking ? `Halo+: ${peeking.p.text}` : `Halo+: ${p.text}. Open Halo+`);
  }
  /** Slide out with one line for about 6 seconds (longer while hovered). */
  function peek(p, via) {
    if (!p) return;
    if (peeking) clearTimeout(peeking.timer);
    peeking = { p, via, clicked: false, hover: false, timer: 0 };
    renderPill();
    hideTip();
    peeking.timer = setTimeout(guard(() => !(peeking && peeking.hover) && endPeek(false)), PEEK_MS);
    count(via === 'next' ? 'next-shown' : 'card-shown');
  }
  function endPeek(byHand) {
    if (!peeking) return;
    clearTimeout(peeking.timer);
    if (byHand && !peeking.clicked) {
      const u = ui();
      u.closes = (u.closes || 0) + 1;
      save({ haloUi: u });
      count('card-closed');
    }
    peeking = null;
    if (route().kind === 'home') renderPill();
    else clearLayer();
  }

  // ---- the hover list ------------------------------------------------------------------------------------------------
  function showTip() {
    if (!view || peeking) return;
    const w = wrap();
    w.querySelector('.tip')?.remove();
    const now = Date.now();
    const list = M.hoverList(view, now);
    const asof = M.stale(view, now);
    const el = document.createElement('div');
    el.className = 'tip';
    el.dataset.side = w.querySelector('.pill')?.dataset.side || 'right';
    const groups = list.groups
      .map(
        (g) =>
          `<h3${g.head === 'Overdue' ? ' data-late' : ''}>${esc(g.head)}</h3><ul>${g.rows
            .map((r) => `<li><span class="l" title="${esc(r.title)}">${esc(r.title)}</span><span class="m">${esc([r.code, list.todayDone ? '' : r.when, r.pts ? `${r.pts} pts` : ''].filter(Boolean).join(' · '))}</span></li>`)
            .join('')}</ul>`,
      )
      .join('');
    const clear = list.todayDone ? '<p class="clear"><b>Today:</b> All done <span>✓</span></p>' : '';
    el.innerHTML = `${clear}${groups || '<p class="none">Nothing graded due soon.</p>'}${list.part ? `<p class="part">${esc(list.part)}</p>` : ''}<div class="foot"><span>${
      free() ? `Synced ${esc(M.syncedDay(view))}` : asof ? esc(asof[0].toUpperCase() + asof.slice(1)) : ''
    }${asof && !free() ? ' · <button class="sync" type="button">Sync now</button>' : ''}</span><a href="${esc(M.link(ORIGIN, null, 'pill'))}" target="_blank" rel="noopener">See all in Halo+</a></div>`;
    w.appendChild(el);
    el.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      openHaloPlus(null, 'pill');
    });
    el.querySelector('.sync')?.addEventListener('click', (e) => {
      count('sync-click');
      chrome.runtime.sendMessage({ kind: 'sync-now' }).catch(() => undefined);
      e.target.textContent = 'Syncing…';
    });
    // The list stays while the pointer moves onto it.
    el.addEventListener('mouseenter', () => (el.dataset.hover = '1'));
    el.addEventListener('mouseleave', () => el.remove());
    count('pill-hover');
  }
  function hideTip() {
    setTimeout(
      guard(() => {
        const t = root && root.querySelector('.tip');
        if (t && !t.dataset.hover) t.remove();
      }),
      250,
    );
  }

  // ---- the class lines under Halo's class cards ------------------------------------------------------------------------
  // Real Halo (build Jk7eKpHtXMWHqa6Y8LtAT, read from its own code 2026-10-23): each class card is
  // Paper.ClassDetails_containerCard > a > button > div > h3 [stage badge "Topic 7"] "CHM-113-WF700A", then the name.
  // 0.8.0 looked for text that starts with the code, so the badge in front of it meant no line ever showed.
  // 0.9.3 (George on real Halo, 2026-10-24: no line under ENG-105-ONL4, CHM-113-WF700A, CHM-113L-M600A): Halo's HOME
  // page cards are another component, CourseCard_cardContainer (a chunk Halo loads on demand; Better Halo, which George
  // also runs, finds the same cards and puts its "Upcoming Assignments" in them before the card's <hr>). cardFor only
  // knew ClassDetails, so a home card was never found. A home card is now matched by the /courses/<slug> link inside
  // it, which is the class's own Halo slug, never by text; a card whose line would not show (clipped) gets none.
  const LINE_CSS = `:host{all:initial}
.l{display:block;margin:6px 0 2px;padding:0 2px;font:500 12px/1.35 Inter,-apple-system,"Segoe UI",Roboto,sans-serif;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
@media (prefers-color-scheme: dark){.l{color:#9aa3ad}}
.l b{font-weight:700}
.l [data-tone=red]{color:#d93a3f}.l [data-tone=gold]{color:#a87400}
@media (prefers-color-scheme: dark){.l [data-tone=red]{color:#ff7b7f}.l [data-tone=gold]{color:#f2b84b}}
.l:hover{text-decoration:underline}`;
  const CODE_RE = /[A-Z]{2,5}-\d{2,4}[A-Z]?-[A-Z0-9]{2,}/i;
  function cardFor(el) {
    // Halo's ClassDetails card, else a list item that holds the card (Halo's class list), else nothing.
    const paper = el.closest('[class*="containerCard"], [class*="ClassDetails_container"]');
    if (paper) return paper;
    const li = el.closest('li');
    if (li && li.closest('#__next') && /\bm-4\b/.test(li.className || '')) return li.firstElementChild || li;
    return null;
  }
  /** Halo's home page class cards, each with the class it links to: [card, class]. Only an exact slug match counts. */
  function homeCards() {
    const out = [];
    for (const card of document.querySelectorAll('[class*="CourseCard_cardContainer"]')) {
      if (card.closest('[data-haloplus]') || card.dataset.haloplusNoLine) continue;
      const a = card.querySelector('a[href*="/courses/"]');
      const m = a && (a.getAttribute('href') || '').match(/\/courses\/([^/?#]+)/);
      if (!m) continue;
      const slug = decodeURIComponent(m[1]).toLowerCase();
      const cls = view.classes.find((c) => c.slug && c.slug.toLowerCase() === slug);
      if (cls) out.push([card, cls]);
    }
    return out;
  }
  /** One line's element, in its own shadow root; clicks open the class in Halo+ and never reach Halo's card link. */
  function lineHost() {
    const h = document.createElement('div');
    h.setAttribute('data-haloplus', 'class');
    h.style.cssText = 'all: initial; display: block;';
    const sr = h.attachShadow({ mode: 'open' });
    sr.innerHTML = `<style>${LINE_CSS}</style><div></div>`;
    const go = (e) => {
      e.preventDefault();
      e.stopPropagation();
      openHaloPlus({ courseId: String(h.dataset.course || '').startsWith('live:') ? null : h.dataset.course }, 'class');
    };
    h.addEventListener('click', go, true);
    h.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && go(e));
    return h;
  }
  const lineHtml = (cls, now) => `<div class="l" role="link" tabindex="0" title="Open ${esc(cls.code)} in Halo+"><b>Halo+</b> · ${M.classLine(view, cls, now).map((p) => `<span data-tone="${p.tone}">${esc(p.text)}</span>`).join(' · ')}</div>`;
  function fill(h, cls, now) {
    h.dataset.course = cls.key;
    const inner = h.shadowRoot.querySelector('div');
    const html = lineHtml(cls, now);
    if (inner.innerHTML !== html) inner.innerHTML = html;
  }
  /** The left edge of the card's own text (where the class code starts), so the line lines up with it. */
  function textInset(card) {
    const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (CODE_RE.test(n.nodeValue || '') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
    const n = walk.nextNode();
    if (!n || !n.parentElement) return 0;
    const x = n.parentElement.getBoundingClientRect().left - card.getBoundingClientRect().left - (parseFloat(getComputedStyle(card).borderLeftWidth) || 0);
    return Math.max(0, Math.min(40, Math.round(x)));
  }
  /** A line that does not show inside its card (the card clips it, or it has no size): taken out, and not tried again. */
  function keepIfShown(h, card) {
    requestAnimationFrame(() => {
      if (!h.isConnected) return;
      const x = textInset(card);
      if (x > 2) h.style.padding = `0 ${x - 2}px`;
      const r = h.getBoundingClientRect();
      const c = card.getBoundingClientRect();
      const clipped = getComputedStyle(card).overflow !== 'visible' && (r.top < c.top - 1 || r.bottom > c.bottom + 1);
      if (r.height < 8 || r.width < 40 || clipped) {
        h.remove();
        card.dataset.haloplusNoLine = '1';
      }
    });
  }
  function classLines() {
    if (!view || free()) return removeAll('[data-haloplus="class"]');
    const now = Date.now();
    const done = new Set();
    // Halo's home page: before Better Halo's list when it is there, else before the card's rule, else at the end.
    for (const [card, cls] of homeCards()) {
      if (done.has(cls.key)) continue;
      done.add(cls.key);
      let h = card.querySelector('[data-haloplus="class"]');
      if (!h) {
        h = lineHost();
        const bh = card.querySelector(':scope .better-halo-todo-list');
        const hr = card.querySelector(':scope hr');
        const at = bh || hr;
        if (at && at.parentNode) at.parentNode.insertBefore(h, at);
        else card.appendChild(h);
        fill(h, cls, now);
        keepIfShown(h, card);
      } else fill(h, cls, now);
    }
    const app = document.getElementById('__next') || document.body;
    const walk = document.createTreeWalker(app, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (CODE_RE.test(n.nodeValue || '') && !(n.parentElement && n.parentElement.closest('[data-haloplus]')) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const el = n.parentElement;
      if (!el) continue;
      const text = (el.textContent || '').trim();
      if (text.length > 60) continue;
      const cls = M.classByCode(view, text);
      if (!cls || done.has(cls.key)) continue;
      const card = cardFor(el);
      if (!card) continue;
      done.add(cls.key);
      let h = card.querySelector(':scope > [data-haloplus="class"]');
      if (!h) {
        h = lineHost();
        // Outside Halo's own button and link: at the end of the card itself.
        card.appendChild(h);
      }
      fill(h, cls, now);
    }
  }
  function removeAll(sel) {
    document.querySelectorAll(sel).forEach((n) => n.remove());
  }

  // ---- the assignment line ---------------------------------------------------------------------------------------------
  // 0.9.1 (George, 2026-10-24: the black box with a list and a gold button clashed with Halo's white page): one quiet
  // line in Halo's own font and card colors, a thin gold left border, a small Halo+ mark. "+2 more" opens the rest
  // inline; the line opens the item in Halo+. Only for a moved date, something to bring or have, a new deliverable.
  const BOX_CSS = `:host{all:initial}
.b{display:block;margin:8px 0;padding:7px 12px;border-radius:6px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-left:3px solid #f2b84b;font:13.5px/1.45 var(--font);max-width:760px;box-sizing:border-box}
.l{color:inherit;text-decoration:none}
.l:hover .t,.l:focus-visible .t{text-decoration:underline}
.l:focus-visible{outline:2px solid #f2b84b;outline-offset:2px;border-radius:3px}
.mk{display:inline-block;width:8px;height:8px;border:2px solid var(--gold);border-radius:50%;margin-right:6px;vertical-align:0}
.h{font-weight:700;color:var(--gold)}
.s{opacity:.45;margin:0 5px}
.more{background:none;border:0;padding:0;margin-left:8px;color:var(--gold);font:inherit;font-weight:600;cursor:pointer;white-space:nowrap}
.more:hover{text-decoration:underline}
.rest{margin:4px 0 1px 20px;padding:0;list-style:none}
.rest li{margin:2px 0}
.rest li::before{content:"· ";opacity:.5}`;
  /** Halo's own look where the line goes: the background behind it, its text color and font, light or dark. */
  function lookAt(el) {
    let bg = null;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c || '');
      if (m && (m[4] === undefined || Number(m[4]) > 0.5)) {
        bg = [Number(m[1]), Number(m[2]), Number(m[3])];
        break;
      }
    }
    if (!bg) {
      const c = getComputedStyle(document.body).backgroundColor;
      const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(c || '');
      bg = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [255, 255, 255];
    }
    const lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
    const dark = lum < 0.45;
    const cs = getComputedStyle(el);
    const lift = (v) => Math.min(255, Math.round(v + (dark ? 14 : 0)));
    return {
      dark,
      bg: dark ? `rgb(${lift(bg[0])}, ${lift(bg[1])}, ${lift(bg[2])})` : '#ffffff',
      ink: cs.color || (dark ? '#e6e6ea' : '#212121'),
      line: dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.12)',
      gold: dark ? '#f2b84b' : '#9a6a00',
      font: cs.fontFamily || 'inherit',
    };
  }
  const boxShown = new Set();
  function boxes() {
    removeStaleBoxes();
    if (!view) return;
    const r = route();
    const now = Date.now();
    if (r.kind === 'quiz') {
      const it = view.items.find((i) => i.h === r.id);
      const c = M.caught(view, it, now);
      const main = document.querySelector('#__next main') || document.querySelector('main');
      if (!c || !main) return;
      placeBox(c, (b) => main.insertAdjacentElement('afterbegin', b), `quiz:${r.id}`, main);
      return;
    }
    if (r.kind !== 'unit') return;
    const cls = view.classes.find((k) => k.slug && k.slug.toLowerCase() === r.slug.toLowerCase());
    if (!cls) return;
    const want = view.items.filter((i) => i.c === cls.key && (!i.u || i.u === r.unit)).map((i) => ({ i, c: M.caught(view, i, now) })).filter((x) => x.c);
    if (!want.length) return;
    const texts = document.querySelectorAll('#__next h1, #__next h2, #__next h3, #__next h4, #__next p, #__next span, #__next a, #__next button, #__next div');
    for (const { i, c } of want) {
      const names = [i.ht, i.t].filter(Boolean).map((s) => s.trim().toLowerCase());
      let title = null;
      for (const el of texts) {
        if (el.closest('[data-haloplus]') || el.children.length > 3) continue;
        const t = (el.textContent || '').trim().toLowerCase();
        if (t && t.length < 200 && names.includes(t)) {
          title = el;
          break;
        }
      }
      if (!title) continue;
      // Under the title's own row.
      let row = title;
      const parent = title.parentElement;
      if (parent && /flex/.test(getComputedStyle(parent).display) && getComputedStyle(parent).flexDirection.startsWith('row')) row = parent;
      placeBox(c, (b) => row.insertAdjacentElement('afterend', b), `item:${M.itemKey(i)}`, title);
    }
  }
  function placeBox(c, put, key, anchor) {
    if (document.querySelector(`[data-haloplus="box"][data-key="${CSS.escape(key)}"]`)) return;
    const look = lookAt(anchor || document.body);
    const h = document.createElement('div');
    h.setAttribute('data-haloplus', 'box');
    h.dataset.key = key;
    h.style.cssText = 'all: initial; display: block;';
    const sr = h.attachShadow({ mode: 'open' });
    const href = M.link(ORIGIN, c, 'box');
    const more = c.more.length;
    sr.innerHTML = `<style>${BOX_CSS}</style><div class="b" role="note" data-dark="${look.dark ? 1 : 0}" style="--bg:${look.bg};--ink:${esc(look.ink)};--line:${look.line};--gold:${look.gold};--font:${esc(look.font)}"><a class="l" href="${esc(href)}" target="_blank" rel="noopener" title="Open in Halo+"><span class="mk" aria-hidden="true"></span><span class="h">Halo+</span><span class="s" aria-hidden="true">·</span><span class="t">${esc(c.line)}</span></a>${more ? `<button class="more" type="button" aria-expanded="false">+${more} more</button><ul class="rest" hidden>${c.more.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
    sr.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openHaloPlus(c, 'box');
    });
    const btn = sr.querySelector('.more');
    if (btn)
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const ul = sr.querySelector('.rest');
        const open = ul.hidden;
        ul.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
        btn.textContent = open ? 'less' : `+${more} more`;
      });
    put(h);
    if (!boxShown.has(key)) {
      boxShown.add(key);
      count('box-shown');
    }
  }
  function removeStaleBoxes() {
    const r = route();
    document.querySelectorAll('[data-haloplus="box"]').forEach((b) => {
      const k = b.dataset.key || '';
      if (r.kind === 'quiz' ? k !== `quiz:${r.id}` : r.kind !== 'unit') b.remove();
    });
  }

  // ---- when to peek -----------------------------------------------------------------------------------------------------
  function home() {
    if (!view) return;
    renderPill();
    if (free() || peeking) return;
    const u = ui();
    const now = Date.now();
    // What changed since the last look, judged against a baseline in one shape; then the baseline moves on. On the
    // first run there is no baseline: it is only recorded.
    const n = M.notable(view, st.haloBase, now, u.flagged);
    if (view.items.length) save({ haloBase: M.baseline(view) });
    if (n && n.kind === 'soon') u.flagged = [...(u.flagged || []), n.key].slice(-50);
    if (!u.first) {
      u.first = true;
      save({ haloUi: u });
      return peek(n && n.kind !== 'soon' ? n : M.peek(view, now), 'card');
    }
    if (n && repeekOk(u)) {
      u.reopens = (u.reopens || 0) + 1;
      save({ haloUi: u });
      return peek(n, 'card');
    }
    save({ haloUi: u });
  }

  const render = guard(function render() {
    if (!view || !showing()) {
      clearLayer();
      removeAll('[data-haloplus="class"]');
      removeAll('[data-haloplus="box"]');
      return;
    }
    const r = route();
    if (r.kind === 'home') {
      home();
      classLines();
    } else {
      // Away from the home page the pill goes; a peek after a submission stays until it ends.
      if (!peeking) clearLayer();
      removeAll('[data-haloplus="class"]');
    }
    boxes();
  });

  // After a submission (content-halo.js has just celebrated it): "Nice. Next up: …", once the confetti has had its moment.
  window.addEventListener(
    'haloplus:submitted',
    guard((e) => {
      if (!view || !showing() || free()) return;
      const id = e && e.detail ? e.detail.id : null;
      setTimeout(
        guard(() => peek(M.nextAfter(view, Date.now(), id), 'next')),
        2800,
      );
    }),
  );

  // ---- keeping up --------------------------------------------------------------------------------------------------
  let path = location.pathname;
  let queued = 0;
  const soon = () => {
    if (queued) return;
    queued = setTimeout(() => {
      queued = 0;
      render();
    }, 400);
  };
  void load().then(render);
  chrome.storage.onChanged.addListener(
    guard((changes, area) => {
      if (area !== 'local' || !KEYS.some((k) => k in changes)) return;
      void load().then(() => {
        // Only today's memory or the baseline changing (another Halo tab): just the pill.
        if (Object.keys(changes).every((k) => k === 'haloUi' || k === 'haloBase')) renderPill();
        else render();
      });
    }),
  );
  setInterval(
    guard(() => {
      if (!alive()) return;
      if (location.pathname !== path) {
        path = location.pathname;
        render();
      }
    }),
    700,
  );
  // The pill's time words and something coming within 3 hours.
  setInterval(guard(() => alive() && render()), 60_000);
  // Halo re-renders: put the class lines and the box back.
  new MutationObserver(
    guard((records) => {
      if (!alive()) return;
      for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1 && !(n.closest && n.closest('[data-haloplus]')) && !(host && host.contains(n))) return soon();
    }),
  ).observe(document.documentElement, { childList: true, subtree: true });
})();
