import { haloLink } from '../domain/heroFacts';
import type { Course, Item } from '../domain/types';

/**
 * "↗ Halo": straight to the item in Halo from any list (2026-09-29). Only for items Halo knows about, or classes it
 * does; a hand-added item with no Halo class gets nothing rather than a link to Halo's home page.
 */
export function HaloJump({ item, course }: { item: Item; course: Course | undefined }) {
  if (!item.url && !item.haloId && !course?.haloSlugId) return null;
  const { href } = haloLink(item, course);
  return (
    <a className="halo-jump" href={href} target="_blank" rel="noreferrer" aria-label={`Open ${item.label} in Halo`} title="Open in Halo" onClick={(e) => e.stopPropagation()}>
      ↗ Halo
    </a>
  );
}
