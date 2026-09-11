import type { HaloExport } from './types';

export const HALO_ORIGIN = 'https://halo.gcu.edu';

export function isHaloExport(x: unknown): x is HaloExport {
  if (!x || typeof x !== 'object') return false;
  const p = x as Record<string, unknown>;
  if (p.kind !== 'halo-export' || p.version !== 1 || typeof p.exportedAt !== 'string' || !Array.isArray(p.classes)) return false;
  return p.classes.every((c) => {
    if (!c || typeof c !== 'object') return false;
    const k = c as Record<string, unknown>;
    return typeof k.id === 'string' && typeof k.courseCode === 'string' && Array.isArray(k.assessments);
  });
}

/** Text from the paste box → payload, with a plain-language error. */
export function parseHaloExport(text: string): HaloExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, '').trim());
  } catch {
    throw new Error('That is not JSON. Copy the whole export from the Halo bookmark and paste it here.');
  }
  if (!isHaloExport(parsed)) throw new Error('That JSON is not a Halo export from the bookmark.');
  return { ...parsed, source: parsed.source === 'bookmarklet' ? 'bookmarklet' : 'paste' };
}

/** A message from the Halo tab, only if it came from Halo and looks like an export. */
export function acceptHandoff(msg: { origin: string; data: unknown }, allowedOrigins: readonly string[] = [HALO_ORIGIN]): HaloExport | null {
  if (!allowedOrigins.includes(msg.origin)) return null;
  return isHaloExport(msg.data) ? msg.data : null;
}

const LAST_KEY = 'school-dashboard:halo-last-sync';
export interface LastSync {
  at: string;
  added: number;
  changed: number;
  removed: number;
  completed: number;
}
export function loadLastSync(): LastSync | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? (JSON.parse(raw) as LastSync) : null;
  } catch {
    return null;
  }
}
export function saveLastSync(s: LastSync): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable */
  }
}
