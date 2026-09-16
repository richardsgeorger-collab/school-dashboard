import { AI_MODEL, callTool } from '../ai/client';
import type { AppData, Course, DateStr } from '../domain/types';
import { contextBlocks, gatherClassContext, type ClassContext, type ContextLoaders } from './context';
import { buildClassPrompt, CLASS_PLAN_TOOL, planFromTool, type ClassPlan } from './plan';
import { buildTermInput, buildTermPrompt, TERM_PLAN_TOOL, termFromTool, type TermResult } from './term';

/**
 * Running the passes: gather, check the cache, call once, validate, cache. Everything the browser supplies (key, IDB,
 * fetch) is injected so the flow can be tested without one.
 */
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: unknown): Promise<void>;
}

export interface RunDeps {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  loaders: ContextLoaders;
  cache: Cache;
  model?: string;
}

export const planKey = (courseId: string) => `plan:${courseId}`;
export const TERM_KEY = 'term';

export type PlanState = 'none' | 'fresh' | 'stale';

/** Fresh when the cached plan was reasoned from exactly what is on file now. */
export const planState = (plan: ClassPlan | null, ctx: ClassContext): PlanState => (!plan ? 'none' : plan.inputHash === ctx.inputHash ? 'fresh' : 'stale');

export async function loadPlan(cache: Cache, courseId: string): Promise<ClassPlan | null> {
  return cache.get<ClassPlan>(planKey(courseId));
}

export async function loadTerm(cache: Cache): Promise<TermResult | null> {
  return cache.get<TermResult>(TERM_KEY);
}

export interface ClassRun {
  plan: ClassPlan;
  ctx: ClassContext;
  cached: boolean;
}

/** The class pass for one course. Returns the cached plan when nothing on file changed, unless forced. */
export async function runClassPass(course: Course, data: AppData, today: DateStr, startByOf: (id: string) => DateStr | undefined, deps: RunDeps, opts: { force?: boolean } = {}): Promise<ClassRun> {
  const ctx = await gatherClassContext(course, data, today, startByOf, deps.loaders);
  const cached = await loadPlan(deps.cache, course.id);
  if (cached && !opts.force && planState(cached, ctx) === 'fresh') return { plan: cached, ctx, cached: true };
  const blocks = contextBlocks(ctx);
  const prompt = buildClassPrompt(ctx, blocks);
  const model = deps.model ?? AI_MODEL;
  const result = await callTool({ apiKey: deps.apiKey, fetch: deps.fetch, kind: 'class_plan', model, system: prompt.system, user: prompt.user, tool: CLASS_PLAN_TOOL, maxTokens: 16_000, think: true });
  const plan = planFromTool(result.input, ctx, model);
  await deps.cache.put(planKey(course.id), plan);
  return { plan, ctx, cached: false };
}

export interface TermRun {
  term: TermResult;
  cached: boolean;
}

/** The term pass over every class. Cached on the same shape of open work. */
export async function runTermPass(data: AppData, plans: Record<string, ClassPlan | null>, today: DateStr, startByOf: (id: string) => DateStr | undefined, deps: RunDeps, opts: { force?: boolean } = {}): Promise<TermRun> {
  const input = buildTermInput(data, plans, today, startByOf);
  const cached = await loadTerm(deps.cache);
  if (cached && !opts.force && cached.inputHash === input.inputHash) return { term: cached, cached: true };
  const prompt = buildTermPrompt(input);
  const model = deps.model ?? AI_MODEL;
  const result = await callTool({ apiKey: deps.apiKey, fetch: deps.fetch, kind: 'term_plan', model, system: prompt.system, user: prompt.user, tool: TERM_PLAN_TOOL, maxTokens: 12_000, think: true });
  const term = termFromTool(result.input, input, model);
  await deps.cache.put(TERM_KEY, term);
  return { term, cached: false };
}
