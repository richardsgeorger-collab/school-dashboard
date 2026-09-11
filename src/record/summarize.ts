import type Anthropic from '@anthropic-ai/sdk';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import type { Course, DateStr, Item } from '../domain/types';
import type { Confidence, LectureNotes, Mention, MentionKind } from './notes';

/** The user asked for this model for the after-lecture pass. */
export const NOTES_MODEL = 'claude-sonnet-4-6';
const MAX_TRANSCRIPT_CHARS = 80_000;

export const NOTES_TOOL = {
  name: 'lecture_notes',
  description: 'Record a short summary, the concepts covered, and every mention of a date, deadline, exam, quiz, or assignment change from a lecture transcript.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'concepts', 'mentions'],
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
            kind: { type: 'string', enum: ['new', 'date_change', 'cancel', 'info'] },
            title: { type: 'string', description: 'What it is about, e.g. "Quiz 2" or "Chapter 4 reading check".' },
            date: { type: ['string', 'null'], description: 'Absolute date YYYY-MM-DD resolved from the lecture date, or null.' },
            time: { type: ['string', 'null'], description: 'HH:mm in 24-hour time when said or implied, or null.' },
            points: { type: ['number', 'null'] },
            confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
            itemId: { type: ['string', 'null'], description: 'The id of the planner item this refers to, from the list given, or null.' },
          },
        },
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
Answer only through the lecture_notes tool.`;

export interface NotesArgs {
  course: Course;
  lectureDate: DateStr;
  items: Item[];
  transcript: string;
  tz: string;
}

export function buildNotesPrompt({ course, lectureDate, items, transcript, tz }: NotesArgs): { system: string; user: string } {
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
    user: `Course: ${course.code} ${course.name}\nLecture date: ${lectureDate} (${weekday})\nClass meets: ${meets}\n\nPlanner items (id · label · title · due):\n${open || '(none)'}\n\nTranscript:\n${body}`,
  };
}

const KINDS: MentionKind[] = ['new', 'date_change', 'cancel', 'info'];
const CONF: Confidence[] = ['high', 'medium', 'low'];
const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Whatever the model sent, shaped into LectureNotes with bad fields dropped rather than trusted. */
export function notesFromTool(input: unknown, model: string, createdAt = new Date().toISOString()): LectureNotes {
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
  return { summary, concepts, mentions, model, createdAt };
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
  const use = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
  if (!use) throw new Error('The model did not return notes.');
  return notesFromTool(use.input, NOTES_MODEL);
}
