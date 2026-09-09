import type { Course } from '../domain/types';

/** Known GCU course codes: colors and meeting times. Editable in Settings after import. */
export const COURSE_DEFAULTS: Record<string, Partial<Course>> = {
  'CHM-113': {
    color: '#D95D39',
    online: false,
    meetings: [
      { day: 3, start: '07:00', end: '08:15' },
      { day: 5, start: '07:00', end: '08:15' },
    ],
  },
  'CHM-113L': { color: '#2F6FDB', online: false, meetings: [{ day: 1, start: '18:00', end: '20:50' }] },
  'ENG-105': {
    color: '#1F9E89',
    online: false,
    meetings: [
      { day: 3, start: '11:00', end: '12:45' },
      { day: 5, start: '11:00', end: '12:45' },
    ],
  },
  'ESG-162': {
    color: '#7A5AD0',
    online: false,
    meetings: [
      { day: 2, start: '07:00', end: '08:15' },
      { day: 4, start: '07:00', end: '08:15' },
    ],
  },
  'ESG-162L': { color: '#C9459A', online: false, meetings: [{ day: 2, start: '12:30', end: '14:20' }] },
  'UNV-106': { color: '#B8860B', online: true, meetings: [] },
};

/** Validated categorical order (light surface). Assign in this order, never cycle. */
export const PALETTE = ['#D95D39', '#2F6FDB', '#1F9E89', '#7A5AD0', '#C9459A', '#B8860B', '#5A6B7C', '#8A5A2B'];

/** Dark-surface counterparts, validated against #171B21. */
export const DARK_VARIANT: Record<string, string> = {
  '#D95D39': '#D4603A',
  '#2F6FDB': '#3B78E0',
  '#1F9E89': '#1E9A85',
  '#7A5AD0': '#7F62D6',
  '#C9459A': '#C2479A',
  '#B8860B': '#A8800F',
};

export function courseColor(hex: string, dark: boolean): string {
  return dark ? DARK_VARIANT[hex.toUpperCase()] ?? DARK_VARIANT[hex] ?? hex : hex;
}
