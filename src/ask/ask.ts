import type { SystemBlock } from '../ai/gateway';
import { sendChat, type ChatTurn } from '../chat/client';
import { buildContext, type ContextInput, type ToolApi } from '../chat/context';
import { courseGrade, gradeLine } from '../domain/grades';
import type { Course, DateStr, Item } from '../domain/types';
import { sourcesBlock, type QuizSource } from '../quiz/sources';
import { inDays, isTest, upcomingTests } from '../study/upcoming';
import { situationText, type TutorSituation } from '../tutor/tutor';
import { starterAsk } from '../work/starter';

/**
 * Ask: the coach and the tutor as one chat. It always knows the planner (every class, assignment, deadline and
 * grade), the syllabi and the slides on file; with a class in focus it also teaches from that class's own material
 * with citations, knows its announcements, what is coming and where the student is weak. Short answers, and every
 * answer ends with three follow-ups the screen turns into buttons.
 */
export const ASK_SYSTEM = `You are the study partner inside a college student's planner. You answer one question at a time about their classes and their work.

What you know, given below on every turn: today's date and the week's study capacity; every class with its meeting times; the open assignments with the real deadline, the start-by date, minutes, points and status (Context, as JSON); the class grades as Halo reports them; the syllabi on file; slides picked for this question; and, when one class is in focus, that class's slides, lecture transcript stretches and syllabus as numbered [S#] sources, its recent announcements, what is coming up in it and where the student has been weak.

How to answer:
- Short. Two to four sentences for a planning question; up to about 150 words when teaching a topic. Name at most three assignments, by their label. Never list everything, never state totals like "you have 47 things".
- Planning ("what should I do", "I'm slammed", "what can wait"): pick one thing and say why in a clause (points, hours, what is due sooner, what class meets early tomorrow), then at most two more. Prefer the real deadline and the start-by date over the syllabus date. Big things start early.
- Class rules, policies, weights and date policy: answer from the syllabus or the announcement, quote the exact line, name the class and say where it is from. If nothing on file covers it, say so; never guess.
- Teaching ("explain", "I don't understand", "how does"): teach from the [S#] sources in the professor's notation and terms, one idea at a time, short paragraphs, and cite the source as [S#] right after the sentence it supports. End with one small check question. If the sources do not cover it, say so in one sentence, then teach it plainly and mark it "(not from your class material)".
- Problems: never give the answer. If they have not said what they tried, ask that first, in one line. Then give the next step only, and stop. If they are stuck on the same step twice, show that one step worked out and hand the next one back.
- Never write anything they would submit: no discussion posts, no essay sentences, no solved problem sets, no code to hand in. Say so plainly in one sentence and offer the structure, the first step or the concept instead.
- When they tell you something about their situation or progress, save it with remember_note; when it changes an assignment's status or remaining effort, use update_item. Confirm in a few words.
- Plain, warm, unhurried. No exclamation marks, no emoji, no headings, no bullet points, no numbered lists, no bold, no preamble like "Sure" or "Great question".
- The last line, always: three short follow-ups the student might tap next, at most six words each, as one line that starts with ">>" and separates them with " | ". Each is written as the student would say it, specific to what was just said (name the assignment, the topic or the class), never a generic "explain a concept". Example:
>> Plan my week | Explain limiting reagent | What earns points on Lab 4?`;

/** What one conversation is about: nothing, a class, or an assignment or test in a class. */
export interface AskScope {
  course: Course | null;
  item: Item | null;
}

export interface AskBlocksInput {
  context: ContextInput;
  courses: Course[];
  /** Syllabus text per class, when any has been added. Stable across turns, so it is cached. */
  syllabi: string;
  /** Deck index plus the slides picked for this question, across classes. Changes per message. */
  materials: string;
  /** The focused class's own material as [S#] sources, when a class is in focus. */
  sources: QuizSource[];
  situation: TutorSituation | null;
}

/** "CHM-113: A 96.0% · ENG-105: B- 81.3%", from Halo's own grades where the last sync carried them. */
export function gradesLine(courses: Course[], items: Item[]): string {
  const parts = courses
    .map((c) => {
      const g = courseGrade(c.id, items, c);
      return g.pct === null ? null : `${c.code}: ${gradeLine(g, c.gradeScale)}`;
    })
    .filter((s): s is string => !!s);
  return parts.join(' · ');
}

/** The system blocks: the rules, the syllabi and the class's sources are cached across turns; the rest is small and changes. */
export function askBlocks(input: AskBlocksInput): SystemBlock[] {
  const blocks: SystemBlock[] = [{ text: ASK_SYSTEM, cache: true }];
  if (input.syllabi) blocks.push({ text: `Syllabi:\n${input.syllabi}`, cache: true });
  if (input.sources.length && input.situation) blocks.push({ text: `Sources from the student's own material for ${input.situation.course.code} (cite as [S#]):\n\n${sourcesBlock(input.sources)}`, cache: true });
  if (input.materials) blocks.push({ text: `Materials:\n${input.materials}` });
  const grades = gradesLine(input.courses, input.context.items);
  const tail = [`Context:\n${buildContext(input.context)}`, grades ? `Grades (Halo's own, as of the last sync): ${grades}` : 'Grades: none reported yet.', input.situation ? `Class in focus:\n${situationText(input.situation)}` : ''].filter(Boolean).join('\n\n');
  blocks.push({ text: tail });
  return blocks;
}

/** The answer split from its follow-up line. The line is dropped from what is shown; the follow-ups become buttons. */
export function parseNextSteps(raw: string): { text: string; next: string[] } {
  // Haiku slips markdown emphasis in now and then despite the rules; the screen shows plain text.
  const lines = raw.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|$|[.,;:!?])/g, '$1$2').trim().split('\n');
  const idx = lines.map((l, i) => (/^\s*(?:>>|Next:)\s*/i.test(l) ? i : -1)).filter((i) => i >= 0).pop();
  if (idx === undefined) return { text: raw.trim(), next: [] };
  const next = lines[idx]
    .replace(/^\s*(?:>>|Next:)\s*/i, '')
    .split('|')
    .map((s) => s.trim().replace(/[.?!]+$/, (m) => (m === '?' ? '?' : '')))
    .filter((s) => s.length > 0 && s.length <= 60)
    .slice(0, 3);
  const text = [...lines.slice(0, idx), ...lines.slice(idx + 1)].join('\n').trim();
  return { text, next };
}

export interface AppStep {
  label: string;
  href: string;
}

/**
 * Buttons the app itself adds under an answer, beyond the model's follow-ups: the tool that fits what was asked
 * about. A test gets Practice; an assignment gets Check; an answer that names an upcoming test gets Practice for it.
 */
export function appSteps(scope: AskScope, answer: string, items: Item[], today: DateStr, tz: string): AppStep[] {
  const out: AppStep[] = [];
  if (scope.item && isTest(scope.item)) out.push({ label: `Practice for ${scope.item.label}`, href: `#/practice?i=${scope.item.id}` });
  else if (scope.item) out.push({ label: 'Check my work', href: `#/check?i=${scope.item.id}` });
  else {
    const a = answer.toLowerCase();
    const named = upcomingTests(items, today, tz).find((t) => a.includes(t.label.toLowerCase()));
    if (named) out.push({ label: `Practice for ${named.label}`, href: `#/practice?i=${named.id}` });
  }
  if (scope.item && scope.course) out.push({ label: `Open ${scope.item.label}`, href: `#/class?c=${scope.course.id}&i=${scope.item.id}` });
  return out.slice(0, 2);
}

/** What the empty conversation offers, from the student's own situation. */
export function askSuggestions(scope: AskScope, items: Item[], today: DateStr, tz: string): string[] {
  if (scope.item && isTest(scope.item)) return [`Help me study for ${scope.item.label}`, `What is on ${scope.item.label}?`, scope.item.topic ? `Explain ${scope.item.topic} like I'm behind` : 'Where am I weakest?'];
  if (scope.item) return [starterAsk(scope.item), `What earns points on ${scope.item.label}?`, "I don't understand what it's asking"];
  if (scope.course) return [`What is due next in ${scope.course.code}?`, `Explain the last ${scope.course.code} lecture like I'm behind`, `How am I doing in ${scope.course.code}?`];
  const next = upcomingTests(items, today, tz)[0];
  return ['What should I work on tonight?', next ? `I have ${next.label} ${inDays(next, today, tz)}, help me study` : 'What is due this week?', 'What can wait?'];
}

/** What the screen says while the answer is on its way. */
export function askLoadingLine(scope: AskScope, question: string, courses: Course[]): string {
  const code = scope.course?.code ?? courses.find((c) => question.toLowerCase().includes(c.code.toLowerCase()))?.code;
  if (code) return `Reading your ${code} slides, lectures and announcements…`;
  if (/\b(explain|understand|how do|how does|why)\b/i.test(question)) return 'Looking through your slides…';
  return 'Reading your week…';
}

export interface SendAskArgs {
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
  history: ChatTurn[];
  userText: string;
  blocks: SystemBlock[];
  api: ToolApi;
}

/** One question through the model; the answer with its follow-ups split off. */
export async function sendAsk(args: SendAskArgs): Promise<{ text: string; next: string[] }> {
  const raw = await sendChat({ apiKey: args.apiKey, fetch: args.fetch, history: args.history, userText: args.userText, system: args.blocks, api: args.api });
  return parseNextSteps(raw);
}
