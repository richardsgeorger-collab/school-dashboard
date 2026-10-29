// Three designs for Halo's class cards on Student Home (George, 2026-10-28: "much more useful, but they must still clearly
// look like Halo's cards"). Prototypes only, NOT shipped: on Halo's Student Home stand-in with extension 0.12.4 and the
// demo student Maya Torres's six classes (made up), the cards are reworked in the page for a picture, in Halo's own card
// shape, stripe, colours (its variables, so Better Halo's themes recolour them) and fonts. Each option, plus Halo+ as it
// is now, at full width and 1024px, light and Better Halo dark, in docs/screens/cards-options/, and side by side.
//   [BH_DIR=<Better Halo unpacked>] node scripts/mock-cards-options.mjs
import { execFileSync } from 'node:child_process';
import { gradesGateway } from './lib/haloPages.mjs';
import { bhPath, openBench, out, sleep, until } from './lib/onHaloRun.mjs';

const OUT = out('docs/screens/cards-options');
const PHX = 'America/Phoenix';
const DONE = (a) => !!a.submittedAt || typeof a.score === 'number' || /^(SUBMITTED|LATE|PUBLISHED)$/.test(a.status || '');
const dayKey = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: PHX, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
function when(t) {
  const now = Date.now();
  const time = new Intl.DateTimeFormat('en-US', { timeZone: PHX, hour: 'numeric', minute: '2-digit' }).format(new Date(t)).replace(' ', ' ');
  if (dayKey(t) === dayKey(now)) return `today ${time}`;
  if (dayKey(t) === dayKey(now + 864e5)) return `tomorrow ${time}`;
  if (t - now < 6 * 864e5) return `${new Intl.DateTimeFormat('en-US', { timeZone: PHX, weekday: 'short' }).format(new Date(t))} ${time}`;
  return new Intl.DateTimeFormat('en-US', { timeZone: PHX, month: 'short', day: 'numeric' }).format(new Date(t));
}

/** What each card shows: the topic's progress (only if every item's state is known), the next item and when. */
function cardData(fx) {
  const now = Date.now();
  const out = {};
  for (const c of fx.payload.classes) {
    const d = new Date(now);
    const mon = now - ((d.getUTCDay() + 6) % 7) * 864e5;
    const graded = c.assessments.filter((a) => a.type !== 'PARTICIPATION');
    const week = graded.filter((a) => a.unitSequence != null && Date.parse(a.dueDate) >= mon - 864e5 && Date.parse(a.dueDate) < mon + 7 * 864e5);
    const next = graded.filter((a) => Date.parse(a.dueDate) >= now && !DONE(a) && (a.points || 0) > 0).sort((x, y) => Date.parse(x.dueDate) - Date.parse(y.dueDate));
    const unit = (week[0] || next[0] || {}).unitId;
    const items = graded.filter((a) => a.unitId === unit);
    const known = items.every((a) => a.status != null || a.submittedAt != null);
    out[c.slugId] = {
      topic: (week[0] || next[0] || {}).unitSequence ?? null,
      done: items.filter(DONE).length,
      total: items.length,
      known,
      next: next[0] ? { title: next[0].title, when: when(Date.parse(next[0].dueDate)), pts: next[0].points } : null,
      more: next.filter((a) => Date.parse(a.dueDate) < mon + 7 * 864e5).length - 1,
    };
  }
  return out;
}

/** Rework the cards in the page as `opt` ('A' | 'B' | 'C'). Runs in the page. */
function rework({ opt, data }) {
  const css = document.createElement('style');
  css.textContent = `
.hpm-meta{font-size:12.5px;line-height:1.5;color:var(--lms-gray61,#616161);margin:2px 0 10px}
.hpm-top{display:flex!important;align-items:baseline;justify-content:space-between;gap:10px;width:100%;flex-wrap:nowrap}
.hpm-top>:first-child{min-width:0;overflow:hidden}
.hpm-grade{flex:none}
.hpm-grade{font-weight:700;font-size:15px;color:var(--lms-textPrimaryColor,#212121);white-space:nowrap}
.hpm-grade span{font-weight:600;color:var(--lms-gray61,#616161);font-size:13px;margin-left:4px}
.hpm-next{margin:10px 0 4px;padding:9px 12px;border-radius:6px;font-size:14px;line-height:1.4;color:var(--lms-textPrimaryColor,#212121)}
.hpm-next small{display:block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--lms-gray61,#616161)}
.hpm-next a{color:var(--lms-hyperlinkColor,#1a65b0);font-weight:600;text-decoration:none}
.hpm-next .w{color:var(--lms-gray61,#616161);white-space:nowrap}
.hpm-line{font-size:14px;margin:8px 0 2px;color:var(--lms-textPrimaryColor,#212121)}
.hpm-line a{color:var(--lms-hyperlinkColor,#1a65b0);font-weight:600;text-decoration:none}
.hpm-mk{display:inline-flex;width:.9em;height:.9em;vertical-align:-.12em;margin-left:5px;opacity:.8}
.hpm-mk svg{width:100%;height:100%}
.hpm-bar{position:absolute;left:0;right:0;top:0;height:8px}
.hpm-cap{font-size:12px;color:var(--lms-gray61,#616161);white-space:nowrap}
.hpm-open{display:flex;justify-content:flex-end;font-size:13px;font-weight:600;color:var(--lms-hyperlinkColor,#1a65b0);margin-top:6px}
.hpm-hint{font-size:12px;color:var(--lms-gray61,#616161);margin-top:2px}
:root[data-better-halo-theme]:not([data-better-halo-theme='']) .hpm-meta,:root[data-better-halo-theme]:not([data-better-halo-theme='']) .hpm-cap,:root[data-better-halo-theme]:not([data-better-halo-theme='']) .hpm-hint,:root[data-better-halo-theme]:not([data-better-halo-theme='']) .hpm-next small,:root[data-better-halo-theme]:not([data-better-halo-theme='']) .hpm-next .w,:root[data-better-halo-theme]:not([data-better-halo-theme='']) .hpm-grade span{color:var(--better-halo-muted-foreground)!important}
:root[data-better-halo-theme]:not([data-better-halo-theme='']) .hpm-grade,:root[data-better-halo-theme]:not([data-better-halo-theme='']) .hpm-next,:root[data-better-halo-theme]:not([data-better-halo-theme='']) .hpm-line{color:var(--better-halo-foreground)!important}
:root[data-better-halo-theme]:not([data-better-halo-theme='']) .hpm-next a,:root[data-better-halo-theme]:not([data-better-halo-theme='']) .hpm-line a,:root[data-better-halo-theme]:not([data-better-halo-theme='']) .hpm-open{color:var(--better-halo-primary)!important}`;
  document.head.appendChild(css);
  const MARK = document.querySelector('.hp-mark') ? document.querySelector('.hp-mark').outerHTML.replace('hp-mark', 'hpm-mk') : '';
  for (const card of document.querySelectorAll('[class*="CourseCard_cardContainer"]')) {
    const a = card.querySelector('a[href^="/courses/"]');
    const slug = a && decodeURIComponent(/\/courses\/([^/?#]+)/.exec(a.getAttribute('href'))[1]);
    const d = data[slug];
    if (!d) continue;
    const body = card.firstElementChild;
    const head = body.firstElementChild;
    const title = body.querySelector('h4');
    const meta = [...body.querySelectorAll('[class*="CourseCard_metaContainer"], [class*="CourseCard_metaItem"], [class*="CourseCard_studentsList"]')];
    const metaText = meta.map((m) => m.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ');
    const line = card.querySelector('[data-haloplus="class"]');
    const lineText = line && line.shadowRoot ? line.shadowRoot.textContent.replace(/\s+/g, ' ') : '';
    const gm = /([A-F][+-]?)\s+([\d.]+%)/.exec(lineText);
    const grade = gm ? `${gm[1]}<span>${gm[2]}</span>` : '';
    const nextHref = line && line.shadowRoot && line.shadowRoot.querySelector('a[href]') ? line.shadowRoot.querySelector('a[href]').getAttribute('href') : '#';
    const color = getComputedStyle(card).borderTopColor !== 'rgba(0, 0, 0, 0)' && parseFloat(getComputedStyle(card).borderTopWidth) >= 2 ? getComputedStyle(card).borderTopColor : card.style.borderTopColor;
    const hr = body.querySelector(':scope > hr');
    const go = body.querySelector('[data-testid="go_to_class"]');
    const nextHtml = d.next ? `<a href="${nextHref}">${d.next.title}</a> <span class="w">· ${d.next.when}</span>` : '<span class="w">Nothing due ahead</span>';
    const progressOk = d.known && d.total > 0;
    const pct = progressOk ? Math.round((d.done / d.total) * 100) : 0;
    const bar = () => {
      if (!progressOk) return;
      card.style.position = 'relative';
      card.style.borderTopColor = 'transparent';
      const b = document.createElement('div');
      b.className = 'hpm-bar';
      b.title = `Topic ${d.topic}: ${d.done} of ${d.total} done (Added by Halo+)`;
      b.style.background = `linear-gradient(to right, ${color} 0 ${pct}%, color-mix(in srgb, ${color} 32%, var(--hp-surface, #fff)) ${pct}% 100%)`;
      card.prepend(b);
    };
    meta.forEach((m) => (m.style.display = 'none'));
    if (line) line.style.display = 'none';
    const metaEl = document.createElement('div');
    metaEl.className = 'hpm-meta';
    metaEl.textContent = metaText;
    if (opt === 'A') {
      title.after(metaEl);
      const row = document.createElement('div');
      row.className = 'hpm-line';
      row.innerHTML = `<span class="hpm-grade">${grade}</span>${MARK}<div style="margin-top:4px">Next: ${nextHtml}</div>`;
      metaEl.after(row);
    }
    if (opt === 'B' || opt === 'C') {
      bar();
      head.classList.add('hpm-top');
      const g = document.createElement('div');
      g.className = 'hpm-grade';
      g.innerHTML = grade;
      head.appendChild(g);
      const n = document.createElement('div');
      n.className = 'hpm-next';
      n.style.background = `color-mix(in srgb, ${color} 12%, var(--hp-surface, #fff))`;
      n.innerHTML = `<small>Next${MARK}</small>${nextHtml}${d.more > 0 && opt === 'C' ? `<div class="hpm-hint">+${d.more} more this week</div>` : ''}`;
      if (opt === 'B') {
        title.after(metaEl);
        metaEl.after(n);
        if (progressOk) {
          const cap = document.createElement('div');
          cap.className = 'hpm-cap';
          cap.textContent = `Topic ${d.topic} · ${d.done} of ${d.total} done`;
          n.after(cap);
        }
      } else {
        title.after(n);
        const hint = document.createElement('div');
        hint.className = 'hpm-hint';
        hint.textContent = `${progressOk ? `Topic ${d.topic} · ${d.done} of ${d.total} done · ` : ''}Details on hover`;
        hint.title = metaText;
        n.after(hint);
        if (hr) hr.style.display = 'none';
        if (go) {
          go.parentElement.style.display = 'none';
          const o = document.createElement('div');
          o.className = 'hpm-open';
          o.textContent = 'Open class ›';
          go.parentElement.after(o);
        }
        card.style.cursor = 'pointer';
      }
      if (opt === 'B') card.style.cursor = 'pointer';
    }
  }
}

const views = [['light', false], ...(bhPath ? [['bh-dark', true]] : [])];
for (const [look, bh] of views) {
  const b = await openBench({ label: `cards-${look}`, bh, bhDark: bh });
  Object.assign(b.bench.state.gateway, gradesGateway(b.fx));
  try {
    await b.seed({ lastAttemptAt: new Date().toISOString() });
    const data = cardData(b.fx);
    for (const width of [1366, 1024]) {
      for (const opt of ['now', 'A', 'B', 'C']) {
        const p = await b.page('https://halo.gcu.edu/', { width, height: width === 1366 ? 1180 : 1500 });
        await until(async () => (await p.locator('[data-haloplus="class"]').count()) >= 6, 15000, 200);
        await until(async () => (await p.locator('[data-haloplus="week-strip"] .hp-sd').count()) === 7, 15000, 200);
        await sleep(2500);
        if (opt !== 'now') await p.evaluate(rework, { opt, data });
        await p.mouse.move(3, 3);
        await sleep(500);
        await p.screenshot({ path: `${OUT}/${opt}-${look}-${width}.png` });
        await p.close();
      }
      // Side by side: now, A, B, C.
      const files = ['now', 'A', 'B', 'C'].map((o) => `${OUT}/${o}-${look}-${width}.png`);
      execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageDraw, ImageFont
fs = sys.argv[2:6]
ims = [Image.open(f) for f in fs]
w = 900 if ims[0].width > 1100 else 760
ims = [i.resize((w, int(i.height * w / i.width))) for i in ims]
h = max(i.height for i in ims) + 44
out = Image.new('RGB', (w * 4 + 60, h), 'white')
d = ImageDraw.Draw(out)
try:
    f = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 26)
except Exception:
    f = None
for k, (im, name) in enumerate(zip(ims, ['Now (0.12.4)', 'A · Tidy', 'B · Focus', 'C · At a glance'])):
    x = k * (w + 20)
    d.text((x + 8, 8), name, fill='black', font=f)
    out.paste(im, (x, 44))
out.save(sys.argv[1])
`, `${OUT}/side-by-side-${look}-${width}.png`, ...files]);
    }
    console.log(`${look}: done`);
  } catch (e) {
    console.log(`${look}: ${e.stack || e.message}`);
  } finally {
    await b.close();
  }
}
