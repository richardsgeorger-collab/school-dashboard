// Feature: what-if from each class card on Student Home (0.12.18, George 2026-11-03: "Make what-if easy to find on
// Halo. Right now you'd never know it exists."). A small "What if?" link right after the card's grade, in Halo's link
// style with the Halo+ mark. It opens a small panel right there, the app's simple design:
//   1. the grade, big ("Estimate" whenever Halo's own numbers do not add up exactly; never a confident wrong number);
//   2. the next big item in plain words: "On Exam 1 (Fri), you need 81% for an A, 61% for an A-…", a letter to tap;
//   3. a slider for each item that moves the grade; 4. everything small in one "Everything else" slider;
//   5. "Open full what-if" to the Gradebook's what-if.
// The math is the Gradebook what-if's (logic.js wi*, the app's own): points only, from Halo's own Points Earned
// (GradeOverview, the class's grade and each assessment's points, read once with the page's own session), possible
// points from the class index. Nothing is saved, nothing is sent, nothing in Halo changes. Shares the "whatif" switch.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  const L = globalThis.HaloPlusOnLogic;
  if (!O || !L) return;
  const esc = O.esc;
  // The sync's own query (src/halo/bookmarklet.ts QG): the class's final grade and each assessment's points.
  const Q = 'query GradeOverview($courseClassSlugId: String!) { gradeOverview: getAllClassGrades(courseClassSlugId: $courseClassSlugId) { finalGrade { id finalPoints gradeValue isPublished maxPoints } grades { assessment { id } finalPoints status } } }';
  const KEEP_MS = 3 * 60_000;
  let panel = null; // { slug, h, sr, anchor }
  let scen = {}; // assessment id -> points
  let smallPct = null; // the "Everything else" slider, or null when untouched
  const cache = new Map(); // slug -> { at, d } | { at, error }
  const r1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
  const an = (l) => (/^[AEFHILMNORSX]/i.test(l) ? 'an' : 'a');

  const slugOf = (card) => {
    const a = card.querySelector('a[href^="/courses/"]');
    const m = a && /\/courses\/([^/?#]+)/.exec(a.getAttribute('href') || '');
    return m ? decodeURIComponent(m[1]) : null;
  };
  const classOf = (slug) => {
    const v = O.view;
    return v && Array.isArray(v.classes) ? v.classes.find((c) => c.slug && c.slug.toLowerCase() === String(slug).toLowerCase()) : null;
  };
  /** What kind of thing an item is, for "what moves the grade" (an exam, quiz, lab, paper or project counts at 2%). */
  const kindOf = (r) => (r.kind === 'quiz' ? 'quiz' : /\bexam|midterm|final\b/i.test(r.title) ? 'exam' : /\blab\b/i.test(r.title) ? 'lab' : /\b(paper|essay)\b/i.test(r.title) ? 'paper' : /\bproject\b/i.test(r.title) ? 'project' : '');

  /** Halo's own colours around the card: its fill and text, for a panel that looks at home in light and dark. */
  function lookOf(el) {
    let n = el;
    let bg = null;
    while (n && n.nodeType === 1) {
      const c = getComputedStyle(n).backgroundColor;
      const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(c || '');
      if (m && (m[4] === undefined || Number(m[4]) > 0.5)) {
        bg = [Number(m[1]), Number(m[2]), Number(m[3])];
        break;
      }
      n = n.parentElement;
    }
    bg = bg || [255, 255, 255];
    const dark = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255 < 0.45;
    const ink = getComputedStyle(el).color || (dark ? '#e6e6ea' : '#212121');
    // Halo's own link colour on this page (its "View your full schedule." link), else Halo's blue.
    const link = [...document.querySelectorAll('#Home--main a')].find((a) => !a.closest('[data-haloplus]') && /^[A-Za-z]/.test((a.textContent || '').trim()) && !a.querySelector('button'));
    const linkInk = (link && getComputedStyle(link).color) || (dark ? '#8ab4f8' : '#1565c0');
    return { dark, bg: `rgb(${bg.join(',')})`, ink, link: linkInk, font: getComputedStyle(el).fontFamily };
  }

  // ---- the link after each card's grade -----------------------------------------------------------------------------
  const LINK_CSS = `button{all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:4px;margin-left:8px;font:600 13px/1.2 inherit;color:var(--link);text-decoration:underline;text-underline-offset:2px;white-space:nowrap}button:hover{text-decoration-thickness:2px}button:focus-visible{outline:2px solid var(--link);outline-offset:2px;border-radius:3px}`;
  function links() {
    for (const card of document.querySelectorAll('#Home--main [class*="CourseCard_cardContainer"]')) {
      const slug = slugOf(card);
      const grade = card.querySelector('[data-haloplus="card-grade"]') || card.querySelector('.better-halo-grade-indicator');
      let l = card.querySelector('[data-haloplus="wi-link"]');
      if (!slug || !grade || !classOf(slug)) {
        if (l) l.remove();
        continue;
      }
      if (l && l.previousElementSibling === grade) continue;
      if (l) l.remove();
      const hst = O.host('wi-link', LINK_CSS);
      l = hst.h;
      hst.root.innerHTML = `<button type="button" aria-haspopup="dialog" title="Try scores and see your grade. Nothing changes in Halo.">What if?${O.mark()}</button>`;
      l.style.setProperty('--link', lookOf(card).link);
      hst.root.querySelector('button').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (panel && panel.slug === slug) return close();
        openFor(slug, card, l);
      });
      grade.insertAdjacentElement('afterend', l);
    }
  }

  // ---- the panel ------------------------------------------------------------------------------------------------------
  const PANEL_CSS = `
.p{position:relative;width:360px;max-width:calc(100vw - 24px);box-sizing:border-box;padding:14px 16px 12px;border-radius:8px;background:var(--bg);color:var(--ink);font:14px/1.45 var(--font);box-shadow:0 8px 28px rgba(0,0,0,.22),0 0 0 1px var(--line)}
.hd{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:13px;font-weight:600;color:var(--muted)}
.hd .x{all:unset;cursor:pointer;margin-left:auto;font-size:18px;line-height:1;padding:2px 6px;border-radius:4px;color:var(--muted)}
.hd .x:hover{background:var(--hover)}
.big{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.big b{font-size:30px;line-height:1.1}
.big span{font-size:17px;font-weight:600}
.est{display:inline-block;font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px;border:1px solid currentColor;opacity:.85}
.sub{font-size:13px;color:var(--muted);margin:2px 0 8px}
.reset{all:unset;cursor:pointer;font-size:13px;font-weight:600;text-decoration:underline;color:var(--ink)}
.next{margin:8px 0 10px;padding:8px 10px;border-radius:6px;background:var(--hover);font-size:14px;line-height:1.7}
.next button{all:unset;cursor:pointer;font-weight:700;padding:0 8px;margin:0 1px;border-radius:12px;border:1px solid var(--line2);line-height:1.5}
.next button:hover{background:var(--hover)}
.row{margin:8px 0}
.row .t{display:flex;gap:8px;align-items:baseline;font-size:13px}
.row .t b{font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.row .t i{font-style:normal;color:var(--muted);white-space:nowrap}
.row .v{font-weight:700;min-width:44px;text-align:right}
.row[data-on] .v{color:var(--gold)}
input[type=range]{width:100%;margin:4px 0 0;accent-color:var(--gold)}
.h3{font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);margin:10px 0 2px}
.ft{display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:8px;border-top:1px solid var(--line)}
.ft a{color:var(--link);font-weight:600;text-decoration:underline;text-underline-offset:2px}
.ft small{margin-left:auto;color:var(--muted);font-size:12px}
.msg{font-size:14px;color:var(--muted);margin:6px 0}
.msg button{all:unset;cursor:pointer;text-decoration:underline;color:var(--ink);font-weight:600}
`;
  function close() {
    if (!panel) return;
    panel.h.remove();
    panel = null;
    scen = {};
    smallPct = null;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('resize', place);
  }
  const onKey = (e) => {
    if (e.key === 'Escape' && panel) {
      const a = panel.anchor;
      close();
      const b = a && a.shadowRoot && a.shadowRoot.querySelector('button');
      if (b) b.focus();
    }
  };
  const onOutside = (e) => {
    if (!panel) return;
    const path = e.composedPath ? e.composedPath() : [];
    if (path.includes(panel.h) || path.includes(panel.anchor)) return;
    close();
  };
  function place() {
    if (!panel || !panel.anchor.isConnected) return close();
    const r = panel.anchor.getBoundingClientRect();
    const w = Math.min(360, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12));
    panel.h.style.left = `${left + window.scrollX}px`;
    panel.h.style.top = `${r.bottom + 8 + window.scrollY}px`;
  }
  function openFor(slug, card, anchor) {
    close();
    const look = lookOf(card);
    const hst = O.host('wi-panel', PANEL_CSS, { tag: 'div', display: 'block' });
    hst.h.style.cssText += ';position:absolute;z-index:2147482000;';
    const line = look.dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.12)';
    hst.h.style.setProperty('--bg', look.bg);
    hst.h.style.setProperty('--ink', look.ink);
    hst.h.style.setProperty('--muted', `color-mix(in srgb, ${look.ink} 62%, transparent)`);
    hst.h.style.setProperty('--line', line);
    hst.h.style.setProperty('--line2', look.dark ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.25)');
    hst.h.style.setProperty('--hover', look.dark ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.045)');
    hst.h.style.setProperty('--gold', look.dark ? '#f2b84b' : '#b07a10');
    hst.h.style.setProperty('--link', look.link);
    hst.h.style.setProperty('--font', look.font);
    hst.h.setAttribute('role', 'dialog');
    document.body.appendChild(hst.h);
    panel = { slug, h: hst.h, sr: hst.sr, root: hst.root, anchor };
    place();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('resize', place);
    O.count('whatif-card-open', false);
    render();
    void load(slug).then(() => panel && panel.slug === slug && render());
  }

  async function load(slug, again = false) {
    const hit = cache.get(slug);
    if (!again && hit && Date.now() - hit.at < KEEP_MS) return hit;
    if (again) O.forget('GradeOverview', { courseClassSlugId: slug });
    try {
      const d = await O.ask('GradeOverview', Q, { courseClassSlugId: slug }, KEEP_MS);
      const v = { at: Date.now(), d };
      cache.set(slug, v);
      return v;
    } catch {
      const v = { at: Date.now(), error: true };
      cache.set(slug, v);
      return v;
    }
  }

  /** Halo's totals and the class's rows, in the Gradebook what-if's shape; null when the class is not in the index. */
  function model(slug, d) {
    const idx = O.st && O.st.haloIndex;
    if (!idx || !Array.isArray(idx.classes) || !Array.isArray(idx.rows)) return null;
    const k = idx.classes.findIndex((c) => c.slug && c.slug.toLowerCase() === slug.toLowerCase());
    if (k < 0) return null;
    const go = d && Array.isArray(d.gradeOverview) ? d.gradeOverview[0] : d && d.gradeOverview;
    const f = go && go.finalGrade;
    const by = new Map(((go && go.grades) || []).filter((g) => g && g.assessment && g.assessment.id).map((g) => [g.assessment.id, g]));
    const rows = idx.rows
      .filter((r) => r.c === k && r.id && Number(r.pts) > 0)
      .map((r) => {
        const g = by.get(r.id);
        const published = !!g && g.status === 'PUBLISHED' && Number.isFinite(g.finalPoints);
        return { id: r.id, title: r.title, kind: r.kind, points: Number(r.pts), score: published ? g.finalPoints : null, published, due: r.cdue || r.due || null };
      });
    const earned = f && Number.isFinite(f.finalPoints) ? f.finalPoints : rows.filter((r) => r.published).reduce((a, r) => a + r.score, 0);
    const max = f && Number.isFinite(f.maxPoints) ? f.maxPoints : rows.filter((r) => r.published).reduce((a, r) => a + r.points, 0);
    const letter = f && f.gradeValue != null && String(f.gradeValue).trim() && String(f.gradeValue).trim() !== '-' ? String(f.gradeValue).trim() : null;
    const t = { earned, max, letter, pct: max > 0 ? (earned / max) * 100 : null };
    const gs = (classOf(slug) || {}).gs || null;
    // Exact only when Halo's own total is there, the rows add up to it, and the scale gives Halo's own letter.
    const exact = !!f && L.wiExact(t, rows) && (!t.letter || L.wiLetter(t.pct, gs) === t.letter.toUpperCase());
    return { t, rows, gs, exact };
  }

  function render() {
    if (!panel) return;
    const { slug, root } = panel;
    const cls = classOf(slug) || {};
    const hit = cache.get(slug);
    const head = `<div class="hd">${O.mark()}<span>What if · ${esc(cls.code || cls.cc || '')}</span><button type="button" class="x" aria-label="Close what-if">×</button></div>`;
    const foot = `<div class="ft"><a href="/courses/${encodeURIComponent(slug)}/student/gradebook" data-full>Open full what-if</a><small>Nothing changes in Halo</small></div>`;
    let body;
    if (!hit) body = '<p class="msg">Reading your grades from Halo…</p>';
    else if (hit.error) body = '<p class="msg">Halo didn’t answer just now. <button type="button" data-again>Try again</button></p>';
    else {
      const m = model(slug, hit.d);
      body = m ? view(m) : '<p class="msg">This class isn’t in Halo+ on this computer yet. Open the Gradebook to try scores there.</p>';
    }
    root.innerHTML = `<div class="p" aria-label="What-if for ${esc(cls.code || '')}">${head}${body}${foot}</div>`;
    wire();
    place();
  }

  /** The what-ifs in force: each slider set, and "Everything else" on every small item without its own. */
  function parts(m) {
    const { t, rows } = m;
    const open = rows.filter((r) => !r.published && r.points > 0);
    const big = L.wiBig(rows, t, kindOf).sort((a, b) => b.points - a.points || String(a.due).localeCompare(String(b.due)));
    const bigIds = new Set(big.map((r) => r.id));
    const small = open.filter((r) => !bigIds.has(r.id));
    const s = { ...scen };
    if (smallPct !== null) for (const r of small) s[r.id] = (r.points * smallPct) / 100;
    return { open, big, small, bigIds, s };
  }
  function topHtml(m, p) {
    const { t, rows, gs, exact } = m;
    const g = L.wiGrade(t, rows, p.s);
    const any = Object.keys(p.s).length > 0;
    const letter = !any && t.letter ? t.letter : L.wiLetter(g.pct, gs);
    return `<div class="big"><b>${esc(letter || '–')}</b><span>${g.pct === null ? '–' : `${r1(g.pct)}%`}</span>${exact ? '' : '<span class="est" title="Halo’s own numbers don’t add up exactly here, so this is an estimate.">Estimate</span>'}</div><div class="sub">${any ? `Halo now: ${esc(t.letter || '–')} ${t.pct === null ? '' : `${r1(t.pct)}%`} · <button type="button" class="reset">Reset</button>` : p.open.length ? 'Move a slider to try a score' : 'Everything is graded'}</div>`;
  }
  /** "On Exam 1 (Fri), you need 81% for an A, …": the next big item, with every other what-if as it is. */
  function nextHtml(m, p) {
    const { t, rows, gs } = m;
    const item = [...p.big].filter((r) => r.due && Date.parse(r.due) > Date.now() - 864e5).sort((a, b) => Date.parse(a.due) - Date.parse(b.due))[0];
    if (!item) return '';
    const rest = { ...p.s };
    delete rest[item.id];
    const needs = L.wiLadder(t, rows, rest, item, gs).filter((x) => x.state === 'needs').slice(0, 3);
    const when = L.dueDayWord(item.due, Date.now(), (O.view && O.view.tz) || 'America/Phoenix');
    return needs.length
      ? `<div class="next">On <b>${esc(item.title)}</b> (${esc(when)}), you need ${needs.map((x) => `${x.pct}% for ${an(x.label)} <button type="button" data-try="${esc(item.id)}" data-pct="${x.pct}" title="Try ${x.pct}%">${esc(x.label)}</button>`).join(', ')}.</div>`
      : `<div class="next"><b>${esc(item.title)}</b> (${esc(when)}) can’t change your letter much either way.</div>`;
  }
  function view(m) {
    const p = parts(m);
    const { t, rows } = m;
    const slider = (id, label, sub, pct, set) =>
      `<div class="row" data-row="${esc(id)}"${set ? ' data-on' : ''}><div class="t"><b title="${esc(label)}">${esc(label)}</b><i>${esc(sub)}</i><span class="v">${set ? `${Math.round(pct)}%` : '–'}</span></div><input type="range" min="0" max="100" step="1" value="${Math.round(pct)}" data-id="${esc(id)}" aria-label="What-if for ${esc(label)}"></div>`;
    const start = t.pct === null ? 85 : Math.round(t.pct);
    const bigRows = p.big.map((r) => slider(r.id, r.title, `${r.points} pts`, typeof scen[r.id] === 'number' ? (scen[r.id] / r.points) * 100 : start, typeof scen[r.id] === 'number')).join('');
    const pubSmall = rows.filter((r) => r.published && !p.bigIds.has(r.id) && r.points > 0);
    const avg = pubSmall.length ? (pubSmall.reduce((a, r) => a + r.score, 0) / pubSmall.reduce((a, r) => a + r.points, 0)) * 100 : start;
    const smallRow = p.small.length ? slider('__small', `Everything else (${p.small.length} item${p.small.length === 1 ? '' : 's'})`, '', smallPct === null ? avg : smallPct, smallPct !== null) : '';
    return `<div class="topw">${topHtml(m, p)}</div><div class="nextw">${nextHtml(m, p)}</div>${p.big.length ? `<div class="h3">What moves your grade</div>${bigRows}` : ''}${smallRow}`;
  }

  /** After a slider moves: the grade and the next-item line again, the sliders left alone (a drag goes on). */
  function refresh(m) {
    const p = parts(m);
    const top = panel.sr.querySelector('.topw');
    const nx = panel.sr.querySelector('.nextw');
    if (top) top.innerHTML = topHtml(m, p);
    if (nx) nx.innerHTML = nextHtml(m, p);
    wireButtons(m);
  }

  function wire() {
    const { sr, slug } = panel;
    const x = sr.querySelector('.x');
    if (x) x.addEventListener('click', close);
    const again = sr.querySelector('[data-again]');
    if (again)
      again.addEventListener('click', () => {
        cache.delete(slug);
        render();
        void load(slug, true).then(() => panel && panel.slug === slug && render());
      });
    const full = sr.querySelector('[data-full]');
    if (full) full.addEventListener('click', () => (chrome.storage.local.set({ haloWiOn: true }).catch(() => undefined), O.count('whatif-card-full', false)));
    const m = model(slug, (cache.get(slug) || {}).d);
    if (!m) return;
    wireButtons(m);
    for (const input of sr.querySelectorAll('input[type=range]'))
      input.addEventListener('input', () => {
        const pct = Number(input.value);
        if (input.dataset.id === '__small') smallPct = pct;
        else {
          const r = m.rows.find((y) => y.id === input.dataset.id);
          if (r) scen[r.id] = (r.points * pct) / 100;
        }
        const row = input.closest('.row');
        row.setAttribute('data-on', '');
        row.querySelector('.v').textContent = `${pct}%`;
        refresh(m);
      });
  }
  function wireButtons(m) {
    const { sr } = panel;
    const reset = sr.querySelector('.reset');
    if (reset)
      reset.addEventListener('click', () => {
        scen = {};
        smallPct = null;
        render();
      });
    for (const b of sr.querySelectorAll('[data-try]'))
      b.addEventListener('click', () => {
        const r = m.rows.find((y) => y.id === b.dataset.try);
        if (!r) return;
        scen[r.id] = (r.points * Number(b.dataset.pct)) / 100;
        O.count('whatif-card-next', false);
        render();
        focusRange(r.id);
      });
  }
  function focusRange(id) {
    const el = panel && [...panel.sr.querySelectorAll('input[type=range]')].find((i) => i.dataset.id === id);
    if (el) el.focus();
  }

  function pass() {
    if (O.route().kind !== 'home') return;
    links();
    if (panel && !panel.anchor.isConnected) {
      // Halo redrew the card: the panel follows its new link, or closes.
      const card = [...document.querySelectorAll('#Home--main [class*="CourseCard_cardContainer"]')].find((c) => slugOf(c) === panel.slug);
      const l = card && card.querySelector('[data-haloplus="wi-link"]');
      if (l) panel.anchor = l;
      else close();
    }
    place();
  }

  O.feature({
    id: 'whatif-card',
    switch: 'whatif',
    routes: ['home'],
    start: pass,
    update: pass,
    stop() {
      close();
      document.querySelectorAll('[data-haloplus="wi-link"], [data-haloplus="wi-panel"]').forEach((n) => n.remove());
    },
  });
})();
