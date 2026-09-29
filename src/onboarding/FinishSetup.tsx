import { useStore } from '../storage/store';
import type { OnboardingState } from './state';

/**
 * For a student who skipped setup before any classes arrived: one card that says what is missing and takes them back
 * to exactly where they left off (the bookmark and the first sync steps are resumable). Gone once classes exist.
 */
export function FinishSetup({ where }: { where: 'now' | 'you' }) {
  const { data, actions } = useStore();
  const ob = data.settings.onboarding as OnboardingState | undefined;
  if (!ob || !ob.skippedAt || ob.doneAt || data.courses.length > 0) return null;
  const resume = () => actions.updateSettings({ onboarding: { ...ob, skippedAt: null } });
  const halo = ob.step === 'halo';
  return (
    <section className="card finish-setup" aria-label="Finish setup" data-where={where}>
      <p className="eyebrow">Finish setup</p>
      <p className="trial-lead">{halo ? 'Your classes are not here yet. Connecting Halo takes about two minutes, and you pick up where you left off.' : 'Your classes are not here yet. Setup takes about two minutes, and you pick up where you left off.'}</p>
      <button type="button" className="btn primary" onClick={resume}>
        Finish setup
      </button>
    </section>
  );
}
