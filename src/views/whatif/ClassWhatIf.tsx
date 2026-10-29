import { useEffect, useMemo, useRef, useState } from 'react';
import { bump } from '../../analytics/usage';
import { dateOf, fmtDate } from '../../domain/dates';
import type { Course, Item } from '../../domain/types';
import {
  bigRemaining,
  categoryOf,
  classGrade,
  cutoffs,
  graded,
  ladderFor,
  needFor,
  remainingOf,
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
 * What-if for one class (George, 2026-10-29: "he wants to use it himself before every exam"; Free). The live grade at
 * the top (letter, percent, how far it moved, marked What-if), the next exam's ladder (the score each letter takes),
 * "What do I need?" for a letter on the class's own scale, then every item still to come and every graded one, each
 * with a score box (percent or points) and a slider. Nothing here touches real scores; one tap resets; a class's
 * what-if is kept only when the student asks. The math is domain/whatIfGrade.ts, exact against Halo's own grade.
 */
type Unit = 'pct' | 'pts';
const r1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function ClassWhatIf({ course }: { course: Course }) {
  const { data, actions } = useStore();
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

  // The moment a what-if crosses into a higher letter: the letter pops (and a small tap on a phone).
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

  const open = remainingOf(data.items, course.id);
  const done = items.filter((i) => graded(i)).sort((a, b) => b.dueAt.localeCompare(a.dueAt));
  const next = useMemo(() => bigRemaining(data.items, course.id, {}, 6).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0] ?? null, [data.items, course.id]);
  const setUnitKept = (u: Unit) => {
    setUnit(u);
    try {
      localStorage.setItem('school-dashboard:whatif-unit', u);
    } catch {
      /* storage unavailable */
    }
  };
  const groups = groupItems(open, grading);
  const saveGrading = (g: Grading | null) => {
    const all = { ...(data.settings.grading ?? {}) };
    if (g) all[course.id] = g;
    else delete all[course.id];
    actions.updateSettings({ grading: all });
    bump(g ? 'whatif:weights' : 'whatif:points');
  };

  return (
    <div className="wi">
      <section className="wi-head card" data-whatif={any || undefined} aria-live="polite">
        <div className="wi-now">
          <span className="wi-letter" key={up} data-up={up > 0 || undefined}>
            {now.letter ?? '–'}
          </span>
          <span className="wi-pct">{now.pct === null ? 'No grade yet' : `${r1(now.pct)}%`}</span>
          {any && real.pct !== null && now.pct !== null && (
            <span className="wi-moved" data-dir={moved > 0.05 ? 'up' : moved < -0.05 ? 'down' : 'same'}>
              {moved > 0.05 ? '▲' : moved < -0.05 ? '▼' : '='} {r1(Math.abs(moved))} from {real.letter} {r1(real.pct)}%
            </span>
          )}
        </div>
        <div className="wi-meta">
          {any ? <span className="gpa-tag">What-if</span> : <span className="wi-real">Your grade now</span>}
          {now.basis === 'exact' && <span className="hint">Matches Halo’s gradebook{course.haloGrade?.at ? `, as of ${fmtDate(dateOf(course.haloGrade.at, tz), 'short')}` : ''}</span>}
          {now.basis === 'yours' && <span className="hint">From your scores (no Halo grade yet)</span>}
          {now.basis === 'estimate' && (
            <span className="wi-estimate">
              <b>Estimate</b> <span className="hint">{now.why}</span>
            </span>
          )}
        </div>
        <div className="wi-actions">
          <div className="wi-unit" role="group" aria-label="Type scores as">
            <button type="button" className="btn small" data-on={unit === 'pct' || undefined} aria-pressed={unit === 'pct'} onClick={() => setUnitKept('pct')}>
              %
            </button>
            <button type="button" className="btn small" data-on={unit === 'pts' || undefined} aria-pressed={unit === 'pts'} onClick={() => setUnitKept('pts')}>
              pts
            </button>
          </div>
          {any && (
            <button type="button" className="btn small" onClick={() => { w.reset(); bump('whatif:reset'); }}>
              Reset
            </button>
          )}
          {(any || w.kept) && (
            <label className="wi-keep">
              <input type="checkbox" checked={w.kept} onChange={(e) => { w.keep(e.target.checked); bump(`whatif:keep-${e.target.checked}`); }} /> Keep for next time
            </label>
          )}
        </div>
      </section>

      {next && <Ladder input={input} scenario={w.scenario} item={next} tz={tz} onTry={(pct) => w.set(next.id, (next.points * pct) / 100)} />}

      {/* "What do I need?" solves on everything still to come; only retakes on graded work are kept from the what-if. */}
      <Need input={input} scenario={Object.fromEntries(Object.entries(w.scenario).filter(([id]) => done.some((i) => i.id === id)))} scale={scale} onTry={(s) => { w.setMany({ ...w.scenario, ...s }); bump('whatif:try-need'); }} />

      <section className="wi-section">
        <h3 className="section-title">
          Still to come <span className="count">{open.length}</span>
        </h3>
        {open.length === 0 && <p className="hint">Nothing left that Halo+ knows of. Try a retake below.</p>}
        <div className="wi-presets">
          {open.length > 1 &&
            [100, 90, 80, 70].map((p) => (
              <button key={p} type="button" className="btn small" onClick={() => w.setMany({ ...w.scenario, ...Object.fromEntries(open.map((i) => [i.id, (i.points * p) / 100])) })}>
                All at {p}%
              </button>
            ))}
        </div>
        {groups.map((g) => (
          <div key={g.key} className="wi-group">
            {g.label && (
              <h4 className="wi-group-h">
                {g.label}
                {g.weight !== null && <span className="hint"> · {g.weight}% of the grade{g.drop ? ` · lowest ${g.drop} dropped` : ''}</span>}
              </h4>
            )}
            <ul className="wi-list">
              {g.items.map((i) => (
                <Row key={i.id} item={i} unit={unit} tz={tz} value={w.scenario[i.id]} swing={swingOf(input, w.scenario, i)} onSet={(v) => w.set(i.id, v)} />
              ))}
            </ul>
          </div>
        ))}
        <p className="hint">Counts the {open.length} item{open.length === 1 ? '' : 's'} Halo+ knows about; anything Halo adds later changes this.</p>
      </section>

      {done.length > 0 && (
        <details className="wi-section wi-done">
          <summary className="section-title">
            Graded: what if a retake or a regrade… <span className="count">{done.length}</span>
          </summary>
          <ul className="wi-list">
            {done.map((i) => (
              <Row key={i.id} item={i} unit={unit} tz={tz} value={w.scenario[i.id]} real={i.score} swing={swingOf(input, w.scenario, i)} onSet={(v) => w.set(i.id, v)} />
            ))}
          </ul>
        </details>
      )}

      <Weights course={course} items={items} grading={grading} estimate={real.basis === 'estimate'} onSave={saveGrading} />
      <p className="hint wi-foot">What-ifs never change your real scores or Halo. They update your projected GPA on Classes while they’re on.</p>
    </div>
  );
}

/** Items to come, grouped by category when the class uses categories, else one list. */
function groupItems(open: Item[], grading: Grading | null): { key: string; label: string | null; weight: number | null; drop: number; items: Item[] }[] {
  if (grading?.mode !== 'weighted' || !grading.categories.length) return [{ key: 'all', label: null, weight: null, drop: 0, items: open }];
  return grading.categories
    .map((c) => ({ key: c.id, label: c.name, weight: c.weight, drop: c.drop, items: open.filter((i) => categoryOf(i, grading) === c.id) }))
    .filter((g) => g.items.length);
}

/** One item: title, due date, points; a score box in % or points; a slider; what each 10% on it is worth. */
function Row({ item, unit, tz, value, real, swing, onSet }: { item: Item; unit: Unit; tz: string; value: number | undefined; real?: number | null; swing: number; onSet: (pts: number | null) => void }) {
  const extra = item.points <= 0;
  const u: Unit = extra ? 'pts' : unit;
  const has = typeof value === 'number';
  const shownPts = has ? value : (real ?? null);
  const toUnit = (pts: number) => (u === 'pct' ? (pts / item.points) * 100 : pts);
  const fromUnit = (n: number) => (u === 'pct' ? (n * item.points) / 100 : n);
  const [text, setText] = useState(shownPts === null ? '' : String(Math.round(toUnit(shownPts) * 10) / 10));
  const focused = useRef(false);
  useEffect(() => {
    if (focused.current) return;
    setText(shownPts === null ? '' : String(Math.round(toUnit(shownPts) * 10) / 10));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownPts, u]);
  const sliderMax = u === 'pct' ? 100 : Math.max(item.points, 1);
  const label = item.label || item.title;
  return (
    <li className="wi-row" data-whatif={has || undefined}>
      <div className="wi-row-top">
        <span className="wi-title">
          {label}
          {has && <span className="gpa-tag">What-if</span>}
        </span>
        <span className="hint wi-sub">
          {fmtDate(dateOf(item.dueAt, tz), 'short')} · {extra ? 'extra credit' : `${item.points} pts`}
          {typeof real === 'number' && ` · got ${r1((real / Math.max(item.points, 1)) * 100)}%`}
          {swing >= 0.1 && ` · each 10% = ${r1(swing)} of your grade`}
        </span>
      </div>
      <div className="wi-row-ctl">
        <label className="wi-score">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step={u === 'pct' ? 1 : 0.5}
            value={text}
            placeholder={u === 'pct' ? '%' : 'pts'}
            aria-label={`What-if score for ${label}, in ${u === 'pct' ? 'percent' : 'points'}`}
            onFocus={() => (focused.current = true)}
            onBlur={() => (focused.current = false)}
            onChange={(e) => {
              setText(e.target.value);
              const n = Number(e.target.value);
              if (e.target.value.trim() === '') onSet(null);
              else if (Number.isFinite(n) && n >= 0) onSet(fromUnit(n));
            }}
          />
          <span>{u === 'pct' ? '%' : `/ ${item.points}`}</span>
        </label>
        <input
          className="wi-slider"
          type="range"
          min={0}
          max={sliderMax}
          step={u === 'pct' ? 1 : 0.5}
          value={shownPts === null ? 0 : Math.min(sliderMax, toUnit(shownPts))}
          aria-label={`What-if slider for ${label}`}
          onChange={(e) => onSet(fromUnit(Number(e.target.value)))}
        />
        {has && (
          <button type="button" className="wi-clear" aria-label={`Clear the what-if for ${label}`} onClick={() => onSet(null)}>
            ×
          </button>
        )}
      </div>
    </li>
  );
}

/** The next big item's ladder: the score each letter takes, your grade right after it, everything else as it is. */
function Ladder({ input, scenario, item, tz, onTry }: { input: ClassInput; scenario: Scenario; item: Item; tz: string; onTry: (pct: number) => void }) {
  const rows = ladderFor(input, scenario, item).filter((r) => r.state !== 'impossible' || r.label.startsWith('A'));
  const shown = rows.filter((r, i) => r.state === 'needs' || (r.state === 'locked' && rows[i - 1]?.state !== 'locked') || (r.state === 'impossible' && i === rows.findIndex((x) => x.state === 'impossible'))).slice(0, 5);
  if (!shown.length) return null;
  return (
    <section className="wi-section card wi-ladder">
      <h3 className="section-title">Before {item.label || item.title}</h3>
      <p className="hint">
        {fmtDate(dateOf(item.dueAt, tz), 'long')} · {item.points} pts · your grade right after it, with everything else as it is:
      </p>
      <ul className="wi-ladder-row">
        {shown.map((r) => (
          <li key={r.label}>
            {r.state === 'needs' ? (
              <button type="button" className="wi-rung" onClick={() => onTry(r.pct as number)} title={`Try ${r.pct}% on it`}>
                <b>{r.label}</b>
                <span>{r.pct}%</span>
              </button>
            ) : (
              <span className="wi-rung" data-state={r.state}>
                <b>{r.label}</b>
                <span>{r.state === 'locked' ? 'safe' : 'out of reach'}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** "What do I need?": a letter on the class's own scale, the average it takes on what's left, spread across the big items. */
function Need({ input, scenario, scale, onTry }: { input: ClassInput; scenario: Scenario; scale: { label: string; min: number }[]; onTry: (s: Scenario) => void }) {
  const letters = scale.filter((c) => c.min > 0);
  const current = classGrade(input, scenario).letter;
  const [target, setTarget] = useState<string>(() => {
    const i = letters.findIndex((c) => c.label.toUpperCase() === (current ?? '').toUpperCase());
    return letters[Math.max(0, i)]?.label ?? 'A';
  });
  const need = needFor(input, scenario, target);
  const big = bigRemaining(input.items, input.course.id, scenario);
  const open = remainingOf(input.items, input.course.id).filter((i) => typeof scenario[i.id] !== 'number');
  return (
    <section className="wi-section card wi-need">
      <h3 className="section-title">What do I need?</h3>
      <div className="wi-targets" role="radiogroup" aria-label="Final grade to aim for">
        {letters.map((c) => (
          <button key={c.label} type="button" role="radio" aria-checked={target === c.label} className="btn small" data-on={target === c.label || undefined} onClick={() => setTarget(c.label)}>
            {c.label}
          </button>
        ))}
      </div>
      {need && (
        <div className="wi-need-out" data-state={need.state}>
          {need.state === 'needs' && (
            <>
              <p>
                Average <b>{need.avg}%</b> on what’s left to finish with {/^[AEIOU]/i.test(need.target) ? 'an' : 'a'} <b>{need.target}</b> ({need.cutoff}% or more).
              </p>
              {big.length > 0 && (
                <p className="wi-spread">
                  {big.map((i) => `${i.label || i.title}: ${need.avg}%`).join(' · ')}
                  {open.length > big.length && ` · the other ${open.length - big.length} at ${need.avg}% too`}
                </p>
              )}
              <button type="button" className="btn small" onClick={() => onTry(Object.fromEntries(open.map((i) => [i.id, (i.points * (need.avg as number)) / 100])))}>
                Try it
              </button>
            </>
          )}
          {need.state === 'locked' && (
            <p>
              <b>{need.target} is locked in.</b> Even zeros on everything left keep you at {need.worst ? `${r1(need.worst.pct)}%` : 'it'}.
            </p>
          )}
          {need.state === 'impossible' && (
            <p>
              {/^[AEIOU]/i.test(need.target) ? 'An' : 'A'} {need.target} isn’t reachable this term with what’s left. Your best possible is <b>{need.best ? `${need.best.letter} (${r1(need.best.pct)}%)` : '–'}</b>, with 100% on everything left. That’s still worth going for.
            </p>
          )}
          {need.state === 'nothing-left' && <p>Nothing left to score in this class that Halo+ knows about. Your grade is {current ?? 'set'}.</p>}
        </div>
      )}
    </section>
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
