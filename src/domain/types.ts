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
  /** Where this class's items come from: the parser (default) or the AI pass, once it proved better. */
  ingest?: 'parser' | 'ai';
  /** The class's topics in syllabus order and what each builds on, from the AI pass. */
  topics?: TopicNode[];
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
  /** Where the score came from: Halo's gradebook, or typed as an override. */
  scoreSource?: 'halo' | 'manual' | null;
  award: Award | null;
  /** "Not this one": kept out of the top of Now until this date. */
  snoozedUntil?: DateStr | null;
  /** Items this one gates: a small task that carries the urgency of what it unlocks. */
  blocks?: string[];
  /** Halo flags this late or missing even though it looks done here; a note to check, never auto-resolved. */
  haloLate?: string | null;
  /** What Halo last said about this item: its submission state, straight from the gradebook. Written on every sync, never approved, never changes the planner. */
  halo?: HaloFact | null;
  /** The steps inside a big assignment. One item everywhere; this is just its inside. */
  steps?: Step[];
  /** What the assignment asks for, read from its description and rubric. */
  brief?: Brief | null;
  /** The AI pass's read of this item, once applied. Raw Halo data never lives here. */
  plan?: ItemPlan | null;
  /** Start-by the AI reasoned and the user accepted. A user's startByOverride still wins. */
  startByPlan?: DateStr | null;
  /** AI suggestions the user turned down; never suggested again. */
  planDeclined?: PlanField[];
  /** Waiting on someone or something else. Leaves Now until `until`; never counts as late while it stands. */
  blocked?: Block | null;
  /** The tailored half of the paste-into-Claude prompt, from the ingestion pass. */
  handoff?: Handoff | null;
  /** When Start was pressed on Now, so Done can log the real time without asking. */
  startedAt?: string | null;
  updatedAt: string;
}

export interface TimingEntry {
  itemId: string;
  courseId: string;
  type: ItemType;
  minutes: number;
  at: string;
}

export interface BankedAward {
  itemId: string;
  courseId: string;
  label: string;
  dueAt: string;
  points: number;
  completedAt: string;
  award: Award;
}

export interface HaloFact {
  /** UPCOMING | ACTIVE | IN_PROGRESS | SUBMITTED | LATE | OVERDUE | REASSIGNED | PUBLISHED, or null when Halo gave none. */
  status: string | null;
  submittedAt: string | null;
  /** When the sync that carried this ran. */
  checkedAt: string;
}

export interface Step {
  id: string;
  label: string;
  done: boolean;
}

export interface Brief {
  /** What it asks for, in plain words, two to five lines. */
  asks: string[];
  /** What earns points. */
  rubric: { criterion: string; points: number | null; how: string }[];
  /** The milestones the rubric implies. */
  steps: string[];
  at: string;
  source: 'claude' | 'local' | 'plan';
}

export type Confidence = 'high' | 'medium' | 'low';

/** A value the AI reasoned out, with its reason and how sure it was. */
export interface Reasoned<T> {
  value: T;
  why: string;
  confidence: Confidence;
}

export interface PlanSource {
  kind: 'slide' | 'recording' | 'syllabus' | 'halo' | 'rubric';
  /** "Stoichiometry.pptx, slides 4–9" or "Lecture Sep 12, 14:32". */
  label: string;
  href: string | null;
}

export interface PlanPrerequisite {
  /** "Claim a topic in the Chemistry Connections forum." */
  text: string;
  /** Where it was said: "announcement Sep 5", "syllabus", "Halo description". */
  source: string;
  /** The planner item that is the prerequisite, when it is one. */
  itemId: string | null;
}

/** What the AI pass understood about one assignment. Every field says where it came from; none of it is Halo's raw data. */
export interface ItemPlan {
  /** What it actually asks for, one to three plain lines. */
  asks: string;
  startBy: Reasoned<DateStr> | null;
  minutes: Reasoned<number> | null;
  /** Milestones the rubric implies, in order. */
  milestones: string[];
  prerequisites: PlanPrerequisite[];
  flags: { lopesWrite: boolean; timed: boolean; group: boolean; inPerson: boolean };
  /** Concepts this work is about, a few words each. */
  topics: string[];
  /** The later item this one feeds (a draft's final), by item id. */
  feeds: string | null;
  /** Slides, readings, recordings that cover it. */
  sources: PlanSource[];
  /** Where the reasoning came from, one line each. */
  citations: string[];
  model: string;
  at: string;
  /** Hash of the inputs it was reasoned from. */
  inputHash: string;
  /** The pass found this item outside Halo (syllabus, announcement, lecture); it is not one of Halo's rows. */
  found?: boolean;
}

export interface TopicNode {
  name: string;
  week: number | null;
  /** Earlier topics this one assumes, by name. */
  buildsOn: string[];
}

/** One idea that appears in two classes under two names: the math topic the chemistry work leans on. */
export interface TopicLink {
  a: { courseId: string; topic: string };
  b: { courseId: string; topic: string };
  /** What carries over, one sentence. */
  note: string;
}

/** The tailored half of the paste-into-Claude prompt, written per assignment during ingestion. */
export interface Handoff {
  /** What kind of work it is, in its own terms: "a piece of writing graded on the thinking in it". */
  kind: string;
  /** The setup to ask Claude for, specific to this assignment. */
  build: string[];
  /** What Claude must not produce for this one, named concretely. */
  withhold: string[];
  /** The format rules that constrain it: word count, style, sources, LopesWrite. */
  format: string[];
  model: string;
  at: string;
}

export type BlockReason = 'partner' | 'feedback' | 'materials' | 'instructor' | 'other';

/** Cannot be done yet, for a reason outside the student: not a snooze, not a skip. It leaves Now until the blocker plausibly clears. */
export interface Block {
  reason: BlockReason;
  note: string;
  since: string;
  /** The day it comes back to Now on its own. */
  until: DateStr;
}

export type PlanField = 'startBy' | 'minutes' | 'steps';

export interface TermWeekPlan {
  start: DateStr;
  load: 'brutal' | 'heavy' | 'normal' | 'light';
  why: string;
}

export interface TermChain {
  /** Item ids: from feeds into to. */
  from: string;
  to: string;
  why: string;
}

/** The AI's read of the whole term across every class. */
export interface TermPlan {
  weeks: TermWeekPlan[];
  chains: TermChain[];
  model: string;
  at: string;
  inputHash: string;
}

/** What the last bookmark run actually brought back for one class. */
export interface HaloPull {
  assessments?: string | null;
  grades?: string | null;
  announcements?: string | null;
}

export interface HaloCheckRecord {
  at: string;
  clean: boolean;
  findings: number;
  /** The class audited. Absent on checks recorded before audits ran one class at a time. */
  courseId?: string | null;
  /** Coverage fell short: no coverage count, pages skipped, or the run stopped early. */
  partial?: boolean;
  coverage?: { visited: number; planned: number } | null;
  skipped?: string[];
}

export interface QuizStat {
  courseId: string;
  topic: string;
  attempts: number;
  misses: number;
  lastAt: string;
}

export interface SundayReviewState {
  skips: number;
  lastOffered: string | null;
  lastDone: string | null;
  off?: boolean;
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
  /** Real minutes logged per item, kept here so a class reset does not lose them. */
  timings?: TimingEntry[];
  /** Awards of items that were deleted after being done, so XP and streaks survive a reset. */
  bankedAwards?: BankedAward[];
  /** Editable template for the Check Halo prompt; the planner's item list is appended when copied. */
  haloAuditPrompt?: string | null;
  /** First word of a file name → course id, remembered from the Library's top-level drop zone. */
  materialsNameMap?: Record<string, string>;
  /** Check Halo results, oldest first, capped. */
  haloChecks?: HaloCheckRecord[];
  /** Practice results per class and topic. */
  quizStats?: Record<string, QuizStat>;
  sundayReview?: SundayReviewState;
  /** Off by default: after 9 PM, Now stops nudging unless something is overdue. */
  eveningQuiet?: boolean;
  /** The AI's read of the term across all classes, from the last term pass. */
  termPlan?: TermPlan | null;
  /** Topics that overlap across classes, from the links pass. */
  topicLinks?: TopicLink[];
  /** Off by default: one flashcard from the student's own study kit on a quiet day. */
  dailyQuestion?: boolean;
  /**
   * When each kind of Halo data was last pulled, per class. A clean screen has to be backed by a pull; a class with
   * nothing here has not been synced, which is not the same as having nothing due.
   */
  haloPulls?: Record<string, HaloPull>;
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
