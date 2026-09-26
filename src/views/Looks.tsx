import { useEffect } from 'react';
import { useAccount } from '../auth/AccountContext';
import { ACCENTS, accentToShow, applyAccent, isAccent, type AccentId } from '../config/accents';
import { can } from '../config/flags';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { Now } from './Now';

/**
 * Hidden: #/looks?d=gold|blue|green|rose|violet|teal shows the Now screen under each accent preset, light or dark
 * by the theme toggle, on real data (#/looks?seed=1 loads the sample term). Leaving restores the account's accent.
 */
export function Looks() {
  const { params } = useRoute();
  const { data } = useStore();
  const { tier } = useAccount();
  const d = params.get('d');
  const look: AccentId = isAccent(d) ? d : 'gold';
  const mine = accentToShow(data.settings.accent, can('themes', tier));
  useEffect(() => {
    applyAccent(document.documentElement, look);
    return () => applyAccent(document.documentElement, mine);
  }, [look, mine]);
  const keep = params.get('seed') === '1' ? '&seed=1' : '';
  return (
    <>
      <div className="looks-bar" role="tablist" aria-label="Accent preset">
        {ACCENTS.map((a) => (
          <a key={a.id} role="tab" aria-selected={a.id === look} className="looks-tab" href={`#/looks?d=${a.id}${keep}`}>
            <b>{a.name}</b>
            <span>
              {a.light} light · {a.dark} dark{a.id === 'gold' ? ' · default' : ''}
            </span>
          </a>
        ))}
      </div>
      <Now />
    </>
  );
}
