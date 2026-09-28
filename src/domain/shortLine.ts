import { dateOf, fmtDate, fmtTime } from './dates';

/**
 * One checklist line, readable at a glance: a plain to-do of about ten words. The reader is asked for exactly that;
 * this is the check in code, and it also tidies every line stored before the reader was asked. It removes what a
 * glance never needs (file names, quoted paragraphs, "per the announcement", anything in brackets) and cuts at a
 * clause boundary rather than mid-thought. The explanation and the post keep the rest one tap away.
 */
export const LINE_WORDS = 10;
const DETAIL_SENTENCES = 3;
const DETAIL_WORDS = 70;

// File names, simple token shapes only (no nested quantifiers): a quoted name ending in an extension, a bare
// name.ext, and the underscore/slash names professors give templates (Connections_Essay_Guide, APA_Guide/APA_Template).
const QUOTED_FILE = /['"‘“][^'"‘’“”\n]{1,80}?\.(?:docx?|pdf|pptx?|xlsx?|csv|zip|txt|m|py|png|jpe?g)['"’”]/gi;
const BARE_FILE = /\b[\w-]+\.(?:docx?|pdf|pptx?|xlsx?|csv|zip|txt|m|py|png|jpe?g)\b/gi;
const UNDERSCORE = /\b\w+_[\w/_]+\b/g;
const QUOTED = /['"‘“][^'"‘’“”\n]{60,400}['"’”]/g;
const FILES = /(?:(?:the|attached)\s+)*\uE000(?:\s*(?:,|and|&)\s*(?:(?:the|attached)\s+)*\uE000)*/g;
const BRACKETS = /\s*[([][^)\]]*[)\]]/g;
const FILLER = /\b(?:per|as stated in|as mentioned in|according to|as noted in|as described in) (?:the|this|last week'?s|today'?s) (?:announcement|post|instructions?|professor'?s? (?:announcement|post))\b[,:]?\s*/gi;
const LEAD = /^(?:note|reminder|important|fyi|please note)\s*[:,-]\s*/i;
const TRAIL_STOP = new Set(['to', 'and', 'the', 'of', 'a', 'an', 'by', 'in', 'for', 'with', 'or', 'on', 'at', 'as', 'from', 'your', 'that', 'this', 'is', 'be']);

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').replace(/[\s,;:—–-]+$/, '').replace(/…$/, '').trim();

/** Too long to read at a glance: the reader is asked to shorten it again. */
export const tooLong = (line: string): boolean => words(line).length > LINE_WORDS;

/** What a glance never needs, removed, but nothing cut: the form sent back to the reader for a shorter rewrite. */
export function cleanLine(text: string): string {
  let s = (text ?? '').trim();
  s = s.replace(LEAD, '').replace(FILLER, '').replace(QUOTED_FILE, '\uE000').replace(BARE_FILE, '\uE000').replace(UNDERSCORE, '\uE000').replace(QUOTED, 'the post').replace(BRACKETS, '');
  s = s.replace(FILES, (m) => ((m.match(/\uE000/g) ?? []).length > 1 ? 'the files' : 'the file'));
  s = tidy(s);
  const first = s.split(/(?<=[.!?])\s+(?=[A-Z])/)[0] ?? s;
  s = tidy(first.replace(/[.!?]$/, ''));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function shortLine(text: string): string {
  let s = (text ?? '').trim();
  if (!s) return '';
  s = s.replace(LEAD, '').replace(FILLER, '').replace(QUOTED_FILE, '\uE000').replace(BARE_FILE, '\uE000').replace(UNDERSCORE, '\uE000').replace(QUOTED, 'the post').replace(BRACKETS, '');
  s = s.replace(FILES, (m) => ((m.match(/\uE000/g) ?? []).length > 1 ? 'the files' : 'the file'));
  s = tidy(s);
  // First sentence only: the second is always the detail.
  const first = s.split(/(?<=[.!?])\s+(?=[A-Z])/)[0] ?? s;
  s = tidy(first.replace(/[.!?]$/, ''));
  if (words(s).length > LINE_WORDS) {
    // Cut at the latest clause break that still leaves a whole instruction of three words or more.
    const breaks = [...s.matchAll(/\s[—–-]\s|;\s|:\s|,\s|\s(?:so that|so|because|which|where|using|including|since|then)\s/g)].map((m) => m.index ?? 0);
    const fit = breaks.filter((i) => words(s.slice(0, i)).length >= 3 && words(s.slice(0, i)).length <= LINE_WORDS).pop();
    s = fit !== undefined ? tidy(s.slice(0, fit)) : s;
  }
  // Last resort, for a line the reader never shortened: keep a couple of words over rather than end mid-phrase.
  let w = words(s);
  if (w.length > LINE_WORDS + 2) {
    w = w.slice(0, LINE_WORDS + 2);
    while (w.length > 3 && TRAIL_STOP.has(w[w.length - 1].toLowerCase().replace(/[^a-z]/g, ''))) w.pop();
    s = tidy(w.join(' '));
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The explanation under a line: two or three plain sentences at most. */
export function clampDetail(text: string | null | undefined): string {
  const s = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const sentences = s.split(/(?<=[.!?])\s+/).slice(0, DETAIL_SENTENCES).join(' ');
  const w = words(sentences);
  return w.length > DETAIL_WORDS ? `${w.slice(0, DETAIL_WORDS).join(' ').replace(/[,;:]$/, '')}.` : sentences;
}

/**
 * The explanation shown on tap. The reader's own when it wrote one; for a line stored before that, the full
 * instruction it was cut from, plus its own date when it has one.
 */
export function detailFor(r: { text: string; detail?: string | null; dueAt?: string | null }, tz: string): string {
  const own = clampDetail(r.detail);
  const date = r.dueAt ? `Due ${fmtDate(dateOf(r.dueAt, tz), 'long')}, ${fmtTime(r.dueAt, tz)}.` : '';
  // Three sentences in all: when the date is added, the explanation gives up its third.
  if (own) return date && !/\b(?:due|by|before)\b/i.test(own) ? `${own.split(/(?<=[.!?])\s+/).slice(0, DETAIL_SENTENCES - 1).join(' ')} ${date}` : own;
  const full = clampDetail(r.text.replace(/…$/, ''));
  const body = full && full !== shortLine(r.text) ? (/[.!?]$/.test(full) ? full : `${full}.`) : '';
  return [body, date].filter(Boolean).join(' ');
}
