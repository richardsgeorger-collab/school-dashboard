// Feature 0 (0.12.0): search all your classes. A search field on Halo's Student Home, under Halo's class tabs, and
// Ctrl+K (⌘K on a Mac) on any Halo page. It looks through the titles of assignments, quizzes, discussions,
// announcements, files and topics in every class, from the index on this computer (built from the last sync; no AI,
// nothing sent anywhere), and opens the one picked at Halo's own address for it. Not in a text box or Halo's editor
// (its Ctrl+K inserts a link), not without an index, and only results with an address Halo+ is sure of.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  const L = globalThis.HaloPlusOnLogic;
  if (!O || !L) return;

  const ICON = { assignment: 'description', quiz: 'quiz', discussion: 'forum', participation: 'chat', announcement: 'campaign', file: 'insert_drive_file' };
  const TONE = {
    topic: 'var(--lms-primaryColor, #522398)',
    assignment: 'var(--lms-colorOrange, #ff9800)',
    quiz: 'var(--lms-colorRed50, #ef5350)',
    discussion: 'var(--lms-colorBlue, #1a65b0)',
    participation: 'var(--lms-colorCyan, #009688)',
    announcement: 'var(--lms-gray70, #707070)',
    file: 'var(--lms-gray61, #616161)',
  };
  const LABEL = { topic: 'Topic', assignment: 'Assignment', quiz: 'Quiz', discussion: 'Discussion', participation: 'Participation', announcement: 'Announcement', file: 'File' };
  const MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  // ---- the index ------------------------------------------------------------------------------------------------------
  let rows = null;
  let rowsAt = null;
  function data() {
    const idx = O.st.haloIndex;
    if (!idx || idx.v !== 1 || !Array.isArray(idx.rows) || !Array.isArray(idx.classes)) return null;
    if (rowsAt !== idx.at || !rows) {
      rows = idx.rows.filter((r) => r && r.href && r.title).map((r) => ({ ...r, cc: (idx.classes[r.c] || {}).cc || '', code: (idx.classes[r.c] || {}).code || '' }));
      rowsAt = idx.at;
    }
    return rows.length ? rows : null;
  }
  /** With nothing typed, in the Ctrl+K box only: what is due in the next week and not done, soonest first. */
  function comingUp(all, now) {
    return all
      .filter((r) => r.due && !r.done && ['assignment', 'quiz', 'discussion'].includes(r.kind))
      .filter((r) => {
        const d = Date.parse(r.due) - now;
        return d >= 0 && d <= 7 * L.DAY;
      })
      .sort((a, b) => Date.parse(a.due) - Date.parse(b.due))
      .slice(0, 5);
  }

  // ---- the look -------------------------------------------------------------------------------------------------------
  const CSS = `
.w{font:14px/1.5 var(--hp-font);color:var(--hp-text);-webkit-font-smoothing:antialiased}
:host{color-scheme:inherit}
.mi{font-family:'Material Icons';font-weight:normal;font-style:normal;font-size:18px;line-height:1;letter-spacing:normal;text-transform:none;display:inline-block;white-space:nowrap;direction:ltr;font-feature-settings:'liga';-webkit-font-smoothing:antialiased}
.field{position:relative;display:flex;align-items:center;gap:7px;height:40px;padding:0 10px 0 14px;border:1px solid var(--hp-input-border);border-radius:var(--hp-radius);background:var(--hp-surface);box-sizing:border-box}
.field:hover{border-color:var(--hp-input-border-hover)}
.field:focus-within{border-color:var(--hp-purple)}
.field .mi.s{color:var(--hp-text-2);font-size:20px}
input{all:unset;flex:1;min-width:0;font:inherit;color:inherit;height:100%}
input::-webkit-search-cancel-button,input::-webkit-search-decoration{-webkit-appearance:none;appearance:none;display:none}
input::placeholder{color:var(--hp-placeholder);opacity:1}
.kbd{font-size:11px;line-height:18px;color:var(--hp-text-2);border:1px solid var(--hp-border);border-radius:4px;padding:0 5px;white-space:nowrap}
.panel{background:var(--hp-surface);border-radius:var(--hp-radius);box-shadow:var(--hp-shadow-menu);overflow:hidden}
.list{max-height:min(420px,60vh);overflow:auto;padding:4px 0;margin:0;list-style:none}
.head{font-size:12px;font-weight:600;color:var(--hp-text-2);padding:8px 16px 4px;text-transform:none}
.row{display:flex;align-items:center;gap:12px;padding:8px 16px;cursor:pointer;text-decoration:none;color:inherit}
.row[aria-selected=true]{background:var(--hp-select)}
.ic{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;flex:none;font-size:12px;font-weight:700}
.ic .mi{font-size:16px}
.tx{min-width:0;flex:1}
.t{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.m{font-size:12px;color:var(--hp-text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empty{padding:14px 16px;color:var(--hp-text-2);font-size:13px}
.foot{display:flex;align-items:center;gap:12px;padding:8px 16px;border-top:1px solid var(--hp-border);font-size:12px;color:var(--hp-text-2)}
.foot .sp{flex:1}
`;
  const esc = O.esc;
  const tone = (k) => TONE[k] || TONE.file;
  function iconHtml(r) {
    const c = tone(r.kind);
    const bg = `background:color-mix(in srgb,${c} 14%,transparent);color:${c}`;
    if (r.kind === 'topic') return `<span class="ic" style="${bg}" aria-hidden="true">${esc(`T${r.n || ''}`)}</span>`;
    return `<span class="ic" style="${bg}" aria-hidden="true"><span class="mi">${ICON[r.kind] || 'insert_drive_file'}</span></span>`;
  }
  function metaText(r) {
    const z = O.zone();
    const bits = [r.code || r.cc, LABEL[r.kind]];
    if (r.topic && r.kind !== 'topic') bits.push(r.topic.replace(/^(Topic \d+):.*$/, '$1'));
    if (r.due && z && Number.isFinite(Date.parse(r.due))) bits.push(`Due ${L.haloFormat(Date.parse(r.due), z, 'short')}`);
    return bits.filter(Boolean).join(' · ');
  }
  function listHtml(list, head) {
    if (!list.length) return '';
    return `${head ? `<li class="head" role="presentation">${esc(head)}</li>` : ''}${list
      .map((r, i) => `<li class="row" role="option" id="o${i}" data-i="${i}" aria-selected="${i === 0}">${iconHtml(r)}<span class="tx"><div class="t">${esc(r.title)}</div><div class="m">${esc(metaText(r))}</div></span></li>`)
      .join('')}`;
  }

  // ---- opening a result ----------------------------------------------------------------------------------------------------
  function go(r, newTab) {
    if (!r || !r.href) return;
    O.count('search-go', false);
    const url = new URL(r.href, location.origin);
    if (newTab) return void window.open(url.href, '_blank', 'noopener');
    // Halo opens its assignment view from the address's #part only on a fresh load (its router never hears a bare hash).
    const sameDoc = url.pathname === location.pathname && url.search === location.search;
    location.assign(url.href);
    if (sameDoc && url.hash) location.reload();
  }

  // One results list, for the Home field's dropdown and the Ctrl+K box.
  function results(box, input, { empty = 'none' } = {}) {
    let shown = [];
    let sel = 0;
    const listEl = box.querySelector('.list');
    const render = () => {
      const all = data() || [];
      const q = input.value.trim();
      const now = Date.now();
      if (!q) {
        shown = empty === 'soon' ? comingUp(all, now) : [];
        listEl.innerHTML = shown.length ? listHtml(shown, 'Coming up') : empty === 'soon' ? '<li class="empty" role="presentation">Type to search every class: assignments, quizzes, discussions, announcements, files and topics.</li>' : '';
      } else {
        shown = L.search(all, q, now, 8);
        listEl.innerHTML = shown.length ? listHtml(shown) : `<li class="empty" role="presentation">Nothing in your classes matches “${esc(q)}”.</li>`;
      }
      sel = 0;
      input.setAttribute('aria-activedescendant', shown.length ? 'o0' : '');
      box.toggleAttribute('data-has', !!listEl.innerHTML);
    };
    const move = (d) => {
      if (!shown.length) return;
      sel = (sel + d + shown.length) % shown.length;
      listEl.querySelectorAll('.row').forEach((el) => el.setAttribute('aria-selected', String(Number(el.dataset.i) === sel)));
      const el = listEl.querySelector(`#o${sel}`);
      if (el) el.scrollIntoView({ block: 'nearest' });
      input.setAttribute('aria-activedescendant', `o${sel}`);
    };
    input.addEventListener('input', render);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') (e.preventDefault(), move(1));
      else if (e.key === 'ArrowUp') (e.preventDefault(), move(-1));
      else if (e.key === 'Enter' && shown[sel]) (e.preventDefault(), go(shown[sel], e.metaKey || e.ctrlKey));
      e.stopPropagation();
    });
    listEl.addEventListener('mousemove', (e) => {
      const row = e.target.closest && e.target.closest('.row');
      if (row && Number(row.dataset.i) !== sel) move(Number(row.dataset.i) - sel);
    });
    listEl.addEventListener('mousedown', (e) => e.preventDefault());
    listEl.addEventListener('click', (e) => {
      const row = e.target.closest && e.target.closest('.row');
      if (row) go(shown[Number(row.dataset.i)], e.metaKey || e.ctrlKey);
    });
    return { render };
  }

  // ---- the field on Student Home ----------------------------------------------------------------------------------------------
  let bar = null;
  function barSpot() {
    const main = document.getElementById('Home--main');
    const tabs = main && main.querySelector('[role="tablist"]');
    if (!tabs) return null;
    const block = tabs.closest('.better-halo-tabs-wrapper') || tabs;
    return block.parentElement === main || main.contains(block) ? block : null;
  }
  function placeBar() {
    const spot = barSpot();
    if (!spot || !data()) return removeBar();
    if (bar && bar.isConnected && bar.previousElementSibling === spot) return;
    if (!bar) bar = makeBar();
    spot.after(bar);
    bar.style.cssText = 'all:initial;display:block;margin:-12px 0 28px;position:relative;z-index:5;';
  }
  function makeBar() {
    const h = document.createElement('div');
    h.setAttribute('data-haloplus', 'search-bar');
    const sr = h.attachShadow({ mode: 'open' });
    const key = MAC ? '⌘K' : 'Ctrl K';
    sr.innerHTML = `<style>${O.MARK_CSS}${CSS}.drop{position:absolute;left:0;top:44px;width:min(560px,100%);z-index:1300;display:none}.drop[data-open][data-has]{display:block}.field{max-width:420px}</style>
<div class="w"><label class="field"><span class="mi s" aria-hidden="true">search</span><input type="search" placeholder="Search your classes" aria-label="Search your classes" role="combobox" aria-expanded="false" aria-controls="l" aria-autocomplete="list" autocomplete="off" spellcheck="false"><span class="kbd" aria-hidden="true">${key}</span>${O.mark()}</label>
<div class="drop panel"><ul class="list" id="l" role="listbox" aria-label="Search results"></ul></div></div>`;
    const input = sr.querySelector('input');
    const drop = sr.querySelector('.drop');
    const r = results(drop, input);
    const open = (on) => {
      drop.toggleAttribute('data-open', on);
      input.setAttribute('aria-expanded', String(on));
    };
    input.addEventListener('focus', () => {
      O.count('search-open');
      r.render();
      open(true);
    });
    input.addEventListener('input', () => open(true));
    input.addEventListener('blur', () => setTimeout(() => open(false), 120));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        input.value = '';
        r.render();
        input.blur();
      }
    });
    return h;
  }
  function removeBar() {
    if (bar) bar.remove();
  }

  // ---- Ctrl+K anywhere on Halo ------------------------------------------------------------------------------------------------
  let palette = null;
  let lastFocus = null;
  const editable = (el) => {
    for (let n = el; n; n = n.parentElement) {
      if (n.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(n.tagName) || (n.classList && (n.classList.contains('ProseMirror') || n.classList.contains('tiptap-editor')))) return true;
      if (n.getRootNode && n.getRootNode() !== document && n.getRootNode().host) return editable(n.getRootNode().host) || /^(INPUT|TEXTAREA)$/.test(n.tagName);
    }
    return false;
  };
  function onKey(e) {
    if (!(e.key === 'k' || e.key === 'K') || !(MAC ? e.metaKey : e.ctrlKey) || e.altKey || e.shiftKey) return;
    if (palette) return;
    const t = e.composedPath ? e.composedPath()[0] : e.target;
    // Halo's editor uses Ctrl+K to insert a link; a text box keeps its own keys.
    if (editable(t) && !(t && t.closest && t.closest('[data-haloplus="search-bar"]'))) return;
    if (!data()) return;
    e.preventDefault();
    e.stopPropagation();
    openPalette();
  }
  function openPalette() {
    lastFocus = document.activeElement;
    const h = document.createElement('div');
    h.setAttribute('data-haloplus', 'search-palette');
    h.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483600;';
    const sr = h.attachShadow({ mode: 'open' });
    sr.innerHTML = `<style>${O.MARK_CSS}${CSS}
.bk{position:fixed;inset:0;background:var(--hp-backdrop)}
.dlg{position:fixed;left:50%;top:12vh;transform:translateX(-50%);width:min(640px,calc(100vw - 32px));border-radius:var(--hp-radius);box-shadow:var(--hp-shadow-dialog)}
.dlg .field{border:0;border-bottom:1px solid var(--hp-border);border-radius:var(--hp-radius) var(--hp-radius) 0 0;height:52px;padding:0 16px;font-size:16px}
.dlg .field:focus-within{border-color:var(--hp-border)}
@media (prefers-reduced-motion:no-preference){.dlg{animation:in .12s ease-out}@keyframes in{from{opacity:0;transform:translate(-50%,-6px)}}}
</style>
<div class="w"><div class="bk"></div><div class="dlg panel" role="dialog" aria-modal="true" aria-label="Search your classes">
<label class="field"><span class="mi s" aria-hidden="true">search</span><input type="search" placeholder="Search your classes" aria-label="Search your classes" role="combobox" aria-expanded="true" aria-controls="l" aria-autocomplete="list" autocomplete="off" spellcheck="false"><span class="kbd" aria-hidden="true">Esc</span></label>
<ul class="list" id="l" role="listbox" aria-label="Search results"></ul>
<div class="foot"><span>↑ ↓ to move</span><span>Enter to open</span><span>${MAC ? '⌘' : 'Ctrl'}+Enter for a new tab</span><span class="sp"></span>${O.mark()}</div></div></div>`;
    document.body.appendChild(h);
    palette = h;
    const input = sr.querySelector('input');
    const r = results(sr.querySelector('.dlg'), input, { empty: 'soon' });
    r.render();
    sr.querySelector('.bk').addEventListener('mousedown', closePalette);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') (e.preventDefault(), closePalette());
      if (e.key === 'Tab') e.preventDefault();
    });
    input.focus();
    O.count('search-open');
  }
  function closePalette() {
    if (!palette) return;
    palette.remove();
    palette = null;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  O.feature({
    id: 'search',
    start() {
      document.addEventListener('keydown', onKey, true);
      if (O.route().kind === 'home') placeBar();
    },
    update() {
      if (O.route().kind === 'home') placeBar();
      else removeBar();
    },
    stop() {
      document.removeEventListener('keydown', onKey, true);
      removeBar();
      closePalette();
    },
  });
})();
