import { ANNOUNCE_SYSTEM, ANNOUNCE_TOOL } from '../halo/announce';
import { ACTIONS_SYSTEM, ACTIONS_TOOL, REWRITE_SYSTEM, REWRITE_TOOL, SHORTEN_SYSTEM, SHORTEN_TOOL } from '../halo/actions';
import { PEEK_SYSTEM, PEEK_TOOL } from '../halo/peek';
import { CORE_SYSTEM, CORE_TOOL, DETAIL_SYSTEM, DETAIL_TOOL, MATERIAL_SYSTEM, MATERIAL_TOOL } from '../ingest/plan';
import { TERM_PLAN_TOOL, TERM_SYSTEM } from '../ingest/term';
import { LINKS_SYSTEM, LINKS_TOOL } from '../ingest/links';
import { KIT_SYSTEM, KIT_TOOL } from '../study/kits';
import { NOTES_SYSTEM, NOTES_TOOL } from '../record/summarize';
import { QUIZ_SYSTEM, QUIZ_TOOL } from '../quiz/generate';
import { WORKSHEET_SYSTEM, WORKSHEET_TOOL } from '../practice/worksheet';
import { BRIEF_SYSTEM, BRIEF_TOOL, DRAFT_SYSTEM, DRAFT_TOOL, METHOD_SYSTEM, METHOD_TOOL } from '../work/brief';
import type { Job, JobTool } from './jobRules';

/**
 * The AI jobs Halo+ runs (2026-10-29), each with the instructions and the one tool its code already uses, and how much
 * of the student's material it may carry. scripts/sync-ai-jobs.ts writes this to supabase/functions/_shared/aiJobs.ts
 * for the AI function, which builds every call from it (jobRules.ts); src/ai/jobs.test.ts fails when the two differ, so
 * a changed prompt cannot ship to the app alone. Ask (the free-form study chat) is not here: it is gone.
 */
const job = (kind: string, rules: string, tool: unknown, maxUserChars: number, more: Partial<Pick<Job, 'rulesAt' | 'maxBlocks' | 'maxContextChars'>> = {}): Job => ({
  kind,
  rules,
  tool: tool as JobTool,
  rulesAt: more.rulesAt ?? 'first',
  maxBlocks: more.maxBlocks ?? 1,
  maxContextChars: more.maxContextChars ?? 0,
  maxUserChars,
});

const list: Job[] = [
  // Reading an announcement (Max): what it changes, what to do, those lines shortened and reworded.
  job('announcement', ANNOUNCE_SYSTEM, ANNOUNCE_TOOL, 40_000),
  job('announcement', ACTIONS_SYSTEM, ACTIONS_TOOL, 40_000),
  job('announcement', SHORTEN_SYSTEM, SHORTEN_TOOL, 12_000),
  job('announcement', REWRITE_SYSTEM, REWRITE_TOOL, 30_000),
  // Free's one AI call: did this announcement change an assignment's date or work (the locked heads-up).
  job('changes', PEEK_SYSTEM, PEEK_TOOL, 24_000),
  // The syllabus pass: the class's material in two blocks, the rules last (for the cache).
  job('class_plan', CORE_SYSTEM, CORE_TOOL, 4000, { rulesAt: 'last', maxBlocks: 3, maxContextChars: 240_000 }),
  job('class_plan', DETAIL_SYSTEM, DETAIL_TOOL, 4000, { rulesAt: 'last', maxBlocks: 3, maxContextChars: 240_000 }),
  job('class_plan', MATERIAL_SYSTEM, MATERIAL_TOOL, 4000, { rulesAt: 'last', maxBlocks: 3, maxContextChars: 240_000 }),
  job('term_plan', TERM_SYSTEM, TERM_PLAN_TOOL, 120_000),
  job('links', LINKS_SYSTEM, LINKS_TOOL, 40_000),
  // Practice: the class's sources in one block after the rules.
  job('study', KIT_SYSTEM, KIT_TOOL, 12_000, { maxBlocks: 2, maxContextChars: 120_000 }),
  job('quiz', QUIZ_SYSTEM, QUIZ_TOOL, 120_000),
  job('worksheet', WORKSHEET_SYSTEM, WORKSHEET_TOOL, 120_000),
  job('lecture', NOTES_SYSTEM, NOTES_TOOL, 100_000),
  // An assignment: what it asks (the brief), and checking the student's own draft or method against it.
  job('brief', BRIEF_SYSTEM, BRIEF_TOOL, 40_000),
  job('draft', DRAFT_SYSTEM, DRAFT_TOOL, 100_000),
  job('method', METHOD_SYSTEM, METHOD_TOOL, 100_000),
];

export const JOBS: Record<string, Job> = Object.fromEntries(list.map((j) => [j.tool.name, j]));
if (Object.keys(JOBS).length !== list.length) throw new Error('Two AI jobs share a tool name.');
