// Halo+ on Halo's pages (0.12.0): the rules, as plain functions with no page and no Chrome in them, so each one is
// tested on its own (src/halo/onHaloLogic.test.ts). Every rule here answers "is Halo+ sure?" first: anything unclear
// returns null, and the page then shows nothing.
(function () {
  'use strict';
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  // ---- dates -------------------------------------------------------------------------------------------------------------
  /** "2026-10-28" for an instant in a time zone. */
  function dayOf(at, tz) {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return null;
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    } catch {
      return null;
    }
  }
  const dayNum = (day) => Date.parse(`${day}T00:00:00Z`) / DAY;

  /**
   * How long until a due date, in the student's time zone (feature 5): "in 40m", "in 5h", "tomorrow", "in 3 days".
   * Only for a date still ahead and within six days; null otherwise (past due is Halo's own business, further out is
   * noise). "tomorrow" only when it is due on the next calendar day there and more than 6 hours away, so "tomorrow"
   * never stands in for "in 2h" just after midnight.
   */
  function dueIn(dueAt, now, tz) {
    const t = Date.parse(dueAt);
    if (!Number.isFinite(t) || !Number.isFinite(now)) return null;
    const left = t - now;
    if (left <= 0) return null;
    if (left < HOUR) return `in ${Math.max(1, Math.floor(left / MIN))}m`;
    const a = dayOf(now, tz);
    const b = dayOf(t, tz);
    if (!a || !b) return null;
    const days = dayNum(b) - dayNum(a);
    if (days === 0 || left < 6 * HOUR) return `in ${Math.floor(left / HOUR)}h`;
    if (days === 1) return 'tomorrow';
    if (days >= 2 && days <= 6) return `in ${days} days`;
    return null;
  }

  // ---- links -------------------------------------------------------------------------------------------------------------
  // Real web addresses in plain text (feature 28): http(s)://… or www.…, with a real-looking host (a dot, a top-level
  // part of letters), ending before trailing punctuation a sentence puts after it. Anything else stays text.
  const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
  const TRAIL = /[.,;:!?)\]}'"»”’]+$/;
  /** The addresses in a piece of text: [{ start, end, href, text }], only ones `new URL` accepts with a real host. */
  function findUrls(text) {
    const out = [];
    const s = String(text || '');
    URL_RE.lastIndex = 0;
    let m;
    while ((m = URL_RE.exec(s))) {
      let raw = m[0];
      // A closing bracket that the address itself opened stays ("…/Foo_(bar)"); others are the sentence's.
      while (TRAIL.test(raw)) {
        const last = raw.slice(-1);
        if (last === ')' && (raw.match(/\(/g) || []).length >= (raw.match(/\)/g) || []).length) break;
        raw = raw.slice(0, -1);
      }
      const href = /^www\./i.test(raw) ? `https://${raw}` : raw;
      let u;
      try {
        u = new URL(href);
      } catch {
        continue;
      }
      if (!/^https?:$/.test(u.protocol) || u.username || u.password) continue;
      const host = u.hostname;
      if (!/^[a-z0-9.-]+$/i.test(host) || !/\.[a-z]{2,24}$/i.test(host) || /\.\./.test(host) || host.startsWith('.')) continue;
      out.push({ start: m.index, end: m.index + raw.length, href: u.href, text: raw });
    }
    return out;
  }

  // ---- words ---------------------------------------------------------------------------------------------------------------
  /** Words in a piece of text, the way a reader counts them: runs of letters or digits (it's, e-mail and 3.5 are one). */
  function countWords(text) {
    const s = String(text || '')
      .replace(/ /g, ' ')
      .replace(/[‘’']/g, '')
      .trim();
    if (!s) return 0;
    const m = s.match(/[\p{L}\p{N}]+(?:[-.][\p{L}\p{N}]+)*/gu);
    return m ? m.length : 0;
  }

  const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  /**
   * The word minimum the instructions state (feature 19), or null when there is none or it is not clear. Clear means
   * the text says it one way: "at least 150 words", "a minimum of 250 words", "150-200 words", "250 to 300 words",
   * "no fewer than 200 words", "150 word minimum". `kind` picks the box: 'reply' takes a number said of replies or
   * responses, 'post' one said of the initial or main post; a single number said of neither applies to both. Two
   * different numbers for the same box: null.
   */
  function wordMinimum(text, kind = 'post') {
    const s = String(text || '').replace(/ /g, ' ').replace(/[–—]/g, '-');
    const found = [];
    const add = (n, at) => {
      const v = Number(n);
      if (Number.isFinite(v) && v >= 20 && v <= 5000) found.push({ n: v, at });
    };
    const pats = [
      /\b(?:at\s+least|a\s+minimum\s+of|minimum\s+of|no\s+(?:fewer|less)\s+than|not\s+(?:fewer|less)\s+than)\s+(\d{2,4})\s*(?:-|to)?\s*(?:\d{2,4})?\s*words?\b/gi,
      /\b(\d{2,4})\s*(?:-|to)\s*\d{2,4}\s+words?\b/gi,
      /\b(\d{2,4})[\s-]*words?\s+(?:minimum|min\.?)\b/gi,
      /\bminimum\s+(?:word\s+count\s+)?(?:of\s+)?(\d{2,4})\s*words?\b/gi,
      /\b(\d{2,4})\s*\+\s*words?\b/gi,
    ];
    for (const re of pats) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(s))) add(m[1], m.index);
    }
    if (!found.length) return null;
    // Which box each number is said of: the nearest "reply/response/peer" or "initial/main/original post" before it,
    // within the same sentence.
    // The sentence a number sits in says which box it is for: replies to classmates or peers, or the initial (main,
    // original) post. "Respond to the prompt" is about the post itself, so "respond" alone says nothing.
    const scoped = found.map((f) => {
      const start = Math.max(s.lastIndexOf('. ', f.at), s.lastIndexOf('\n', f.at), 0);
      const ends = [s.indexOf('. ', f.at), s.indexOf('\n', f.at)].filter((x) => x >= 0);
      const sentence = s.slice(start, ends.length ? Math.min(...ends) : s.length).toLowerCase();
      const reply = /\b(repl(y|ies)|peers?|classmates?|other\s+students|responses?\s+to\s+(your\s+)?(classmates|peers|others|other\s+students))\b/.test(sentence);
      const post = /\b(initial|main|original|primary)\b/.test(sentence);
      return { ...f, scope: reply && !post ? 'reply' : post && !reply ? 'post' : 'any' };
    });
    const mine = scoped.filter((f) => f.scope === kind || f.scope === 'any');
    const nums = [...new Set(mine.map((f) => f.n))];
    if (nums.length !== 1) return null;
    // A number said of the other box too, with no scope of its own, makes it unclear.
    return nums[0];
  }

  // ---- file types ------------------------------------------------------------------------------------------------------------
  const TYPES = [
    { key: 'docx', words: /\b(?:\.docx|docx|microsoft\s+word|ms\s+word|word\s+(?:document|doc|file))\b/i, exts: ['docx', 'doc'] },
    { key: 'pdf', words: /\b(?:\.pdf|pdf)\b/i, exts: ['pdf'] },
    { key: 'pptx', words: /\b(?:\.pptx|pptx|powerpoint)\b/i, exts: ['pptx', 'ppt'] },
    { key: 'xlsx', words: /\b(?:\.xlsx|xlsx|excel\s+(?:spreadsheet|file|workbook)|excel)\b/i, exts: ['xlsx', 'xls'] },
  ];
  const ASK = /\b(?:submit|upload|save|turn\s+in|attach|format(?:ted)?|as\s+an?|in\s+an?|must\s+be|should\s+be|file\s+type|only)\b/i;
  /**
   * The one file type the instructions ask for (feature 8), or null. Only when exactly one of Word, PDF, PowerPoint or
   * Excel is named, in a sentence that asks for a submission in it ("Submit your paper as a Word document"); two types
   * named anywhere ("Word or PDF"), or a type named only in passing, is not clear.
   */
  function requiredType(text) {
    const s = String(text || '').replace(/ /g, ' ');
    const named = TYPES.filter((t) => t.words.test(s));
    if (named.length !== 1) return null;
    const t = named[0];
    const sentences = s.split(/(?<=[.!?])\s+|\n+/);
    const asked = sentences.some((x) => t.words.test(x) && ASK.test(x) && !/\bor\b/i.test(x.replace(/\b(?:\.?docx?|word)\b\s+or\s+\b(?:\.?docx?|word)\b/i, '')));
    if (!asked) return null;
    return { key: t.key, exts: t.exts };
  }
  /** The attached file is clearly another type: it has an extension, and it is not one the asked-for type allows. */
  function wrongType(fileName, req) {
    if (!req) return false;
    const m = /\.([a-z0-9]{2,5})$/i.exec(String(fileName || '').trim());
    if (!m) return false;
    return !req.exts.includes(m[1].toLowerCase());
  }

  // ---- search (feature 0) ------------------------------------------------------------------------------------------------
  const KIND_WORDS = { topic: 'topic', assignment: 'assignment', quiz: 'quiz test exam', discussion: 'discussion dq forum', announcement: 'announcement news', file: 'file resource document' };
  const fold = (s) =>
    String(s || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const words = (s) => (fold(s) ? fold(s).split(' ') : []);
  /**
   * The best matches for what the student typed, from the index on this computer: every word typed must start a word
   * of the row (its title, its kind, its topic, its class code); a number must be the whole number ("3" is not "30").
   * Ranked: words found in the title first, then a phrase in the title, then work coming up soon, then the rest.
   * Rows: { kind, title, cc, topic, href, due }. At most `limit`.
   */
  function search(rows, query, now, limit = 8) {
    const q = words(query);
    if (!q.length || !Array.isArray(rows)) return [];
    const phrase = fold(query);
    const out = [];
    for (const r of rows) {
      if (!r || !r.href || !r.title) continue;
      const title = words(r.title);
      const rest = [...words(KIND_WORDS[r.kind] || ''), ...words(r.topic), ...words(r.cc), ...words(r.code)];
      let score = 0;
      let ok = true;
      for (const w of q) {
        const isNum = /^\d+$/.test(w);
        const hit = (x) => (isNum ? x === w : x.startsWith(w));
        if (title.some(hit)) score += isNum ? 3 : 4;
        else if (rest.some(hit)) score += 1;
        else {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      if (fold(r.title).includes(phrase)) score += 3;
      if (fold(r.title) === phrase) score += 4;
      const due = r.due ? Date.parse(r.due) : NaN;
      if (Number.isFinite(due) && Number.isFinite(now)) {
        const d = due - now;
        if (d >= 0 && d <= 7 * DAY) score += 2;
        else if (d < 0 && d > -14 * DAY) score += 0.5;
      }
      if (r.kind === 'topic' || r.kind === 'assignment' || r.kind === 'quiz' || r.kind === 'discussion') score += 0.25;
      out.push({ r, score });
    }
    out.sort((a, b) => b.score - a.score || String(a.r.due || '9').localeCompare(String(b.r.due || '9')) || a.r.title.localeCompare(b.r.title));
    return out.slice(0, limit).map((x) => x.r);
  }

  // ---- last feedback (feature 23) -------------------------------------------------------------------------------------
  // "Topic 7 DQ 2" and "Topic 6 DQ 2" are the same assignment a week apart: the title with its topic (week, module, unit)
  // number taken out is the same, and so is Halo's type.
  const SERIES = /\b(topic|week|module|unit|wk|chapter|ch)\.?\s*(\d{1,2})\b/i;
  function seriesOf(title, type) {
    // A discussion's subject changes every week by design ("Topic 3 DQ 1: Listening"): only what comes before it counts.
    let t = String(title || '');
    if (type === 'DISCUSSION_QUESTION' && t.includes(':')) t = t.slice(0, t.indexOf(':'));
    const m = SERIES.exec(t);
    if (!m) return null;
    const rest = fold(t.slice(0, m.index) + ' # ' + t.slice(m.index + m[0].length));
    if (!/[a-z]/.test(rest.replace(/\b(topic|week|module|unit)\b/g, ''))) return null;
    return { key: `${m[1].toLowerCase().replace(/^wk$/, 'week').replace(/^ch$/, 'chapter')}|${rest}`, n: Number(m[2]) };
  }
  /**
   * The earlier assignment whose feedback belongs under this one (feature 23), or null. Clear means: the same series
   * (seriesOf) and Halo type, an earlier number, a comment from the instructor; the most recent such number wins, and
   * two different assignments at that number (a duplicate title) make it unclear.
   */
  function earlierMatch(current, candidates) {
    const me = seriesOf(current && current.title, current && current.type);
    if (!me) return null;
    const same = (candidates || []).filter((c) => {
      if (!c || c.id === current.id || !String(c.comment || '').trim()) return false;
      if ((c.type || '') !== (current.type || '')) return false;
      const s = seriesOf(c.title, c.type);
      return !!s && s.key === me.key && s.n < me.n;
    });
    if (!same.length) return null;
    const top = Math.max(...same.map((c) => seriesOf(c.title, c.type).n));
    const at = same.filter((c) => seriesOf(c.title, c.type).n === top);
    return at.length === 1 ? at[0] : null;
  }

  // ---- participation (feature 9) ---------------------------------------------------------------------------------------
  const DAYS_N = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
  /**
   * How many separate days a week the class asks for posts (feature 9), from the syllabus or instructions text, or
   * null. Clear means sentences about posting or participation name one number of separate (different, distinct) days:
   * "post on at least three (3) separate days", "participate on 4 different days each topic". Two different numbers:
   * null.
   */
  function participationDays(text) {
    const s = String(text || '').replace(/\u00a0/g, ' ');
    const found = new Set();
    const re = /\b(one|two|three|four|five|six|seven|[1-7])\s*(?:\(\s*[1-7]\s*\)\s*)?(?:separate|different|distinct|unique)\s+days\b/gi;
    for (const sentence of s.split(/(?<=[.!?])\s+|\n+/)) {
      if (!/\b(post|posts|posting|participat\w*|discussion|forum)\b/i.test(sentence)) continue;
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(sentence))) {
        const n = DAYS_N[m[1].toLowerCase()] || Number(m[1]);
        if (n >= 1 && n <= 7) found.add(n);
      }
    }
    return found.size === 1 ? [...found][0] : null;
  }
  const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  /**
   * The participation line (feature 9): the days in [start, end) with a post, in the student's time zone, and what is
   * left. "This week: posted Mon, Wed · 1 more day needed", "This week: posted Mon, Wed, Thu ✓", "This week: no posts
   * yet · 3 days needed". Null when anything is missing or unreadable.
   */
  function participationLine(postDates, start, end, need, tz, perDay = 1) {
    const a = Date.parse(start);
    const b = Date.parse(end);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || !(need >= 1) || !(perDay >= 1) || !Array.isArray(postDates)) return null;
    const days = new Map();
    for (const d of postDates) {
      const t = Date.parse(d);
      if (!Number.isFinite(t)) return null;
      if (t < a || t >= b) continue;
      const day = dayOf(t, tz);
      if (!day) return null;
      days.set(day, (days.get(day) || 0) + 1);
    }
    const name = (k) => WEEKDAY[new Date(`${k}T12:00:00Z`).getUTCDay()];
    const keys = [...days.keys()].sort();
    // A day counts with the posts the class asks for that day (Halo's numPosts); a day short of it is said as such.
    const full = keys.filter((k) => days.get(k) >= perDay).map(name);
    const short = keys.filter((k) => days.get(k) < perDay).map((k) => `${name(k)}: ${days.get(k)} of ${perDay} posts`);
    const left = Math.max(0, need - full.length);
    const tail = short.length ? ` · ${short.join(', ')}` : '';
    if (!full.length) return `This week: no ${perDay > 1 ? 'full days' : 'posts'} yet · ${need} ${need === 1 ? 'day' : 'days'} needed${tail}`;
    return left ? `This week: posted ${full.join(', ')} · ${left} more ${left === 1 ? 'day' : 'days'} needed${tail}` : `This week: posted ${full.join(', ')} ✓`;
  }

  // ---- drafts (feature 18) -----------------------------------------------------------------------------------------------
  const DRAFT_DAYS = 30;
  const DRAFT_MAX = 40;
  const squash = (t) => String(t || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  /** Worth keeping: at least three words typed. */
  const draftWorth = (text) => countWords(text) >= 3;
  /**
   * Offer "Restore your draft" (feature 18): there is a draft for this box, the box is empty now, the draft is from the
   * last 30 days and was never offered on this page, and it is not already posted (the student's own posts here).
   */
  function offerDraft(draft, boxText, now, ownPosts) {
    if (!draft || !draftWorth(draft.text) || squash(boxText)) return false;
    if (!Number.isFinite(Date.parse(draft.at)) || now - Date.parse(draft.at) > DRAFT_DAYS * DAY) return false;
    return !postedAlready(draft.text, ownPosts);
  }
  /** The draft's words are in one of the student's own posts here: it went through. */
  function postedAlready(text, ownPosts) {
    const d = squash(text).toLowerCase();
    if (!d) return false;
    const head = d.slice(0, 160);
    return (ownPosts || []).some((p) => {
      const q = squash(p).toLowerCase();
      return q === d || (head.length >= 40 && q.includes(head));
    });
  }
  /** The drafts kept: the newest 40, none older than 30 days. */
  function pruneDrafts(all, now) {
    const list = Object.entries(all || {}).filter(([, v]) => v && Number.isFinite(Date.parse(v.at)) && now - Date.parse(v.at) <= DRAFT_DAYS * DAY);
    list.sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at));
    return Object.fromEntries(list.slice(0, DRAFT_MAX));
  }

  // ---- Halo's own dates ------------------------------------------------------------------------------------------------
  // Halo shows every course date in its school time zone (tenantConfig.timezone, America/Phoenix), as "Nov 1, 2026,
  // 11:59 PM" (FULL_DATE_AND_TIME_FORMAT "MMM D, YYYY, h:mm A"). Read back exactly, or not at all.
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function offsetAt(utcMs, tz) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(utcMs));
    const g = (t) => Number(parts.find((x) => x.type === t).value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second')) - utcMs;
  }
  /** The instant of a wall-clock time in a zone (the offset checked twice, so a DST edge lands right). */
  function zoned(y, mo, d, h, mi, tz) {
    const guess = Date.UTC(y, mo, d, h, mi);
    let t = guess - offsetAt(guess, tz);
    t = guess - offsetAt(t, tz);
    return t;
  }
  /** "Nov 1, 2026, 11:59 PM" in Halo's zone → epoch ms; null for anything else. */
  function haloDateTime(text, tz) {
    const m = /^\s*([A-Z][a-z]{2}) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2}) (AM|PM)\s*$/.exec(String(text || ''));
    if (!m || !tz) return null;
    const mo = MONTHS.indexOf(m[1]);
    const d = Number(m[2]);
    let h = Number(m[4]);
    const mi = Number(m[5]);
    if (mo < 0 || d < 1 || d > 31 || h < 1 || h > 12 || mi > 59) return null;
    if (m[6] === 'AM' && h === 12) h = 0;
    if (m[6] === 'PM' && h !== 12) h += 12;
    try {
      const t = zoned(Number(m[3]), mo, d, h, mi, tz);
      // The date must exist ("Feb 30" is not a date) and read back the same.
      return haloFormat(t, tz) === `${m[1]} ${d}, ${m[3]}, ${m[4]}:${m[5]} ${m[6]}` ? t : null;
    } catch {
      return null;
    }
  }
  /** An instant as Halo writes it: "Nov 1, 2026, 11:59 PM" ('full'), "Sun 3:12 PM" ('day'), "Oct 26, 3:12 PM" ('short'). */
  function haloFormat(t, tz, kind = 'full') {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'short', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(t));
    const g = (x) => (parts.find((p) => p.type === x) || {}).value || '';
    const clock = `${g('hour')}:${g('minute')} ${g('dayPeriod').toUpperCase()}`;
    if (kind === 'day') return `${g('weekday')} ${clock}`;
    if (kind === 'short') return `${g('month')} ${g('day')}, ${clock}`;
    return `${g('month')} ${g('day')}, ${g('year')}, ${clock}`;
  }

  // ---- Halo's class colours -------------------------------------------------------------------------------------------
  // Halo colours each class (its Home card's top border, the My Classes menu, alerts) by a hash of its slug into 44
  // colours (_app 88863 and 6489 17817); the same colour here, from Halo's own variable when the page has it.
  const CLASS_COLORS = [
    ['Pink', '#e91e63'], ['Purple', '#522398'], ['Indigo', '#3f51b5'], ['Blue', '#2196f3'], ['Cyan', '#00bcd4'], ['Teal', '#009688'], ['Green', '#4caf50'], ['Lime', '#cddc39'], ['Orange', '#ff9800'], ['DeepOrange', '#ff5722'], ['Brown', '#795548'],
    ['OrchidPink', '#efbed0'], ['PaleViolet', '#c0a5ff'], ['PeriwinkleCrayola', '#c6cbe7'], ['Diamond', '#bde4fa'], ['PaleBlue', '#beeaf1'], ['ColumbiaBlue', '#bbdedb'], ['TeaGreen', '#cee5cc'], ['LightBlond', '#f1f4c8'], ['Blond', '#fcecba'], ['BabyPink', '#f7cebf'], ['PastelGray', '#d5cdc9'],
    ['PastelPink', '#e06c92'], ['LavenderPurple', '#8c6adc'], ['PeriwinkleBlue', '#7b87c6'], ['SkyBlue', '#77b4f1'], ['LightAqua', '#73cedf'], ['SeafoamGreen', '#6ab4ac'], ['SageGreen', '#91c58a'], ['PastelYellow', '#dfe685'], ['Peach', '#f5b961'], ['Coral', '#f0906e'], ['Taupe', '#9d8981'],
    ['DeepRose', '#9f2857'], ['RoyalPurple', '#2f1259'], ['OliveGreen', '#457b3c'], ['MustardYellow', '#9e9c3d'], ['BrickRed', '#c84e2a'], ['CetaceanBlue', '#010958'], ['TrueBlue', '#005be0'], ['BlueMunsell', '#038ea4'], ['BlueGreen', '#004b3e'], ['WindsorTan', '#9f5000'], ['Cola', '#3b2a26'],
  ];
  function djb2xor(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = (33 * h) ^ str.charCodeAt(i);
    return h >>> 0;
  }
  /** Halo's colour for a class: { name, hex, css } (css uses Halo's own variable, the hex as its fallback). */
  function classColor(slug, classCode, startDate) {
    const newer = !startDate || Date.parse(startDate) > Date.parse('2025-08-28T07:00:00Z');
    const list = newer ? CLASS_COLORS : CLASS_COLORS.slice(0, 11);
    const key = newer ? String(slug || '') : String(classCode || '');
    const [name, hex] = list[djb2xor(key) % list.length];
    return { name, hex, css: `var(--lms-colorClassCard${name}, ${hex})` };
  }

  // ---- the index on this computer (search, next, calendar, feedback) -----------------------------------------------------
  const KIND_OF = { ASSIGNMENT: 'assignment', DISCUSSION_QUESTION: 'discussion', QUIZ: 'quiz', PARTICIPATION: 'participation', LTI: 'lti' };
  /**
   * Where something opens on Halo (Halo's own routes and hash views, build 2026-10-27), or null when Halo+ cannot be
   * sure: an assignment opens its submission view on its topic page, a group assignment the class's groups, a quiz its
   * landing page, a discussion its forum (only with the forum id Halo gave), participation the class's discussions.
   */
  function hrefFor(slug, a) {
    if (!slug || !a || !a.id) return null;
    const S = encodeURIComponent(slug);
    const kind = KIND_OF[a.type] || null;
    if (kind === 'quiz') return `/quiz/${encodeURIComponent(a.id)}?slugId=${S}`;
    if (kind === 'discussion') return a.forumId ? `/courses/${S}/forums/discussion/${encodeURIComponent(a.forumId)}` : null;
    if (kind === 'participation') return `/courses/${S}/forums/discussion`;
    if (kind === 'assignment') {
      if (a.group) return `/courses/${S}/groups?assessmentId=${encodeURIComponent(a.id)}`;
      return a.unitId ? `/courses/${S}/course-units/${encodeURIComponent(a.unitId)}#assignment-submission/${encodeURIComponent(a.id)}` : null;
    }
    return null;
  }
  /**
   * The index Halo+ keeps on this computer after each sync (the worker builds it from the sync's own reading of Halo):
   * per class its slug, id, code, name, dates, colour, participation rule and holidays; then rows for everything with a
   * title and an address on Halo: topics, assignments, quizzes, discussions, announcements, files.
   */
  function buildIndex(payload, at) {
    const classes = [];
    const rows = [];
    for (const c of (payload && payload.classes) || []) {
      if (!c || !c.slugId) continue;
      const S = encodeURIComponent(c.slugId);
      const k = classes.length;
      const col = classColor(c.slugId, c.classCode, c.startDate);
      classes.push({ slug: c.slugId, id: c.id || null, cc: c.classCode || '', code: c.courseCode || '', name: c.name || '', start: c.startDate || null, end: c.endDate || null, col: col.css, hex: col.hex, part: c.participation && c.participation.days && c.participation.posts ? { days: c.participation.days, posts: c.participation.posts } : null, hol: (c.holidays || []).filter((h) => h && h.startDate).map((h) => ({ t: h.title || '', s: h.startDate, n: h.duration || 1 })) });
      const forumOf = {};
      for (const d of c.discussions || []) if (d && d.contextId && d.forumId) forumOf[d.contextId] = d.forumId;
      const units = new Map();
      for (const a of c.assessments || []) {
        if (!a || !a.id || !a.title) continue;
        if (a.unitId && !units.has(a.unitId)) units.set(a.unitId, { t: a.unit || '', n: a.unitSequence });
        const kind = KIND_OF[a.type] || 'assignment';
        const item = { id: a.id, type: a.type || 'ASSIGNMENT', unitId: a.unitId || null, forumId: forumOf[a.id] || null, group: !!a.isGroupEnabled };
        const href = kind === 'lti' ? null : hrefFor(c.slugId, item);
        rows.push({ c: k, kind, id: a.id, title: String(a.title).slice(0, 160), topic: a.unit || '', unit: a.unitId || null, href, due: a.dueDate || null, cdue: a.classDueDate || null, start: a.startDate || null, type: a.type || 'ASSIGNMENT', pts: a.points || 0, forum: item.forumId, group: item.group, done: !!a.submittedAt || typeof a.score === 'number' || /^(SUBMITTED|LATE|PUBLISHED)$/.test(a.status || '') });
        for (const f of a.attachments || []) if (f && f.resourceId && f.title) rows.push({ c: k, kind: 'file', title: String(f.title).slice(0, 160), topic: a.unit || '', href: `/resource/${encodeURIComponent(f.resourceId)}` });
      }
      for (const [id, u] of units) rows.push({ c: k, kind: 'topic', id, title: u.t || `Topic ${u.n}`, href: `/courses/${S}/course-units/${encodeURIComponent(id)}`, n: u.n });
      for (const p of c.announcements || []) {
        if (!p || !p.id || !p.title) continue;
        rows.push({ c: k, kind: 'announcement', id: p.id, title: String(p.title).slice(0, 160), href: `/courses/${S}/announcements?pId=${encodeURIComponent(p.id)}`, at: p.publishedAt || null });
        for (const f of p.resources || []) if (f && f.id && f.name && (!f.kind || f.kind === 'FILE')) rows.push({ c: k, kind: 'file', title: String(f.name).slice(0, 160), topic: p.title, href: `/resource/${encodeURIComponent(f.id)}` });
      }
      for (const r of c.resources || []) {
        if (!r || !r.id) continue;
        for (const f of r.files || []) if (f && f.id && f.name && (!f.kind || f.kind === 'FILE')) rows.push({ c: k, kind: 'file', title: String(f.name).slice(0, 160), topic: r.unit || r.title || '', href: `/resource/${encodeURIComponent(r.id)}?nestedResourceId=${encodeURIComponent(f.id)}` });
      }
    }
    return { v: 1, at: at || (payload && payload.exportedAt) || null, classes, rows };
  }

  // ---- fetching ahead (feature 13) -------------------------------------------------------------------------------------
  /**
   * Whether fetching page code ahead is fine right now: the tab in front, no data saver, a fast connection (4g, or a
   * desktop browser that does not say), and not running on a battery below 30%. A battery at 0% that is "not charging"
   * is a machine without one (some browsers report that).
   */
  function preloadOk({ visible, saveData, effectiveType, battery }) {
    if (!visible || saveData) return false;
    if (effectiveType && effectiveType !== '4g') return false;
    if (battery && !battery.charging && battery.level > 0 && battery.level < 0.3) return false;
    return true;
  }

  globalThis.HaloPlusOnLogic = { preloadOk, haloDateTime, haloFormat, zoned, classColor, djb2xor, hrefFor, buildIndex, KIND_OF, draftWorth, offerDraft, postedAlready, pruneDrafts, participationDays, participationLine, seriesOf, earlierMatch, search, fold, dayOf, dueIn, findUrls, countWords, wordMinimum, requiredType, wrongType, MIN, HOUR, DAY };
})();
