import type { SVGProps } from 'react';

/**
 * One icon set, one stroke, and every icon carries its own size. An unsized SVG grows to whatever holds it, which is
 * how a clock once filled a screen. Rows use 20, headers 24; nothing goes over 48 (scripts/check-icons.mjs).
 */
export interface IconProps {
  size?: number;
}
const base: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  'data-icon': '',
} as SVGProps<SVGSVGElement>;

export const IconHome = ({ size = 20 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" />
  </svg>
);
export const IconCalendar = ({ size = 20 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </svg>
);
export const IconLoad = ({ size = 20 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
  </svg>
);
export const IconGrades = ({ size = 20 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <path d="M12 3 2 8l10 5 10-5-10-5z" />
    <path d="M6 10.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-5.5" />
  </svg>
);
export const IconNews = ({ size = 20 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <path d="M4 5h11a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2Z" />
    <path d="M16 8h3a1 1 0 0 1 1 1v8a2 2 0 0 1-2 2" />
    <path d="M7 8.5h5M7 12h5M7 15.5h3" />
  </svg>
);

export const IconSettings = ({ size = 20 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);
export const IconNow = ({ size = 20 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
export const IconCheck = ({ size = 14 }: IconProps = {}) => (
  <svg {...base} strokeWidth={3} width={size} height={size}>
    <path d="M5 12.5 10 17 19 7" />
  </svg>
);
export const IconClose = ({ size = 20 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const IconPlus = ({ size = 18 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconRecord = ({ size = 20 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
  </svg>
);
export const IconSync = ({ size = 20 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <path d="M20 12a8 8 0 0 1-14.5 4.6M4 12a8 8 0 0 1 14.5-4.6" />
    <path d="M18.5 3.5v4h-4M5.5 20.5v-4h4" />
  </svg>
);
export const IconOkay = ({ size = 20 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </svg>
);
export const IconCheckHalo = ({ size = 20 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <path d="M4 6h9M4 12h9M4 18h6" />
    <path d="m14 15 2.5 2.5L21 13" />
  </svg>
);
export const IconLibrary = ({ size = 20 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <path d="M4 5h4v15H4zM10 5h4v15h-4z" />
    <path d="m16 6 3.5-1 3.5 13.5-3.5 1z" />
  </svg>
);
export const IconClasses = ({ size = 20 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 16.5z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h4.5a1.5 1.5 0 0 0 1.5-1.5z" />
  </svg>
);
export const IconInbox = ({ size = 20 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <path d="M4 13.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3.5" />
    <path d="M4 13.5h4l1.5 2.5h5l1.5-2.5h4" />
    <path d="M6.5 13.5 8 6h8l1.5 7.5" />
  </svg>
);
export const IconYou = ({ size = 20 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 19.5a7 7 0 0 1 14 0" />
  </svg>
);
export const IconSun = ({ size = 20 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
  </svg>
);
export const IconMoon = ({ size = 20 }: IconProps = {}) => (
  <svg {...base} width={size} height={size}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </svg>
);
/**
 * The Halo+ mark: a halo drawn as an open ring, and the plus that completes it, sitting in the gap in gold.
 * The same drawing is public/icon.svg (the app icon) and the landing page's mark.
 */
export const IconHalo = ({ size = 24 }: IconProps = {}) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden data-icon="" width={size} height={size}>
    <path d="M19.73 9.93A8 8 0 1 1 14.07 4.27" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M17.66 3.5v5.7M14.8 6.35h5.7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);
