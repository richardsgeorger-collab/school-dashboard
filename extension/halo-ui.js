// Halo+ on Halo (George, 2026-10-22, 0.8.0): students sync once and forget Halo+, so Halo+ comes to them, on Halo.
// - Halo's home page (My Classes): the daily card (the first visit each day), then a pill in the corner that always
//   says where today stands (green all done, gold due today, red overdue or due within 3 hours), with today's list on
//   hover; a line under each class card ("2 due this week", "1 overdue", "1 extra requirement").
// - An assignment on Halo (a unit page, a quiz): what announcements added, or a date an announcement moved, if any.
// - After a submission anywhere on Halo: "Nice. Next: …".
// The card opens again on its own only when something changed (new work, a moved date, a new requirement, a new grade,
// something now due within 3 hours), at most 3 times a day, and never again that day after two closes without a click.
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
  const guard = (fn) =>
    function (...a) {
      try {
        return fn.apply(this, a);
      } catch {
        return undefined;
      }
    };

  // ---- state ---------------------------------------------------------------------------------------------------------
  let st = { haloSnap: null, haloLive: null, haloUi: null, haloUiOn: null, tier: null };
  let view = null;
  const KEYS = ['haloSnap', 'haloLive', 'haloUi', 'haloUiOn', 'tier'];
  const load = async () => {
    try {
      st = await chrome.storage.local.get(KEYS);
    } catch {
      /* the extension was updated under this page */
    }
    view = M.merge(st.haloSnap, st.haloLive);
  };
  const saveUi = (ui) => {
    st.haloUi = ui;
    chrome.storage.local.set({ haloUi: ui }).catch(() => undefined);
  };
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
  /** Today's memory: shown, how many times it opened again on its own, closes without a click, what was seen. */
  const ui = () => {
    const u = st.haloUi || {};
    if (u.day === today()) return { ...u };
    return { day: today(), first: false, reopens: 0, closes: 0, flagged: [], seen: u.seen || null };
  };
  const autoOk = (u) => (u.reopens || 0) < 3 && (u.closes || 0) < 2;

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

  // ---- the layer: the card and the pill, in one shadow root on <html> (outside Halo's React tree) --------------------
  const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap { --bg: #15181d; --bg2: #1e232a; --ink: #eef1f4; --ink2: #b7c0ca; --ink3: #8b95a1; --line: rgba(255,255,255,.1); --gold: #f2b84b; --goldInk: #141414; --green: #3ec27a; --red: #ff5a5f;
  font: 14px/1.4 Inter, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--ink); -webkit-font-smoothing: antialiased; }
@media (prefers-color-scheme: light) { .wrap { --bg: #ffffff; --bg2: #f6f4ee; --ink: #1b1d22; --ink2: #4b5563; --ink3: #6b7280; --line: rgba(20,20,20,.12); --green: #1f8a4c; --red: #d93a3f; } }
.card { position: fixed; right: 16px; width: 340px; max-width: calc(100vw - 32px); background: var(--bg); border: 1px solid var(--line); border-top: 3px solid var(--gold);
  border-radius: 14px; box-shadow: 0 18px 50px rgba(0,0,0,.28); padding: 14px 16px 16px; z-index: 2147483000; animation: slide .32s cubic-bezier(.2,.8,.2,1); }
.card[data-tone="red"] { border-top-color: var(--red); }
.card[data-tone="green"] { border-top-color: var(--green); }
@keyframes slide { from { transform: translateX(24px); opacity: 0; } to { transform: none; opacity: 1; } }
.head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.brand { font-weight: 800; letter-spacing: -.01em; }
.brand b { color: var(--gold); }
.asof { color: var(--ink3); font-size: 12px; margin-left: 2px; }
.x { margin-left: auto; width: 28px; height: 28px; border-radius: 8px; border: 0; background: transparent; color: var(--ink3); font-size: 18px; line-height: 1; cursor: pointer; }
.x:hover { background: var(--bg2); color: var(--ink); }
.news { margin: 0 0 6px; color: var(--gold); font-size: 13px; font-weight: 600; }
.card[data-tone="red"] .news { color: var(--red); }
.title { margin: 0 0 10px; font-size: 20px; font-weight: 800; letter-spacing: -.02em; line-height: 1.2; }
.top { display: grid; gap: 2px; padding: 10px 12px; border-radius: 10px; background: var(--bg2); margin-bottom: 10px; }
.eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink3); }
.top b { font-size: 15px; }
.meta { color: var(--ink2); font-size: 12.5px; }
.hidden { margin: 0 0 12px; font-size: 13px; color: var(--ink2); }
.hidden b { color: var(--gold); }
.actions { display: flex; align-items: center; gap: 12px; }
.go { display: inline-flex; align-items: center; justify-content: center; height: 36px; padding: 0 16px; border-radius: 999px; background: var(--gold); color: var(--goldInk); font-weight: 700; text-decoration: none; font-size: 14px; border: 0; cursor: pointer; }
.go:hover { filter: brightness(1.05); }
.link { background: none; border: 0; padding: 0; color: var(--ink2); font: inherit; font-size: 13px; text-decoration: underline; cursor: pointer; }
.pill { position: fixed; bottom: 16px; right: 16px; z-index: 2147483000; display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 14px 0 12px; border-radius: 999px;
  border: 1px solid var(--line); background: var(--bg); color: var(--ink); font: 600 13.5px/1 Inter, -apple-system, "Segoe UI", Roboto, sans-serif; cursor: pointer; box-shadow: 0 8px 24px rgba(0,0,0,.22); }
.pill[data-side="left"] { right: auto; left: 16px; }
.pill .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--gold); flex: none; }
.pill[data-tone="green"] .dot { background: var(--green); }
.pill[data-tone="red"] { background: var(--red); color: #fff; border-color: transparent; }
.pill[data-tone="red"] .dot { background: #fff; }
.pill[data-tone="muted"] .dot { background: var(--ink3); }
.pill[data-pulse] { animation: pulse 2.4s ease-in-out infinite; }
@keyframes pulse { 0%,100% { box-shadow: 0 8px 24px rgba(0,0,0,.22), 0 0 0 0 rgba(255,90,95,.45); } 50% { box-shadow: 0 8px 24px rgba(0,0,0,.22), 0 0 0 8px rgba(255,90,95,0); } }
.tip { position: fixed; bottom: 60px; right: 16px; width: 300px; max-width: calc(100vw - 32px); z-index: 2147483000; background: var(--bg); border: 1px solid var(--line); border-radius: 12px;
  box-shadow: 0 18px 50px rgba(0,0,0,.28); padding: 10px 12px; }
.tip[data-side="left"] { right: auto; left: 16px; }
.tip h3 { margin: 0 0 6px; font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--ink3); }
.tip ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.tip li { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: baseline; font-size: 13px; }
.tip li .c { font: 12px ui-monospace, Menlo, monospace; color: var(--ink3); }
.tip li .w { color: var(--ink3); font-size: 12px; }
.tip li[data-done] .l { text-decoration: line-through; color: var(--ink3); }
.tip li[data-late] .w { color: var(--red); }
.tip p { margin: 6px 0 0; font-size: 12.5px; color: var(--ink2); }
@media (prefers-reduced-motion: reduce) { .card { animation: none; } .pill[data-pulse] { animation: none; } }
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
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /** Below Halo's own top bar: the bottom of whatever is fixed or sticky at the top of the page. */
  function topClear() {
    let bottom = 0;
    for (const x of [window.innerWidth / 2, window.innerWidth - 60, 60]) {
      for (const el of document.elementsFromPoint(x, 4)) {
        if (host && host.contains(el)) continue;
        let n = el;
        for (let k = 0; n && n !== document.body && k < 8; k++, n = n.parentElement) {
          const p = getComputedStyle(n).position;
          if (p === 'fixed' || p === 'sticky') {
            const r = n.getBoundingClientRect();
            if (r.top <= 4 && r.height < 200) bottom = Math.max(bottom, r.bottom);
            break;
          }
        }
      }
    }
    return Math.min(Math.max(bottom, 8), 160) + 12;
  }
  /** The pill's corner: bottom right, unless a Halo button sits there; then bottom left. */
  function pillSide() {
    const clickable = (x, y) =>
      document.elementsFromPoint(x, y).some((el) => !(host && host.contains(el)) && el.closest && el.closest('button, a, input, select, textarea, [role="button"]'));
    const y = window.innerHeight - 34;
    if (!clickable(window.innerWidth - 80, y) && !clickable(window.innerWidth - 30, y)) return 'right';
    if (!clickable(80, y) && !clickable(30, y)) return 'left';
    return 'right';
  }

  // ---- the card ------------------------------------------------------------------------------------------------------
  let open = null; // { mode, clicked }
  const openHaloPlus = (target, via) => {
    count(via === 'card' || via === 'next' ? 'card-click' : via === 'pill' ? 'pill-click' : via === 'class' ? 'class-click' : 'box-click');
    window.open(M.link(ORIGIN, target, via), '_blank', 'noopener');
  };
  function showCard(mode, extra) {
    if (!view) return;
    const now = Date.now();
    const c = M.card(view, now);
    const asof = M.stale(view, now);
    const w = wrap();
    w.querySelector('.tip')?.remove();
    w.querySelector('.pill')?.remove();
    w.querySelector('.card')?.remove();
    let news = '';
    if (mode === 'changes' && extra) news = `<p class="news">New: ${esc(extra)}</p>`;
    if (mode === 'soon' && extra) news = `<p class="news">${esc(extra)}</p>`;
    let body;
    if (mode === 'next') {
      const nx = extra;
      body = `<h2 class="title">Nice.${nx ? ' Next:' : ''}</h2>${nx ? `<div class="top"><b>${esc(nx.label)}</b><span class="meta">${esc([nx.code, nx.when].filter(Boolean).join(' · '))}</span></div>` : '<p class="hidden">Nothing else due soon.</p>'}`;
    } else {
      const t = c.top;
      body = `${news}<h2 class="title">${esc(c.title)}</h2>${
        t ? `<div class="top"><span class="eyebrow">Do now</span><b>${esc(t.label)}</b><span class="meta">${esc([t.code, t.when, t.pts ? `${t.pts} pts` : ''].filter(Boolean).join(' · '))}</span></div>` : ''
      }${c.hidden ? `<p class="hidden"><b>${c.hidden}</b> thing${c.hidden === 1 ? '' : 's'} hidden in announcements</p>` : ''}`;
    }
    const target = mode === 'next' ? extra : c.top;
    const el = document.createElement('div');
    el.className = 'card';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Halo+ today');
    el.dataset.tone = mode === 'next' ? 'green' : c.tone;
    el.style.top = `${topClear()}px`;
    el.innerHTML = `<div class="head"><span class="brand">Halo<b>+</b></span>${asof ? `<span class="asof">${esc(asof)}</span>` : ''}<button class="x" aria-label="Close" title="Close">×</button></div>${body}<div class="actions"><a class="go" href="${esc(M.link(ORIGIN, target, mode === 'next' ? 'next' : 'card'))}" target="_blank" rel="noopener">Open in Halo+</a>${asof && !free() ? '<button class="link sync">Sync now</button>' : ''}</div>`;
    w.appendChild(el);
    open = { mode, clicked: false };
    el.querySelector('.go').addEventListener('click', (e) => {
      e.preventDefault();
      open.clicked = true;
      openHaloPlus(target, mode === 'next' ? 'next' : 'card');
    });
    el.querySelector('.sync')?.addEventListener('click', () => {
      open.clicked = true;
      count('sync-click');
      chrome.runtime.sendMessage({ kind: 'sync-now' }).catch(() => undefined);
      const b = el.querySelector('.sync');
      if (b) b.textContent = 'Syncing…';
    });
    el.querySelector('.x').addEventListener('click', () => closeCard(true));
    if (mode === 'next') setTimeout(() => open && open.mode === 'next' && closeCard(false), 15_000);
    // Whatever opened it, it has now been seen.
    const u = ui();
    u.seen = M.fingerprint(view);
    saveUi(u);
    count(mode === 'next' ? 'next-shown' : 'card-shown');
  }
  function closeCard(byHand) {
    const w = wrap();
    w.querySelector('.card')?.remove();
    if (byHand && open && !open.clicked) {
      const u = ui();
      u.closes = (u.closes || 0) + 1;
      saveUi(u);
      count('card-closed');
    }
    open = null;
    renderPill();
  }

  // ---- the pill ------------------------------------------------------------------------------------------------------
  function renderPill() {
    if (!view || open) return;
    if (route().kind !== 'home') return;
    const w = wrap();
    const now = Date.now();
    const isFree = free();
    const p = isFree ? { tone: 'muted', text: `Halo+ · Synced ${M.syncedDay(view)}`, pulse: false } : M.pill(view, now);
    let el = w.querySelector('.pill');
    if (!el) {
      el = document.createElement('button');
      el.className = 'pill';
      el.type = 'button';
      w.appendChild(el);
      el.addEventListener('click', () => {
        if (free()) {
          count('pill-click');
          window.open(M.link(ORIGIN, null, 'pill'), '_blank', 'noopener');
          return;
        }
        count('pill-click');
        showCard('daily');
      });
      el.addEventListener('mouseenter', showTip);
      el.addEventListener('focus', showTip);
      el.addEventListener('mouseleave', hideTip);
      el.addEventListener('blur', hideTip);
    }
    el.dataset.tone = p.tone;
    el.dataset.side = pillSide();
    if (p.pulse) el.dataset.pulse = '';
    else delete el.dataset.pulse;
    el.setAttribute('aria-label', `Halo+: ${p.text}`);
    el.innerHTML = `<span class="dot" aria-hidden="true"></span><span>${esc(p.text)}</span>`;
  }
  function showTip() {
    if (!view) return;
    const w = wrap();
    w.querySelector('.tip')?.remove();
    const now = Date.now();
    const rows = M.preview(view, now);
    const asof = M.stale(view, now);
    const el = document.createElement('div');
    el.className = 'tip';
    el.dataset.side = w.querySelector('.pill')?.dataset.side || 'right';
    el.innerHTML = `<h3>Today</h3>${
      rows.length
        ? `<ul>${rows.map((r) => `<li${r.done ? ' data-done' : ''}${r.late ? ' data-late' : ''}><span class="c">${esc(r.code)}</span><span class="l">${esc(r.label)}</span><span class="w">${esc(r.late ? 'overdue' : r.done ? 'done' : r.when)}</span></li>`).join('')}</ul>`
        : '<p>Nothing due today.</p>'
    }${free() ? `<p>Synced ${esc(M.syncedDay(view))}. Turn on Halo+ to keep this current.</p>` : asof ? `<p>${esc(asof)}</p>` : ''}`;
    w.appendChild(el);
  }
  function hideTip() {
    wrap().querySelector('.tip')?.remove();
  }

  // ---- the class lines on Halo's home page ---------------------------------------------------------------------------
  const LINE_CSS = `:host{all:initial}.l{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin-top:6px;padding-top:6px;border-top:1px dashed rgba(120,120,140,.35);font:600 12px/1.3 Inter,-apple-system,"Segoe UI",Roboto,sans-serif;color:#4b5563;cursor:pointer}
.l b{font-weight:800;color:#141414;background:#f2b84b;border-radius:4px;padding:0 4px;font-size:10px;letter-spacing:.02em}
.l [data-tone=red]{color:#d93a3f}.l [data-tone=gold]{color:#9a6a00}.l:hover span{text-decoration:underline}`;
  function classLines() {
    if (!view || free()) return removeAll('[data-haloplus="class"]');
    const now = Date.now();
    const seen = new Set();
    const nodes = document.querySelectorAll('#__next p, #__next h3, #__next span');
    for (const el of nodes) {
      if (el.children.length > 2) continue;
      const text = (el.textContent || '').trim();
      if (!text || text.length > 40 || !/^[A-Z]{2,5}-\d{2,4}/i.test(text)) continue;
      const cls = M.classByCode(view, text);
      if (!cls || seen.has(cls.key)) continue;
      // The card: Halo's home list puts each class in an <li>; elsewhere the nearest bordered block.
      const li = el.closest('li');
      const card = li && li.closest('#__next') ? li.firstElementChild || li : el.parentElement && el.parentElement.parentElement;
      if (!card) continue;
      seen.add(cls.key);
      const parts = M.classLine(view, cls, now);
      const html = `<div class="l" role="link" tabindex="0" title="Open ${esc(cls.code)} in Halo+"><b>H+</b>${parts.map((p) => `<span data-tone="${p.tone}">${esc(p.text)}</span>`).join('<span aria-hidden="true">·</span>')}</div>`;
      let h = card.querySelector(':scope > [data-haloplus="class"]');
      if (!h) {
        h = document.createElement('div');
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
        card.appendChild(h);
      }
      h.dataset.course = cls.key;
      const inner = h.shadowRoot.querySelector('div');
      if (inner.innerHTML !== html) inner.innerHTML = html;
    }
  }
  function removeAll(sel) {
    document.querySelectorAll(sel).forEach((n) => n.remove());
  }

  // ---- the assignment box ---------------------------------------------------------------------------------------------
  const BOX_CSS = `:host{all:initial}.b{margin:10px 0;padding:12px 14px;border-radius:10px;background:#15181d;color:#eef1f4;border-left:4px solid #f2b84b;font:14px/1.4 Inter,-apple-system,"Segoe UI",Roboto,sans-serif;max-width:760px}
@media (prefers-color-scheme: light){.b{background:#fffaf0;color:#1b1d22;border:1px solid #f2d79a;border-left:4px solid #f2b84b}}
.t{font-weight:800;margin:0 0 6px}.t span{color:#f2b84b}@media (prefers-color-scheme: light){.t span{color:#9a6a00}}
ul{margin:0 0 8px;padding-left:18px}li{margin:2px 0}.m{margin:0 0 8px;font-size:13px;opacity:.85}
a{display:inline-flex;align-items:center;height:30px;padding:0 12px;border-radius:999px;background:#f2b84b;color:#141414;font-weight:700;font-size:13px;text-decoration:none}`;
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
      placeBox(c, (b) => main.insertAdjacentElement('afterbegin', b), `quiz:${r.id}`);
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
      placeBox(c, (b) => row.insertAdjacentElement('afterend', b), `item:${M.itemKey(i)}`);
    }
  }
  function placeBox(c, put, key) {
    if (document.querySelector(`[data-haloplus="box"][data-key="${CSS.escape(key)}"]`)) return;
    const h = document.createElement('div');
    h.setAttribute('data-haloplus', 'box');
    h.dataset.key = key;
    h.style.cssText = 'all: initial; display: block;';
    const sr = h.attachShadow({ mode: 'open' });
    const href = M.link(ORIGIN, c, 'box');
    sr.innerHTML = `<style>${BOX_CSS}</style><div class="b" role="note"><p class="t"><span>Halo+</span> ${esc(c.title.replace(/^Halo\+ /, ''))}</p>${c.list.length ? `<ul>${c.list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}${c.moved ? `<p class="m">${esc(c.moved)}</p>` : ''}<a href="${esc(href)}" target="_blank" rel="noopener">Open in Halo+</a></div>`;
    sr.querySelector('a').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openHaloPlus(c, 'box');
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

  // ---- when to show what ---------------------------------------------------------------------------------------------
  function home() {
    if (!view) return;
    const u = ui();
    const now = Date.now();
    // Free: the pill only, no card, no nagging.
    if (free()) return renderPill();
    if (!open) {
      if (!u.first) {
        u.first = true;
        saveUi(u);
        return showCard('daily');
      }
      if (autoOk(u)) {
        const ch = M.changes(view, u.seen, now);
        if (ch.total > 0) {
          u.reopens = (u.reopens || 0) + 1;
          saveUi(u);
          return showCard('changes', M.changesLine(ch));
        }
        const soon = M.newlySoon(view, now, u.flagged);
        if (soon.length) {
          u.reopens = (u.reopens || 0) + 1;
          u.flagged = [...(u.flagged || []), ...soon];
          saveUi(u);
          const it = view.items.find((i) => M.itemKey(i) === soon[0]);
          return showCard('soon', it ? `${M.dueIn(Date.parse(it.due) - now)}: ${it.t}` : null);
        }
      } else {
        // Still noted, so a flag does not fire later for something already past.
        const soon = M.newlySoon(view, now, u.flagged);
        if (soon.length) saveUi({ ...u, flagged: [...(u.flagged || []), ...soon] });
      }
    }
    renderPill();
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
      // Away from the home page: the card and pill go (the "Nice. Next" card stays where it was opened).
      if (!open || open.mode !== 'next') {
        open = null;
        clearLayer();
      }
      removeAll('[data-haloplus="class"]');
    }
    boxes();
  });

  // After a submission (content-halo.js has just celebrated it): "Nice. Next: …".
  window.addEventListener(
    'haloplus:submitted',
    guard((e) => {
      if (!view || !showing() || free()) return;
      const id = e && e.detail ? e.detail.id : null;
      setTimeout(
        guard(() => {
          const u = ui();
          if ((u.reopens || 0) >= 3) return;
          u.reopens = (u.reopens || 0) + 1;
          saveUi(u);
          showCard('next', M.nextAfter(view, Date.now(), id));
        }),
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
        // The day's memory alone changing (another Halo tab) only updates the pill.
        if (Object.keys(changes).every((k) => k === 'haloUi')) renderPill();
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
  // The pill's time words ("Due in 2h") and a deadline coming within 3 hours.
  setInterval(guard(() => alive() && render()), 60_000);
  // Halo re-renders: put the class lines and the box back.
  new MutationObserver(
    guard((records) => {
      if (!alive()) return;
      for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1 && !(n.closest && n.closest('[data-haloplus]')) && !(host && host.contains(n))) return soon();
    }),
  ).observe(document.documentElement, { childList: true, subtree: true });
})();
