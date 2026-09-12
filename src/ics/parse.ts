import { dateOf, makeIso, zonedParts } from '../domain/dates';
import type { Course } from '../domain/types';
import { normCode, normTitle } from '../halo/normalize';
import type { HaloAssessment, HaloClass, HaloExport } from '../halo/types';

/** One VEVENT, with the fields the Halo export fills in. */
export interface IcsValue {
  value: string;
  tzid: string | null;
}
export interface IcsEvent {
  uid: string | null;
  summary: string;
  dtstart: IcsValue | null;
  dtend: IcsValue | null;
  dtstamp: IcsValue | null;
  location: string;
  description: string;
  url: string | null;
}
export interface IcsFile {
  events: IcsEvent[];
  /** When the export was made, as an ISO instant, from the newest DTSTAMP. */
  stamp: string | null;
  prodId: string | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** RFC 5545 folds long lines; a continuation line starts with a space or tab. */
export function unfoldLines(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r\n|\n|\r/)) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) out[out.length - 1] += line.slice(1);
    else out.push(line);
  }
  return out;
}

export function unescapeText(v: string): string {
  return v.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\\\/g, '\\');
}

function splitProp(line: string): { name: string; params: Record<string, string>; value: string } | null {
  let i = 0;
  let quoted = false;
  for (; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ':' && !quoted) break;
  }
  if (i >= line.length) return null;
  const [name, ...ps] = line.slice(0, i).split(';');
  const params: Record<string, string> = {};
  for (const p of ps) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return { name: name.trim().toUpperCase(), params, value: line.slice(i + 1) };
}

type Props = Record<string, { params: Record<string, string>; value: string }>;
const val = (p: Props, k: string): IcsValue | null => (p[k] ? { value: p[k].value.trim(), tzid: p[k].params.TZID ?? null } : null);

export function parseIcs(text: string): IcsFile {
  const events: IcsEvent[] = [];
  let cur: Props | null = null;
  let prodId: string | null = null;
  for (const line of unfoldLines(text)) {
    const p = splitProp(line);
    if (!p) continue;
    if (p.name === 'BEGIN' && p.value.trim().toUpperCase() === 'VEVENT') {
      cur = {};
      continue;
    }
    if (p.name === 'END' && p.value.trim().toUpperCase() === 'VEVENT') {
      if (cur) {
        events.push({
          uid: cur.UID?.value.trim() || null,
          summary: unescapeText(cur.SUMMARY?.value ?? '').trim(),
          dtstart: val(cur, 'DTSTART'),
          dtend: val(cur, 'DTEND'),
          dtstamp: val(cur, 'DTSTAMP'),
          location: unescapeText(cur.LOCATION?.value ?? '').trim(),
          description: unescapeText(cur.DESCRIPTION?.value ?? '').trim(),
          url: cur.URL?.value.trim() || null,
        });
      }
      cur = null;
      continue;
    }
    if (cur) cur[p.name] = { params: p.params, value: p.value };
    else if (p.name === 'PRODID') prodId = p.value.trim();
  }
  const stamps = events.map((e) => stampIso(e.dtstamp)).filter((s): s is string => !!s).sort();
  return { events, stamp: stamps.at(-1) ?? null, prodId };
}

const DT = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/;

function rezone(iso: string, tz: string): string {
  const p = zonedParts(iso, tz);
  return makeIso(`${p.y}-${pad(p.m)}-${pad(p.d)}`, `${pad(p.hh)}:${pad(p.mm)}`, tz);
}

/**
 * The .ics export writes FLOATING local time: no Z, no TZID, already Phoenix wall-clock.
 * Such values are read as wall time in `tz`, never shifted. A Z suffix means UTC and a
 * TZID means that zone; both are re-expressed in `tz`.
 *
 * This is the opposite of the GraphQL bookmark path (halo/normalize.ts), where bare
 * strings ARE UTC. Two paths, two rules. Do not merge them into one code path.
 */
export function parseIcsDate(v: IcsValue | null | undefined, tz: string): string | null {
  if (!v) return null;
  const m = DT.exec(v.value);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4]) return makeIso(date, '23:59', tz);
  const time = `${m[4]}:${m[5]}`;
  if (m[7]) return rezone(`${date}T${time}:${m[6] ?? '00'}Z`, tz);
  if (v.tzid) {
    try {
      return rezone(makeIso(date, time, v.tzid), tz);
    } catch {
      return makeIso(date, time, tz);
    }
  }
  return makeIso(date, time, tz);
}

/** DTSTAMP is UTC by the standard, with or without the Z. */
export function stampIso(v: IcsValue | null | undefined): string | null {
  if (!v) return null;
  const m = DT.exec(v.value);
  if (!m || !m[4]) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}.000Z`;
}

/** "Points: 10\nType: Assignment" → what the export says about the item. */
export function descriptionFields(d: string): { points: number | null; type: string | null; rest: string } {
  const pts = /points:\s*([\d.]+)/i.exec(d);
  const typ = /type:\s*([A-Za-z_ ]+)/i.exec(d);
  const rest = d
    .split('\n')
    .filter((l) => !/^\s*(points|type):/i.test(l))
    .join('\n')
    .trim();
  return {
    points: pts ? Number(pts[1]) : null,
    type: typ ? typ[1].trim().toUpperCase().replace(/\s+/g, '_') : null,
    rest,
  };
}

const CODE_PREFIX = /^([A-Z]{2,4})-?(\d{3})([A-Z])?\b[\s:–-]*/;
/** "CHM113 Prerequisite Concept Assignment" → title without the code, plus the code as a class hint. */
export function splitTitle(summary: string): { title: string; codeHint: string | null } {
  const m = CODE_PREFIX.exec(summary.trim());
  if (!m) return { title: summary.trim(), codeHint: null };
  const rest = summary.trim().slice(m[0].length).trim();
  if (!rest) return { title: summary.trim(), codeHint: null };
  return { title: rest, codeHint: `${m[1]}-${m[2]}${m[3] ?? ''}` };
}

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function jaccard(a: string, b: string): number {
  const A = new Set(a.split(' ').filter(Boolean));
  const B = new Set(b.split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / (A.size + B.size - n);
}

/** Best guess at which class a LOCATION means: exact name, then the code in the titles, then a close name. */
export function suggestCourse(location: string, codeHint: string | null, courses: Course[]): Course | null {
  const ln = normName(location);
  const exact = courses.find((c) => normName(c.name) === ln);
  if (exact) return exact;
  if (codeHint) {
    const byCode = courses.find((c) => normCode(c.code) === normCode(codeHint));
    if (byCode) return byCode;
  }
  let best: { c: Course; s: number } | null = null;
  for (const c of courses) {
    const s = jaccard(ln, normName(c.name));
    if (s >= 0.6 && s > (best?.s ?? 0)) best = { c, s };
  }
  return best?.c ?? null;
}

export interface IcsLocation {
  location: string;
  count: number;
  codeHint: string | null;
  sample: string;
}
/** The distinct LOCATION values in an export, with the most common code hint from their titles. */
export function icsLocations(file: IcsFile): IcsLocation[] {
  const m = new Map<string, { count: number; hints: Map<string, number>; sample: string }>();
  for (const e of file.events) {
    const loc = e.location || '(no class)';
    const cur = m.get(loc) ?? { count: 0, hints: new Map(), sample: e.summary };
    cur.count++;
    const { codeHint } = splitTitle(e.summary);
    if (codeHint) cur.hints.set(codeHint, (cur.hints.get(codeHint) ?? 0) + 1);
    m.set(loc, cur);
  }
  return [...m.entries()].map(([location, v]) => ({
    location,
    count: v.count,
    codeHint: [...v.hints.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    sample: v.sample,
  }));
}

/**
 * Events → the same payload shape the Halo diff understands, one "class" per LOCATION.
 * Due comes from DTEND (DTSTART is fifteen minutes earlier, a display artifact). Dates are
 * already zoned ISO here, so the diff never applies its bare-string rule to them.
 */
export function icsToExport(file: IcsFile, mapping: Record<string, string>, courses: Course[], tz: string, now = new Date().toISOString()): HaloExport {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const groups = new Map<string, HaloAssessment[]>();
  for (const e of file.events) {
    const loc = e.location || '(no class)';
    const course = byId.get(mapping[loc] ?? '');
    if (!course) continue;
    const { title } = splitTitle(e.summary);
    const dueAt = parseIcsDate(e.dtend ?? e.dtstart, tz);
    if (!dueAt) continue;
    const { points, type, rest } = descriptionFields(e.description);
    const hh = zonedParts(dueAt, tz).hh;
    const id = e.uid ?? `ics|${normTitle(title)}|${course.code}|${dateOf(dueAt, tz)}`;
    const a: HaloAssessment = {
      id,
      title,
      description: rest || null,
      unit: null,
      unitSequence: null,
      sequence: null,
      startDate: null,
      dueDate: dueAt,
      classDueDate: dueAt,
      points,
      type: type ?? 'ASSIGNMENT',
      tags: [],
      inPerson: !course.online && hh < 23,
      isGroupEnabled: false,
      requiresLopesWrite: false,
      status: null,
      submittedAt: null,
      score: null,
      url: e.url,
      rawDue: (e.dtend ?? e.dtstart)?.value ?? null,
    };
    groups.set(loc, [...(groups.get(loc) ?? []), a]);
  }
  const classes: HaloClass[] = [...groups.entries()].map(([loc, assessments]) => {
    const course = byId.get(mapping[loc])!;
    return {
      id: `ics:${loc}`,
      slugId: '',
      classCode: course.code,
      courseCode: course.code,
      name: loc,
      startDate: null,
      endDate: null,
      stage: 'CURRENT',
      modality: null,
      credits: null,
      assessments: assessments.sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? '')),
    };
  });
  return { kind: 'halo-export', version: 1, exportedAt: file.stamp ?? now, source: 'ics', classes };
}
