import type { SVGProps } from 'react';

const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const IconHome = () => (
  <svg {...base}>
    <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" />
  </svg>
);
export const IconCalendar = () => (
  <svg {...base}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </svg>
);
export const IconLoad = () => (
  <svg {...base}>
    <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
  </svg>
);
export const IconGrades = () => (
  <svg {...base}>
    <path d="M12 3 2 8l10 5 10-5-10-5z" />
    <path d="M6 10.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-5.5" />
  </svg>
);
export const IconSettings = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);
export const IconNow = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
export const IconCheck = () => (
  <svg {...base} strokeWidth={3} width="14" height="14">
    <path d="M5 12.5 10 17 19 7" />
  </svg>
);
export const IconClose = () => (
  <svg {...base} width="20" height="20">
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const IconPlus = () => (
  <svg {...base} width="18" height="18">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconRecord = () => (
  <svg {...base}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
  </svg>
);
