import { addDays, weekdayOf } from '../domain/dates';
import { courseShortName } from '../domain/labels';
import type { Course, DateStr } from '../domain/types';
import { normCode } from '../halo/normalize';
import type { Mention, MentionKind } from '../record/notes';

/** What one typed line turned into: a mention for the review screen plus the class it seems to be about. */
export interface Captured {
  mention: Mention;
  courseId: string | null;
  /** Words the parser could not place; shown so the user can see what was ignored. */
  leftover: string;
}

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const GENERIC_NAME_WORDS = new Set(['general', 'i', 'ii', 'lecture', 'lab', 'university', 'on', 'campus', 'success', 'intro', 'introduction', 'to', 'and', 'the', 'of', 'a']);
const ALIASES: Record<string, string[]> = {
  chm: ['chem', 'chemistry'],
  eng: ['english', 'comp', 'composition', 'writing', 'essay'],
  esg: ['math', 'engineering'],
  unv: ['unv', 'success', 'university'],
};
const pad = (n: number) => String(n).padStart(2, '0');

/** Which class the text names. Codes win, then the class word ("chem"), then a distinctive name word. "lab" picks the lab section. */
export function courseScore(text: string, c: Course): number {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const wantsLab = /\blab\b/.test(t) || /\b[a-z]{2,4} ?\d{3}l\b/.test(t);
  {
    let s = 0;
    const code = normCode(c.code).toLowerCase();
    const letters = code.replace(/[^a-z]/g, '').slice(0, 3);
    // "CHM-113L" normalizes to "chm 113l"; the lecture's "chm 113" must not match it.
    const spaced = code.replace(/^([a-z]+)(\d+)/, '$1 $2');
    if (t.includes(` ${code} `) || t.includes(` ${spaced} `)) s += 6;
    const short = courseShortName(c.code).toLowerCase().split(/\s+/).filter((w) => w !== 'lab');
    if (short.some((w) => w.length >= 3 && t.includes(` ${w} `)) || t.includes(` ${letters} `)) s += 3;
    for (const alias of ALIASES[letters] ?? []) if (t.includes(` ${alias} `)) s += 3;
    for (const w of c.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ')) if (w.length >= 4 && !GENERIC_NAME_WORDS.has(w) && t.includes(` ${w} `)) s += 2;
    if (s === 0) return 0;
    const isLab = /l$/.test(code);
    if (wantsLab === isLab) s += 2;
    else if (isLab) s -= 1;
    return s;
  }
}

export function guessCourse(text: string, courses: Course[]): Course | null {
  let best: { c: Course; s: number } | null = null;
  for (const c of courses) {
    const s = courseScore(text, c);
    if (s > 0 && (!best || s > best.s)) best = { c, s };
  }
  return best?.c ?? null;
}

/** "friday" said on a Wednesday is that Friday; on a Friday it is the next one. "next friday" always skips a week. */
export function parseDate(text: string, today: DateStr): { date: DateStr | null; matched: string[] } {
  const t = text.toLowerCase();
  const matched: string[] = [];
  const hit = (re: RegExp) => {
    const m = re.exec(t);
    if (m) matched.push(m[0]);
    return m;
  };
  let m: RegExpExecArray | null;
  if (hit(/\b(today|tonight)\b/)) return { date: today, matched };
  if (hit(/\btomorrow\b/)) return { date: addDays(today, 1), matched };
  if ((m = hit(/\b(next\s+)?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\b/))) {
    const idx = DAYS.findIndex((d) => d.startsWith(m![2].slice(0, 3)));
    let delta = (idx - weekdayOf(today) + 7) % 7;
    if (delta === 0) delta = 7;
    if (m[1]) delta += 7;
    return { date: addDays(today, delta), matched };
  }
  if (hit(/\bnext week\b/)) {
    const delta = ((1 - weekdayOf(today) + 7) % 7) || 7;
    return { date: addDays(today, delta), matched };
  }
  if ((m = hit(/\bin (\d{1,2}) days?\b/))) return { date: addDays(today, Number(m[1])), matched };
  if ((m = hit(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/))) {
    const month = MONTHS.indexOf(m[1].slice(0, 3)) + 1;
    return { date: resolveYear(month, Number(m[2]), today), matched };
  }
  if ((m = hit(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
    return { date: year ? `${year}-${pad(Number(m[1]))}-${pad(Number(m[2]))}` : resolveYear(Number(m[1]), Number(m[2]), today), matched };
  }
  if ((m = hit(/\bthe (\d{1,2})(?:st|nd|rd|th)\b/))) {
    const day = Number(m[1]);
    const [y, mo] = today.split('-').map(Number);
    const thisMonth = `${y}-${pad(mo)}-${pad(day)}`;
    return { date: thisMonth >= today ? thisMonth : resolveYear(mo === 12 ? 1 : mo + 1, day, today), matched };
  }
  return { date: null, matched };
}
function resolveYear(month: number, day: number, today: DateStr): DateStr {
  const y = Number(today.slice(0, 4));
  const candidate = `${y}-${pad(month)}-${pad(day)}`;
  return candidate >= today ? candidate : `${y + 1}-${pad(month)}-${pad(day)}`;
}

/** "2pm", "2:30 pm", "14:00", "noon", "midnight", "before class". */
export function parseTime(text: string): { time: string | null; beforeClass: boolean; matched: string[] } {
  const t = text.toLowerCase();
  const matched: string[] = [];
  const bc = /\bbefore (?:\w+ )?class\b/.exec(t);
  if (bc) matched.push(bc[0]);
  const beforeClass = matched.length > 0;
  if (/\bnoon\b/.test(t)) return { time: '12:00', beforeClass, matched: [...matched, 'noon'] };
  if (/\bmidnight\b/.test(t)) return { time: '23:59', beforeClass, matched: [...matched, 'midnight'] };
  const m = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/.exec(t) ?? /\b(\d{1,2}):(\d{2})\b(?!\s*(am|pm))/.exec(t);
  if (!m) return { time: null, beforeClass, matched };
  let hh = Number(m[1]);
  const mm = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.replace(/\./g, '');
  if (ap === 'pm' && hh < 12) hh += 12;
  if (ap === 'am' && hh === 12) hh = 0;
  if (hh > 23 || mm > 59) return { time: null, beforeClass, matched };
  return { time: `${pad(hh)}:${pad(mm)}`, beforeClass, matched: [...matched, m[0]] };
}

const MOVE = /\b(moved?|pushed?|postponed|rescheduled|changed|now due|instead|bumped|delayed|extended)\b/;
const CANCEL = /\b(cancel(l?ed)?|dropped|scrapped|called off|no (homework|hw|quiz|class|lab|assignment)\b)/;
const INFO = /\b(office hours|review session|study session|meeting|reminder|still on|unchanged|confirmed)\b/;

export function guessKind(text: string): MentionKind {
  const t = text.toLowerCase();
  if (CANCEL.test(t)) return 'cancel';
  if (MOVE.test(t)) return 'date_change';
  if (INFO.test(t)) return 'info';
  return 'new';
}

const FILLER = /\b(the|a|an|to|on|by|at|for|is|was|be|will|of|in|due|now|this|next|week|moved?|pushed?|postponed|rescheduled|changed|instead|bumped|delayed|extended|before class|before|after|until|till|tonight|today|tomorrow|cancel(l?ed)?|dropped|no|please|remember|note|that|there's|there is|we have|have)\b/g;

/** Turn one typed line into a mention the review screen can act on. */
export function parseCapture(text: string, courses: Course[], today: DateStr): Captured {
  const course = guessCourse(text, courses);
  const { date, matched: dm } = parseDate(text, today);
  const { time, beforeClass, matched: tm } = parseTime(text);
  const kind = guessKind(text);
  const points = /\b(\d{1,3})\s*(pts?|points?)\b/i.exec(text);
  let rest = text;
  for (const w of [...dm, ...tm]) rest = rest.replace(w, ' ');
  if (points) rest = rest.replace(points[0], ' ');
  if (course) {
    for (const w of [course.code, normCode(course.code), courseShortName(course.code), ...(ALIASES[normCode(course.code).toLowerCase().replace(/[^a-z]/g, '').slice(0, 3)] ?? [])]) rest = rest.replace(new RegExp(`\\b${w.replace(/[-.]/g, '[-. ]?')}\\b`, 'ig'), ' ');
  }
  rest = rest.replace(/\b(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*\b/gi, ' ').replace(FILLER, ' ');
  const title = rest
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\w/, (ch) => ch.toUpperCase());
  const classTime = course && beforeClass && date ? course.meetings.find((mt) => mt.day === weekdayOf(date))?.start ?? null : null;
  return {
    mention: {
      id: 'capture',
      quote: text.trim(),
      kind,
      title: title || (kind === 'info' ? 'Note' : 'Untitled'),
      date,
      time: time ?? classTime,
      points: points ? Number(points[1]) : null,
      confidence: date && course ? 'high' : date || course ? 'medium' : 'low',
      itemId: null,
    },
    courseId: course?.id ?? null,
    leftover: title,
  };
}
