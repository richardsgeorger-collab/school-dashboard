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
  /** The letter scale this class is graded on, from Halo. */
  gradeScale?: { label: string; minPercent: number | null; maxPercent: number | null }[];
  /** Days the class does not meet, from Halo. */
  holidays?: { title: string; description: string | null; startDate: string | null; duration: number | null }[];
  /** What participation asks for, from Halo. */
  participation?: { description: string | null; days: number | null; posts: number | null } | null;
  termStart: DateStr;
  termEnd: DateStr;
  /** Where this class's items come from: the parser (default) or the AI pass, once it proved better. */
  /** Findings about the class that belong to no single assignment, including the ones that fit no category. */
  notes?: ClassNote[];
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
  /** The rubric Halo grades this against, criterion by criterion. Facts from the sync, never inferred. */
  rubric?: ItemRubric | null;
  /** What the instructor wrote about the submitted work, and which rubric level they picked. */
  feedback?: ItemFeedback | null;
  /** A quiz attempt: the score, and the questions as they were asked. */
  quiz?: ItemQuiz | null;
  /** Parts of this assignment, each with its own deadline and done state. Usually from an announcement. */
  requirements?: Requirement[];
  /** Set when an announcement, rather than the gradebook, is what put this on the calendar. */
  origin?: ReqSource;
  /** A date an announcement moved automatically. Shown struck through for a few days so the move is noticed. */
  dateChange?: { from: string; at: string; source: ReqSource };
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

/** Halo's own rubric for one assessment. */
/**
 * Where a requirement came from. At GCU the week's real instructions are posted in announcements and never reach the
 * assignment itself, so anything derived from one carries the post it came from and the sentence that said it.
 */
export interface ReqSource {
  kind: 'announcement' | 'syllabus' | 'lecture' | 'manual';
  /** The announcement id, so the requirement can link back to the post. */
  id: string | null;
  title: string | null;
  /** The professor's own words. Nothing is attached without them. */
  quote: string | null;
  /** When it was posted, for "said on the 14th, after the assignment was written". */
  at: string | null;
}

/**
 * One part of an assignment. An announcement routinely turns a single item into several steps with different
 * deadlines, so a requirement carries its own date and its own done state, and the item is not finished until every
 * graded one is.
 */
export interface Requirement {
  id: string;
  /** What to do, in the imperative. */
  text: string;
  /** Its own deadline when it has one, which is often not the assignment's. */
  dueAt: string | null;
  done: boolean;
  doneAt: string | null;
  /** Full credit depends on this. False for something worth knowing that is not itself graded. */
  gradedOn: boolean;
  /** Set when this changes what full credit means, rather than adding a step. */
  redefinesDone?: boolean;
  /** instance: a thing to do. rule: true all term, never dated. reference: worth knowing, not an action. */
  scope?: 'instance' | 'rule' | 'reference';
  /** Every post that said it. The same instruction arrives from several announcements in different wordings. */
  sources?: ReqSource[];
  source: ReqSource;
  addedAt: string;
}

/**
 * A finding that belongs to the class rather than to any one assignment, including anything that did not fit a
 * category. A finding that cannot be classified is still a finding and is never discarded.
 */
export interface ClassNote {
  id: string;
  text: string;
  source: ReqSource;
  addedAt: string;
  seenAt?: string | null;
}

export interface ItemRubric {
  id: string;
  name: string | null;
  criteria: { id: string; name: string; description: string | null; points: number | null; levels: { cellId: string; name: string | null; description: string | null; points: number | null }[] }[];
  at: string;
}

export interface ItemFeedback {
  comment: string | null;
  gradedAt: string | null;
  /** Per criterion: the level the instructor chose and anything they wrote. */
  criteria: { criteriaId: string; cellId: string | null; comment: string | null }[];
  files: { id: string; name: string }[];
  /** The student's own discussion post, when this assessment is one. */
  post?: { publishedAt: string; words: number | null } | null;
  at: string;
  /** Seen in this app, so a new comment can be quiet after the first read. */
  seenAt?: string | null;
}

export interface ItemQuiz {
  userQuizId: string;
  finalScore: number | null;
  answered: number | null;
  correct: number | null;
  incorrect: number | null;
  submittedAt: string | null;
  questions: { id: string; type: string | null; content: string; chosen: string[] }[];
  at: string;
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
  rubrics?: string | null;
  feedback?: string | null;
  resources?: string | null;
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
  /** What the last Halo sync actually brought back, kept so the answer outlives the review screen. */
  lastPull?: { at: string; build: string | null; counts: Record<string, number> };
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
  theme: 'light',
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
