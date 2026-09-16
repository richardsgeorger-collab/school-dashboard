import type Anthropic from '@anthropic-ai/sdk';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { recordUsage } from '../ai/usage';
import type { Course, DateStr, Item } from '../domain/types';
import type { Confidence, LectureKnowledge, LectureNotes, Mention, MentionKind } from './notes';

/** The user asked for this model for the after-lecture pass. */
export const NOTES_MODEL = 'claude-sonnet-4-6';
const MAX_TRANSCRIPT_CHARS = 80_000;

/**
 * Not strict. This schema grew when the lecture pass started capturing what was stressed and what was called exam
 * material, and a strict schema is compiled into a decoding grammar with a size ceiling. notesFromTool validates every
 * field anyway, so the grammar bought nothing and could only fail.
 */
export const NOTES_TOOL = {
  name: 'lecture_notes',
  description: 'From a lecture transcript: a short summary, the concepts covered, every mention of a date or assignment, what the professor stressed, what was called exam material, which slides got the time, and the terms introduced.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'concepts', 'mentions', 'emphasized', 'exam_flags', 'dwelt', 'skipped', 'terms'],
    properties: {
      summary: { type: 'array', items: { type: 'string' }, description: 'At most five short bullets in plain words.' },
      concepts: { type: 'array', items: { type: 'string' }, description: 'Concepts covered, a few words each.' },
      mentions: {
        type: 'array',
        description: 'Every mention of a date, deadline, exam, quiz, or assignment. Empty when there are none.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['quote', 'kind', 'title', 'date', 'time', 'points', 'confidence', 'itemId'],
          properties: {
            quote: { type: 'string', description: 'The transcript words, verbatim.' },
            kind: { type: 'string', description: 'new, date_change, cancel, or info.' },
            title: { type: 'string', description: 'What it is about, e.g. "Quiz 2" or "Chapter 4 reading check".' },
            date: { type: ['string', 'null'], description: 'Absolute date YYYY-MM-DD resolved from the lecture date, or null.' },
            time: { type: ['string', 'null'], description: 'HH:mm in 24-hour time when said or implied, or null.' },
            points: { type: ['number', 'null'] },
            confidence: { type: 'string', description: 'high, medium, or low.' },
            itemId: { type: ['string', 'null'], description: 'The id of the planner item this refers to, from the list given, or null.' },
          },
        },
      },
      emphasized: {
        type: 'array',
        description: 'What the professor stressed, repeated, or said mattered. Empty when nothing stood out.',
        items: { type: 'object', additionalProperties: false, required: ['point', 'quote', 'at'], properties: { point: { type: 'string', description: 'The point, in a few plain words.' }, quote: { type: 'string', description: 'The transcript words, verbatim.' }, at: { type: 'string', description: 'The [mm:ss] marker before those words, or an empty string when the transcript has no markers.' } } },
      },
      exam_flags: {
        type: 'array',
        description: 'Anything said to be on a test, quiz, or exam, or that students "will see again". Empty when nothing was said.',
        items: { type: 'object', additionalProperties: false, required: ['point', 'quote', 'at'], properties: { point: { type: 'string' }, quote: { type: 'string' }, at: { type: 'string' } } },
      },
      dwelt: {
        type: 'array',
        description: 'When a slide outline is given: the slides that got the most time, by number. Empty otherwise.',
        items: { type: 'object', additionalProperties: false, required: ['slide', 'title', 'why'], properties: { slide: { type: ['integer', 'null'] }, title: { type: 'string' }, why: { type: 'string', description: 'What was done with it, a few words.' } } },
      },
      skipped: {
        type: 'array',
        description: 'When a slide outline is given: slides skipped or barely touched. Empty otherwise.',
        items: { type: 'object', additionalProperties: false, required: ['slide', 'title', 'why'], properties: { slide: { type: ['integer', 'null'] }, title: { type: 'string' }, why: { type: 'string' } } },
      },
      terms: {
        type: 'array',
        description: 'New terms introduced, with the meaning the professor gave.',
        items: { type: 'object', additionalProperties: false, required: ['term', 'meaning'], properties: { term: { type: 'string' }, meaning: { type: 'string' } } },
      },
    },
  },
} as const;

const SYSTEM = `You turn a rough, machine-made transcript of a college lecture into notes for the student who recorded it. The transcript has recognition errors; read through them.
Rules:
- Summary: at most five bullets, plain words, what was taught.
- Concepts: short phrases.
- Mentions: every time the instructor refers to a date, deadline, exam, quiz, homework, reading, or a change to one. Quote the transcript verbatim.
- Resolve relative dates against the lecture date given: "Friday" is the next Friday after the lecture date, "before Wednesday's class" is that Wednesday at the class start time, "next week" is the following week.
- kind: date_change when an existing deadline moves; new when something is assigned that is not in the planner list; cancel when something is dropped; info when a date is confirmed or only mentioned.
- When a mention is about one of the planner items listed, set itemId to that item's id.
- Prefer fewer, surer mentions. Mark confidence low when the audio is unclear.
- Stressed: what the professor repeated, slowed down for, or said mattered. Quote the words and give the [mm:ss] marker that precedes them when the transcript carries markers.
- Exam flags: anything said to be on a test, quiz, or exam, or that "you will see again". Quote it. Professors say this constantly; catch every one.
- When a slide outline is given, say which slides got the most time and which were skipped or barely touched, by slide number. When no outline is given, leave both empty.
- Terms: new terms introduced, with the meaning the professor gave, in their words.
Answer only through the lecture_notes tool.`;

export interface NotesArgs {
  course: Course;
  lectureDate: DateStr;
  items: Item[];
  /** The transcript, with [mm:ss] markers per stretch when the recording has timings. */
  transcript: string;
  tz: string;
  /** The deck used that day, as numbered first lines, so the pass can say which slides got the time. */
  deckOutline?: { deckId: string; title: string; lines: string[] } | null;
}

export function buildNotesPrompt({ course, lectureDate, items, transcript, tz, deckOutline }: NotesArgs): { system: string; user: string } {
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(`${lectureDate}T12:00:00`).getDay()];
  const meets = course.meetings.length ? course.meetings.map((m) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][m.day]} ${m.start}`).join(', ') : 'online';
  const open = items
    .filter((i) => i.courseId === course.id && i.status !== 'done' && dateOf(i.dueAt, tz) >= lectureDate)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
    .slice(0, 60)
    .map((i) => `${i.id} · ${i.label} · ${i.title} · due ${fmtDate(dateOf(i.dueAt, tz), 'short')} ${fmtTime(i.dueAt, tz)}`)
    .join('\n');
  const body = transcript.length > MAX_TRANSCRIPT_CHARS ? `${transcript.slice(0, MAX_TRANSCRIPT_CHARS)}\n[transcript truncated]` : transcript;
  return {
    system: SYSTEM,
    user: `Course: ${course.code} ${course.name}\nLecture date: ${lectureDate} (${weekday})\nClass meets: ${meets}\n\nPlanner items (id · label · title · due):\n${open || '(none)'}${deckOutline ? `\n\nSlide outline for the day (${deckOutline.title}):\n${deckOutline.lines.slice(0, 80).join('\n')}` : ''}\n\nTranscript:\n${body}`,
  };
}

const KINDS: MentionKind[] = ['new', 'date_change', 'cancel', 'info'];
const CONF: Confidence[] = ['high', 'medium', 'low'];
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Whatever the model sent, shaped into LectureNotes with bad fields dropped rather than trusted. */
const said = (v: unknown, max: number) =>
  (Array.isArray(v) ? v : [])
    .map((raw) => {
      const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      return { point: str(p.point, 160), quote: str(p.quote, 300), at: /^\d{1,3}:[0-5]\d$/.test(str(p.at, 8)) ? str(p.at, 8) : '' };
    })
    .filter((p) => p.point)
    .slice(0, max);
const slides = (v: unknown, max: number) =>
  (Array.isArray(v) ? v : [])
    .map((raw) => {
      const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const n = typeof p.slide === 'number' && Number.isFinite(p.slide) && p.slide >= 1 ? Math.round(p.slide) : null;
      return { slide: n, title: str(p.title, 100), why: str(p.why, 160) };
    })
    .filter((p) => p.title || p.slide !== null)
    .slice(0, max);

/** The knowledge fields, shaped; present whenever the model answered through the current tool. */
export function knowledgeFromTool(o: Record<string, unknown>, deckId: string | null): LectureKnowledge | null {
  if (!('emphasized' in o) && !('exam_flags' in o) && !('terms' in o)) return null;
  const terms = (Array.isArray(o.terms) ? o.terms : [])
    .map((raw) => {
      const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      return { term: str(p.term, 60), meaning: str(p.meaning, 200) };
    })
    .filter((t) => t.term)
    .slice(0, 20);
  return { emphasized: said(o.emphasized, 12), examFlags: said(o.exam_flags, 12), dwelt: slides(o.dwelt, 12), skipped: slides(o.skipped, 12), terms, deckId };
}

export function notesFromTool(input: unknown, model: string, createdAt = new Date().toISOString(), deckId: string | null = null): LectureNotes {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const summary = (Array.isArray(o.summary) ? o.summary : []).map((s) => str(s, 300)).filter(Boolean).slice(0, 5);
  const concepts = (Array.isArray(o.concepts) ? o.concepts : []).map((s) => str(s, 80)).filter(Boolean).slice(0, 20);
  const mentions: Mention[] = [];
  for (const raw of Array.isArray(o.mentions) ? o.mentions : []) {
    const m = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const quote = str(m.quote);
    const title = str(m.title, 120);
    if (!quote || !title) continue;
    const date = typeof m.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(m.date) ? m.date : null;
    const time = typeof m.time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(m.time) ? m.time : null;
    mentions.push({
      id: `m${mentions.length + 1}`,
      quote,
      title,
      kind: KINDS.includes(m.kind as MentionKind) ? (m.kind as MentionKind) : 'info',
      date,
      time,
      points: typeof m.points === 'number' && Number.isFinite(m.points) && m.points >= 0 ? m.points : null,
      confidence: CONF.includes(m.confidence as Confidence) ? (m.confidence as Confidence) : 'low',
      itemId: typeof m.itemId === 'string' && m.itemId ? m.itemId : null,
    });
  }
  const knowledge = knowledgeFromTool(o, deckId);
  return { summary, concepts, mentions, model, createdAt, ...(knowledge ? { knowledge } : {}) };
}

/** The optional after-lecture pass. Needs the key from this browser; never runs during recording. */
export async function summarizeLecture(args: NotesArgs & { apiKey: string }): Promise<LectureNotes> {
  const { default: AnthropicSdk } = await import('@anthropic-ai/sdk');
  const client = new AnthropicSdk({ apiKey: args.apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  const { system, user } = buildNotesPrompt(args);
  const response = await client.messages.create({
    model: NOTES_MODEL,
    max_tokens: 4000,
    system,
    tools: [NOTES_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: NOTES_TOOL.name },
    messages: [{ role: 'user', content: user }],
  });
  recordUsage('lecture', NOTES_MODEL, response.usage);
  const use = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!use) throw new Error('The model did not return notes.');
  return notesFromTool(use.input, NOTES_MODEL, new Date().toISOString(), args.deckOutline?.deckId ?? null);
}
