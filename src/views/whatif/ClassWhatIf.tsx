import { useEffect, useMemo, useRef, useState } from 'react';
import { bump } from '../../analytics/usage';
import { addDays, dateOf, fmtDate } from '../../domain/dates';
import type { Course, Item } from '../../domain/types';
import {
  classGrade,
  cutoffs,
  graded,
  ladderFor,
  needFor,
  remainingOf,
  smallAverage,
  splitByWeight,
  suggestCategories,
  swingOf,
  type Category,
  type ClassInput,
  type Grading,
  type Scenario,
} from '../../domain/whatIfGrade';
import { useStore } from '../../storage/store';
import { useClassWhatIf } from './store';

/**
 * What-if for one class, simple (George, 2026-10-29: "a first-time student gets it in 5 seconds"; it had listed 23
 * cards of equal size, and Exam 1 got lost among participation posts). Top to bottom:
 * 1. the grade, big, "What-if" when changed, one Reset;
 * 2. the next big item in plain words: "On Exam 1 (tomorrow), you need 81% for an A, 61% for an A-…", a letter to tap;
 * 3. only the items that move the grade, one slider each, biggest first;
 * 4. everything small in one "Everything else (N items)" slider, at their average so far, each one behind a tap;
 * 5. "What do I need?" in one line, with a letter picker;
 * 6. More options, closed: % or points, presets, keep it for next time, retakes on graded work, weights.
 * The math is domain/whatIfGrade.ts (exact against Halo's own grade); nothing here touches real scores.
 */
type Unit = 'pct' | 'pts';
const r1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const r0 = (n: number) => String(Math.round(n));
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const an = (l: string) => (/^[AEFHILMNORSX]/i.test(l) ? 'an' : 'a');

export function ClassWhatIf({ course }: { course: Course }) {
  const { data, actions, today } = useStore();
  const tz = data.settings.timezone;
  const w = useClassWhatIf(course.id);
  const grading = data.settings.grading?.[course.id] ?? null;
  const items = useMemo(() => data.items.filter((i) => i.courseId === course.id), [data.items, course.id]);
  const input: ClassInput = useMemo(() => ({ course, items, grading }), [course, items, grading]);
  const real = useMemo(() => classGrade(input), [input]);
  const now = useMemo(() => classGrade(input, w.scenario), [input, w.scenario]);
  const [unit, setUnit] = useState<Unit>(() => (localStorage.getItem('school-dashboard:whatif-unit') === 'pts' ? 'pts' : 'pct'));
  const scale = useMemo(() => cutoffs(course.gradeScale), [course.gradeScale]);
  const any = Object.keys(w.scenario).length > 0;
  const moved = real.pct !== null && now.pct !== null ? now.pct - real.pct : 0;
  const open = useMemo(() => remainingOf(data.items, course.id), [data.items, course.id]);
  const { big, small } = useMemo(() => splitByWeight(input, open), [input, open]);
  const done = items.filter((i) => graded(i)).sort((a, b) => b.dueAt.localeCompare(a.dueAt));
  const next = useMemo(() => [...big].sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0] ?? null, [big]);
  const smallAvg = useMemo(() => smallAverage(input), [input]);

  // A higher letter pops (and a small tap on a phone).
  const rank = (l: string | null) => (l ? scale.findIndex((c) => c.label.toUpperCase() === l.toUpperCase()) : 99);
  const last = useRef(now.letter);
  const [up, setUp] = useState(0);
  useEffect(() => {
    if (any && rank(now.letter) < rank(last.current)) {
      setUp((n) => n + 1);
      if (!reduced()) navigator.vibrate?.(12);
    }
    last.current = now.letter;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now.letter]);

  const setUnitKept = (u: Unit) => {
    setUnit(u);
    try {
      localStorage.setItem('school-dashboard:whatif-unit', u);
    } catch {
      /* storage unavailable */
    }
  };
  const saveGrading = (g: Grading | null) => {
    const all = { ...(data.settings.grading ?? {}) };
    if (g) all[course.id] = g;
    else delete all[course.id];
    actions.updateSettings({ grading: all });
    bump(g ? 'whatif:weights' : 'whatif:points');
  };
  // "Everything else": one value for all the small items; their what-ifs move together.
  const smallSet = small.filter((i) => typeof w.scenario[i.id] === 'number');
  const smallPct = smallSet.length ? (smallSet.reduce((a, i) => a + w.scenario[i.id], 0) / Math.max(1, smallSet.reduce((a, i) => a + i.points, 0))) * 100 : (smallAvg ?? 90);
  const setSmall = (pct: number) => w.setMany({ ...w.scenario, ...Object.fromEntries(small.map((i) => [i.id, (i.points * pct) / 100])) });
  const dayWord = (iso: string) => {
    const d = dateOf(iso, tz);
    if (d === today) return 'today';
    if (d === addDays(today, 1)) return 'tomorrow';
    return fmtDate(d, 'long').split(',')[0] + (d > addDays(today, 6) ? `, ${fmtDate(d, 'short')}` : '');
  };

  return (
    <div className="wis">
      <section className="wis-top card" data-whatif={any || undefined} aria-live="polite">
        <span className="wis-letter" key={up} data-up={up > 0 || undefined}>
          {now.letter ?? '–'}
        </span>
        <span className="wis-pct">{now.pct === null ? 'No grade yet' : `${r1(now.pct)}%`}</span>
        {any && (
          <>
            <span className="gpa-tag">What-if</span>
            {real.pct !== null && now.pct !== null && (
              <span className="wis-moved" data-dir={moved > 0.05 ? 'up' : moved < -0.05 ? 'down' : 'same'}>
                {moved > 0.05 ? '▲' : moved < -0.05 ? '▼' : '='} {r1(Math.abs(moved))} from {real.letter} {r1(real.pct)}%
              </span>
            )}
            <button type="button" className="btn small wis-reset" onClick={() => { w.reset(); bump('whatif:reset'); }}>
              Reset
            </button>
          </>
        )}
        {now.basis === 'estimate' && (
          <p className="wis-basis">
            <b>Estimate</b> {now.why}
          </p>
        )}
      </section>

      {next && <NextLine input={input} scenario={w.scenario} item={next} when={dayWord(next.dueAt)} onTry={(pct) => { w.set(next.id, (next.points * pct) / 100); bump('whatif:next-letter'); }} />}

      {big.length > 0 && (
        <section className="wis-big" aria-label="What moves your grade">
          <h3 className="wis-h">What moves your grade</h3>
          <ul className="wis-list">
            {big.map((i) => (
              <SliderRow key={i.id} item={i} unit={unit} value={w.scenario[i.id]} start={smallAvg ?? 90} sub={`${dayWord(i.dueAt)} · ${i.points} pts · each 10% = ${r1(swingOf(input, w.scenario, i))} of your grade`} onSet={(v) => w.set(i.id, v)} />
            ))}
          </ul>
        </section>
      )}

      {small.length > 0 && (
        <section className="wis-rest" data-whatif={smallSet.length > 0 || undefined}>
          <div className="wis-row">
            <div className="wis-row-top">
              <span className="wis-name">Everything else ({small.length} item{small.length === 1 ? '' : 's'})</span>
              <span className="wis-val">{r0(smallPct)}%</span>
            </div>
            <span className="hint wis-sub">{kindsOf(small)} · {small.reduce((a, i) => a + i.points, 0)} pts in all{smallSet.length ? '' : ', at your average so far'}</span>
            <input type="range" min={0} max={100} step={1} value={Math.round(smallPct)} aria-label={`What-if for everything else, ${small.length} items`} onChange={(e) => setSmall(Number(e.target.value))} />
          </div>
          <details className="wis-each-wrap">
            <summary className="wis-expand">Set each one</summary>
            <ul className="wis-list wis-each">
              {small.map((i) => (
                <SliderRow key={i.id} item={i} unit={unit} value={w.scenario[i.id]} start={smallAvg ?? 90} sub={`${dayWord(i.dueAt)} · ${i.points} pts`} onSet={(v) => w.set(i.id, v)} />
              ))}
            </ul>
          </details>
        </section>
      )}

      {open.length > 0 && <NeedLine input={input} scenario={Object.fromEntries(Object.entries(w.scenario).filter(([id]) => done.some((i) => i.id === id)))} scale={scale} current={real.letter} onTry={(s) => w.setMany({ ...w.scenario, ...s })} />}
      {open.length === 0 && <p className="hint">Nothing left to score that Halo+ knows about. You can still try a retake under More options.</p>}

      <details className="wis-more">
        <summary>More options</summary>
        <div className="wis-more-body">
          <div className="wis-opt">
            <span className="hint">Type scores as</span>
            <div className="wi-unit" role="group" aria-label="Type scores as">
              <button type="button" className="btn small" data-on={unit === 'pct' || undefined} aria-pressed={unit === 'pct'} onClick={() => setUnitKept('pct')}>
                %
              </button>
              <button type="button" className="btn small" data-on={unit === 'pts' || undefined} aria-pressed={unit === 'pts'} onClick={() => setUnitKept('pts')}>
                pts
              </button>
            </div>
          </div>
          {open.length > 1 && (
            <div className="wis-opt">
              <span className="hint">Everything left at</span>
              {[100, 90, 80, 70].map((p) => (
                <button key={p} type="button" className="btn small" onClick={() => w.setMany({ ...w.scenario, ...Object.fromEntries(open.map((i) => [i.id, (i.points * p) / 100])) })}>
                  {p}%
                </button>
              ))}
            </div>
          )}
          <label className="wis-opt wi-keep">
            <input type="checkbox" checked={w.kept} onChange={(e) => { w.keep(e.target.checked); bump(`whatif:keep-${e.target.checked}`); }} /> Keep this what-if for next time
          </label>
          {done.length > 0 && (
            <details className="wis-retakes">
              <summary>Change a graded score (a retake or regrade)</summary>
              <ul className="wis-list">
                {done.map((i) => (
                  <SliderRow key={i.id} item={i} unit={unit} value={w.scenario[i.id]} start={((i.score as number) / Math.max(1, i.points)) * 100} sub={`${dayWord(i.dueAt)} · got ${i.score} of ${i.points}`} onSet={(v) => w.set(i.id, v)} />
                ))}
              </ul>
            </details>
          )}
          <Weights course={course} items={items} grading={grading} estimate={real.basis === 'estimate'} onSave={saveGrading} />
          <p className="hint">What-ifs never change your real scores or Halo. While one is on, your projected GPA on Classes shows it too.</p>
        </div>
      </details>
    </div>
  );
}

/** "Participation, homework and activities": the kinds in the bundle, in plain words. */
function kindsOf(items: Item[]): string {
  const name: Record<string, string> = { participation: 'participation', discussion: 'discussions', homework: 'homework', other: 'activities', quiz: 'quizzes', lab: 'labs', paper: 'papers', project: 'projects', exam: 'exams' };
  const kinds = [...new Set(items.map((i) => name[i.type] ?? 'other'))];
  const s = kinds.length <= 1 ? kinds.join('') : `${kinds.slice(0, -1).join(', ')} and ${kinds[kinds.length - 1]}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** One item: its name, when and what it's worth, one slider and its value (typed in More options' unit). */
function SliderRow({ item, unit, value, start, sub, onSet }: { item: Item; unit: Unit; value: number | undefined; start: number; sub: string; onSet: (pts: number | null) => void }) {
  const has = typeof value === 'number';
  const extra = item.points <= 0;
  const u: Unit = extra ? 'pts' : unit;
  const max = u === 'pct' ? 100 : Math.max(1, item.points);
  const shown = has ? (u === 'pct' ? (value / item.points) * 100 : value) : u === 'pct' ? start : (item.points * start) / 100;
  const label = item.label || item.title;
  return (
    <li className="wis-row" data-whatif={has || undefined}>
      <div className="wis-row-top">
        <span className="wis-name">{label}</span>
        <label className="wis-val">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={Math.round(shown * 10) / 10}
            aria-label={`What-if score for ${label}, in ${u === 'pct' ? 'percent' : 'points'}`}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (e.target.value.trim() === '') onSet(null);
              else if (Number.isFinite(n) && n >= 0) onSet(u === 'pct' ? (n * item.points) / 100 : n);
            }}
          />
          {u === 'pct' ? '%' : `/${item.points}`}
        </label>
        {has && (
          <button type="button" className="wi-clear" aria-label={`Back to no what-if for ${label}`} onClick={() => onSet(null)}>
            ×
          </button>
        )}
      </div>
      <span className="hint wis-sub">{sub}</span>
      <input type="range" min={0} max={max} step={u === 'pct' ? 1 : 0.5} value={Math.min(max, shown)} aria-label={`What-if slider for ${label}`} onChange={(e) => onSet(u === 'pct' ? (Number(e.target.value) * item.points) / 100 : Number(e.target.value))} />
    </li>
  );
}

/** "On Exam 1 (tomorrow), you need 81% for an A, 61% for an A-, 41% for a B+." Each letter tries it. */
function NextLine({ input, scenario, item, when, onTry }: { input: ClassInput; scenario: Scenario; item: Item; when: string; onTry: (pct: number) => void }) {
  const rows = ladderFor(input, scenario, item);
  const needs = rows.filter((r) => r.state === 'needs').slice(0, 3);
  const safe = rows.find((r) => r.state === 'locked');
  const name = item.label || item.title;
  if (!needs.length && !safe) return null;
  return (
    <p className="wis-next">
      On <b>{name}</b> ({when}),{' '}
      {needs.length > 0 ? (
        <>
          you need{' '}
          {needs.map((r, i) => (
            <span key={r.label}>
              {i > 0 && ', '}
              {r.pct}% for {an(r.label)}{' '}
              <button type="button" className="wis-letter-btn" onClick={() => onTry(r.pct as number)} title={`Try ${r.pct}% on ${name}`}>
                {r.label}
              </button>
            </span>
          ))}
          .
        </>
      ) : (
        <>{safe!.label} is safe even with a 0.</>
      )}
    </p>
  );
}

/** "For an A, you need about 82% on what's left." with a letter picker. */
function NeedLine({ input, scenario, scale, current, onTry }: { input: ClassInput; scenario: Scenario; scale: { label: string; min: number }[]; current: string | null; onTry: (s: Scenario) => void }) {
  const letters = scale.filter((c) => c.min > 0);
  const [target, setTarget] = useState<string>(() => {
    const i = letters.findIndex((c) => c.label.toUpperCase() === (current ?? '').toUpperCase());
    return letters[Math.max(0, i - 1)]?.label ?? letters[0]?.label ?? 'A';
  });
  const need = needFor(input, scenario, target);
  const open = remainingOf(input.items, input.course.id).filter((i) => typeof scenario[i.id] !== 'number');
  const picker = (
    <select className="wis-pick" value={target} aria-label="Letter to aim for" onChange={(e) => setTarget(e.target.value)}>
      {letters.map((c) => (
        <option key={c.label} value={c.label}>
          {c.label}
        </option>
      ))}
    </select>
  );
  if (!need) return null;
  return (
    <p className="wis-need">
      {need.state === 'needs' && (
        <>
          For {an(target)} {picker}, you need about <b>{Math.ceil(need.avg as number)}%</b> on what’s left.{' '}
          <button type="button" className="hero-inline" onClick={() => onTry(Object.fromEntries(open.map((i) => [i.id, (i.points * (need.avg as number)) / 100])))}>
            Try it
          </button>
        </>
      )}
      {need.state === 'locked' && (
        <>
          {picker} is locked in: even zeros on what’s left keep you there.
        </>
      )}
      {need.state === 'impossible' && (
        <>
          {picker} isn’t reachable this term with what’s left. Your best is {need.best ? `${need.best.letter} (${r1(need.best.pct)}%)` : '–'}.
        </>
      )}
      {need.state === 'nothing-left' && <>Nothing left to score.</>}
    </p>
  );
}

/** How the class is graded: Halo's points (exact), or the syllabus's category weights, with drops and extra credit. */
function Weights({ course, items, grading, estimate, onSave }: { course: Course; items: Item[]; grading: Grading | null; estimate: boolean; onSave: (g: Grading | null) => void }) {
  const [open, setOpen] = useState(estimate && !grading);
  const [draft, setDraft] = useState<Category[]>(() => grading?.categories ?? suggestCategories(items));
  const total = draft.filter((c) => !c.extra).reduce((n, c) => n + (Number(c.weight) || 0), 0);
  const set = (i: number, patch: Partial<Category>) => setDraft((d) => d.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  return (
    <details className="wi-section wi-weights" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="section-title">How {course.code} is graded{grading?.mode === 'weighted' ? ' · weighted' : ' · by points'}</summary>
      <p className="hint">
        Halo grades most classes by points: what you earned over what has been graded. If the syllabus weighs categories (exams 40%…), enter the weights here; Halo+ checks them against Halo’s grade.
      </p>
      <ul className="wi-cats">
        {draft.map((c, i) => (
          <li key={c.id}>
            <input className="wi-cat-name" value={c.name} aria-label="Category" onChange={(e) => set(i, { name: e.target.value })} />
            <label>
              <input type="number" inputMode="decimal" min={0} max={100} value={c.weight} aria-label={`${c.name} weight`} onChange={(e) => set(i, { weight: Number(e.target.value) })} />%
            </label>
            <label>
              drop <input type="number" inputMode="numeric" min={0} max={10} value={c.drop} aria-label={`${c.name}: lowest scores dropped`} onChange={(e) => set(i, { drop: Number(e.target.value) })} />
            </label>
            <label className="wi-cat-extra">
              <input type="checkbox" checked={!!c.extra} onChange={(e) => set(i, { extra: e.target.checked })} /> extra credit
            </label>
            <button type="button" className="wi-clear" aria-label={`Remove ${c.name}`} onClick={() => setDraft((d) => d.filter((_, k) => k !== i))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <p className="hint" data-off={total !== 100 || undefined}>
        Weights add up to {total}%{total !== 100 ? ' (the syllabus’s usually add to 100)' : ''}.
      </p>
      <div className="settings-actions">
        <button type="button" className="btn small" onClick={() => setDraft((d) => [...d, { id: `cat-${d.length + 1}-${Date.now()}`, name: 'New category', weight: 0, drop: 0 }])}>
          Add category
        </button>
        <button type="button" className="btn small primary" onClick={() => onSave({ mode: 'weighted', categories: draft, assign: grading?.assign ?? {} })}>
          Use these weights
        </button>
        {grading && (
          <button type="button" className="btn small" onClick={() => onSave(null)}>
            Back to points
          </button>
        )}
      </div>
    </details>
  );
}
