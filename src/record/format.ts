import { fmtDate } from '../domain/dates';
import type { DateStr } from '../domain/types';
import { BITRATE } from './support';

const pad = (n: number) => String(n).padStart(2, '0');

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(n < 10 * 1024 ** 2 ? 1 : 0)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}

/** m:ss under an hour, h:mm:ss above. */
export function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Hours of lecture audio that fit in `freeBytes` at the recording bitrate. */
export function hoursOfAudio(freeBytes: number, bitrate = BITRATE): number {
  return freeBytes / (bitrate / 8) / 3600;
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Up to `max` windows of text around case-insensitive hits of `query`. */
export function snippets(text: string, query: string, radius = 60, max = 3): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const lower = text.toLowerCase();
  const out: string[] = [];
  let from = 0;
  while (out.length < max) {
    const i = lower.indexOf(q, from);
    if (i < 0) break;
    const a = Math.max(0, i - radius);
    const b = Math.min(text.length, i + q.length + radius);
    out.push(`${a > 0 ? '…' : ''}${text.slice(a, b).replace(/\s+/g, ' ')}${b < text.length ? '…' : ''}`);
    from = i + q.length;
  }
  return out;
}

const MIME_BY_EXT: Record<string, string> = { m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', wav: 'audio/wav', webm: 'audio/webm', ogg: 'audio/ogg', oga: 'audio/ogg', caf: 'audio/x-caf' };
/** The file's own type when the browser knows it, else by extension. */
export function audioMime(name: string, declared?: string): string {
  if (declared && declared.startsWith('audio/')) return declared;
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return MIME_BY_EXT[ext] ?? 'audio/mpeg';
}
export const isAudioFile = (name: string, declared?: string): boolean => (declared ?? '').startsWith('audio/') || /\.(m4a|mp4|aac|mp3|wav|webm|ogg|oga|caf)$/i.test(name);

/** "CHM-113 — Sep 15" */
export const memoTitle = (courseCode: string, day: DateStr): string => `${courseCode} — ${fmtDate(day, 'short')}`;
