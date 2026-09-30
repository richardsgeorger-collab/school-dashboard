import { useMemo } from 'react';
import { useStore } from '../storage/store';
import { UpgradeButton } from '../views/PlanWall';
import { examLine, examOffer } from './rules';
import { useWinbackEligible } from './WinbackHooks';

/** "Your Chem Quiz 2 is Friday. Get a study plan and practice worksheet with Max." One tap lands in Practice for it. */
export function ExamWeekCard() {
  const { data, today, actions } = useStore();
  const eligible = useWinbackEligible();
  const tz = data.settings.timezone;
  const exam = useMemo(() => examOffer(data.items, today, tz), [data.items, today, tz]);
  const done = data.settings.examCardsDone ?? [];
  if (!eligible || !exam || done.includes(exam.id)) return null;
  const line = examLine(exam, tz, data.settings.lastPull?.at ?? null, new Date().toISOString());
  return (
    <section className="card exam-week" aria-label="Your next test">
      <button type="button" className="welcome-x" aria-label="Put this away" onClick={() => actions.updateSettings({ examCardsDone: [...done, exam.id] })}>
        ×
      </button>
      <p className="trial-lead">{line}</p>
      <div className="settings-actions">
        <UpgradeButton tier="max" label="Get Max and practice" source="exam" next={`/practice?i=${exam.id}`} />
      </div>
    </section>
  );
}
