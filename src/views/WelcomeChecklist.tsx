import { useMemo } from 'react';
import { dateOf } from '../domain/dates';
import type { Item } from '../domain/types';
import { useMorningNote } from '../onboarding/ComeBack';
import { isTest } from '../study/upcoming';
import { useStore } from '../storage/store';
import { syncPress } from '../ui/presses';

/**
 * "Get the most out of your week" (George, 2026-09-29): four one-tap things that open the real thing, each ticking
 * itself when it is done. It counts "2 of 4", goes away when all four are done or it is put away, and the moment it
 * is finished is recorded for the Admin funnel.
 */
export function WelcomeChecklist({ onOpen }: { onOpen: (i: Item) => void }) {
  const { data, today, actions } = useStore();
  const { turnOn } = useMorningNote();
  const tz = data.settings.timezone;
  const wl = data.settings.welcomeList ?? {};
  const ob = data.settings.onboarding;
  const nextTest = useMemo(() => data.items.filter((i) => isTest(i) && i.status !== 'done' && dateOf(i.dueAt, tz) >= today).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0] ?? null, [data.items, today, tz]);
  const found = useMemo(() => data.items.find((i) => i.status !== 'done' && (i.requirements ?? []).some((r) => r.source.kind === 'announcement' && !r.done)) ?? null, [data.items]);
  // For the first two weeks after setup; never for an account that set up before it existed.
  const recent = !!ob?.doneAt && Date.now() - new Date(ob.doneAt).getTime() < 14 * 86_400_000;
  if (!recent || wl.dismissedAt || wl.doneAt) return null;
  const mark = (patch: Partial<NonNullable<typeof wl>>) => {
    const next = { ...wl, ...patch };
    const all = !!data.settings.lastPull && !!data.settings.reminders?.pushEnabled && !!next.practice && !!next.requirement;
    actions.updateSettings({ welcomeList: all ? { ...next, doneAt: new Date().toISOString() } : next });
  };
  const rows: { done: boolean; label: string; act: () => void; href?: string }[] = [
    { done: !!data.settings.lastPull, label: 'Sync Halo', act: () => syncPress.current?.() },
    { done: !!data.settings.reminders?.pushEnabled, label: 'Turn on your morning note', act: () => void turnOn().then((r) => (r.ok ? mark({}) : (window.location.hash = '/you?s=notifications'))) },
    { done: !!wl.practice, label: nextTest ? `Practice for ${nextTest.label}` : 'Practice for your next quiz or exam', act: () => mark({ practice: new Date().toISOString() }), href: nextTest ? `#/practice?i=${nextTest.id}` : '#/study' },
    { done: !!wl.requirement, label: 'Open one requirement Max found in your announcements', act: () => { if (found) { mark({ requirement: new Date().toISOString() }); onOpen(found); } else window.location.hash = '/inbox'; } },
  ];
  const n = rows.filter((r) => r.done).length;
  if (n === rows.length) {
    if (!wl.doneAt) queueMicrotask(() => actions.updateSettings({ welcomeList: { ...wl, doneAt: new Date().toISOString() } }));
    return null;
  }
  return (
    <section className="card welcome-list" aria-label="Get the most out of your week">
      <div className="welcome-head">
        <p className="section-title">Get the most out of your week</p>
        <span className="mono muted">
          {n} of {rows.length}
        </span>
        <button type="button" className="welcome-x" aria-label="Put this away" onClick={() => actions.updateSettings({ welcomeList: { ...wl, dismissedAt: new Date().toISOString() } })}>
          ×
        </button>
      </div>
      <ol className="welcome-rows">
        {rows.map((r) => (
          <li key={r.label} data-done={r.done}>
            <span className="welcome-tick" aria-hidden>
              {r.done ? '✓' : ''}
            </span>
            {r.done ? (
              <span className="welcome-label">{r.label}</span>
            ) : r.href ? (
              <a className="welcome-label" href={r.href} onClick={r.act}>
                {r.label}
              </a>
            ) : (
              <button type="button" className="welcome-label" onClick={r.act}>
                {r.label}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
