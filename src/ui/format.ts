import { dateOf, diffDays, fmtDate, fmtMinutes, fmtTime } from '../domain/dates';
import type { DateStr, Item } from '../domain/types';

export function relativeDay(today: DateStr, d: DateStr): string {
  const n = diffDays(today, d);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n < 0) return `${-n} days ago`;
  if (n < 7) return fmtDate(d, 'long').split(',')[0];
  return `in ${n} days`;
}

export function dueLabel(item: Item, tz: string, today: DateStr): string {
  const d = dateOf(item.dueAt, tz);
  const time = fmtTime(item.dueAt, tz);
  const rel = relativeDay(today, d);
  const showTime = time !== '11:59 PM';
  return `${rel === fmtDate(d, 'long').split(',')[0] ? rel : rel}, ${fmtDate(d, 'short')}${showTime ? ` ${time}` : ''}`;
}

export function hours(min: number): string {
  return fmtMinutes(min);
}

export function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
