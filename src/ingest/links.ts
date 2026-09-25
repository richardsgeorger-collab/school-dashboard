import { arr, callTool, obj, str, type ToolSpec } from '../ai/client';
import type { Course, Item, TopicLink } from '../domain/types';
import { itemTopics, topicKey } from '../domain/concepts';

/**
 * Cross-class connections: the same idea under two names in two classes. One cheap call over the topic maps, once
 * two or more classes have them; the result is said once, on the item, never as a screen of its own.
 */
export const LINKS_TOOL: ToolSpec = {
  name: 'topic_links',
  description: 'Topics that overlap across a student’s classes, each with one sentence on what carries over.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['links'],
    properties: {
      links: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['a_code', 'a_topic', 'b_code', 'b_topic', 'note'],
          properties: {
            a_code: { type: 'string', description: 'Course code, exactly as listed.' },
            a_topic: { type: 'string', description: 'Topic name exactly as listed under that course.' },
            b_code: { type: 'string' },
            b_topic: { type: 'string' },
            note: { type: 'string', description: 'What carries over, one plain sentence a freshman can use: "Mole ratios are the unit conversions from ESG-162 Topic 2."' },
          },
        },
      },
    },
  },
};

export const LINKS_SYSTEM = `You connect topics across a first-semester engineering student's classes. Find where the same idea appears under different names, or where one class's topic is the tool another class needs: dimensional analysis in math is the unit conversion in chemistry; a lab report's structure is the writing class's argument structure. Only real overlaps a student would feel while doing the work, at most eight, each with one plain sentence on what carries over. Use only the topics listed, with their exact names and course codes. Answer only through the topic_links tool.`;

export function buildLinksPrompt(courses: Course[]): { system: { text: string; cache?: boolean }[]; user: string } {
  const lines = courses
    .filter((c) => c.topics?.length)
    .map((c) => `${c.code} (${c.name}):\n${(c.topics ?? []).map((t) => `  - ${t.name}${t.week ? ` (week ${t.week})` : ''}`).join('\n')}`)
    .join('\n\n');
  return { system: [{ text: LINKS_SYSTEM, cache: true }], user: `Classes and their topics:\n\n${lines}` };
}

export function linksFromTool(raw: unknown, courses: Course[]): TopicLink[] {
  const byCode = new Map(courses.map((c) => [c.code.toUpperCase(), c]));
  const topicOf = (c: Course, name: string) => (c.topics ?? []).find((t) => topicKey(t.name) === topicKey(name))?.name ?? null;
  const out: TopicLink[] = [];
  for (const e of arr(obj(raw).links)) {
    const x = obj(e);
    const a = byCode.get(str(x.a_code, 12).toUpperCase());
    const b = byCode.get(str(x.b_code, 12).toUpperCase());
    if (!a || !b || a.id === b.id) continue;
    const at = topicOf(a, str(x.a_topic, 80));
    const bt = topicOf(b, str(x.b_topic, 80));
    const note = str(x.note, 220);
    if (!at || !bt || !note) continue;
    if (out.some((l) => (l.a.courseId === a.id && l.a.topic === at && l.b.courseId === b.id && l.b.topic === bt) || (l.a.courseId === b.id && l.a.topic === bt && l.b.courseId === a.id && l.b.topic === at))) continue;
    out.push({ a: { courseId: a.id, topic: at }, b: { courseId: b.id, topic: bt }, note });
  }
  return out.slice(0, 12);
}

/** True when the links are worth (re)computing: two or more classes carry a topic map. */
export const canLink = (courses: Course[]): boolean => courses.filter((c) => c.topics?.length).length >= 2;

export async function findLinks(args: { apiKey?: string; fetch?: typeof globalThis.fetch; courses: Course[] }): Promise<TopicLink[]> {
  const prompt = buildLinksPrompt(args.courses);
  const r = await callTool({ apiKey: args.apiKey, fetch: args.fetch, kind: 'links', system: prompt.system, user: prompt.user, tool: LINKS_TOOL, maxTokens: 2500 });
  return linksFromTool(r.input, args.courses);
}

export interface ItemLink {
  other: Course;
  topic: string;
  note: string;
}

/** The connections that touch one item, by its topics. Said once, on the item. */
export function linksFor(item: Item, links: TopicLink[], courses: Course[]): ItemLink[] {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const mine = itemTopics(item).map(topicKey);
  const hit = (t: string) => mine.some((m) => m === topicKey(t) || m.includes(topicKey(t)) || topicKey(t).includes(m));
  const out: ItemLink[] = [];
  for (const l of links) {
    if (l.a.courseId === item.courseId && hit(l.a.topic) && byId.get(l.b.courseId)) out.push({ other: byId.get(l.b.courseId)!, topic: l.b.topic, note: l.note });
    else if (l.b.courseId === item.courseId && hit(l.b.topic) && byId.get(l.a.courseId)) out.push({ other: byId.get(l.a.courseId)!, topic: l.a.topic, note: l.note });
  }
  return out.slice(0, 2);
}
