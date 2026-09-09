import type { Course } from '../domain/types';

/** Known GCU course codes: colors and meeting times. Editable in Settings after import. */
export const COURSE_DEFAULTS: Record<string, Partial<Course>> = {
  'CHM-113': {
    color: '#e05a4b',
    online: false,
    meetings: [
      { day: 3, start: '07:00', end: '08:15' },
      { day: 5, start: '07:00', end: '08:15' },
    ],
  },
  'CHM-113L': { color: '#ef9f2f', online: false, meetings: [{ day: 1, start: '18:00', end: '20:50' }] },
  'ENG-105': {
    color: '#3b82c4',
    online: false,
    meetings: [
      { day: 3, start: '11:00', end: '12:45' },
      { day: 5, start: '11:00', end: '12:45' },
    ],
  },
  'ESG-162': {
    color: '#2fa36b',
    online: false,
    meetings: [
      { day: 2, start: '07:00', end: '08:15' },
      { day: 4, start: '07:00', end: '08:15' },
    ],
  },
  'ESG-162L': { color: '#7c5cc4', online: false, meetings: [{ day: 2, start: '12:30', end: '14:20' }] },
  'UNV-106': { color: '#c93f8e', online: true, meetings: [] },
};

export const PALETTE = ['#e05a4b', '#ef9f2f', '#3b82c4', '#2fa36b', '#7c5cc4', '#c93f8e', '#1fa3a3', '#8a6d3b'];
