import { useEffect } from 'react';
import { useRoute } from '../router';
import { Now } from './Now';

/**
 * Hidden: #/looks?d=default|sky shows the Now screen under the default blue and one alternate, light or dark by
 * the theme toggle, on real data (#/looks?seed=1 loads the sample term). Switching is one token block. DESIGN.md §7.
 */
export type Look = 'default' | 'sky';
export const LOOKS: { id: Look; name: string; line: string }[] = [
  { id: 'default', name: 'Default', line: 'Neutral greys, one cool blue (#3F7FEE / #6FA0FF at night).' },
  { id: 'sky', name: 'Alternate blue', line: 'The same system with a softer, lighter blue (#5B93F5 / #86B1FF).' },
];

/** Applies a look to the document. Both follow the light/dark toggle. */
export function applyLook(look: Look | null) {
  const root = document.documentElement;
  if (look && look !== 'default') root.dataset.look = look;
  else delete root.dataset.look;
}

export function Looks() {
  const { params } = useRoute();
  const d = (params.get('d') as Look | null) ?? 'default';
  const look = LOOKS.some((l) => l.id === d) ? d : 'default';
  useEffect(() => {
    applyLook(look);
    return () => applyLook(null);
  }, [look]);
  const keep = params.get('seed') === '1' ? '&seed=1' : '';
  return (
    <>
      <div className="looks-bar" role="tablist" aria-label="Visual direction">
        {LOOKS.map((l) => (
          <a key={l.id} role="tab" aria-selected={l.id === look} className="looks-tab" href={`#/looks?d=${l.id}${keep}`}>
            <b>{l.name}</b>
            <span>{l.line}</span>
          </a>
        ))}
      </div>
      <Now />
    </>
  );
}
