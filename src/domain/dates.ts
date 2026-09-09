import type { DateStr } from './types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86_400_000;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatterCache.set(tz, f);
  }
  return f;
}

export interface ZonedParts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  ss: number;
  weekday: number;
}

function partsAt(ms: number, tz: string): ZonedParts {
  const parts = formatter(tz).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const hh = Number(get('hour'));
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
    hh: hh === 24 ? 0 : hh,
    mm: Number(get('minute')),
    ss: Number(get('second')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
  };
}

/** Offset of `tz` from UTC in minutes at the given instant (positive = east of UTC). */
function offsetAt(ms: number, tz: string): number {
  const p = partsAt(ms, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, '0');
}

function splitDate(d: DateStr): [number, number, number] {
  const [y, m, day] = d.split('-').map(Number);
  return [y, m, day];
}

function toUtcMs(d: DateStr): number {
  const [y, m, day] = splitDate(d);
  return Date.UTC(y, m - 1, day);
}

function fromUtcMs(ms: number): DateStr {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function zonedParts(iso: string, tz: string): ZonedParts {
  return partsAt(new Date(iso).getTime(), tz);
}

export function dateOf(iso: string, tz: string): DateStr {
  const p = zonedParts(iso, tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

/** Build an ISO string for a wall-clock date + time in `tz`, with the correct offset. */
export function makeIso(date: DateStr, time: string, tz: string): string {
  const [y, m, d] = splitDate(date);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm, 0);
  let offset = offsetAt(wall, tz);
  offset = offsetAt(wall - offset * 60_000, tz);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return `${date}T${pad(hh)}:${pad(mm)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function todayStr(tz: string, now: Date = new Date()): DateStr {
  return dateOf(now.toISOString(), tz);
}

export function addDays(d: DateStr, n: number): DateStr {
  return fromUtcMs(toUtcMs(d) + n * DAY_MS);
}

/** Days from a to b (b - a). */
export function diffDays(a: DateStr, b: DateStr): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / DAY_MS);
}

export function weekdayOf(d: DateStr): number {
  return new Date(toUtcMs(d)).getUTCDay();
}

export function isWeekend(d: DateStr): boolean {
  const w = weekdayOf(d);
  return w === 0 || w === 6;
}

export function weekStart(d: DateStr, weekStartsOn: 0 | 1): DateStr {
  const back = (weekdayOf(d) - weekStartsOn + 7) % 7;
  return addDays(d, -back);
}

export function eachDay(from: DateStr, to: DateStr): DateStr[] {
  const out: DateStr[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function fmtDate(d: DateStr, style: 'short' | 'long' | 'numeric' = 'short'): string {
  const [, m, day] = splitDate(d);
  if (style === 'numeric') return `${m}/${day}`;
  const base = `${MONTHS[m - 1]} ${day}`;
  return style === 'long' ? `${WEEKDAYS[weekdayOf(d)]}, ${base}` : base;
}

export function fmtMonth(d: DateStr): string {
  const [y, m] = splitDate(d);
  return `${MONTHS[m - 1]} ${y}`;
}

export function fmtClock(hh: number, mm: number): string {
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${h12}:${pad(mm)} ${hh < 12 ? 'AM' : 'PM'}`;
}

export function fmtTime(iso: string, tz: string): string {
  const p = zonedParts(iso, tz);
  return fmtClock(p.hh, p.mm);
}

/** "HH:mm" -> minutes since midnight */
export function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToHhmm(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

const GCU_DT = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4}), (\d{1,2}):(\d{2}) ([AP]M)$/;

/** Parse "Sep 25, 2026, 8:00 AM" (GCU syllabus format) into an ISO string in `tz`. */
export function parseGcuDateTime(s: string, tz = 'America/Phoenix'): string | null {
  const m = GCU_DT.exec(s.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]);
  if (month < 0) return null;
  let hh = Number(m[4]) % 12;
  if (m[6] === 'PM') hh += 12;
  const date = `${m[3]}-${pad(month + 1)}-${pad(Number(m[2]))}`;
  return makeIso(date, `${pad(hh)}:${m[5]}`, tz);
}

/** Parse "Sep 8, 2026" into YYYY-MM-DD. Optional year fallback for "Sep 8". */
export function parseGcuDate(s: string, fallbackYear?: number): DateStr | null {
  const m = /^([A-Z][a-z]{2}) (\d{1,2})(?:, (\d{4}))?$/.exec(s.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]);
  const year = m[3] ? Number(m[3]) : fallbackYear;
  if (month < 0 || !year) return null;
  return `${year}-${pad(month + 1)}-${pad(Number(m[2]))}`;
}

export function fmtMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = min / 60;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1).replace(/\.0$/, '')}h`;
}
