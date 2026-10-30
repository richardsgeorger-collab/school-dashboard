// Feature: what-if on Halo's Gradebook (0.12.14, George 2026-10-29: "What-if right in Halo's gradebook… looks like Halo
// built it, nothing loud"). A small "What-if" toggle with the Halo+ mark beside Halo's score cards. On: a score box in
// every row (rows with no grade yet, and graded ones for a retake), a "What-if" card beside Halo's own total that moves
// as you type (letter and percent), "What do I need?" under it, and above the topics the next big item in plain words
// ("On Exam 1 (tomorrow), you need 81% for an A, 61% for an A-, 41% for a B+."; a letter fills it in). The math is the
// app's (logic.js wi*, tested against src/domain/whatIfGrade.ts): it starts from Halo's own Points Earned, points only,
// as Halo grades; "Estimate" whenever it is not certain (Halo's rows do not add up to Halo's total, or the letter scale
// does not give Halo's own letter). Off puts the page back exactly as Halo drew it: everything added carries
// data-haloplus and is removed; nothing of Halo's is changed, nothing is sent anywhere, nothing is submitted.
// Halo draws the rows as a table at 1366px and wider and as cards below, and redraws them; every pass re-finds them.
(function () {
  'use strict';
  const O = globalThis.HaloPlusOn;
  const L = globalThis.HaloPlusOnLogic;
  if (!O || !L) return;
  const esc = O.esc;
  let on = false;
  let loaded = false;
  /** The what-ifs on this page, by Halo assessment id, in points. Kept while the page is open. */
  let scen = {};
  let slugFor = null;
  const firstText = (el) => {
    if (!el) return '';
    for (const n of el.childNodes) if (n.nodeType === 3 && n.nodeValue.trim()) return n.nodeValue.trim();
    return (el.firstChild && el.firstChild.nodeType === 3 ? el.firstChild.nodeValue : '').trim();
  };
  const num = (t) => (/^-?\d+(\.\d+)?$/.test(String(t).trim()) ? Number(t) : null);

  /** Halo's three score cards: Overall Grade, Points Earned, Percentage (fixed order). */
  function haloTotals() {
    const sec = document.getElementById('guide_anchor_studentGradebook_progress') || document.querySelector('.guide_anchor_studentGradebook_progress');
    if (!sec) return null;
    const cards = [...sec.querySelectorAll('[class*="GradingScoreCard_scoreCard"]')].filter((c) => !c.closest('[data-haloplus]'));
    const byLabel = (l) => cards.find((c) => (c.querySelector('[class*="GradingScoreCard_scoreLabel"]')?.textContent || '').trim() === l);
    const overall = byLabel('Overall Grade');
    const pts = byLabel('Points Earned');
    if (!overall || !pts) return null;
    const earned = num(firstText(pts.querySelector('[data-testid="student_scored_points"]')));
    const max = num(pts.querySelector('[class*="Points_totalPoints"]')?.textContent);
    const letter = firstText(overall.querySelector('[data-testid="student_scored_points"]')) || null;
    if (earned === null || max === null) return null;
    return { sec, cards, earned, max, letter: letter === '-' ? null : letter, pct: max > 0 ? (earned / max) * 100 : null };
  }

  /** Every assessment row on the page, in either layout: its id, title, points, score, due date and where to put the box. */
  function haloRows() {
    const out = [];
    for (const b of document.querySelectorAll('[data-testid^="student_Assessment_Status_Button="]')) {
      if (b.closest('[data-haloplus]')) continue;
      const id = b.getAttribute('data-testid').split('=')[1];
      const tr = b.closest('tr');
      const card = tr ? null : b.closest('[class*="studentFeedbackCard_cardColor"], [class*="studentFeedbackCard_bgcardColor"]');
      const row = tr || card;
      if (!row || !id) continue;
      const title = (row.querySelector('h4[class*="AssessmentTable_assessmentTitle"], span[class*="studentFeedbackCard_wordBreak"]')?.textContent || '').trim();
      const scoreCell = tr ? tr.querySelector('td[data-testid$="_score"]') : [...row.querySelectorAll('[class*="StudentAssessmentDetails_childItem"]')].find((x) => x.previousElementSibling && x.previousElementSibling.textContent.trim() === 'Score');
      if (!scoreCell) continue;
      const totalEl = scoreCell.querySelector('[class*="Points_totalPoints"]');
      const points = num(totalEl && totalEl.textContent);
      const status = (row.querySelector('[data-testid="status"]')?.textContent || '').trim();
      const earned = num(firstText(scoreCell.querySelector('[data-testid="student_scored_points"]')));
      const published = status === 'Published' && earned !== null;
      const due = row.querySelector('time[datetime]')?.getAttribute('datetime') || null;
      if (points === null) continue;
      out.push({ id, title, points, score: published ? earned : null, published, due, scoreCell, row });
    }
    return out;
  }

  const classOf = (slug) => {
    const v = O.view;
    return v && Array.isArray(v.classes) ? v.classes.find((c) => c.slug && c.slug.toLowerCase() === String(slug).toLowerCase()) : null;
  };
  const kindOf = (id) => {
    const v = O.view;
    const it = v && Array.isArray(v.items) ? v.items.find((i) => i.h === id) : null;
    return it ? String(it.ty || '').toLowerCase() : '';
  };

  const CSS = `
[data-haloplus="wi-toggle"]{display:flex;flex-wrap:wrap;align-items:center;gap:6px 14px;margin:10px 0 2px;font-size:14px;width:100%;flex-basis:100%}
[data-haloplus="wi-toggle"] > button{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13px;font-weight:600;padding:4px 10px;border-radius:4px;border:1px solid currentColor;background:transparent;color:inherit;opacity:.8;cursor:pointer}
[data-haloplus="wi-toggle"] > button[aria-pressed="true"]{opacity:1;background:rgba(127,127,127,.12)}
[data-haloplus="wi-card"]{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px}
[data-haloplus="wi-card"] .hp-wi-big{font-size:22px;font-weight:700;line-height:1.1}
[data-haloplus="wi-card"] .hp-wi-big small{font-size:15px;font-weight:600;margin-left:5px}
[data-haloplus="wi-card"] .hp-wi-sub{font-size:13px;opacity:.75}
[data-haloplus="wi-card"] .hp-wi-est{display:inline-block;font-size:11px;font-weight:700;padding:1px 6px;border-radius:999px;border:1px solid currentColor;opacity:.85}
[data-haloplus="wi-card"] .hp-wi-need{font-size:13px}
[data-haloplus="wi-card"] .hp-wi-need select{font:inherit;font-weight:700;padding:0 2px;border-radius:4px;border:1px solid rgba(127,127,127,.5);background:transparent;color:inherit}
[data-haloplus="wi-card"] .hp-wi-reset{font:inherit;font-size:13px;font-weight:600;border:0;background:none;color:inherit;text-decoration:underline;cursor:pointer;padding:0}
[data-haloplus="wi-next"]{margin:6px 8px 12px;font-size:15px;line-height:1.7}
[data-haloplus="wi-next"] button{font:inherit;font-weight:700;padding:0 8px;margin:0 1px;border-radius:12px;border:1px solid rgba(127,127,127,.5);background:transparent;color:inherit;cursor:pointer;line-height:1.5}
[data-haloplus="wi-next"] button:hover{background:rgba(127,127,127,.15)}
[data-haloplus="wi-box"]{display:inline-flex;align-items:center;gap:4px;margin-top:4px;font-size:12px;white-space:nowrap}
[data-haloplus="wi-box"] input{width:56px;font:inherit;font-size:13px;padding:2px 4px;border-radius:4px;border:1px solid rgba(127,127,127,.55);background:transparent;color:inherit;text-align:right}
[data-haloplus="wi-box"][data-on] input{border-color:#f2b84b;box-shadow:0 0 0 1px #f2b84b}
[data-haloplus="wi-box"] .hp-wi-tag{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;opacity:.75}
`;
  function style() {
    if (document.querySelector('style[data-haloplus="wi-style"]')) return;
    const s = document.createElement('style');
    s.setAttribute('data-haloplus', 'wi-style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }
  function clear() {
    document.querySelectorAll('[data-haloplus^="wi-"]').forEach((n) => n.remove());
  }
  const dayWord = (iso) => {
    if (!iso) return '';
    const tz = (O.view && O.view.tz) || 'America/Phoenix';
    const day = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
    const d = day(iso);
    const now = Date.now();
    if (d === day(now)) return 'today';
    if (d === day(now + 864e5)) return 'tomorrow';
    const days = (Date.parse(iso) - now) / 864e5;
    return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long', ...(days > 6 ? { month: 'short', day: 'numeric' } : {}) }).format(new Date(iso));
  };
  const an = (l) => (/^[AEFHILMNORSX]/i.test(l) ? 'an' : 'a');
  const r1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

  /** The toggle, always there on the Gradebook while the feature is on. */
  function toggle(t) {
    let box = t.sec.querySelector('[data-haloplus="wi-toggle"]');
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('data-haloplus', 'wi-toggle');
      box.innerHTML = `<button type="button" aria-pressed="false" title="Try scores on your assignments. Nothing changes in Halo.">${O.mark()}<span>What-if</span></button>`;
      box.querySelector('button').addEventListener('click', () => {
        on = !on;
        chrome.storage.local.set({ haloWiOn: on }).catch(() => undefined);
        O.count(on ? 'whatif-on' : 'whatif-off', false);
        if (!on) clear();
        pass();
      });
      t.sec.appendChild(box);
    }
    const b = box.querySelector('button');
    if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
  }

  /** The What-if card beside Halo's own total: the letter and percent with every what-if in, and "What do I need?". */
  function wiCard(t, rows, gs, exact) {
    const g = L.wiGrade(t, rows, scen);
    const any = Object.keys(scen).length > 0;
    const letter = !any && t.letter ? t.letter : L.wiLetter(g.pct, gs);
    const key = `${g.earned}|${g.max}|${letter}|${exact}|${any}`;
    const bar = t.sec.querySelector('[data-haloplus="wi-toggle"]');
    if (!bar) return;
    let card = bar.querySelector('[data-haloplus="wi-card"]');
    if (card && card.dataset.key === key) return;
    if (!card) {
      card = document.createElement('div');
      card.setAttribute('data-haloplus', 'wi-card');
      bar.appendChild(card);
    }
    card.dataset.key = key;
    const need = needLine(t, rows, gs, letter);
    card.innerHTML = `<div class="hp-wi-big">${esc(letter || '-')}<small>${g.pct === null ? '-' : `${r1(g.pct)}%`}</small></div>${exact ? '' : '<span class="hp-wi-est" title="Halo+ cannot reproduce Halo’s total exactly here, so this is an estimate.">Estimate</span>'}<div class="hp-wi-sub">${any ? `Halo: ${esc(t.letter || '-')} ${t.pct === null ? '' : `${r1(t.pct)}%`}` : 'Type a score in any row to try it'}</div>${need}${any ? '<button type="button" class="hp-wi-reset">Reset</button>' : ''}`;
    const sel = card.querySelector('select');
    if (sel)
      sel.addEventListener('change', () => {
        target = sel.value;
        card.dataset.key = '';
        pass();
      });
    const rb = card.querySelector('.hp-wi-reset');
    if (rb)
      rb.addEventListener('click', () => {
        scen = {};
        pass();
      });
  }
  let target = null;
  function needLine(t, rows, gs, letter) {
    const letters = (Array.isArray(gs) && gs.length ? gs : [['A', 93], ['A-', 90], ['B+', 87], ['B', 83], ['B-', 80], ['C+', 77], ['C', 70], ['D', 60], ['F', 0]]).filter((e) => e[1] > 0).map((e) => e[0]);
    if (!target || !letters.includes(target)) target = letters[Math.max(0, letters.indexOf(letter) - 1)] || letters[0];
    const graded = Object.fromEntries(Object.entries(scen).filter(([id]) => rows.some((r) => r.id === id && r.published)));
    const n = L.wiNeed(t, rows, graded, target, gs);
    if (!n || n.state === 'nothing-left') return '';
    const pick = `<select aria-label="Letter to aim for">${letters.map((l) => `<option${l === target ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    if (n.state === 'needs') return `<div class="hp-wi-need">For ${an(target)} ${pick}, you need about <b>${n.avg}%</b> on what’s left.</div>`;
    if (n.state === 'locked') return `<div class="hp-wi-need">${pick} is locked in.</div>`;
    return `<div class="hp-wi-need">${pick} isn’t reachable with what’s left; best ${r1(n.best)}%.</div>`;
  }

  /** "On Exam 1 (tomorrow), you need 81% for an A, 61% for an A-, 41% for a B+." above the topics. */
  function nextLine(t, rows, gs) {
    const big = L.wiBig(rows, t, (r) => kindOf(r.id)).filter((r) => r.due && Date.parse(r.due) > Date.now() - 864e5).sort((a, b) => Date.parse(a.due) - Date.parse(b.due));
    const item = big[0];
    const host = document.querySelector('[class*="TopicGrouping_topics"]');
    let line = document.querySelector('[data-haloplus="wi-next"]');
    if (!item || !host) return line && line.remove();
    const rest = { ...scen };
    delete rest[item.id];
    const needs = L.wiLadder(t, rows, rest, item, gs).filter((x) => x.state === 'needs').slice(0, 3);
    const key = `${item.id}|${needs.map((x) => x.label + x.pct).join(',')}`;
    if (line && line.dataset.key === key && line.nextElementSibling === host) return;
    if (!line) {
      line = document.createElement('p');
      line.setAttribute('data-haloplus', 'wi-next');
    }
    line.dataset.key = key;
    line.innerHTML = needs.length
      ? `${O.mark()} On <b>${esc(item.title)}</b> (${esc(dayWord(item.due))}), you need ${needs.map((x) => `${x.pct}% for ${an(x.label)} <button type="button" data-pct="${x.pct}" title="Fill in ${x.pct}%">${esc(x.label)}</button>`).join(', ')}.`
      : `${O.mark()} <b>${esc(item.title)}</b> (${esc(dayWord(item.due))}) can’t change your letter much either way.`;
    line.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        scen[item.id] = (item.points * Number(b.dataset.pct)) / 100;
        O.count('whatif-next', false);
        pass();
      }),
    );
    host.insertAdjacentElement('beforebegin', line);
  }

  /** A small score box in every row (points, like Halo's own column). */
  function boxes(rows) {
    for (const r of rows) {
      let box = r.scoreCell.querySelector('[data-haloplus="wi-box"]');
      const v = scen[r.id];
      if (!box) {
        box = document.createElement('div');
        box.setAttribute('data-haloplus', 'wi-box');
        box.innerHTML = `<span class="hp-wi-tag">What-if</span><input type="number" inputmode="decimal" min="0" step="0.5" aria-label="What-if score for ${esc(r.title)}, points out of ${r.points}" placeholder="${r.published ? esc(String(r.score)) : '–'}"><span>/ ${r.points}</span>`;
        const input = box.querySelector('input');
        input.addEventListener('input', () => {
          const n = Number(input.value);
          if (input.value.trim() === '' || !Number.isFinite(n) || n < 0) delete scen[r.id];
          else scen[r.id] = n;
          pass();
        });
        r.scoreCell.appendChild(box);
      }
      const input = box.querySelector('input');
      const want = typeof v === 'number' ? String(Math.round(v * 100) / 100) : '';
      if (document.activeElement !== input && input.value !== want) input.value = want;
      if (typeof v === 'number') box.setAttribute('data-on', '');
      else box.removeAttribute('data-on');
    }
  }

  function pass() {
    const r = O.route();
    if (r.kind !== 'gradebook') return;
    if (slugFor !== r.slug) {
      slugFor = r.slug;
      scen = {};
    }
    const t = haloTotals();
    if (!t) return;
    style();
    toggle(t);
    if (!on) return clear0();
    const rows = haloRows();
    const k = classOf(r.slug);
    const gs = k && Array.isArray(k.gs) ? k.gs : null;
    // Exact only when Halo's rows add up to Halo's total and the scale gives Halo's own letter for Halo's percent.
    const exact = L.wiExact(t, rows) && (!t.letter || L.wiLetter(t.pct, gs) === t.letter.toUpperCase());
    boxes(rows);
    wiCard(t, rows, gs, exact);
    nextLine(t, rows, gs);
  }
  /** Off: only the toggle stays. */
  function clear0() {
    document.querySelectorAll('[data-haloplus^="wi-"]:not([data-haloplus="wi-toggle"]):not([data-haloplus="wi-style"])').forEach((n) => n.remove());
  }

  O.feature({
    id: 'whatif',
    routes: ['gradebook'],
    start() {
      if (loaded) return pass();
      chrome.storage.local
        .get('haloWiOn')
        .then((s) => {
          loaded = true;
          on = s.haloWiOn === true;
          pass();
        })
        .catch(() => {
          loaded = true;
          pass();
        });
    },
    update() {
      if (loaded) pass();
    },
    stop() {
      clear();
    },
  });
})();
