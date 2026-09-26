import { useEffect, useState } from 'react';
import { latestMeter, onMeter } from '../ai/gateway';
import type { Meter } from '../ai/meter';
import { useAccount } from '../auth/AccountContext';
import { ChatCard } from '../chat/ChatCard';
import { SegmentedControl } from '../components/SegmentedControl';
import { Locked } from '../config/Locked';
import { LIMITS, TIER_NAMES } from '../config/tiers';
import { useRoute, type Route } from '../router';
import { Quiz } from './Quiz';
import { StudyKit } from './StudyKit';
import { Tutor } from './Tutor';

type Mode = 'coach' | 'tutor' | 'study' | 'quiz';
const MODE_OF: Partial<Record<Route, Mode>> = { tutor: 'tutor', study: 'study', quiz: 'quiz' };

/**
 * The one AI surface. Coach (what to do), Tutor (how to do it, from your own material), Study kit and Practice
 * (from your own material, Max). One meter line, one lock per plan. The old addresses still open the right mode.
 */
export function Ai() {
  const { route, params, navigate } = useRoute();
  const { tier } = useAccount();
  const mode: Mode = MODE_OF[route] ?? ((['coach', 'tutor', 'study', 'quiz'] as Mode[]).includes(params.get('m') as Mode) ? (params.get('m') as Mode) : 'coach');
  const [m, setM] = useState<Meter | null>(latestMeter());
  useEffect(() => onMeter(setM), []);
  const cap = LIMITS.aiMessagesPerDay[tier];
  const meterLine = cap === 0 ? `AI chat is part of Pro and Max.` : m ? `${m.messagesToday} of ${cap} messages today · $${m.monthCostUsd.toFixed(2)} of $${m.ceilingUsd.toFixed(2)} this month` : `${cap} messages a day on ${TIER_NAMES[tier]}.`;

  const go = (next: Mode) => {
    const keep: Record<string, string> = { m: next };
    for (const k of ['c', 'i', 't']) {
      const v = params.get(k);
      if (v) keep[k] = v;
    }
    navigate('ai', keep);
  };

  return (
    <>
      <div className="cal-toolbar">
        <h1 className="page-title">AI</h1>
        <p className="hint ai-meter">{meterLine}</p>
      </div>
      <SegmentedControl
        label="AI mode"
        value={mode}
        options={[
          { value: 'coach', label: 'Coach' },
          { value: 'tutor', label: 'Tutor' },
          { value: 'study', label: 'Study kit' },
          { value: 'quiz', label: 'Practice' },
        ]}
        onChange={go}
      />
      <div className="ai-body">
        {mode === 'coach' && (
          <Locked feature="aiChat" tier={tier}>
            <ChatCard />
          </Locked>
        )}
        {mode === 'tutor' && (
          <Locked feature="aiChat" tier={tier} line="Stuck on something? The tutor explains it from your own slides and lectures, at your level." quiet>
            <Tutor />
          </Locked>
        )}
        {mode === 'study' && (
          <Locked feature="flashcards" tier={tier}>
            <StudyKit />
          </Locked>
        )}
        {mode === 'quiz' && (
          <Locked feature="flashcards" tier={tier} line="Practice questions from your own slides and lectures, weak spots first.">
            <Quiz />
          </Locked>
        )}
      </div>
    </>
  );
}
