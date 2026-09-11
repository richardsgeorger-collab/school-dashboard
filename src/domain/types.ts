export type ItemType =
  | 'exam'
  | 'quiz'
  | 'homework'
  | 'lab'
  | 'paper'
  | 'project'
  | 'discussion'
  | 'participation'
  | 'other';

export type ItemStatus = 'todo' | 'in_progress' | 'done';

export type Risk = 'overdue' | 'at_risk' | 'due_soon' | 'start_today' | null;

/** Calendar date in the settings time zone, formatted YYYY-MM-DD. */
export type DateStr = string;

export interface Meeting {
  day: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday
  start: string; // HH:mm
  end: string; // HH:mm
  location?: string;
}

export interface Instructor {
  name: string;
  email: string;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  color: string;
  credits: number;
  instructors: Instructor[];
  meetings: Meeting[];
  online: boolean;
  /** Set when the class is linked to Halo. */
  haloSlugId?: string | null;
  haloClassId?: string | null;
  termStart: DateStr;
  termEnd: DateStr;
  updatedAt: string;
}

export interface ItemFlags {
  inClass: boolean;
  group: boolean;
  lopesWrite: boolean;
  timed: boolean;
  practice: boolean;
}

/** Points locked at first completion. Value = base × multiplier × (scoreFactor ?? 1). */
export interface Award {
  base: number;
  multiplier: 1.5 | 1 | 0.5;
  earnedAt: string;
  scoreFactor: number | null;
}

export interface Item {
  id: string;
  courseId: string;
  title: string;
  /** Short generated label, e.g. "Chem Quiz 1". Primary text everywhere. */
  label: string;
  labelOverridden: boolean;
  type: ItemType;
  points: number;
  opensAt: string | null; // ISO with offset
  dueAt: string; // ISO with offset
  estimatedMinutes: number;
  estimateOverridden: boolean;
  startByOverride: DateStr | null;
  status: ItemStatus;
  completedAt: string | null;
  score: number | null;
  notes: string;
  topic: string | null;
  flags: ItemFlags;
  source: 'parsed' | 'manual' | 'halo' | 'ics';
  /** Halo assessment id, set once an item is linked to Halo. */
  haloId?: string | null;
  /** Calendar-export UID, set when the item came from or matched an .ics import. */
  icsUid?: string | null;
  /** Link into Halo when the export carried one. */
  url?: string | null;
  /** Minutes it actually took, from the after-done prompt. */
  actualMinutes?: number | null;
  award: Award | null;
  /** "Not this one": kept out of the top of Now until this date. */
  snoozedUntil?: DateStr | null;
  updatedAt: string;
}

export interface Settings {
  timezone: string;
  weekdayMinutes: number;
  weekendMinutes: number;
  theme: 'system' | 'light' | 'dark';
  weekStartsOn: 0 | 1;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  /** LOCATION text in .ics exports → course id, as confirmed by the user. */
  icsClassMap?: Record<string, string>;
  /** Last assignments import: when it was applied, and the export's own timestamp. */
  syncedAt?: string | null;
  syncStamp?: string | null;
  updatedAt: string;
}

export interface AppData {
  courses: Course[];
  items: Item[];
  settings: Settings;
}

export const DEFAULT_SETTINGS: Settings = {
  timezone: 'America/Phoenix',
  weekdayMinutes: 180,
  weekendMinutes: 300,
  theme: 'system',
  weekStartsOn: 0,
  supabaseUrl: null,
  supabaseAnonKey: null,
  updatedAt: '2026-09-09T00:00:00-07:00',
};

export const ITEM_TYPES: ItemType[] = [
  'exam',
  'quiz',
  'homework',
  'lab',
  'paper',
  'project',
  'discussion',
  'participation',
  'other',
];

export const TYPE_LABELS: Record<ItemType, string> = {
  exam: 'Exam',
  quiz: 'Quiz',
  homework: 'Homework',
  lab: 'Lab',
  paper: 'Paper',
  project: 'Project',
  discussion: 'Discussion',
  participation: 'Participation',
  other: 'Other',
};

export const DEFAULT_FLAGS: ItemFlags = {
  inClass: false,
  group: false,
  lopesWrite: false,
  timed: false,
  practice: false,
};
