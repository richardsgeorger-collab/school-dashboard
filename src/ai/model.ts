/**
 * The only model this product calls. Every AI request goes through the gateway, which sets this; nothing else may
 * name a model. `model.test.ts` fails the build if any other model string appears anywhere in the codebase.
 *
 * Roll back in one line: `export const MODEL = HAIKU_4_5;` (the request is reshaped for whichever model this is, and
 * the meter prices it by its own list, so nothing else changes).
 */
export const HAIKU_4_5 = 'claude-haiku-4-5-20251001';
export const HAIKU_5_5 = 'claude-haiku-5-5';
export const MODEL: string = HAIKU_5_5;

/** Every model the gateway knows how to call. Only `MODEL` serves students; an admin's side-by-side may name another. */
export const KNOWN_MODELS: readonly string[] = [HAIKU_4_5, HAIKU_5_5];

export interface ModelPrices {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * Per million tokens, Anthropic's list prices (platform.claude.com, checked 2026-10-25). Haiku 5.5 charges more for
 * a prompt over 100,000 tokens (input, cache and cache reads counted together); Haiku 4.5 has one price.
 */
export const PRICES_BY_MODEL: Record<string, { base: ModelPrices; long?: { over: number; prices: ModelPrices } }> = {
  [HAIKU_4_5]: { base: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 } },
  [HAIKU_5_5]: { base: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 }, long: { over: 100_000, prices: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 } } },
};

/** What it costs, per million tokens, for the meter: the shipped model's base prices. */
export const MODEL_PRICES_USD: ModelPrices = PRICES_BY_MODEL[MODEL].base;

/** The prices one call pays: the long-prompt list when its prompt is over the line. */
export function pricesFor(model: string, promptTokens: number): ModelPrices {
  const p = PRICES_BY_MODEL[model] ?? PRICES_BY_MODEL[MODEL];
  return p.long && promptTokens > p.long.over ? p.long.prices : p.base;
}

/** How hard Haiku 5.5 thinks; `off` is thinking turned off (`thinking: disabled`, at low effort), Haiku 4.5's way. */
export type Effort = 'off' | 'low' | 'medium' | 'high';
export const EFFORTS: readonly Effort[] = ['off', 'low', 'medium', 'high'];

/**
 * How hard Haiku 5.5 thinks, by kind of call (it thinks by default, at medium). Chosen by the side-by-side on the
 * saved fixtures (scripts/ai-compare.ts, docs/ai-compare/2026-10-25-2.md, LOOP_LOG Loop 267): low passed all 146
 * checks (Haiku 4.5: 138, medium: 143). The tutor (plain text, no tools) runs with thinking off: the same checks,
 * about twice as fast. Off is kept away from tool calls (Anthropic: it can skip a tool it needs) and from the quiz and
 * worksheet (42 and 62 s a call off, 7 and 10 s at low). A call that asks to think (`think: true`) gets medium.
 */
export const EFFORT_BY_KIND: Record<string, Effort> = { tutor: 'off' };
export const DEFAULT_EFFORT: Effort = 'low';

/** Haiku 5.5 counts the same text as about 30% more tokens and thinks inside max_tokens, so its output caps are this much larger. */
const OUTPUT_SCALE: Record<string, number> = { [HAIKU_5_5]: 1.5 };

/** A call's output cap (asked for and capped per kind, in Haiku 4.5 tokens) as the model it goes to counts it. */
export const outputCapFor = (model: string, max: number): number => Math.ceil(max * (OUTPUT_SCALE[model] ?? 1));

/**
 * A Messages API body made right for the model it goes to. The client builds one shape; old clients still in use
 * build Haiku 4.5's. Haiku 5.5 refuses sampling settings, `thinking: enabled` with a budget, and a request that
 * ends on an assistant turn (all 400s), and takes `output_config.effort`; Haiku 4.5 refuses `adaptive` and effort.
 */
export function forModel(wire: Record<string, unknown>, model: string, kind = 'other'): Record<string, unknown> {
  const out: Record<string, unknown> = { ...wire, model };
  const thinking = wire.thinking as { type?: string; budget_tokens?: number } | undefined;
  const asked = thinking?.type === 'enabled' || thinking?.type === 'adaptive';
  if (model === HAIKU_5_5) {
    delete out.temperature;
    delete out.top_p;
    delete out.top_k;
    out.max_tokens = outputCapFor(model, Number(wire.max_tokens ?? 1024));
    const given = (wire.output_config as { effort?: Effort } | undefined)?.effort;
    let effort: Effort = given ?? EFFORT_BY_KIND[kind] ?? DEFAULT_EFFORT;
    if (asked && (effort === 'low' || effort === 'off')) effort = 'medium';
    if (effort === 'off') out.thinking = { type: 'disabled' };
    else if (asked) out.thinking = { type: 'adaptive' };
    else delete out.thinking;
    out.output_config = { ...((wire.output_config as Record<string, unknown>) ?? {}), effort: effort === 'off' ? 'low' : effort };
    // A prefill (the last turn the assistant's) is refused: say it in a user turn instead.
    const messages = (wire.messages as { role: string; content: unknown }[] | undefined) ?? [];
    const last = messages[messages.length - 1];
    if (last?.role === 'assistant' && typeof last.content === 'string') {
      out.messages = [...messages.slice(0, -1), { role: 'user', content: `Your previous response was interrupted and ended with: ${last.content}\nContinue from where you left off.` }];
    }
  } else {
    delete out.output_config;
    if (thinking?.type === 'adaptive') {
      const max = Number(wire.max_tokens ?? 1024);
      const budget = Math.min(Math.max(1024, Math.floor(max / 2)), max - 512);
      if (budget >= 1024) out.thinking = { type: 'enabled', budget_tokens: budget };
      else delete out.thinking;
    }
  }
  return out;
}
