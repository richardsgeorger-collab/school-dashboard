// Halo+ on Halo's own pages, the shared part (0.12.0, George 2026-10-27: "make Halo's own pages feel so much better
// with Halo+ that going back to plain Halo feels broken"). Every feature file in this folder registers here and runs
// only when all of these hold:
// - "Show Halo+ on Halo pages" is on (popup or Halo+, whichever changed last), and the feature's own switch is on;
// - there is a Halo+ account on this computer (any plan: everything on Halo is Free since 0.12.12);
// - the page is one the feature knows (route()).
// The rules every feature follows: if Halo+ is not sure, it shows nothing; it looks like Halo (Halo's own font and
// colours are inherited, never set); it adds the Halo+ mark (mark()) beside anything it adds; it never makes Halo do
// more work than a student would (one query at a time, cached, only when needed); and nothing runs in the background:
// one shared watcher for Halo's page changes, no timers that tick on their own.
(function () {
  'use strict';
  // One live copy: a copy left by an extension update (its extension gone) steps aside for the new one (0.12.9).
  if (globalThis.HaloPlusOn && (!globalThis.HaloPlusOn.alive || globalThis.HaloPlusOn.alive())) return;
  const alive = () => {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  };
  const M = globalThis.HaloPlusModel;
  if (!M) return;

  /** The features, in the order the switches list them (features.js, shared with the popup). */
  const FEATURES = globalThis.HaloPlusOnFeatures || [];

  // ---- state ----------------------------------------------------------------------------------------------------------
  const KEYS = ['haloSnap', 'haloLive', 'haloDone', 'haloMarks', 'haloUiOn', 'haloFeat', 'haloIndex', 'tier', 'haloJustDone'];
  let st = {};
  let view = null;
  let loaded = false;
  const load = async () => {
    try {
      st = await chrome.storage.local.get(KEYS);
    } catch {
      /* the extension was updated under this page */
    }
    view = M.merge(st.haloSnap, st.haloLive, M.doneFrom(st.haloDone, st.haloMarks));
    if (!loaded) diag('data', { snap: !!st.haloSnap, index: !!st.haloIndex, tier: st.tier || null, view: !!view });
    loaded = true;
  };

  // ---- what Halo+ waited for (0.12.9) ------------------------------------------------------------------------------------
  // George: Halo+ sometimes did not show until he reloaded. A quiet log on this computer of what each Halo page waited
  // for and when (milliseconds since the page started), so it can be told apart if it happens again: the data being
  // there, Halo's page parts appearing, which features started, Halo's answers (ok, or why not), a check that held
  // something back. Never student data: no names, titles, classes, ids or addresses; the page's kind only. The last ten
  // pages, in chrome.storage.local "haloDiag"; nothing is sent anywhere.
  const RUN = Math.random().toString(36).slice(2, 8);
  const diagBuf = [];
  let diagTimer = 0;
  function diag(ev, data = {}) {
    diagBuf.push({ t: Math.round(performance.now()), ev, ...data });
    if (diagBuf.length > 120) diagBuf.splice(0, diagBuf.length - 120);
    if (!diagTimer) diagTimer = setTimeout(flushDiag, 2500);
  }
  async function flushDiag() {
    diagTimer = 0;
    try {
      const { haloDiag } = await chrome.storage.local.get('haloDiag');
      const runs = (haloDiag && Array.isArray(haloDiag.runs) ? haloDiag.runs : []).filter((r) => r.id !== RUN);
      runs.push({ id: RUN, at: new Date(Date.now() - performance.now()).toISOString(), v: chrome.runtime.getManifest().version, page: route().kind, ev: diagBuf.slice() });
      await chrome.storage.local.set({ haloDiag: { v: 1, runs: runs.slice(-10) } });
    } catch {
      /* the extension was updated under this page */
    }
  }

  /** "Show Halo+ on Halo pages": on unless turned off, in the popup or in Halo+ (whichever was changed last). */
  const showing = () => {
    if (!view) return false;
    const local = st.haloUiOn;
    if (local && (!view.showAt || local.at > view.showAt)) return local.on !== false;
    return view.show !== false;
  };
  /** Any account on this computer (Free too, 0.12.12). None yet (a store install before sign-up) is not. */
  // Every plan with an account (0.12.12, George 2026-10-29: everything on Halo is Free); the name stays for its callers.
  const paid = () => !!st.tier || !!view;
  /** A feature's own switch: on unless turned off, in the popup or in Halo+ (whichever list was changed last). */
  function switchOn(id) {
    const snap = (st.haloSnap && st.haloSnap.hf) || null;
    const local = st.haloFeat || null;
    const fromLocal = local && (!snap || !snap.at || local.at > snap.at);
    const off = (fromLocal ? local.off : snap && snap.off) || [];
    return !off.includes(id);
  }
  const enabled = (id) => showing() && paid() && switchOn(id);

  // ---- where we are ---------------------------------------------------------------------------------------------------
  /** Halo's page, from its address (Halo's own routes, build manifest 2026-10-27). */
  function route(loc = location) {
    const p = loc.pathname;
    const q = new URLSearchParams(loc.search);
    const d = (s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    };
    if (/^\/(login|auth|admin|halo-admin|lti-launch)(\/|$)/.test(p)) return { kind: 'none' };
    if (p === '/' || p === '') return { kind: 'home', q };
    let m = /^\/courses\/([^/]+)\/course-units\/([^/]+)\/resources\/([^/]+)/.exec(p);
    if (m) return { kind: 'unit-resource', slug: d(m[1]), unit: d(m[2]), resource: d(m[3]), q };
    m = /^\/courses\/([^/]+)\/course-units\/([^/]+)\/?$/.exec(p);
    if (m) return { kind: 'unit', slug: d(m[1]), unit: d(m[2]), q };
    m = /^\/courses\/([^/]+)\/forums\/discussion\/([^/]+)\/?$/.exec(p);
    if (m) return { kind: 'discussion', slug: d(m[1]), forum: d(m[2]), q };
    m = /^\/courses\/([^/]+)\/forums\/(discussion|class-questions)\/?$/.exec(p);
    if (m) return { kind: 'forums', slug: d(m[1]), which: m[2], q };
    m = /^\/courses\/([^/]+)\/(announcements|class-resources|syllabus|worklist|classroom|student\/gradebook)\/?$/.exec(p);
    if (m) return { kind: m[2] === 'student/gradebook' ? 'gradebook' : m[2], slug: d(m[1]), q };
    m = /^\/courses\/([^/]+)\/rubrics\/([^/]+)\/?$/.exec(p);
    if (m) return { kind: 'rubric', slug: d(m[1]), assessment: d(m[2]), q };
    m = /^\/courses\/([^/]+)\/?$/.exec(p);
    if (m) return { kind: 'class', slug: d(m[1]), q };
    m = /^\/quiz\/([^/]+)\/(start-quiz|review-quiz)\//.exec(p);
    if (m) return { kind: 'quiz-taking', id: d(m[1]), q };
    m = /^\/quiz\/([^/]+)\/?$/.exec(p);
    if (m) return { kind: 'quiz', id: d(m[1]), q };
    m = /^\/resource\/([^/]+)\/?$/.exec(p);
    if (m) return { kind: 'resource', resource: d(m[1]), q };
    if (/^\/inbox(\/|$)/.test(p)) return { kind: 'inbox', q };
    if (/^\/alerts(\/|$)/.test(p)) return { kind: 'alerts', q };
    return { kind: 'other', q };
  }

  // ---- the Halo+ mark -------------------------------------------------------------------------------------------------
  // Halo+'s own logo mark (0.12.1, George: the gray ⊕ was "unrecognizable, even to George"): the gold open ring with the
  // plus, as on the app icon, without its dark square. The ring is Halo+ gold (a deeper gold on light pages, the icon's
  // gold under Better Halo's dark themes), the plus the colour of the text beside it (dark on Halo's white page, light
  // on a dark theme, as the icon's white plus). As tall as that text, slightly faded. Hover: "Added by Halo+".
  const MARK_SVG =
    '<svg viewBox="5 3 56 56" width="1em" height="1em" aria-hidden="true" focusable="false"><path d="M52.6 26.5A21.3 21.3 0 1 1 37.5 11.4" fill="none" stroke="var(--hp-gold, #c98a17)" stroke-width="7.5" stroke-linecap="round"/><path d="M47.1 9.3v15.2M39.5 16.9h15.2" fill="none" stroke="currentColor" stroke-width="7.5" stroke-linecap="round"/></svg>';
  const MARK_CSS = '.hp-mark{display:inline-flex;vertical-align:-0.14em;width:.95em;height:.95em;opacity:.8;flex:none;color:inherit;cursor:default}.hp-mark svg{width:100%;height:100%;overflow:visible}';
  const mark = () => `<span class="hp-mark" title="Added by Halo+" role="img" aria-label="Added by Halo+">${MARK_SVG}</span>`;

  /**
   * A host for something Halo+ adds: a shadow root (Halo's styles cannot reach in and ours cannot leak out) that still
   * takes Halo's font and colour by inheritance. `tag` and `display` let it sit inline beside Halo's own text.
   */
  function host(kind, css = '', { tag = 'span', display = 'inline' } = {}) {
    const h = document.createElement(tag);
    h.setAttribute('data-haloplus', kind);
    h.style.cssText = `all: initial; display: ${display}; font: inherit; color: inherit; letter-spacing: inherit; line-height: inherit;`;
    const sr = h.attachShadow({ mode: 'open' });
    sr.innerHTML = `<style>:host{all:initial;font:inherit;color:inherit;letter-spacing:inherit;line-height:inherit}*{box-sizing:border-box}${MARK_CSS}${css}</style><span class="hp-root"></span>`;
    return { h, sr, root: sr.querySelector('.hp-root') };
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const ours = (n) => !!(n && n.nodeType === 1 && n.closest && n.closest('[data-haloplus]'));

  // ---- the features -----------------------------------------------------------------------------------------------------
  /** id -> { id, routes, start(ctx), stop(), update(ctx) }; `running` holds the ones on now. */
  const defs = new Map();
  const running = new Map();
  const ctx = () => ({ view, st, route: route(), tz: (view && view.tz) || Intl.DateTimeFormat().resolvedOptions().timeZone });
  const seen = new Set();
  /** Halo's page parts, logged the first time each is there. */
  function landmarks() {
    const has = {
      'home-main': () => !!document.getElementById('Home--main'),
      'class-cards': () => !!document.querySelector('[class*="CourseCard_cardContainer"]'),
      'purple-bar': () => !!document.querySelector('#header_main_container header'),
      'halo-data': () => !!document.getElementById('__NEXT_DATA__'),
    };
    for (const [k, f] of Object.entries(has)) if (!seen.has(k) && f()) (seen.add(k), diag('halo', { part: k }));
  }
  function reconcile() {
    if (!alive()) return stopAll();
    const r = route();
    landmarks();
    const before = [...running.keys()].join(',');
    for (const def of defs.values()) {
      // A feature can share another's switch (`switch`): the calendar on Student Home and on a class page are one.
      const want = enabled(def.switch || def.id) && (!def.routes || def.routes.includes(r.kind));
      const on = running.has(def.id);
      try {
        if (want && !on) {
          running.set(def.id, true);
          def.start(ctx());
        } else if (!want && on) {
          running.delete(def.id);
          def.stop();
        } else if (want && on && def.update) def.update(ctx());
      } catch (e) {
        /* one feature failing never takes another down, and never Halo */
        diag('error', { f: def.id, e: String((e && e.name) || 'Error').slice(0, 40) });
      }
    }
    const after = [...running.keys()].join(',');
    if (after !== before) diag('features', { page: r.kind, on: after ? after.split(',') : [], data: !!view, shown: showing(), paid: paid() });
  }
  function stopAll() {
    for (const id of running.keys()) {
      try {
        defs.get(id).stop();
      } catch {
        /* nothing */
      }
    }
    running.clear();
  }
  function feature(def) {
    defs.set(def.id, def);
    soon();
  }

  // One pass at most every 250 ms, and only when something happened: Halo changed its page, the address changed, or a
  // setting or the data changed. Nothing ticks on its own.
  let queued = 0;
  function soon() {
    if (queued) return;
    queued = setTimeout(() => {
      queued = 0;
      reconcile();
    }, 250);
  }
  // A few passes more after the page starts and after each move between Halo's pages (0.12.9): Halo's parts that come
  // late or settle without adding anything (sizes, styles, a redraw in place) are seen within seconds, never only at
  // the next reload. Then nothing until something happens again.
  let settling = [];
  function settle() {
    for (const t of settling) clearTimeout(t);
    settling = [600, 1500, 3000, 6000, 12000].map((ms) => setTimeout(soon, ms));
  }
  let href = location.href;
  const onDom = (records) => {
    if (!alive()) return;
    if (location.href !== href) {
      href = location.href;
      diag('moved', { page: route().kind });
      settle();
      return soon();
    }
    for (const r of records) {
      // Typing in Halo's editor changes the page on every key; nothing here depends on that (drafts and the word count
      // listen for typing themselves), so changes inside an editor are not a reason to look again.
      const t = r.target;
      if (t && t.nodeType === 1 && t.closest && t.closest('[contenteditable="true"]')) continue;
      for (const n of r.addedNodes) if (n.nodeType === 1 && !ours(n)) return soon();
    }
  };
  new MutationObserver(onDom).observe(document.documentElement, { childList: true, subtree: true });
  try {
    // Next.js moves between Halo's pages with history.pushState, which a content script cannot hear; the Navigation API
    // can (Chrome and Edge 102+).
    if (globalThis.navigation) globalThis.navigation.addEventListener('currententrychange', () => soon());
  } catch {
    /* the DOM watcher still sees the page change */
  }
  window.addEventListener('popstate', soon);
  window.addEventListener('load', soon);
  window.addEventListener('pageshow', soon);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && soon());
  // A stylesheet that finishes loading (Halo's page styles arrive with its pages): features that read Halo's class
  // names look again. Load events do not bubble; they are caught on the way down.
  document.addEventListener(
    'load',
    (e) => {
      if (e.target && e.target.tagName === 'LINK' && /stylesheet/i.test(e.target.rel || '')) {
        cssMap = null;
        soon();
      }
    },
    true,
  );
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !KEYS.some((k) => k in changes)) return;
    void load().then(soon);
  });

  // ---- asking Halo, politely ------------------------------------------------------------------------------------------
  // The page's own session, the way Halo's own code asks its gateway; one request at a time with a pause between, and
  // each answer kept for a while so the same thing is never asked twice in a row.
  const GATEWAY = 'https://gateway.halo.gcu.edu/';
  let session = null;
  let queue = Promise.resolve();
  const answers = new Map();
  async function haloSession() {
    if (session && Date.now() - session.t < 5 * 60_000) return session;
    const r = await fetch('/api/auth/session', { credentials: 'include' });
    const s = await r.json();
    if (!s || !s.authToken || !s.contextToken) throw new Error('no session');
    // Halo's own code reads the student's id from the same session (next-auth's data.userId).
    session = { a: s.authToken, c: s.contextToken, user: s.userId || (s.user && (s.user.userId || s.user.id)) || null, t: Date.now() };
    return session;
  }
  /** One GraphQL read (never a mutation), queued; `keepMs` how long the answer is reused. Throws on any doubt. */
  function ask(operationName, query, variables, keepMs = 5 * 60_000) {
    if (/^\s*mutation\b/i.test(query)) return Promise.reject(new Error('read only'));
    const key = `${operationName}:${JSON.stringify(variables)}`;
    const hit = answers.get(key);
    if (hit && Date.now() - hit.t < keepMs) return hit.p;
    const p = (queue = queue
      .catch(() => undefined)
      .then(async () => {
        // A session not there yet (just after signing in) or ended (401): a fresh one, and once more (0.12.9).
        for (let attempt = 0; ; attempt++) {
          let s;
          try {
            s = await haloSession();
          } catch (e) {
            if (attempt) throw e;
            diag('ask', { op: operationName, why: 'no-session' });
            await new Promise((res) => setTimeout(res, 1500));
            continue;
          }
          const r = await fetch(GATEWAY, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.a}`, ContextToken: `Bearer ${s.c}` },
            body: JSON.stringify({ operationName, variables, query }),
          });
          if (r.status === 401) {
            session = null;
            diag('ask', { op: operationName, why: '401' });
            if (!attempt) continue;
          }
          const j = await r.json().catch(() => null);
          await new Promise((res) => setTimeout(res, 250));
          if (!r.ok || !j || j.errors || !j.data) {
            diag('ask', { op: operationName, why: r.ok ? 'halo-errors' : `http-${r.status}` });
            throw new Error('halo said no');
          }
          return j.data;
        }
      }));
    answers.set(key, { p, t: Date.now() });
    p.catch(() => answers.delete(key));
    return p;
  }
  /** Forget a kept answer (or every one of that kind), so the next ask reads Halo again (a submission changed it). */
  const forget = (operationName, variables) => {
    if (variables !== undefined) return void answers.delete(`${operationName}:${JSON.stringify(variables)}`);
    for (const k of [...answers.keys()]) if (k.startsWith(`${operationName}:`)) answers.delete(k);
  };

  // ---- Halo's zone ----------------------------------------------------------------------------------------------------
  let zoneId = null;
  /** Halo's school time zone, as Halo itself reads it (tenantConfig.timezone in the page's own data); null if absent. */
  function zone() {
    if (zoneId) return zoneId;
    try {
      const d = JSON.parse(document.getElementById('__NEXT_DATA__').textContent);
      const z = d && d.props && d.props.tenantConfig && d.props.tenantConfig.timezone && d.props.tenantConfig.timezone.id;
      if (z && Intl.DateTimeFormat('en-US', { timeZone: z })) zoneId = z;
    } catch {
      /* not Halo's page, or not ready */
    }
    return zoneId;
  }
  // ---- Halo's own class names -------------------------------------------------------------------------------------------
  // Halo's components are styled by CSS modules ("WeeklyCalendar_eventBar__sW_Yr"); the part after "__" changes with
  // Halo's builds, so Halo+ reads the current names from the stylesheets on the page, once per set of stylesheets.
  let cssMap = null;
  let cssCount = -1;
  let cssAt = 0;
  let cssMisses = 0;
  function cssClass(name) {
    // Read again when the stylesheets change, and when a name is missing (a stylesheet still loading reads as empty),
    // at most once a second and three times until the stylesheets change: a name Halo no longer has costs no more.
    const miss = cssMap && !cssMap.has(name) && Date.now() - cssAt > 1000 && cssMisses < 3;
    if (!cssMap || document.styleSheets.length !== cssCount || miss) {
      cssMisses = miss ? cssMisses + 1 : 0;
      cssMap = new Map();
      cssCount = document.styleSheets.length;
      cssAt = Date.now();
      const re = /\.([A-Za-z0-9]+_[A-Za-z0-9]+)__([A-Za-z0-9_-]{5})(?![A-Za-z0-9_-])/g;
      for (const sh of document.styleSheets) {
        let rules;
        try {
          rules = sh.cssRules;
        } catch {
          continue;
        }
        for (const r of rules) {
          const t = r.selectorText;
          if (!t) continue;
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(t))) if (!cssMap.has(m[1])) cssMap.set(m[1], `${m[1]}__${m[2]}`);
        }
      }
    }
    return cssMap.get(name) || null;
  }

  // ---- Halo's own text, shown safely ------------------------------------------------------------------------------------
  // An instructor's comment as Halo stores it (HTML), word for word: only plain formatting and real links survive
  // (Halo's own renderer also strips every attribute but links); scripts, styles, frames and handlers never do.
  const KEEP = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'UL', 'OL', 'LI', 'A', 'SPAN', 'DIV', 'BLOCKQUOTE', 'SUB', 'SUP', 'H4', 'H5', 'H6']);
  function cleanHtml(html) {
    let doc;
    try {
      doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    } catch {
      return '';
    }
    const out = (n) => {
      if (n.nodeType === 3) return esc(n.nodeValue);
      if (n.nodeType !== 1) return '';
      const kids = [...n.childNodes].map(out).join('');
      if (!KEEP.has(n.tagName)) return /^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|TEMPLATE|NOSCRIPT|SVG|MATH)$/.test(n.tagName) ? '' : kids;
      if (n.tagName === 'BR') return '<br>';
      if (n.tagName === 'A') {
        const href = n.getAttribute('href') || '';
        return /^(https?:|mailto:)/i.test(href.trim()) ? `<a href="${esc(href.trim())}" target="_blank" rel="noopener noreferrer" style="color:var(--hp-link)">${kids}</a>` : kids;
      }
      const t = n.tagName.toLowerCase();
      return `<${t}>${kids}</${t}>`;
    };
    return [...doc.body.childNodes].map(out).join('');
  }

  /** One moment counted for Admin (the worker keeps a daily cap); never more than once per page for the same thing. */
  const counted = new Set();
  const count = (event, once = true) => {
    if (once && counted.has(`${event}@${location.pathname}`)) return;
    counted.add(`${event}@${location.pathname}`);
    chrome.runtime.sendMessage({ kind: 'halo-ui', event }).catch(() => undefined);
  };

  globalThis.HaloPlusOn = { FEATURES, feature, route, enabled, paid, showing, mark, MARK_SVG, MARK_CSS, host, esc, ours, ask, forget, haloSession, count, soon, alive, diag, zone, cssClass, cleanHtml, get view() { return view; }, get st() { return st; } };
  diag('start', { ready: document.readyState, visible: document.visibilityState === 'visible', page: route().kind });
  settle();
  void load().then(soon);
})();
