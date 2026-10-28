// Feature 13 (0.12.0): Halo, but faster. Halo already fetches ahead the page code for links on screen (Next.js); a topic
// page and a discussion page are never linked from Student Home, so the first one opened after Halo updates waits for
// its code. On Student Home, once per Halo version, Halo+ asks the browser to fetch ahead the code for the page of the
// student's next assignment (a topic page, a discussion or a quiz): Halo's own public files from Halo's file servers,
// at the browser's lowest priority, never a Halo page or a question to Halo's servers (Halo loads its data fresh on
// every page by design, so fetching data ahead would only double Halo's work). Only with the tab in front, a fast
// connection without data saver, and the computer not on a low battery; then never again until Halo changes.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  const L = globalThis.HaloPlusOnLogic;
  if (!O || !L) return;
  const ROUTE = { assignment: '/courses/[slugId]/course-units/[courseUnitId]', discussion: '/courses/[slugId]/forums/discussion/[discussionId]', quiz: '/quiz/[assessmentId]' };
  let done = false;

  /** Halo's build manifest (`self.__BUILD_MANIFEST = function(a,b,…){return {route: [a, "x", …]}}("…", …)`), read without running it. */
  function parseManifest(src) {
    const fn = /function\(([^)]*)\)\{return(\{[\s\S]*\})\}\(([\s\S]*)\)\s*,\s*self\.__BUILD_MANIFEST_CB/.exec(src);
    const vars = {};
    let body = src;
    if (fn) {
      const names = fn[1].split(',').map((x) => x.trim());
      const args = [];
      const re = /"((?:[^"\\]|\\.)*)"|([^,\s][^,]*)/g;
      let m;
      while ((m = re.exec(fn[3]))) args.push(m[1] !== undefined ? m[1] : m[2].trim());
      names.forEach((n, i) => (vars[n] = args[i]));
      body = fn[2];
    }
    const routes = {};
    const rr = /"(\/[^"]*)":\[/g;
    let r;
    while ((r = rr.exec(body))) {
      // Scan the list: quoted names (which can hold "[" and "]") or the function's argument names, to the closing "]".
      const items = [];
      let i = rr.lastIndex;
      while (i < body.length && body[i] !== ']') {
        if (body[i] === '"') {
          let j = i + 1;
          while (j < body.length && body[j] !== '"') j += body[j] === '\\' ? 2 : 1;
          items.push(body.slice(i + 1, j));
          i = j + 1;
        } else if (/[A-Za-z_$]/.test(body[i])) {
          let j = i;
          while (j < body.length && /[A-Za-z0-9_$]/.test(body[j])) j += 1;
          items.push(vars[body.slice(i, j)]);
          i = j;
        } else i += 1;
      }
      rr.lastIndex = i;
      routes[r[1]] = items.filter((x) => typeof x === 'string' && /^static\//.test(x));
    }
    return routes;
  }
  async function ok() {
    const c = navigator.connection;
    let battery = null;
    try {
      if (navigator.getBattery) {
        const b = await navigator.getBattery();
        battery = { charging: b.charging, level: b.level };
      }
    } catch {
      /* no battery information: a desktop */
    }
    return L.preloadOk({ visible: document.visibilityState === 'visible', saveData: !!(c && c.saveData), effectiveType: c ? c.effectiveType : null, battery });
  }
  function nextKind() {
    const idx = O.st.haloIndex;
    if (!idx || !Array.isArray(idx.rows)) return null;
    const now = Date.now();
    const next = idx.rows.filter((r) => r.href && !r.done && r.due && Date.parse(r.due) > now && ['assignment', 'discussion', 'quiz'].includes(r.kind)).sort((a, b) => Date.parse(a.due) - Date.parse(b.due))[0];
    return next ? next.kind : null;
  }
  async function run() {
    if (done) return;
    done = true;
    let build = null;
    try {
      build = JSON.parse(document.getElementById('__NEXT_DATA__').textContent).buildId;
    } catch {
      return;
    }
    if (!build || !/^[A-Za-z0-9_-]{6,64}$/.test(build)) return;
    try {
      const { haloPreload } = await chrome.storage.local.get('haloPreload');
      if (haloPreload && haloPreload.build === build) return;
    } catch {
      return;
    }
    if (!(await ok())) return;
    const kind = nextKind();
    if (!kind) return;
    let routes;
    try {
      const r = await fetch(`/_next/static/${build}/_buildManifest.js`, { credentials: 'same-origin' });
      if (!r.ok) return;
      routes = parseManifest(await r.text());
    } catch {
      return;
    }
    // The route's own files first (Halo lists the page's own chunk last), and none Halo has already loaded.
    const files = [...(routes[ROUTE[kind]] || [])].reverse().filter((f) => !document.querySelector(`script[src$="${CSS.escape(f)}"], link[href$="${CSS.escape(f)}"]`)).slice(0, 12);
    if (!files.length) return;
    for (const f of files) {
      const l = document.createElement('link');
      l.rel = 'prefetch';
      l.href = `/_next/${f}`;
      l.as = f.endsWith('.css') ? 'style' : 'script';
      l.setAttribute('data-haloplus', 'preload');
      document.head.appendChild(l);
    }
    try {
      await chrome.storage.local.set({ haloPreload: { build, at: Date.now(), kind, files: files.length } });
    } catch {
      /* once this page */
    }
    O.count('preload-done');
  }
  O.feature({
    id: 'preload',
    routes: ['home'],
    start() {
      // When the page is done loading and the browser is idle.
      const go = () => ('requestIdleCallback' in window ? requestIdleCallback(() => void run(), { timeout: 8000 }) : setTimeout(() => void run(), 3000));
      setTimeout(go, 3000);
    },
    stop() {},
  });
  O.parseManifest = parseManifest;
})();
