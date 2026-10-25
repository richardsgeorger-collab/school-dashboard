/**
 * A real extra step an announcement added (George, 2026-10-24): something to bring or have on hand, or a new thing to
 * do or hand in for credit. Never a reading or general reminder ("Review chapters 3 and 4"), a format rule ("Op-ed
 * follows five-paragraph structure"), or "acknowledge this announcement". One rule for every place that shows such a
 * step: the line on the assignment's Halo page and the gold dot in "This week" (halo/haloSnap.ts), and the class card's
 * "Don't forget" (domain/urgent.ts).
 */

/**
 * Something to bring or have on hand: said so ("Bring a printed copy", "Have your laptop"), or gear that only ever
 * means it ("Closed-toe shoes, lab coat and goggles"). An everyday noun alone is not ("Cite the textbook in APA").
 */
const BRING = /\b(bring|wear|have (?:your|a|an)|carry)\b/i;
const GEAR = /\b(goggles|safety glasses|lab coat|closed[- ]toe|calculator|ID card|student ID)\b/i;
/**
 * A new thing to hand in or do for credit, said as an instruction: the action word leads ("Post your main response by
 * Wednesday", "Submit the data table as one PDF"). Anywhere else it is a rule about the work ("Cite the textbook in APA
 * format in the main post": "post" there is the thing, not the step).
 */
const DELIVER = /^(?:please |also |you (?:must|need to|will) )?(submit|upload|turn in|hand in|post|write|complete|attach|include|prepare|present|record|sign|email|print|fill out)\b/i;
/** Never worth a step by itself. */
const SOFT = /\b(review|re-?read|read|reading|study|watch|look over|remember|reminder|don'?t forget|be sure|keep in mind|check (?:out|your)|practice|acknowledge)\b/i;

export interface StepLike {
  text: string;
  gradedOn: boolean;
  scope?: string;
}

export function isExtraStep(r: StepLike): boolean {
  const t = r.text.trim();
  if (BRING.test(t) || GEAR.test(t)) return true;
  return r.gradedOn && r.scope !== 'reference' && r.scope !== 'rule' && DELIVER.test(t) && !SOFT.test(t);
}

/** A step that gates another ("Sign the lab safety waiver before lab"): a real step even when it is not graded. */
export const isGateStep = (r: StepLike, gate: RegExp): boolean => gate.test(r.text) && DELIVER.test(r.text) && !SOFT.test(r.text);
