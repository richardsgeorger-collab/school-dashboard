// Feature: the GPA on Student Home (0.12.18, George 2026-11-03: "A GPA calculator on Halo that's seamless and
// useful"). "GPA 3.54" sits in the This week bar beside "Calendar" (drawn by halo-ui.js); clicking it opens this small
// panel: each class with its letter, grade and credits (editable: kept on this computer at once, and on the account
// with this browser's sync key, the same field as the app's GPA card, so the two agree), the projected semester GPA,
// a what-if letter per class (tried only, never saved), and an optional "GPA so far" for the projected cumulative
// GPA (also on the account). The math is the app's (logic.js gpaOf, tested against src/domain/gpa.ts): GCU's points,
// Halo's own letter, never rounded up. Free, with its own switch ("gpa").
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  const L = globalThis.HaloPlusOnLogic;
  if (!O || !L) return;
  const esc = O.esc;
  const LETTERS = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D', 'F'];
  let panel = null; // { h, sr, root }
  let tryL = {}; // slug -> letter (what-if)
  let saved = ''; // the last save's words
  let soOpen = false;

  const local = () => (O.st && O.st.haloGpa) || {};
  const mine = () => L.gpaMine(local(), O.st && O.st.haloSnap);
  const own = () => mine().cr;
  const soFar = () => mine().so;
  const classes = () => ((O.view && O.view.classes) || []).filter((c) => c.slug);

  /** The colours of Halo+'s This week bar (Halo's own card look, light or dark): the panel matches it. */
  function vars() {
    const host = document.querySelector('[data-haloplus="week"]');
    const wk = host && host.shadowRoot && host.shadowRoot.querySelector('.wk');
    return (wk && wk.getAttribute('style')) || '--bg:#fff;--ink:#212121;--muted:#666;--line:rgba(0,0,0,.1);--hover:rgba(0,0,0,.04);--gold:#e0a526;--font:inherit';
  }
  const anchor = () => {
    const host = document.querySelector('[data-haloplus="week"]');
    return (host && host.shadowRoot && host.shadowRoot.querySelector('[data-gpa]')) || null;
  };

  const CSS = `
.p{width:440px;max-width:calc(100vw - 24px);box-sizing:border-box;padding:14px 16px 12px;border-radius:8px;background:var(--bg);color:var(--ink);font:14px/1.45 var(--font);box-shadow:0 8px 28px rgba(0,0,0,.22),0 0 0 1px var(--line)}
.hd{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--muted)}
.hd .x{all:unset;cursor:pointer;margin-left:auto;font-size:18px;line-height:1;padding:2px 6px;border-radius:4px}
.hd .x:hover{background:var(--hover)}
.big{display:flex;align-items:baseline;gap:10px;margin:4px 0 2px}
.big b{font-size:32px;line-height:1.1}
.big span{font-size:13px;color:var(--muted)}
.tag{display:inline-block;font-size:11px;font-weight:700;padding:1px 7px;border-radius:999px;border:1px solid var(--gold);color:var(--gold)}
table{width:100%;border-collapse:collapse;margin:8px 0 4px;font-size:13.5px}
th{font-size:11.5px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:var(--muted);text-align:left;padding:4px 4px;border-bottom:1px solid var(--line)}
td{padding:6px 4px;border-bottom:1px solid var(--line);vertical-align:middle}
td.c b{display:block;font-weight:600}
td.c small{color:var(--muted);font-size:12px}
td.g{white-space:nowrap}
td.g .l{font-weight:700}
td.g .n{color:var(--muted);font-size:12.5px;margin-left:4px}
tr[data-tried] td.g .l{color:var(--gold)}
select,input{font:inherit;font-size:13px;color:inherit;background:transparent;border:1px solid var(--line2);border-radius:4px;padding:2px 4px}
input.cr{width:52px;text-align:right}
.left{color:var(--muted);font-size:12.5px}
.so{margin-top:8px}
.so button.link{all:unset;cursor:pointer;font-weight:600;text-decoration:underline;font-size:13px}
.so .f{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin-top:6px;font-size:13px}
.so .f input{width:64px}
.so .cum{font-weight:700}
.ft{display:flex;align-items:center;gap:10px;margin-top:10px;padding-top:8px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
.ft .reset{all:unset;cursor:pointer;text-decoration:underline;font-weight:600;color:var(--ink)}
select:focus-visible,input:focus-visible,button:focus-visible{outline:2px solid var(--gold);outline-offset:1px}
@media (max-width:480px){td.c small{display:none}}
`;

  function close() {
    if (!panel) return;
    panel.h.remove();
    panel = null;
    tryL = {};
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('resize', place);
  }
  const onKey = (e) => {
    if (e.key === 'Escape' && panel) {
      close();
      const a = anchor();
      if (a) a.focus();
    }
  };
  const onOutside = (e) => {
    if (!panel) return;
    const path = e.composedPath ? e.composedPath() : [];
    const a = anchor();
    if (path.includes(panel.h) || (a && path.includes(a))) return;
    close();
  };
  function place() {
    const a = anchor();
    if (!panel) return;
    if (!a) return close();
    const r = a.getBoundingClientRect();
    const w = Math.min(440, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.right - w, window.innerWidth - w - 12));
    panel.h.style.left = `${left + window.scrollX}px`;
    panel.h.style.top = `${r.bottom + 8 + window.scrollY}px`;
  }
  function open() {
    if (panel) return close();
    const hst = O.host('gpa-panel', CSS, { tag: 'div', display: 'block' });
    hst.h.style.cssText += `;position:absolute;z-index:2147482000;${vars()};--line2:color-mix(in srgb, var(--ink) 30%, transparent)`;
    hst.h.setAttribute('role', 'dialog');
    hst.h.setAttribute('aria-label', 'Semester GPA');
    document.body.appendChild(hst.h);
    panel = { h: hst.h, sr: hst.sr, root: hst.root };
    soOpen = !!soFar();
    saved = '';
    render();
    place();
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('resize', place);
    O.count('gpa-open', false);
    const first = panel.sr.querySelector('select, input');
    if (first) first.focus({ preventScroll: true });
  }

  function render() {
    if (!panel) return;
    const cls = classes();
    const g = L.gpaOf(cls, own(), tryL);
    const any = Object.keys(tryL).length > 0;
    const so = soFar();
    const cum = so ? L.gpaCumulative(so, { gpa: g.gpa, credits: g.credits }) : null;
    const rows = g.rows
      .map((r) => {
        const c = cls.find((x) => x.slug === r.slug) || {};
        const why = r.left === 'no-grade' ? 'No grade yet' : r.left === 'no-points' ? 'Not on GCU’s scale' : '';
        const real = c.gl ? String(c.gl).toUpperCase() : Number.isFinite(c.g) ? L.wiLetter(c.g, c.gs) : null;
        const opts = [`<option value="">${real ? `Now (${esc(real)})` : 'Now'}</option>`, ...LETTERS.map((l) => `<option${tryL[r.slug] === l ? ' selected' : ''}>${l}</option>`)].join('');
        return `<tr data-slug="${esc(r.slug)}"${r.tried ? ' data-tried' : ''}><td class="c"><b>${esc(c.code || '')}</b><small>${esc(c.name || '')}</small></td><td class="g">${why ? `<span class="left">${why}</span>` : `<span class="l">${esc(r.letter)}</span>${r.pct !== null && !r.tried ? `<span class="n">${(Math.round(r.pct * 10) / 10).toFixed(1)}%</span>` : ''}`}</td><td><select aria-label="What-if letter for ${esc(c.code || '')}" data-try>${opts}</select></td><td><input class="cr" type="number" min="0" max="12" step="1" inputmode="numeric" value="${esc(String(r.credits))}" aria-label="Credits for ${esc(c.code || '')}" data-cr></td></tr>`;
      })
      .join('');
    const soHtml = soOpen
      ? `<div class="f"><label>GPA so far <input type="number" min="0" max="4" step="0.01" inputmode="decimal" data-so-gpa value="${so ? esc(String(so.gpa)) : ''}" placeholder="3.40"></label><label>over <input type="number" min="0" max="300" step="1" inputmode="numeric" data-so-cr value="${so ? esc(String(so.credits)) : ''}" placeholder="45"> credits</label>${cum !== null ? `<span>Cumulative after this semester: <span class="cum">${L.fmtGpa(cum)}</span></span>` : ''}</div>`
      : '<button type="button" class="link" data-so-open>Add your GPA so far for a cumulative GPA</button>';
    panel.root.innerHTML = `<div class="p"><div class="hd">${O.mark()}<span>Semester GPA</span><button type="button" class="x" aria-label="Close GPA">×</button></div><div class="big"><b>${L.fmtGpa(g.gpa)}</b><span>${g.credits} credit${g.credits === 1 ? '' : 's'}</span>${any ? '<span class="tag">What-if</span>' : ''}</div><table><thead><tr><th>Class</th><th>Grade</th><th>What if</th><th>Credits</th></tr></thead><tbody>${rows}</tbody></table><div class="so">${soHtml}</div><div class="ft"><span>${esc(saved || 'GCU’s grade points · credits are saved')}</span>${any ? '<button type="button" class="reset">Clear what-ifs</button>' : ''}</div></div>`;
    wire();
  }

  /** Kept on this computer at once; on the account with this browser's sync key (the app shows the same). */
  async function keep(patch, toAccount) {
    const m = mine();
    const next = { cr: m.cr, so: m.so, ...patch, at: new Date().toISOString() };
    await chrome.storage.local.set({ haloGpa: next }).catch(() => undefined);
    if (O.st) O.st.haloGpa = next;
    const r = await chrome.runtime.sendMessage({ kind: 'gpa', ...toAccount }).catch(() => null);
    saved = r && r.ok ? 'Saved to your Halo+ account' : r && r.why === 'no-account' ? 'Saved on this computer' : 'Saved on this computer · the account gets it next time';
    const ft = panel && panel.sr.querySelector('.ft span');
    if (ft) ft.textContent = saved;
  }

  function wire() {
    const { sr } = panel;
    sr.querySelector('.x').addEventListener('click', close);
    for (const sel of sr.querySelectorAll('[data-try]'))
      sel.addEventListener('change', () => {
        const slug = sel.closest('tr').dataset.slug;
        if (sel.value) tryL[slug] = sel.value;
        else delete tryL[slug];
        O.count('gpa-whatif', false);
        render();
        const again = [...panel.sr.querySelectorAll('tr')].find((t) => t.dataset.slug === slug);
        if (again) again.querySelector('[data-try]').focus();
      });
    for (const inp of sr.querySelectorAll('[data-cr]'))
      inp.addEventListener('change', () => {
        const slug = inp.closest('tr').dataset.slug;
        const n = Number(inp.value);
        if (inp.value.trim() === '' || !Number.isFinite(n) || n < 0 || n > 12) return render();
        const cr = Math.round(n * 10) / 10;
        void keep({ cr: { ...own(), [slug]: cr } }, { slug, credits: cr }).then(() => {
          render();
          const again = [...panel.sr.querySelectorAll('tr')].find((t) => t.dataset.slug === slug);
          if (again) again.querySelector('[data-cr]').focus();
        });
        O.count('gpa-credits', false);
      });
    const so = sr.querySelector('[data-so-open]');
    if (so)
      so.addEventListener('click', () => {
        soOpen = true;
        render();
        const f = panel.sr.querySelector('[data-so-gpa]');
        if (f) f.focus();
      });
    const sg = sr.querySelector('[data-so-gpa]');
    const sc = sr.querySelector('[data-so-cr]');
    const saveSo = () => {
      const gv = sg.value.trim();
      const cv = sc.value.trim();
      if (!gv && !cv) return void keep({ so: null }, { soFar: null }).then(render);
      const gn = Number(gv);
      const cn = Number(cv);
      if (!gv || !cv || !Number.isFinite(gn) || gn < 0 || gn > 4 || !Number.isFinite(cn) || cn < 0 || cn > 300) return;
      const v = { gpa: Math.round(gn * 100) / 100, credits: Math.round(cn) };
      void keep({ so: v }, { soFar: v }).then(() => {
        render();
        O.count('gpa-sofar', false);
      });
    };
    if (sg) sg.addEventListener('change', saveSo);
    if (sc) sc.addEventListener('change', saveSo);
    const reset = sr.querySelector('.reset');
    if (reset)
      reset.addEventListener('click', () => {
        tryL = {};
        render();
      });
  }

  document.addEventListener('haloplus-gpa-open', () => {
    if (!O.enabled('gpa') || O.route().kind !== 'home') return;
    open();
  });

  O.feature({
    id: 'gpa',
    routes: ['home'],
    start() {},
    update() {
      if (panel) {
        // The data changed under it (a sync, the account): drawn again unless something in it has focus.
        if (!panel.sr.activeElement) render();
        place();
      }
    },
    stop: close,
  });
})();
