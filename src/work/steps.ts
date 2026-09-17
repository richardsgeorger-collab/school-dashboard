import type { Item, Step } from '../domain/types';

export const BIG_POINTS = 100;
export const BIG_MINUTES = 180;

/** Big enough to carry steps inside it. */
export const isMilestoneWork = (i: Item): boolean => i.points >= BIG_POINTS || i.estimatedMinutes >= BIG_MINUTES;

const BY_TYPE: Record<string, string[]> = {
  paper: ['Outline', 'Draft', 'Revise', 'Cite sources', 'Proofread'],
  project: ['Plan it', 'Build the pieces', 'Put it together', 'Test it', 'Write it up'],
  exam: ['Review notes', 'Practice problems', 'Go over what was missed', 'Final pass'],
  quiz: ['Review the slides', 'Practice problems', 'Take it'],
  lab: ['Read the handout', 'Do the lab', 'Analyze results', 'Write the report'],
  discussion: ['Read the prompt', 'Write the post', 'Reply to two'],
  homework: ['Read the section', 'Work the problems', 'Check the answers'],
  other: ['Read what it asks', 'Do the work', 'Check it over'],
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
