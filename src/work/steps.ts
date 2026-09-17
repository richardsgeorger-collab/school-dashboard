import type { Item, Step } from '../domain/types';

export const BIG_POINTS = 100;
export const BIG_MINUTES = 180;

/** Big enough to carry steps inside it. */
export const isMilestoneWork = (i: Item): boolean => i.points >= BIG_POINTS || i.estimatedMinutes >= BIG_MINUTES;

/**
 * The steps before any AI pass has read the assignment. They name the moves this kind of work actually takes, in
 * order, so the first one is something a person can start in the next ten minutes. The pass replaces them with steps
 * that name this assignment's own parts.
 */
const BY_TYPE: Record<string, string[]> = {
  paper: ['Decide what you are arguing', 'Find the evidence for it', 'Outline paragraph by paragraph', 'Write the messy first draft', 'Cut and tighten it', 'Fix the citations and the formatting'],
  project: ['Pin down what it has to do', 'Sketch the design', 'Build the first piece end to end', 'Build the rest', 'Test it against the brief', 'Write up what you built'],
  exam: ['List every topic it covers', 'Work problems on the shakiest one', 'Redo what you got wrong', 'One pass over the rest', 'Sleep before it'],
  quiz: ['Reread the slides it covers', 'Work a few problems from them', 'Check what you got wrong', 'Take it'],
  lab: ['Read the handout before the bench', 'Run the procedure and record raw data', 'Do the calculations with units', 'Write the results and what they mean', 'Format the report'],
  discussion: ['Read the prompt twice', 'Decide what you actually think', 'Write the post', 'Reply to two classmates'],
  homework: ['Reread the worked examples', 'Set up the first problem', 'Work the rest', 'Check the units and the answers'],
  other: ['Read what it asks for', 'Gather what you need', 'Do the work', 'Check it against the instructions'],
};

/** Steps from the AI plan's milestones, else the brief, else the usual shape for this kind of work. */
export function defaultSteps(item: Item): string[] {
  const fromPlan = item.plan?.milestones?.filter(Boolean) ?? [];
  if (fromPlan.length >= 2) return fromPlan.slice(0, 7);
  const fromBrief = item.brief?.steps?.filter(Boolean) ?? [];
  if (fromBrief.length >= 2) return fromBrief.slice(0, 7);
  return BY_TYPE[item.type] ?? BY_TYPE.other;
}

export const makeSteps = (labels: string[]): Step[] => labels.map((label, i) => ({ id: `s${i + 1}`, label, done: false }));

/** The item's steps, made on first use. Never a new row anywhere. */
export function stepsFor(item: Item): Step[] {
  if (item.steps && item.steps.length) return item.steps;
  return makeSteps(defaultSteps(item));
}

export const stepProgress = (steps: Step[] | undefined): number | null => (steps && steps.length ? steps.filter((s) => s.done).length / steps.length : null);

export const nextStep = (steps: Step[] | undefined): Step | null => steps?.find((s) => !s.done) ?? null;
