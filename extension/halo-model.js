// Halo+ on Halo (George, 2026-10-22): what the card, the pill, the class lines, the assignment box and the toolbar badge
// say, from the student's own Halo+ data. Pure: no DOM, no chrome.*. Loaded as a plain script on Halo pages (before
// halo-ui.js), imported by the worker for the toolbar badge, and run by the app's tests (src/halo/haloModel.test.ts).
//
// Two sources, both already on this computer:
// - haloSnap: written by Halo+ itself whenever it is open (labels, done states, requirements found in announcements,
//   due dates an announcement moved, the do-now item, class grades, the "Show Halo+ on Halo pages" switch).
// - haloLive: what the extension's own sync last read from Halo (titles, due dates, handed in, class grades). It keeps
//   the picture current between visits to Halo+: a new assignment or a date Halo moved shows here the same day.
(function (root) {
  const HOUR = 3_600_000;
  const DAY = 24 * HOUR;
  const SOON_MS = 3 * HOUR;
  /** Overdue counts for two days: older work the student let go should not keep everything red for weeks. */
  const OVERDUE_MS = 2 * DAY;
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
  function clock(at, tz) {
    try {
      return new Date(at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: zone(tz) });
    } catch {
      return '';
    }
  }
  /** "today 9:12 AM", "yesterday 9:12 AM", "Oct 20, 9:12 AM". */
  function whenAt(at, now, tz) {
    const k = dayDiff(dayOf(at, tz), dayOf(now, tz));
    if (k === 0) return `today ${clock(at, tz)}`;
    if (k === 1) return `yesterday ${clock(at, tz)}`;
    const d = dayOf(at, tz);
    return `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}, ${clock(at, tz)}`;
  }
  /** "today", "tomorrow", "on Thu", "Oct 30": for a due date. */
  function dueWord(at, now, tz) {
    const k = dayDiff(dayOf(now, tz), dayOf(at, tz));
    if (k === 0) return `today ${clock(at, tz)}`;
    if (k === 1) return 'tomorrow';
    if (k > 1 && k < 7) return `on ${weekday(dayOf(at, tz))}`;
    const d = dayOf(at, tz);
    return `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
  }
  /** "Thu, Oct 23": a day on its own. */
  function shortDate(at, tz) {
    const d = dayOf(at, tz);
    return `${weekday(d)}, ${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
  }
  /** "Due in 45m", "Due in 2h". */
  function dueIn(ms) {
    if (ms < HOUR) return `Due in ${Math.max(1, Math.round(ms / 60_000))}m`;
    return `Due in ${Math.round(ms / HOUR)}h`;
  }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || `${one}s`}`;

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
        a: (c.assessments || []).filter((a) => a && a.id && a.type !== 'PARTICIPATION').map((a) => [a.id, String(a.title || '').slice(0, 120), a.dueDate || null, a.points || 0, a.type || '', done(a) ? 1 : 0, a.unitId || null]),
      })),
    };
  }

  /**
   * One view of the student's work from Halo+'s snapshot and the extension's latest reading of Halo. Halo is the truth
   * for what exists, its due date and whether it is handed in; Halo+ adds labels, what announcements asked for, and a
   * date an announcement moved (kept unless Halo itself changed the date since).
   */
  function merge(snap, live) {
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
      for (const [id, title, due, pts, type, done, unit] of lc.a) {
        const it = byHalo.get(id);
        if (it) {
          if (!it.ht) it.ht = title;
          if (!it.u && unit) it.u = unit;
          // Halo changed the date since Halo+ last saw it: Halo wins. Otherwise Halo+'s date (an announcement may have moved it).
          if (due && l.at >= snapSynced && due !== it.hd) {
            it.due = due;
            it.hd = due;
          }
          if (done) it.done = 1;
          continue;
        }
        if (!due) continue;
        const add = { id: null, h: id, c: k.key, t: title, ht: title, due, hd: due, pts, ty: type, done, x: 0, u: unit };
        items.push(add);
        byHalo.set(id, add);
      }
    }
    const syncedAt = [snapSynced, (l && l.at) || ''].sort().pop() || null;
    return {
      tz,
      plan: s ? s.plan : 'sync',
      show: s ? s.show !== false : true,
      showAt: (s && s.showAt) || null,
      syncedAt,
      top: (s && s.top) || null,
      hidden: (s && s.hidden) || 0,
      classes,
      items: items.filter((i) => i.due && i.ty !== 'participation' && i.ty !== 'PARTICIPATION'),
    };
  }

  const klass = (view, key) => view.classes.find((c) => c.key === key) || null;
  const itemKey = (i) => i.h || i.id;
  const nowMs = (now) => (typeof now === 'number' ? now : Date.parse(now));

  function today(view, now) {
    const t = nowMs(now);
    const d = dayOf(t, view.tz);
    const open = view.items.filter((i) => !i.done);
    const overdue = open.filter((i) => Date.parse(i.due) < t && t - Date.parse(i.due) <= OVERDUE_MS);
    const soon = open.filter((i) => Date.parse(i.due) >= t && Date.parse(i.due) - t <= SOON_MS).sort((a, b) => a.due.localeCompare(b.due));
    const dueToday = open.filter((i) => dayOf(i.due, view.tz) === d && Date.parse(i.due) >= t).sort((a, b) => a.due.localeCompare(b.due));
    const doneToday = view.items.filter((i) => i.done && dayOf(i.due, view.tz) === d);
    const next = open.filter((i) => Date.parse(i.due) >= t && dayOf(i.due, view.tz) > d).sort((a, b) => a.due.localeCompare(b.due))[0] || null;
    return { overdue, soon, dueToday, doneToday, next, day: d };
  }

  /** The pill: red (overdue, or due within 3 hours), gold (due today), green (nothing left today). */
  function pill(view, now) {
    const t = today(view, now);
    if (t.overdue.length) return { tone: 'red', text: `${t.overdue.length} overdue`, pulse: true };
    if (t.soon.length) return { tone: 'red', text: dueIn(Date.parse(t.soon[0].due) - nowMs(now)), pulse: true };
    if (t.dueToday.length) return { tone: 'gold', text: `${t.dueToday.length} due today`, pulse: false };
    return { tone: 'green', text: '✓ All done today', pulse: false };
  }

  /** The hover list: today's items, unfinished first, then done (struck through), at most 6. */
  function preview(view, now) {
    const t = today(view, now);
    const row = (i, done) => ({ label: i.t, code: (klass(view, i.c) || {}).code || '', when: clock(i.due, view.tz), done, late: !done && Date.parse(i.due) < nowMs(now) });
    return [...t.overdue.map((i) => row(i, false)), ...t.dueToday.map((i) => row(i, false)), ...t.doneToday.map((i) => row(i, true))].slice(0, 6);
  }

  /** The do-now item: Halo+'s own pick while it is still open, else the soonest thing not done. */
  function topItem(view, now) {
    const t = nowMs(now);
    const picked = view.top ? view.items.find((i) => (i.id || i.h) === view.top || i.id === view.top) : null;
    if (picked && !picked.done) return picked;
    const open = view.items.filter((i) => !i.done && Date.parse(i.due) >= t - OVERDUE_MS).sort((a, b) => a.due.localeCompare(b.due));
    return open[0] || null;
  }

  /** The daily card. */
  function card(view, now) {
    const t = today(view, now);
    const n = t.dueToday.length + t.overdue.length;
    const title = n ? `${n} due today` : t.next ? `Nothing due today. Next: ${t.next.t} ${dueWord(t.next.due, now, view.tz)}` : 'Nothing due today.';
    const top = topItem(view, now);
    const c = top ? klass(view, top.c) : null;
    return {
      title,
      tone: t.overdue.length || t.soon.length ? 'red' : n ? 'gold' : 'green',
      top: top ? { key: itemKey(top), id: top.id, h: top.h, label: top.t, code: c ? c.code : '', courseId: c && !String(c.key).startsWith('live:') ? c.key : null, when: Date.parse(top.due) < nowMs(now) ? 'overdue' : `due ${dueWord(top.due, now, view.tz)}`, pts: top.pts || 0 } : null,
      hidden: view.hidden || 0,
    };
  }

  /** "Nice. Next: X": after a submission, the next thing, leaving out what was just handed in. */
  function nextAfter(view, now, haloId) {
    const v = { ...view, items: view.items.map((i) => (haloId && i.h === haloId ? { ...i, done: 1 } : i)) };
    const top = topItem(v, now);
    if (!top) return null;
    const c = klass(v, top.c);
    return { key: itemKey(top), id: top.id, h: top.h, label: top.t, code: c ? c.code : '', courseId: c && !String(c.key).startsWith('live:') ? c.key : null, when: `due ${dueWord(top.due, now, v.tz)}` };
  }

  /** The line under a class card on Halo's home page. */
  function classLine(view, cls, now) {
    const t = nowMs(now);
    const mine = view.items.filter((i) => i.c === cls.key && !i.done);
    const overdue = mine.filter((i) => Date.parse(i.due) < t && t - Date.parse(i.due) <= OVERDUE_MS).length;
    const week = mine.filter((i) => Date.parse(i.due) >= t && Date.parse(i.due) - t <= 7 * DAY).length;
    const extra = mine.reduce((n, i) => n + (i.x || 0), 0);
    const parts = [];
    if (overdue) parts.push({ tone: 'red', text: `${overdue} overdue` });
    parts.push({ tone: 'plain', text: week ? `${week} due this week` : 'Nothing due this week' });
    if (extra) parts.push({ tone: 'gold', text: plural(extra, 'extra requirement') });
    return parts;
  }

  /** Which class a Halo class code (the card's own text, "CHM-113-WF700A") belongs to. */
  function classByCode(view, text) {
    const s = String(text || '').trim().toUpperCase();
    if (!s) return null;
    return view.classes.find((c) => (c.cc && c.cc.toUpperCase() === s) || (c.slug && c.slug.toUpperCase().replace(/-\d{8}$/, '') === s)) || null;
  }

  /** What Halo+ caught for one assignment: extra requirements from announcements, or a date an announcement moved. */
  function caught(view, item, now) {
    if (!item) return null;
    const extras = item.x || 0;
    const moved = item.m ? `Due date moved to ${shortDate(item.due, view.tz)} (was ${shortDate(item.m, view.tz)}), from an announcement.` : null;
    if (!extras && !moved) return null;
    return { title: extras ? `Halo+ caught ${plural(extras, 'extra requirement')} for this` : 'Halo+ caught a date change for this', list: (item.xs || []).slice(0, 5), moved, key: itemKey(item), id: item.id, courseId: item.c && !String(item.c).startsWith('live:') ? item.c : null };
  }

  /** The toolbar badge: today's count, red when something is overdue or due within 3 hours. */
  function badge(view, now) {
    if (!view) return null;
    const t = today(view, now);
    const n = t.dueToday.length + t.overdue.length;
    if (!n) return null;
    return { text: String(n), red: t.overdue.length > 0 || t.soon.length > 0 };
  }

  /** What the student has seen, to notice what is new. */
  function fingerprint(view) {
    const items = {};
    for (const i of view.items) items[itemKey(i)] = `${i.due}|${i.x || 0}|${i.done ? 1 : 0}`;
    const grades = {};
    for (const c of view.classes) if (typeof c.g === 'number') grades[c.slug || c.key] = c.g;
    return { items, grades };
  }

  /** New since it was last seen: assignments, moved dates, requirements from announcements, grades. */
  function changes(view, seen, now) {
    const out = { added: 0, moved: 0, extra: 0, grades: [], total: 0 };
    if (!seen || !seen.items) return out;
    const t = nowMs(now);
    for (const i of view.items) {
      const was = seen.items[itemKey(i)];
      if (!was) {
        if (!i.done && Date.parse(i.due) >= t) out.added += 1;
        continue;
      }
      const [due, x] = was.split('|');
      if (!i.done && due !== i.due && Date.parse(i.due) >= t - DAY) out.moved += 1;
      if (!i.done && (i.x || 0) > Number(x || 0)) out.extra += 1;
    }
    for (const c of view.classes) {
      const k = c.slug || c.key;
      if (typeof c.g === 'number' && typeof seen.grades?.[k] === 'number' && seen.grades[k] !== c.g) out.grades.push(c.code);
    }
    out.total = out.added + out.moved + out.extra + out.grades.length;
    return out;
  }
  /** "1 new assignment · 1 date moved · new grade in BIO-181". */
  function changesLine(ch) {
    const p = [];
    if (ch.added) p.push(plural(ch.added, 'new assignment'));
    if (ch.moved) p.push(plural(ch.moved, 'date moved', 'dates moved'));
    if (ch.extra) p.push(plural(ch.extra, 'new requirement'));
    if (ch.grades.length) p.push(`new grade in ${ch.grades.join(', ')}`);
    return p.join(' · ');
  }

  /** Items newly due within 3 hours that have not been flagged yet. */
  function newlySoon(view, now, flagged) {
    const t = today(view, now);
    return t.soon.filter((i) => !(flagged || []).includes(itemKey(i))).map(itemKey);
  }

  /** "as of Oct 20, 9:12 AM" when the data is more than a day old, else null. */
  function stale(view, now) {
    if (!view.syncedAt) return null;
    if (nowMs(now) - Date.parse(view.syncedAt) <= DAY) return null;
    return `as of ${whenAt(view.syncedAt, nowMs(now), view.tz)}`;
  }
  /** "Oct 12": for the Free pill. */
  function syncedDay(view) {
    if (!view.syncedAt) return 'a while ago';
    const d = dayOf(view.syncedAt, view.tz);
    return `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
  }

  /** Halo+'s address for an item or a class, marked as opened from Halo (counted in Admin). */
  function link(origin, target, via) {
    const q = (o) => Object.entries(o).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    if (target && target.courseId && target.id) return `${origin}/#/class?${q({ c: target.courseId, i: target.id, from: 'halo', via })}`;
    if (target && target.courseId) return `${origin}/#/class?${q({ c: target.courseId, from: 'halo', via })}`;
    return `${origin}/#/now?${q({ from: 'halo', via })}`;
  }

  const api = { dayOf, whenAt, dueWord, dueIn, compactLive, merge, today, pill, preview, card, nextAfter, classLine, classByCode, caught, badge, fingerprint, changes, changesLine, newlySoon, stale, syncedDay, link, topItem, itemKey, SOON_MS, OVERDUE_MS };
  root.HaloPlusModel = api;
})(globalThis);
