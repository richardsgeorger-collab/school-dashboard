import { useEffect } from 'react';
import { useRoute } from '../router';
import { Now } from './Now';

/**
 * Hidden: #/looks?d=ink|paper|pop shows the Now screen under each visual direction, so the three can be compared
 * on the real screen with real data (#/looks?seed=1 loads the sample term). The chosen direction is the default
 * everywhere; the other two stay here to switch to. See DESIGN.md §5.
 */
export type Look = 'ink' | 'paper' | 'pop';
export const LOOKS: { id: Look; name: string; line: string }[] = [
  { id: 'ink', name: 'Ink', line: 'Dark and glowy. Geist, indigo, the card lit from behind.' },
  { id: 'paper', name: 'Paper', line: 'Warm and editorial. Instrument Serif, ink blue, grain.' },
  { id: 'pop', name: 'Pop', line: 'Bright and quick. Sora, coral, soft colour in the page.' },
];
const FONTS = 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap';

/** Applies a look to the document. Ink is dark by nature; the others follow the theme setting. */
export function applyLook(look: Look | null) {
  const root = document.documentElement;
  if (look && look !== 'paper') root.dataset.look = look;
  else delete root.dataset.look;
  if (look === 'ink') root.dataset.theme = 'dark';
}

export function Looks() {
  const { params } = useRoute();
  const d = (params.get('d') as Look | null) ?? 'paper';
  const look = LOOKS.some((l) => l.id === d) ? d : 'paper';
  useEffect(() => {
    if (!document.querySelector('link[data-looks-fonts]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONTS;
      link.dataset.looksFonts = '';
      document.head.appendChild(link);
    }
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
