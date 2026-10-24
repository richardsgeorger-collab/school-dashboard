// Halo+ on Halo. Calm, small, and only when it helps (0.9.0, George, 2026-10-23: 0.8.0's card "looks like an ad").
// - Halo's Student Home (0.10.0): "This week" at the top, in Halo's own card look (see its section below); it is the
//   day's look there, so no pill and no peek on Student Home. Halo's other pages: the pill (quiet on an assignment's
//   page, gone while a quiz is being taken). Where "This week" cannot sit cleanly, Student Home keeps the pill.
// - The pill: a small one in the corner. Dark with gold text by default ("Next: Quiz #2 tomorrow"); gold "N due
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
  let st = { haloSnap: null, haloLive: null, haloDone: null, haloMarks: null, haloWeek: null, haloUi: null, haloUiOn: null, haloBase: null, tier: null, syncKey: null };
  let view = null;
  const KEYS = ['haloSnap', 'haloLive', 'haloDone', 'haloMarks', 'haloWeek', 'haloUi', 'haloUiOn', 'haloBase', 'tier', 'syncKey'];
  const load = async () => {
    try {
      st = await chrome.storage.local.get(KEYS);
    } catch {
      /* the extension was updated under this page */
    }
    // Done in Halo+ (any device), and this computer's own check-offs still on their way there.
    view = M.merge(st.haloSnap, st.haloLive, M.doneFrom(st.haloDone, st.haloMarks));
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
    if (!pillHere() && !peeking) return;
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
    if (pillHere()) renderPill();
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

  // ---- "This week" on Halo's Student Home (0.10.0, George 2026-10-24) -------------------------------------------------
  // At the top of Student Home, above the class cards and below Halo's own tabs, the full width of the card area: what is
  // due this week across every class, graded work only, from the same rules as the pill (halo-model.js week). It takes
  // the look of Halo's own class card on the page (its background, corners, shadow, border, font and ink), so it reads
  // as part of Halo under Halo's light and dark looks and under Better Halo's themes; a thin gold edge and a small Halo+
  // mark are the only accents. A header "This week · 6 due" folds it (remembered). A row opens the assignment on Halo;
  // "Open in Halo+" shows on hover; the box checks it off in Halo+ with a few seconds to undo. Participation is one line
  // at the bottom. On Student Home it is the day's look: no peek there, and no pill. It is placed only where it sits
  // cleanly (the full width, above the cards); otherwise nothing, and the pill does the job as before.
  const WEEK_ROWS = 8;
  const UNDO_MS = 5000;
  const WEEK_CSS = `:host{all:initial;display:block}
*{box-sizing:border-box}
.wk{position:relative;margin:0 0 16px;background:var(--bg);color:var(--ink);border:var(--border);border-radius:var(--radius);box-shadow:var(--shadow);font:14px/1.4 var(--font);overflow:hidden;-webkit-font-smoothing:antialiased}
.wk::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--gold)}
.hd{all:unset;box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;padding:12px 16px 12px 20px;cursor:pointer;font:600 15px/1.3 var(--font);color:var(--ink)}
.hd:focus-visible{outline:2px solid var(--gold);outline-offset:-3px;border-radius:var(--radius)}
.hd .n{color:var(--muted);font-weight:500}
.hd .asof{color:var(--muted);font-weight:400;font-size:12.5px}
.mk{margin-left:auto;display:inline-flex;align-items:center;gap:5px;font:700 11px/1 var(--font);letter-spacing:.02em;color:var(--muted)}
.mk i{display:inline-block;width:8px;height:8px;border:2px solid var(--gold);border-radius:50%}
.chev{width:16px;height:16px;flex:none;color:var(--muted);transition:transform .18s ease}
.hd[aria-expanded="false"] .chev{transform:rotate(-90deg)}
.bd{padding:0 16px 12px 20px}
.bd[hidden]{display:none}
.clear{margin:0 0 4px;color:var(--muted);font-size:13.5px}
.clear b{color:var(--ink);font-weight:600}
.clear span{color:var(--green);font-weight:700}
h4{margin:10px 0 2px;font:700 11px/1.2 var(--font);letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
h4:first-child{margin-top:0}
h4.late{color:var(--red)}
ul{list-style:none;margin:0;padding:0}
.r{display:flex;align-items:center;gap:10px;min-height:34px;padding:5px 8px;margin:0 -8px;border-radius:6px;cursor:pointer}
.r:hover,.r:focus-within{background:var(--hover)}
.r input{margin:0;width:16px;height:16px;flex:none;accent-color:var(--gold);cursor:pointer}
.r .sp{width:16px;flex:none}
.dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--muted)}
.t{min-width:0;flex:0 1 auto;color:var(--ink);font-weight:600;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.t:focus-visible{outline:2px solid var(--gold);outline-offset:2px;border-radius:3px}
.c{flex:none;color:var(--muted);font-size:12.5px;white-space:nowrap}
.x{flex:none;width:6px;height:6px;border-radius:50%;background:var(--gold)}
.gap{flex:1 1 auto}
.plus{display:none;flex:none;color:var(--gold-ink);font-size:12.5px;font-weight:600;text-decoration:none;white-space:nowrap}
.plus:hover{text-decoration:underline}
.r:hover .plus,.r:focus-within .plus{display:inline}
.w{flex:none;color:var(--muted);font-size:12.5px;white-space:nowrap;font-variant-numeric:tabular-nums}
.r.late .w{color:var(--red)}
.p{flex:none;min-width:46px;text-align:right;color:var(--muted);font-size:12.5px;white-space:nowrap;font-variant-numeric:tabular-nums}
.r.on .t{text-decoration:line-through;color:var(--muted)}
.undo{all:unset;flex:none;color:var(--gold-ink);font:600 12.5px/1 var(--font);cursor:pointer;padding:4px 2px}
.undo:hover{text-decoration:underline}
.undo:focus-visible{outline:2px solid var(--gold);outline-offset:2px;border-radius:3px}
.more{all:unset;display:inline-block;margin:6px 0 0;color:var(--gold-ink);font:600 13px/1.2 var(--font);cursor:pointer}
.more:hover{text-decoration:underline}
.more:focus-visible{outline:2px solid var(--gold);outline-offset:2px;border-radius:3px}
.part{margin:10px 0 0;padding-top:8px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
.none{margin:0;color:var(--muted)}
@media (prefers-reduced-motion: reduce){.chev{transition:none}}`;

  /** Halo's home page class cards, and the box that holds them all (their grid). */
  function homeGrid() {
    const cards = [...document.querySelectorAll('[class*="CourseCard_cardContainer"]')].filter((c) => !c.closest('[data-haloplus]'));
    if (!cards.length) return null;
    let g = cards[0].parentElement;
    while (g && !cards.every((c) => g.contains(c))) g = g.parentElement;
    const app = document.getElementById('__next');
    if (!g || !app || !app.contains(g) || g === app) return null;
    return { grid: g, card: cards[0] };
  }
  /** Halo's own tabs ("Current classes" and the rest): the panel is for the current ones only. */
  function currentTab() {
    const sel = document.querySelector('#__next [role="tab"][aria-selected="true"]');
    return !sel || /current|active|in progress/i.test(sel.textContent || '');
  }
  const rgb = (c) => {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c || '');
    return m ? { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) } : null;
  };
  /**
   * The look of Halo's own class card under the page's look right now (Halo's light or dark, or a Better Halo theme),
   * read from an invisible copy of the card made for the moment: a new element takes the theme's final style at once,
   * where the card itself may be partway through a theme's fade, or lifted under the pointer.
   */
  function cardStyle(card) {
    const probe = document.createElement(card.tagName);
    probe.className = card.className;
    probe.setAttribute('data-haloplus', 'probe');
    probe.style.cssText = 'position:absolute!important;left:-10000px!important;top:0!important;width:200px!important;visibility:hidden!important;pointer-events:none!important;transition:none!important;animation:none!important';
    card.parentElement.appendChild(probe);
    const c = getComputedStyle(probe);
    const out = { backgroundColor: c.backgroundColor, color: c.color, borderTopWidth: c.borderTopWidth, borderTopStyle: c.borderTopStyle, borderTopColor: c.borderTopColor, borderRadius: c.borderRadius, boxShadow: c.boxShadow, fontFamily: c.fontFamily };
    probe.remove();
    return out;
  }
  function cardLook(card) {
    const cs = cardStyle(card);
    let bg = rgb(cs.backgroundColor);
    // The card's own fill, exactly (a theme may make it a little see-through); a card without one shows what is behind.
    let fill = cs.backgroundColor;
    if (!bg || bg.a < 0.5) {
      const l = lookAt(card);
      bg = rgb(l.bg) || { r: 255, g: 255, b: 255, a: 1 };
      fill = `rgb(${bg.r}, ${bg.g}, ${bg.b})`;
    }
    const lum = (0.2126 * bg.r + 0.7152 * bg.g + 0.0722 * bg.b) / 255;
    const dark = lum < 0.45;
    const ink = cs.color || (dark ? '#e6e6ea' : '#212121');
    const bw = parseFloat(cs.borderTopWidth) || 0;
    return {
      dark,
      bg: fill,
      ink,
      muted: `color-mix(in srgb, ${ink} 62%, transparent)`,
      line: dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.10)',
      hover: dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.04)',
      border: bw ? `${bw}px ${cs.borderTopStyle} ${cs.borderTopColor}` : 'none',
      radius: cs.borderRadius || '8px',
      shadow: cs.boxShadow && cs.boxShadow !== 'none' ? cs.boxShadow : bw ? 'none' : dark ? 'none' : '0 1px 3px rgba(0,0,0,.12)',
      font: cs.fontFamily || 'inherit',
      gold: dark ? '#f2b84b' : '#e0a526',
      goldInk: dark ? '#f2b84b' : '#8a5d00',
      red: dark ? '#ff7b7f' : '#c62828',
      green: dark ? '#5fd393' : '#1e7d4a',
    };
  }
  /** Check-offs still inside their Undo: { id: { until, timer } }. Shown checked in place until then. */
  const checking = new Map();
  let weekAll = false;
  let weekShownDay = '';
  let weekHtml = '';
  /**
   * The card's look, read once and again only when the page's look can have changed (a theme, light or dark, the panel
   * placed anew): reading it puts a copy of the card in Halo's grid for an instant, which other extensions watching the
   * grid (Better Halo) would see on every redraw.
   */
  let weekLook = null;
  /** The panel's own view: this computer's marks count as done, except the ones still inside their Undo. */
  function weekView() {
    const marks = { ...(st.haloMarks || {}) };
    for (const id of checking.keys()) delete marks[id];
    return M.merge(st.haloSnap, st.haloLive, M.doneFrom(st.haloDone, marks));
  }
  const weekOpen = () => !(st.haloWeek && st.haloWeek.open === false);
  const CHEV = '<svg class="chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function weekBody(w) {
    const out = [];
    if (w.todayDone) out.push('<p class="clear"><b>Today:</b> All done <span>✓</span></p>');
    let shown = 0;
    const total = w.groups.reduce((n, g) => n + g.rows.length, 0);
    for (const g of w.groups) {
      const rows = weekAll ? g.rows : g.rows.slice(0, Math.max(0, WEEK_ROWS - shown));
      if (!rows.length) continue;
      shown += rows.length;
      out.push(`<h4${g.head === 'Overdue' ? ' class="late"' : ''}>${esc(g.head)}</h4><ul>${rows
        .map((r) => {
          const on = r.id && checking.has(r.id);
          const box = r.canCheck && st.syncKey ? `<input type="checkbox" data-id="${esc(r.id)}" aria-label="Done: ${esc(r.title)}"${on ? ' checked' : ''}>` : '<span class="sp" aria-hidden="true"></span>';
          const dot = `<span class="dot" aria-hidden="true"${r.color && /^#[0-9a-f]{3,8}$/i.test(r.color) ? ` style="background:${r.color}"` : ''}></span>`;
          const x = r.extra.length ? `<span class="x" role="img" aria-label="Halo+ caught: ${esc(r.extra.join('; '))}" title="${esc(`Halo+ caught: ${r.extra.join(' · ')}`)}"></span>` : '';
          const tail = on
            ? `<span class="gap"></span><button class="undo" type="button" data-undo="${esc(r.id)}">Undo</button>`
            : `<span class="gap"></span>${r.courseId && r.id ? `<a class="plus" href="${esc(M.link(ORIGIN, r, 'week'))}" target="_blank" rel="noopener" data-plus>Open in Halo+</a>` : ''}<span class="w">${esc(r.time)}</span><span class="p">${r.pts ? `${r.pts} pts` : ''}</span>`;
          return `<li class="r${r.late ? ' late' : ''}${on ? ' on' : ''}" data-href="${esc(r.href)}">${box}${dot}<a class="t" href="${esc(r.href)}" title="${esc(r.title)}">${esc(r.title)}</a><span class="c">${esc(r.code)}</span>${x}${tail}</li>`;
        })
        .join('')}</ul>`);
    }
    if (!total && !w.todayDone) out.push('<p class="none">Nothing graded is due this week.</p>');
    else if (!total) out.push('<p class="none">Nothing else graded is due this week.</p>');
    if (!weekAll && total > WEEK_ROWS) out.push(`<button class="more" type="button">Show all ${total}</button>`);
    if (w.part) out.push(`<p class="part">${esc(w.part)}</p>`);
    return out.join('');
  }
  /** Draw (or redraw) the panel. True when it is on the page, placed cleanly. */
  function weekPanel() {
    const old = document.querySelector('[data-haloplus="week"]');
    const spot = homeGrid();
    if (!spot || !currentTab()) {
      if (old) old.remove();
      return false;
    }
    const v = weekView();
    if (!v) return false;
    const w = M.week(v, Date.now());
    if (!weekLook || !old) weekLook = cardLook(spot.card);
    const look = weekLook;
    const open = weekOpen();
    const asof = free() ? `as of ${M.syncedDay(v)}` : M.stale(v, Date.now());
    const n = w.count;
    const head = `<button class="hd" type="button" aria-expanded="${open}"><span>This week</span><span class="n">· ${n ? `${n} due` : 'nothing due'}</span>${asof ? `<span class="asof">${esc(asof)}</span>` : ''}<span class="mk" aria-hidden="true"><i></i>Halo+</span>${CHEV}</button>`;
    const vars = `--bg:${look.bg};--ink:${look.ink};--muted:${look.muted};--line:${look.line};--hover:${look.hover};--border:${look.border};--radius:${look.radius};--shadow:${look.shadow};--font:${look.font};--gold:${look.gold};--gold-ink:${look.goldInk};--red:${look.red};--green:${look.green}`;
    const html = `<section class="wk" aria-label="This week, from Halo+" style="${esc(vars)}">${head}<div class="bd"${open ? '' : ' hidden'}>${open ? weekBody(w) : ''}</div></section>`;
    let h = old;
    if (!h || h.nextElementSibling !== spot.grid) {
      if (h) h.remove();
      h = document.createElement('div');
      h.setAttribute('data-haloplus', 'week');
      h.style.cssText = 'all: initial; display: block; width: 100%;';
      const sr = h.attachShadow({ mode: 'open' });
      sr.innerHTML = `<style>${WEEK_CSS}</style><div class="root"></div>`;
      weekEvents(h, sr);
      spot.grid.parentNode.insertBefore(h, spot.grid);
      // Placed cleanly: the full width of the cards, and above them. Otherwise nothing.
      const a = h.getBoundingClientRect();
      const b = spot.grid.getBoundingClientRect();
      if (a.width < Math.max(280, b.width * 0.9) || a.top > b.top) {
        h.remove();
        weekHtml = '';
        return false;
      }
      weekHtml = '';
    }
    if (html !== weekHtml) {
      const focus = h.shadowRoot.activeElement;
      const fid = focus && (focus.dataset.id || focus.dataset.undo || focus.className);
      h.shadowRoot.querySelector('.root').innerHTML = html;
      weekHtml = html;
      // Keyboard focus survives a redraw (a check-off, Undo).
      if (fid) h.shadowRoot.querySelector(`[data-id="${CSS.escape(fid)}"], [data-undo="${CSS.escape(fid)}"]`)?.focus();
    }
    const d = today();
    if (weekShownDay !== d && !(st.haloUi && st.haloUi.weekShown === d)) {
      weekShownDay = d;
      const u = ui();
      u.weekShown = d;
      save({ haloUi: u });
      count('week-shown');
    }
    return true;
  }
  function weekEvents(h, sr) {
    sr.addEventListener(
      'click',
      guard((e) => {
        const t = e.target;
        if (t.closest('.hd')) {
          const open = !weekOpen();
          save({ haloWeek: { open } });
          count(open ? 'week-open' : 'week-close');
          weekHtml = '';
          return weekPanel();
        }
        if (t.closest('.more')) {
          weekAll = true;
          count('week-more');
          weekHtml = '';
          return weekPanel();
        }
        const undo = t.closest('[data-undo]');
        if (undo) {
          const id = undo.dataset.undo;
          const c = checking.get(id);
          if (c) clearTimeout(c.timer);
          checking.delete(id);
          chrome.runtime.sendMessage({ kind: 'week-undo', id }).catch(() => undefined);
          count('week-undo');
          weekHtml = '';
          return weekPanel();
        }
        if (t.closest('input[type="checkbox"]')) return;
        if (t.closest('[data-plus]')) {
          e.preventDefault();
          count('week-plus');
          window.open(t.closest('[data-plus]').href, '_blank', 'noopener');
          return;
        }
        const row = t.closest('.r');
        if (!row || row.classList.contains('on')) return;
        e.preventDefault();
        count('week-row');
        location.assign(row.dataset.href);
      }),
    );
    sr.addEventListener(
      'change',
      guard((e) => {
        const box = e.target.closest('input[type="checkbox"]');
        if (!box) return;
        const id = box.dataset.id;
        if (box.checked) {
          const timer = setTimeout(
            guard(() => {
              checking.delete(id);
              weekHtml = '';
              weekPanel();
            }),
            UNDO_MS,
          );
          checking.set(id, { until: Date.now() + UNDO_MS, timer });
          chrome.runtime.sendMessage({ kind: 'week-mark', id }).catch(() => undefined);
          count('week-check');
        } else {
          const c = checking.get(id);
          if (c) clearTimeout(c.timer);
          checking.delete(id);
          chrome.runtime.sendMessage({ kind: 'week-undo', id }).catch(() => undefined);
          count('week-undo');
        }
        weekHtml = '';
        weekPanel();
      }),
    );
  }

  // ---- when to peek -----------------------------------------------------------------------------------------------------
  /** Whether "This week" is on Student Home right now (then no pill and no peek there). */
  let weekPlaced = false;
  /**
   * Where the pill sits: Student Home when "This week" could not be placed, and Halo's other pages; never while a quiz
   * is being taken (0.10.0, George 2026-10-24: "the panel replaces the daily peek… pill stays on other Halo pages").
   */
  function pillHere() {
    const r = route().kind;
    if (r === 'home') return !weekPlaced;
    return r === 'other' || r === 'unit';
  }
  function home() {
    if (!view) return;
    weekPlaced = weekPanel();
    if (weekPlaced) {
      // The day's look is the panel: no peek here, and it counts as today's (no peek later on another page either).
      if (!peeking) clearLayer();
      const u = ui();
      if (view.items.length) save({ haloBase: M.baseline(view) });
      if (!u.first) {
        u.first = true;
        save({ haloUi: u });
      }
      return;
    }
    pillPage();
  }
  /** The pill and its peeks: the day's first look, then only for what matters since (see the top of this file). */
  function pillPage() {
    if (!view) return;
    renderPill();
    // An assignment's own page says what matters there (its line); the pill stays quiet on it.
    if (free() || peeking || route().kind === 'unit') return;
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
      weekPlaced = false;
      removeAll('[data-haloplus="class"]');
      removeAll('[data-haloplus="box"]');
      removeAll('[data-haloplus="week"]');
      return;
    }
    const r = route();
    if (r.kind === 'home') {
      home();
      classLines();
    } else {
      weekPlaced = false;
      removeAll('[data-haloplus="week"]');
      removeAll('[data-haloplus="class"]');
      // Halo's other pages: the pill (not while a quiz is being taken; a peek after a submission stays until it ends).
      if (pillHere()) pillPage();
      else if (!peeking) clearLayer();
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
  // Halo's look changing under the page (Better Halo's themes and its auto dark mode, the system's light or dark): the
  // panel takes the new look.
  const relook = guard(() => {
    if (!alive()) return;
    weekHtml = '';
    weekLook = null;
    soon();
  });
  new MutationObserver(relook).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-better-halo-theme', 'data-theme'] });
  if (document.body) new MutationObserver(relook).observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  try {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', relook);
  } catch {
    /* older browsers */
  }
  // Halo re-renders: put the class lines and the box back.
  new MutationObserver(
    guard((records) => {
      if (!alive()) return;
      let halo = false;
      for (const r of records)
        for (const n of r.addedNodes) {
          // A stylesheet arriving (a theme loading after the page): the panel reads the card's look again.
          if (n.nodeName === 'LINK' || n.nodeName === 'STYLE') weekLook = null;
          if (n.nodeType === 1 && !(n.closest && n.closest('[data-haloplus]')) && !(host && host.contains(n))) halo = true;
        }
      if (halo) soon();
    }),
  ).observe(document.documentElement, { childList: true, subtree: true });
})();
