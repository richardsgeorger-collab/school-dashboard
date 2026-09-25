import { callTool, type ToolSpec } from '../ai/client';
import { MODEL } from '../ai/model';
import type { ApiUsage } from '../ai/usage';
import type { AppData, Course, DateStr } from '../domain/types';
import { contextBlocks, gatherClassContext, type ClassContext, type ContextLoaders } from './context';
import { buildCorePrompt, buildDetailPrompt, buildMaterialPrompt, CORE_TOOL, DETAIL_TOOL, detailRefs, MATERIAL_TOOL, mergeDetail, mergeMaterial, planFromCore, type ClassPlan } from './plan';
import { buildTermInput, buildTermPrompt, TERM_PLAN_TOOL, termFromTool, type TermResult } from './term';

/**
 * Running the passes: gather, check the cache, call, validate, cache. Everything the browser supplies (key, IDB,
 * fetch) is injected so the flow can be tested without one.
 */
export interface Cache {
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: unknown): Promise<void>;
}

export interface RunDeps {
  apiKey?: string;
  fetch?: typeof globalThis.fetch;
  loaders: ContextLoaders;
  cache: Cache;
}

/** What a run actually spent, summed from what the API reported per call. */
export interface RunCost {
  calls: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const NO_COST: RunCost = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
export const addCost = (a: RunCost, u: ApiUsage): RunCost => ({ calls: a.calls + 1, input: a.input + n(u.input_tokens), output: a.output + n(u.output_tokens), cacheRead: a.cacheRead + n(u.cache_read_input_tokens), cacheWrite: a.cacheWrite + n(u.cache_creation_input_tokens) });

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
  cost: RunCost;
}

/** What the screen says while a pass is running. */
export type Step = 'core' | 'detail' | 'material' | 'term';
export const STEP_WORDS: Record<Step, string> = { core: 'Reading the assignments', detail: 'Working out the parts', material: 'Matching your material', term: 'Reasoning across all classes' };

export interface RunOptions {
  force?: boolean;
  onStep?: (step: Step) => void;
}

interface Call {
  step: Step;
  tool: ToolSpec;
  prompt: { system: { text: string; cache?: boolean }[]; user: string };
  maxTokens: number;
}

/**
 * The class pass, in three calls over one cached context. The first must land; the other two only add to it, so a
 * failure there is recorded in plain words and the rest of the plan stands.
 */
export async function runClassPass(course: Course, data: AppData, today: DateStr, startByOf: (id: string) => DateStr | undefined, deps: RunDeps, opts: RunOptions = {}): Promise<ClassRun> {
  const ctx = await gatherClassContext(course, data, today, startByOf, deps.loaders);
  const cached = await loadPlan(deps.cache, course.id);
  if (cached && !opts.force && planState(cached, ctx) === 'fresh') return { plan: cached, ctx, cached: true, cost: NO_COST };

  const blocks = contextBlocks(ctx);
  const model = MODEL;
  let cost = NO_COST;
  const run = async ({ step, tool, prompt, maxTokens }: Call) => {
    opts.onStep?.(step);
    const r = await callTool({ apiKey: deps.apiKey, fetch: deps.fetch, kind: 'class_plan', system: prompt.system, user: prompt.user, tool, maxTokens, think: step === 'core' });
    cost = addCost(cost, r.usage);
    return r.input;
  };

  // A. Every item: what it asks for, when to start, how long, its flags. Without this there is no plan.
  let plan = planFromCore(await run({ step: 'core', tool: CORE_TOOL, prompt: buildCorePrompt(ctx, blocks), maxTokens: 12_000 }), ctx, model);

  // B. The work with parts, what the syllabus carries that Halo does not, the topic order.
  const refs = detailRefs(plan, ctx);
  try {
    plan = mergeDetail(plan, await run({ step: 'detail', tool: DETAIL_TOOL, prompt: buildDetailPrompt(ctx, blocks, refs), maxTokens: 8000 }), ctx);
  } catch {
    plan = { ...plan, incomplete: [...plan.incomplete, 'milestones and prerequisites'] };
  }

  // C. Which material on file covers which item. Nothing to match when the library is empty for this class.
  if (ctx.decks.length || ctx.rubrics.length || ctx.lectures.length || ctx.syllabus) {
    try {
      plan = mergeMaterial(plan, await run({ step: 'material', tool: MATERIAL_TOOL, prompt: buildMaterialPrompt(ctx, blocks), maxTokens: 6000 }), ctx);
    } catch {
      plan = { ...plan, incomplete: [...plan.incomplete, 'which slides cover what'] };
    }
  }

  await deps.cache.put(planKey(course.id), plan);
  return { plan, ctx, cached: false, cost };
}

export interface TermRun {
  term: TermResult;
  cached: boolean;
  cost: RunCost;
}

/** The term pass over every class. Cached on the same shape of open work. */
export async function runTermPass(data: AppData, plans: Record<string, ClassPlan | null>, today: DateStr, startByOf: (id: string) => DateStr | undefined, deps: RunDeps, opts: RunOptions = {}): Promise<TermRun> {
  const input = buildTermInput(data, plans, today, startByOf);
  const cached = await loadTerm(deps.cache);
  if (cached && !opts.force && cached.inputHash === input.inputHash) return { term: cached, cached: true, cost: NO_COST };
  opts.onStep?.('term');
  const prompt = buildTermPrompt(input);
  const model = MODEL;
  const result = await callTool({ apiKey: deps.apiKey, fetch: deps.fetch, kind: 'term_plan', system: prompt.system, user: prompt.user, tool: TERM_PLAN_TOOL, maxTokens: 12_000, think: true });
  const term = termFromTool(result.input, input, model);
  await deps.cache.put(TERM_KEY, term);
  return { term, cached: false, cost: addCost(NO_COST, result.usage) };
}
