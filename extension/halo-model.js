// Halo+ on Halo: what the peek, the pill, the hover list, the class lines, the assignment box, the popup's "Next up"
// and the toolbar badge say, from the student's own Halo+ data. Pure: no DOM, no chrome.*. Loaded as a plain script on
// Halo pages (before halo-ui.js), imported by the worker and the popup, and run by the app's tests
// (src/halo/haloModel.test.ts).
//
// 0.9.0 (George, 2026-10-23, after using 0.8.0 on real Halo): calm, not an ad.
// - Only graded work drives urgency. Participation (a day's post, a weekly check-in) never makes anything red or gold,
//   never counts, never leads; it gets one quiet line in the hover list.
// - No counts of "new" anything. A re-peek is for one thing that matters since the student last looked: a graded item's
//   due date moved, a new requirement on a 20+ point item, a graded item now due within 3 hours.
// 0.9.1 (2026-10-24): done in Halo+ is done here (the snapshot keeps done work, and the account's own list of what is
//   done arrives from the server, so a check-off on the phone counts on this computer too). Work with no submission in
//   Halo (an outside tool's set, in-person work) goes quiet once its date passes: never overdue, never counted.
// - The baseline is one shape (instants rounded to the minute) whatever the source, and on first run it is only
//   recorded: with nothing to compare against, nothing is "new". (0.8.0 compared date strings from two sources,
//   "…06:59:59Z" from Halo and "…06:59:00.000Z" from Halo+, so every item looked moved.)
//
// Two sources, both already on this computer:
// - haloSnap: written by Halo+ itself (labels, done states, requirements found in announcements, dates an announcement
//   moved, Halo+'s do-now pick, class grades, participation left this week, the "Show Halo+ on Halo pages" switch).
// - haloLive: what the extension's own sync last read from Halo, so the picture stays current between visits.
(function (root) {
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;
  const SOON_MS = 3 * HOUR;
  /** Overdue counts for two days: older work the student let go should not keep everything red for weeks. */
  const OVERDUE_MS = 2 * DAY;
  /** A move smaller than this is two sources rounding the same deadline differently, not a move. */
  const MOVE_MS = 60 * MIN;
  /** A new requirement re-peeks only on work worth this much. */
  const BIG_PTS = 20;
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const zone = (tz) => {
    try {
      return Intl.DateTimeFormat(undefined, { timeZone: tz || undefined }).resolvedOptions().timeZone;
    } catch {
      return undefined;
    }
  };
  /** "2026-10-22" for an instant, in the student's time zone. */
  function dayOf(at, tz) {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return '';
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: zone(tz), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const g = (t) => (p.find((x) => x.type === t) || {}).value;
    return `${g('year')}-${g('month')}-${g('day')}`;
  }
  const dayDiff = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY);
  const weekday = (day) => WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];
  const monthDay = (day) => `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`;
  function clock(at, tz) {
    try {
      return new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone(tz) }).replace(':00 ', ' ');
    } catch {
      return '';
    }
  }
  const nowMs = (now) => (typeof now === 'number' ? now : Date.parse(now));
  const ms = (iso) => Date.parse(iso);
  /** "today 9:12 AM", "yesterday 9 AM", "Oct 20, 9:12 AM". */
  function whenAt(at, now, tz) {
    const k = dayDiff(dayOf(at, tz), dayOf(now, tz));
    if (k === 0) return `today ${clock(at, tz)}`;
    if (k === 1) return `yesterday ${clock(at, tz)}`;
    return `${monthDay(dayOf(at, tz))}, ${clock(at, tz)}`;
  }
  /** "Due in 45m", "Due in 2h". */
  function dueIn(t) {
    if (t < HOUR) return `Due in ${Math.max(1, Math.round(t / MIN))}m`;
    return `Due in ${Math.round(t / HOUR)}h`;
  }
  /** When something is due, short: "overdue", "in 2h", "tonight", "today 3 PM", "tomorrow", "Thu", "Oct 30". */
  function when(at, now, tz) {
    const t = nowMs(now);
    const d = ms(at) - t;
    if (d < 0) return 'overdue';
    if (d <= SOON_MS) return dueIn(d).replace('Due in', 'in');
    const k = dayDiff(dayOf(t, tz), dayOf(at, tz));
    const c = clock(at, tz);
    if (k === 0) return c === '11:59 PM' ? 'tonight' : `today ${c}`;
    if (k === 1) return 'tomorrow';
    if (k > 1 && k < 7) return weekday(dayOf(at, tz));
    return monthDay(dayOf(at, tz));
  }
  /** "today 3 PM", "tomorrow", "on Thu", "Oct 30": inside a sentence. */
  function dueWord(at, now, tz) {
    const w = when(at, now, tz);
    return /^[A-Z][a-z]{2}$/.test(w) ? `on ${w}` : w;
  }
  /** "Thu, Oct 23". */
  function shortDate(at, tz) {
    const d = dayOf(at, tz);
    return `${weekday(d)}, ${monthDay(d)}`;
  }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;
  const clip = (s, n) => {
    const t = String(s || '').trim();
    return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
  };

  /** What the sync read, small: per class, its code, slug, grade, and each assignment's id, title, due date, points, type, handed in, unit. */
  function compactLive(payload) {
    const done = (a) => !!a.submittedAt || typeof a.score === 'number' || /GRADED|SUBMITTED|COMPLETED|PUBLISHED/i.test(a.status || '');
    return {
      v: 1,
      at: payload.exportedAt || new Date().toISOString(),
      classes: (payload.classes || []).map((c) => ({
        slug: c.slugId || '',
        cc: c.classCode || '',
        code: c.courseCode || '',
        name: c.name || '',
        g: c.finalGrade && typeof c.finalGrade.finalPoints === 'number' && c.finalGrade.maxPoints ? Math.round((c.finalGrade.finalPoints / c.finalGrade.maxPoints) * 1000) / 10 : null,
        // The eighth field: no submission in Halo (an outside tool, or in person), as Halo+ reads it (normalize.ts).
        a: (c.assessments || []).filter((a) => a && a.id && a.type !== 'PARTICIPATION').map((a) => [a.id, String(a.title || '').slice(0, 120), a.dueDate || null, a.points || 0, a.type || '', done(a) ? 1 : 0, a.unitId || null, a.type === 'LTI' || a.inPerson || (a.tags || []).includes('IN_PERSON') ? 1 : 0]),
      })),
    };
  }

  /** Participation: Halo's own type, Halo+'s flag, or "participation" in either title. Never urgent. */
  const isPart = (i) => i.pa === 1 || /^participation$/i.test(i.ty || '') || /particip/i.test(`${i.t || ''} ${i.ht || ''}`);
  /** Graded work: anything with points that is not participation. */
  const graded = (i) => !isPart(i) && (i.pts || 0) > 0;
  /** No submission in Halo and its date has passed: quiet, neither overdue nor done (a grade later marks it done). */
  const quietPast = (i, t) => i.ns === 1 && !i.done && ms(i.due) < t;
  /** Halo's own title when known (what the student sees on the page), else Halo+'s label. */
  const title = (i) => i.ht || i.t || '';

  /**
   * One view of the student's work from Halo+'s snapshot and the extension's latest reading of Halo. Halo is the truth
   * for what exists, its due date and whether it is handed in; Halo+ adds labels, what announcements asked for, and a
   * date an announcement moved (kept unless Halo itself moved the date since: compared as instants, a minute apart).
   */
  function merge(snap, live, server) {
    const s = snap && snap.v === 1 ? snap : null;
    const l = live && live.v === 1 ? live : null;
    if (!s && !l) return null;
    const tz = (s && s.tz) || undefined;
    const classes = [];
    const bySlug = new Map();
    for (const c of (s && s.classes) || []) {
      const k = { key: c.id, code: c.code, cc: c.cc || '', slug: c.slug || '', name: c.name || '', g: typeof c.g === 'number' ? c.g : null };
      classes.push(k);
      if (k.slug) bySlug.set(k.slug, k);
    }
    const items = ((s && s.items) || []).map((i) => ({ ...i }));
    const byHalo = new Map(items.filter((i) => i.h).map((i) => [i.h, i]));
    const snapSynced = (s && s.syncedAt) || '';
    for (const lc of (l && l.classes) || []) {
      let k = bySlug.get(lc.slug);
      if (!k) {
        k = { key: `live:${lc.slug}`, code: lc.code, cc: lc.cc, slug: lc.slug, name: lc.name, g: null };
        classes.push(k);
        bySlug.set(lc.slug, k);
      }
      if (!k.cc) k.cc = lc.cc;
      if (typeof lc.g === 'number' && (!snapSynced || l.at >= snapSynced)) k.g = lc.g;
      for (const [id, t, due, pts, type, done, unit, ns] of lc.a) {
        const it = byHalo.get(id);
        if (it) {
          if (!it.ht) it.ht = t;
          if (ns) it.ns = 1;
          if (!it.u && unit) it.u = unit;
          if (due && l.at >= snapSynced && (!it.hd || Math.abs(ms(due) - ms(it.hd)) >= MIN)) {
            it.due = due;
            it.hd = due;
          }
          if (done) it.done = 1;
          continue;
        }
        if (!due) continue;
        const add = { id: null, h: id, c: k.key, t, ht: t, due, hd: due, pts, ty: type, done, x: 0, u: unit, ...(ns ? { ns: 1 } : {}) };
        items.push(add);
        byHalo.set(id, add);
      }
    }
    // What the account says is done (Halo+ on any device), over everything else.
    const doneIds = server && Array.isArray(server.done) ? new Set(server.done) : null;
    if (doneIds) for (const i of items) if (!i.done && ((i.h && doneIds.has(i.h)) || (i.id && doneIds.has(i.id)))) i.done = 1;
    const syncedAt = [snapSynced, (l && l.at) || ''].sort().pop() || null;
    return {
      tz,
      plan: s ? s.plan : 'sync',
      show: s ? s.show !== false : true,
      showAt: (s && s.showAt) || null,
      syncedAt,
      top: (s && s.top) || null,
      pw: s && typeof s.pw === 'number' ? s.pw : null,
      classes,
      items: items.filter((i) => i.due && !Number.isNaN(ms(i.due)) && !/^participation$/i.test(i.ty || '')),
    };
  }

  const klass = (view, key) => view.classes.find((c) => c.key === key) || null;
  const itemKey = (i) => i.h || i.id;

  /** Open graded work, sorted into where it stands right now. */
  function standing(view, now) {
    const t = nowMs(now);
    const d = dayOf(t, view.tz);
    const open = view.items.filter((i) => !i.done && graded(i) && !quietPast(i, t) && ms(i.due) >= t - OVERDUE_MS).sort((a, b) => ms(a.due) - ms(b.due) || (b.pts || 0) - (a.pts || 0));
    const overdue = open.filter((i) => ms(i.due) < t);
    const later = open.filter((i) => ms(i.due) >= t);
    const soon = later.filter((i) => ms(i.due) - t <= SOON_MS);
    const dueToday = later.filter((i) => dayOf(i.due, view.tz) === d);
    const tomorrow = later.filter((i) => dayDiff(d, dayOf(i.due, view.tz)) === 1);
    const upcoming = later.filter((i) => dayDiff(d, dayOf(i.due, view.tz)) > 1);
    return { overdue, soon, dueToday, tomorrow, upcoming, later };
  }

  /** The most important real graded item: overdue first, then due within 3 hours, then Halo+'s own pick, then the soonest. */
  function nextUp(view, now) {
    if (!view) return null;
    const s = standing(view, now);
    if (s.overdue.length) return s.overdue[0];
    if (s.soon.length) return s.soon[0];
    const picked = view.top ? s.later.find((i) => i.id === view.top || i.h === view.top) : null;
    return picked || s.later[0] || null;
  }

  /** A row for the peek, the hover list and the popup: Halo's title, class code, when, points, and where it opens. */
  function row(view, i, now) {
    const c = klass(view, i.c);
    return { key: itemKey(i), id: i.id, h: i.h, title: clip(title(i), 48), code: c ? c.code : '', when: when(i.due, now, view.tz), pts: i.pts || 0, late: ms(i.due) < nowMs(now), courseId: c && !String(c.key).startsWith('live:') ? c.key : null };
  }
  /** "Quiz #2 · tomorrow · 50 pts". */
  const rowLine = (r) => [r.title, r.when, r.pts ? `${r.pts} pts` : ''].filter(Boolean).join(' · ');

  /** The daily peek: "Next up: Quiz #2 · tomorrow · 50 pts", or null when nothing graded is coming. */
  function peek(view, now) {
    const i = nextUp(view, now);
    if (!i) return null;
    const r = row(view, i, now);
    return { ...r, text: `Next up: ${rowLine(r)}`, tone: r.late || ms(i.due) - nowMs(now) <= SOON_MS ? 'red' : 'calm' };
  }

  /**
   * The pill: calm (dark, gold text "Next: Quiz #2 tomorrow"); gold "N due today"; red only for graded work overdue or
   * due within 3 hours; green "✓ All caught up" when nothing graded is due today or tomorrow.
   */
  function pill(view, now) {
    const s = standing(view, now);
    if (s.overdue.length) return { tone: 'red', text: `${s.overdue.length} overdue` };
    if (s.soon.length) return { tone: 'red', text: `${dueIn(ms(s.soon[0].due) - nowMs(now))}: ${clip(title(s.soon[0]), 22)}` };
    if (s.dueToday.length) return { tone: 'gold', text: `${s.dueToday.length} due today` };
    if (s.tomorrow.length) return { tone: 'calm', text: `Next: ${clip(title(s.tomorrow[0]), 24)} tomorrow` };
    return { tone: 'green', text: '✓ All caught up' };
  }

  /** "Participation: 3 posts left this week", from Halo+ (as Now says it), else what is open this week here. */
  function partLine(view, now) {
    let n = view.pw;
    if (typeof n !== 'number') {
      const d = dayOf(nowMs(now), view.tz);
      n = view.items.filter((i) => isPart(i) && !i.done && dayDiff(d, dayOf(i.due, view.tz)) >= 0 && dayDiff(d, dayOf(i.due, view.tz)) <= 6).length;
    }
    if (!n) return null;
    return `Participation: ${plural(n, 'post')} left this week`;
  }

  /** The hover list: at most 3 graded rows under small headers (Overdue, Today, Tomorrow, Next), then participation. */
  function hoverList(view, now) {
    const s = standing(view, now);
    const groups = [];
    let room = 3;
    for (const [head, list] of [['Overdue', s.overdue], ['Today', s.dueToday], ['Tomorrow', s.tomorrow], ['Next', s.upcoming]]) {
      if (!room || !list.length) continue;
      const rows = list.slice(0, room).map((i) => row(view, i, now));
      room -= rows.length;
      groups.push({ head, rows });
    }
    return { groups, part: partLine(view, now) };
  }

  /** The line under a class card: gray by default, gold for a real extra requirement, red for graded work overdue. */
  function classLine(view, cls, now) {
    const t = nowMs(now);
    const mine = view.items.filter((i) => i.c === cls.key && !i.done && !isPart(i) && !quietPast(i, t));
    const overdue = mine.filter((i) => graded(i) && ms(i.due) < t && t - ms(i.due) <= OVERDUE_MS).length;
    const week = mine.filter((i) => ms(i.due) >= t && ms(i.due) - t <= 7 * DAY).length;
    // Assignments (due in the next two weeks) with something an announcement added: one per assignment, not per line.
    const extra = mine.filter((i) => boxLines(i).length > 0 && ms(i.due) >= t && ms(i.due) - t <= 14 * DAY);
    const parts = [];
    if (overdue) parts.push({ tone: 'red', text: `${overdue} overdue` });
    parts.push({ tone: 'plain', text: week ? `${week} due this week` : 'Nothing due this week' });
    if (extra.length) parts.push({ tone: 'gold', text: `${extra.length} with extra requirements` });
    return parts;
  }

  /** Halo's class code for a class ("CHM-113-WF700A"). */
  const codeOfClass = (c) => (c.cc || (c.slug || '').replace(/-\d{8}$/, '')).toUpperCase();
  /**
   * Which class a piece of Halo's text belongs to: the code on its own, or at the end of Halo's card heading, where a
   * stage badge comes first ("Topic 7CHM-113-WF700A": that is what real Halo renders, 2026-10-23).
   */
  function classByCode(view, text) {
    const s = String(text || '').trim().toUpperCase();
    if (!s) return null;
    const exact = view.classes.find((c) => codeOfClass(c) && codeOfClass(c) === s);
    if (exact) return exact;
    // The badge runs straight into the code ("Topic 7" + "CHM-113-WF700A"), so only the end is checked; the longest
    // code that ends the text wins.
    const ends = view.classes.filter((c) => codeOfClass(c).length >= 6 && s.endsWith(codeOfClass(c))).sort((a, b) => codeOfClass(b).length - codeOfClass(a).length);
    return ends[0] || null;
  }

  /** What the assignment-page line may say: things to bring or have, a new deliverable (Halo+ picks them, haloSnap.ts). */
  const boxLines = (i) => (Array.isArray(i.xb) ? i.xb : []);

  /**
   * The line on an assignment's own Halo page (0.9.1, George 2026-10-24): only when something truly matters here, a
   * date an announcement moved, something to bring or have, a new deliverable; never a reading reminder. The first
   * parts fit one line ("Bring lab coat, goggles, closed-toe shoes · +2 more"); the rest open inline. Null otherwise.
   */
  function caught(view, item, now) {
    if (!item || item.done) return null;
    const parts = [];
    if (item.m) parts.push(`Due date moved to ${shortDate(item.due, view.tz)} (was ${shortDate(item.m, view.tz)})`);
    for (const l of boxLines(item)) parts.push(l.replace(/[.!]$/, ''));
    if (!parts.length) return null;
    const first = [];
    let len = 0;
    for (const p of parts) {
      if (first.length && len + p.length > 70) break;
      first.push(p);
      len += p.length + 3;
    }
    return { line: first.join(' · '), more: parts.slice(first.length), key: itemKey(item), id: item.id, courseId: item.c && !String(item.c).startsWith('live:') ? item.c : null };
  }

  /** The toolbar badge: graded work due today (and overdue), red when overdue or due within 3 hours. */
  function badge(view, now) {
    if (!view) return null;
    const s = standing(view, now);
    const n = s.overdue.length + s.dueToday.length;
    if (!n) return null;
    return { text: String(n), red: s.overdue.length > 0 || s.soon.length > 0 };
  }

  /** What the student has seen: each open item's due instant (in minutes), requirements and points. */
  function baseline(view) {
    const items = {};
    for (const i of view.items) if (!i.done && !isPart(i)) items[itemKey(i)] = [Math.round(ms(i.due) / MIN), boxLines(i).length, i.pts || 0];
    return { v: 2, items };
  }

  /**
   * The one thing worth a re-peek since the baseline, or null: a graded item now due within 3 hours (not flagged yet),
   * a graded item whose due date moved, a new requirement on a 20+ point item. Nothing on first run (no baseline).
   */
  function notable(view, base, now, flagged) {
    if (!view || !base || base.v !== 2 || !base.items) return null;
    const t = nowMs(now);
    const out = [];
    for (const i of view.items) {
      if (i.done || isPart(i)) continue;
      const k = itemKey(i);
      const due = ms(i.due);
      if (due < t) continue;
      if (graded(i) && due - t <= SOON_MS && !(flagged || []).includes(k)) out.push({ rank: 0, kind: 'soon', i, text: `${dueIn(due - t)}: ${clip(title(i), 40)}${i.pts ? ` · ${i.pts} pts` : ''}` });
      const was = base.items[k];
      if (!was) continue;
      if (graded(i) && Math.abs(Math.round(due / MIN) - was[0]) * MIN >= MOVE_MS) out.push({ rank: 1, kind: 'moved', i, text: `Moved: ${clip(title(i), 36)} is now due ${dueWord(i.due, now, view.tz)}` });
      if ((i.pts || 0) >= BIG_PTS && boxLines(i).length > was[1]) {
        const what = boxLines(i)[was[1]] || boxLines(i)[0];
        out.push({ rank: 2, kind: 'req', i, text: what ? `New for ${clip(title(i), 28)}: ${clip(what, 44)}` : `New requirement on ${clip(title(i), 40)}` });
      }
    }
    out.sort((a, b) => a.rank - b.rank || ms(a.i.due) - ms(b.i.due));
    const n = out[0];
    if (!n) return null;
    return { ...row(view, n.i, now), kind: n.kind, text: n.text, tone: n.kind === 'soon' ? 'red' : 'calm' };
  }

  /** "Nice. Next up: …": after a submission, the next graded thing, leaving out what was just handed in. */
  function nextAfter(view, now, haloId) {
    const v = { ...view, items: view.items.map((i) => (haloId && i.h === haloId ? { ...i, done: 1 } : i)), top: null };
    const p = peek(v, now);
    return p ? { ...p, text: `Nice. ${p.text}`, tone: 'green' } : { key: null, text: 'Nice. Nothing graded is due this week.', tone: 'green', courseId: null, id: null };
  }

  /** "as of Oct 20, 9:12 AM" when the data is more than a day old, else null. */
  function stale(view, now) {
    if (!view.syncedAt) return null;
    if (nowMs(now) - ms(view.syncedAt) <= DAY) return null;
    return `as of ${whenAt(view.syncedAt, nowMs(now), view.tz)}`;
  }
  /** "Oct 12": for the Free pill. */
  function syncedDay(view) {
    if (!view.syncedAt) return 'a while ago';
    return monthDay(dayOf(view.syncedAt, view.tz));
  }

  /** Halo+'s address for an item or a class, marked as opened from Halo (counted in Admin). */
  function link(origin, target, via) {
    const q = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    if (target && target.courseId && target.id) return `${origin}/#/class?${q({ c: target.courseId, i: target.id, from: 'halo', via })}`;
    if (target && target.courseId) return `${origin}/#/class?${q({ c: target.courseId, from: 'halo', via })}`;
    return `${origin}/#/now?${q({ from: 'halo', via })}`;
  }

  const api = { quietPast, boxLines, dayOf, whenAt, when, dueWord, dueIn, compactLive, merge, isPart, graded, standing, nextUp, row, rowLine, peek, pill, hoverList, partLine, classLine, classByCode, caught, badge, baseline, notable, nextAfter, stale, syncedDay, link, itemKey, SOON_MS, OVERDUE_MS };
  root.HaloPlusModel = api;
})(globalThis);
