import { cleanAll, instanceParts, rulesFor } from '../domain/reqClean';
import type { Course, Item } from '../domain/types';
import { useStore } from '../storage/store';

/**
 * Standing rules for a class: true all term, never a task for a particular day. They used to appear on the agenda
 * with a due date, which made "every DQ post must be 150-200 words" look like something to finish by Sunday.
 */
export function ClassRules({ course }: { course: Course }) {
  const { data } = useStore();
  const rules = rulesFor(cleanAll(data.items).items, course.id);
  if (rules.length === 0) return null;
  return (
    <section className="card class-rules" aria-label={`Rules for ${course.code}`}>
      <h2 className="section-title">Rules in this class</h2>
      <p className="hint">They apply to everything, so they are not on any one day.</p>
      <ul className="rules-list">
        {rules.map((r, i) => (
          <li key={i}>
            <span className="rules-text">{r.text}</span>
            <span className="hint mono">
              {r.items.length === 1 ? r.items[0] : `${r.items.length} assignments`}
              {r.sources[0]?.title ? ` · from "${r.sources[0].title}"` : ''}
              {r.sources.length > 1 ? ` and ${r.sources.length - 1} more post${r.sources.length - 1 === 1 ? '' : 's'}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The same rules, compact, on an assignment they govern. One line, not a checklist of things to tick. */
export function RulesOnItem({ item }: { item: Item }) {
  const { data } = useStore();
  const cleaned = cleanAll(data.items).items;
  const mine = cleaned.find((i) => i.id === item.id);
  const rules = (mine?.requirements ?? []).filter((r) => r.scope === 'rule');
  if (rules.length === 0) return null;
  void instanceParts;
  return (
    <p className="hint item-rules">
      <b>Class rules that apply:</b> {rules.map((r) => r.text).join(' · ')}
    </p>
  );
}
