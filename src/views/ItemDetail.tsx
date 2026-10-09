import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CourseChip } from '../components/CourseChip';
import { HaloJump } from '../components/HaloJump';
import { Modal } from '../components/Modal';
import { BLOCK_REASONS, BLOCK_WORDS, blockPhrase, isBlocked, makeBlock } from '../domain/blocked';
import { addDays, dateOf, fmtDate, fmtMinutes, makeIso, zonedParts } from '../domain/dates';
import { estimateMinutes } from '../domain/estimate';
import { gatedBy } from '../domain/gating';
import { newId } from '../domain/ids';
import { skipLine } from '../domain/impact';
import { shortLabel } from '../domain/labels';
import { cleanAll } from '../domain/reqClean';
import { askKey, nudgeLine, todoLines, whenLine, type TodoLine } from '../domain/sheet';
import { shortLine } from '../domain/shortLine';
import { DEFAULT_FLAGS, ITEM_TYPES, TYPE_LABELS, type BlockReason, type Item, type ItemType } from '../domain/types';
import { linksFor } from '../ingest/links';
import { libraryDb, type Deck } from '../library/db';
import { decksForItem } from '../library/links';
import { terms } from '../library/search';
import { recordingsDb, type Recording } from '../record/db';
import { useStore } from '../storage/store';
import { isTest } from '../study/upcoming';
import { syllabiDb } from '../syllabus/db';
import { starterAsk } from '../work/starter';
import { stepsFor } from '../work/steps';
import { Feedback, RubricList, rubricTotal } from './Feedback';
import { Fold } from './Fold';
import { ParticipationChecklist } from './ParticipationWeek';
import { Sure } from './PlanReview';
import { PromptPanel } from './PromptPanel';
import { SourceBlock } from './SourceBlock';
import { useBrief } from './WorkPanel';

interface Draft {
  title: string;
  label: string;
  labelOverridden: boolean;
  courseId: string;
  type: ItemType;
  dueDate: string;
  dueTime: string;
  opensDate: string;
  points: string;
  estimatedMinutes: string;
  estimateOverridden: boolean;
  startByOverride: string;
  score: string;
  notes: string;
  inClass: boolean;
  group: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function blankItem(courseId: string, tz: string, today: string): Item {
  return {
    id: newId(),
    courseId,
    title: '',
    label: '',
    labelOverridden: false,
    type: 'homework',
    points: 0,
    opensAt: null,
    dueAt: makeIso(today, '23:59', tz),
    estimatedMinutes: 60,
    estimateOverridden: false,
    startByOverride: null,
    status: 'todo',
    completedAt: null,
    score: null,
    notes: '',
    topic: null,
    flags: { ...DEFAULT_FLAGS },
    source: 'manual',
    award: null,
    updatedAt: new Date().toISOString(),
  };
}

/** Reads the brief (what Halo's description asks for) for the sheet; a component so the hook can wait for a class. */
function BriefReader({ item, course }: { item: Item; course: NonNullable<ReturnType<ReturnType<typeof useStore>['courseById']['get']>> }) {
  useBrief(item, course);
  return null;
}

/**
 * The assignment sheet (George, 2026-10-08 redesign): what matters first, in the order a student needs it.
 * 1. Header: the class, one line of facts ("Due Sun, Oct 11 · 100 pts · ~2h"), one nudge, Done at the top right.
 * 2. What to do: one checklist that merges what the assignment asks for, the parts announcements and the syllabus
 *    added, and what to do first (domain/sheet.ts). Ticking a part writes the same requirement the Now card shows.
 * 3. One main action (Get help, or Practice for a test), the rest in a quiet row.
 * 4. Folds, closed by default and remembered: the rubric, the full instructions from Halo, the grade impact, the
 *    fields to edit anything. Sections with nothing in them are not there.
 */
export function ItemDetail({ item: passed, isNew = false, onClose }: { item: Item; isNew?: boolean; onClose: () => void }) {
  const { data, courseById, schedule, actions, today, derived, calibrate } = useStore();
  // Opened with a copy; every tick redraws against the live item.
  const item = isNew ? passed : (data.items.find((i) => i.id === passed.id) ?? passed);
  const tz = data.settings.timezone;
  const [decks, setDecks] = useState<Deck[]>([]);
  const [prompt, setPrompt] = useState(false);
  const [recs, setRecs] = useState<Recording[]>([]);
  const [sylLine, setSylLine] = useState<string | null>(null);
  useEffect(() => {
    if (isNew) return;
    libraryDb
      .listDecks()
      .then((all) => setDecks(decksForItem(item, all)))
      .catch(() => setDecks([]));
    const due = dateOf(item.dueAt, tz);
    const from = addDays(due, -7);
    recordingsDb
      .list()
      .then((all) => setRecs(all.filter((r) => r.courseId === item.courseId && r.status !== 'recording' && dateOf(r.startedAt, tz) >= from && dateOf(r.startedAt, tz) <= due).slice(0, 3)))
      .catch(() => setRecs([]));
    syllabiDb
      .get(item.courseId)
      .then((doc) => {
        if (!doc) return setSylLine(null);
        const words = terms(item.title);
        const paras = doc.text.split(/\n{2,}|\r?\n(?=[A-Z])/).map((p) => p.trim()).filter((p) => p.length >= 30);
        const best = paras.map((p) => ({ p, n: words.filter((w) => p.toLowerCase().includes(w)).length })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n)[0];
        setSylLine(best ? (best.p.length > 260 ? `${best.p.slice(0, 260)}…` : best.p) : null);
      })
      .catch(() => setSylLine(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.courseId, item.title, item.dueAt, tz, isNew]);
  const inference = derived[item.id];
  const [draft, setDraft] = useState<Draft>(() => {
    const due = zonedParts(item.dueAt, tz);
    return {
      title: item.title,
      label: item.label,
      labelOverridden: item.labelOverridden,
      courseId: item.courseId,
      type: item.type,
      dueDate: dateOf(item.dueAt, tz),
      dueTime: `${pad(due.hh)}:${pad(due.mm)}`,
      opensDate: item.opensAt ? dateOf(item.opensAt, tz) : '',
      points: String(item.points),
      estimatedMinutes: String(item.estimatedMinutes),
      estimateOverridden: item.estimateOverridden,
      startByOverride: item.startByOverride ?? '',
      score: item.score === null ? '' : String(item.score),
      notes: item.notes,
      inClass: item.flags.inClass,
      group: item.flags.group,
    };
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const course = courseById.get(draft.courseId);
  const suggested = useMemo(
    () => estimateMinutes({ title: draft.title, type: draft.type, points: Number(draft.points) || 0, courseCode: course?.code ?? '' }),
    [draft.title, draft.type, draft.points, course?.code],
  );
  const sched = schedule.byItem[item.id];
  const suggestedLabel = useMemo(() => shortLabel({ title: draft.title, courseCode: course?.code ?? '', type: draft.type }), [draft.title, draft.type, course?.code]);
  const effectiveLabel = draft.labelOverridden && draft.label.trim() ? draft.label.trim() : suggestedLabel;

  const save = () => {
    if (!draft.title.trim()) return;
    const estimated = Math.max(0, Math.round(Number(draft.estimatedMinutes) || 0));
    const next: Item = {
      ...item,
      title: draft.title.trim(),
      label: effectiveLabel,
      labelOverridden: draft.labelOverridden && draft.label.trim() !== '' && draft.label.trim() !== suggestedLabel,
      courseId: draft.courseId,
      type: draft.type,
      points: Math.max(0, Number(draft.points) || 0),
      opensAt: draft.opensDate ? makeIso(draft.opensDate, '00:00', tz) : null,
      dueAt: makeIso(draft.dueDate, draft.dueTime || '23:59', tz),
      estimatedMinutes: estimated,
      estimateOverridden: draft.estimateOverridden || estimated !== suggested,
      startByOverride: draft.startByOverride || null,
      score: draft.score === '' ? null : Number(draft.score),
      notes: draft.notes,
      flags: { ...item.flags, inClass: draft.inClass, group: draft.group },
    };
    actions.upsertItem(next);
    onClose();
  };

  // The fields to change anything, shared by a new item's form and the sheet's Edit details fold.
  const fields = (
    <>
      <label className="field">
        <span>Name</span>
        <input value={draft.title} onChange={(e) => set('title', e.target.value)} required autoComplete="off" />
      </label>
      <label className="field">
        <span>Short name</span>
        <input
          value={draft.labelOverridden ? draft.label : suggestedLabel}
          onChange={(e) => {
            set('label', e.target.value);
            set('labelOverridden', true);
          }}
          autoComplete="off"
          maxLength={40}
        />
        <span className="hint">
          {draft.labelOverridden && draft.label.trim() !== suggestedLabel ? (
            <>
              Suggested "{suggestedLabel}" ·{' '}
              <button type="button" className="muted" style={{ textDecoration: 'underline' }} onClick={() => { set('label', suggestedLabel); set('labelOverridden', false); }}>
                use suggested
              </button>
            </>
          ) : (
            'Shown on Now, the calendar and in lists; the name stays as the subtitle.'
          )}
        </span>
      </label>
      <div className="field-row">
        <label className="field">
          <span>Class</span>
          <select value={draft.courseId} onChange={(e) => set('courseId', e.target.value)}>
            {data.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Type</span>
          <select value={draft.type} onChange={(e) => set('type', e.target.value as ItemType)}>
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Due date</span>
          <input type="date" value={draft.dueDate} onChange={(e) => set('dueDate', e.target.value)} required />
        </label>
        <label className="field">
          <span>Due time</span>
          <input type="time" value={draft.dueTime} onChange={(e) => set('dueTime', e.target.value)} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Opens</span>
          <input type="date" value={draft.opensDate} onChange={(e) => set('opensDate', e.target.value)} />
        </label>
        <label className="field">
          <span>Points</span>
          <input type="number" min={0} step={1} inputMode="numeric" value={draft.points} onChange={(e) => set('points', e.target.value)} />
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Time it takes, minutes</span>
          {/* step="any": with step 15 the browser refused to submit a 10- or 25-minute item, and Save did nothing (2026-10-08). */}
          <input
            type="number"
            min={0}
            step="any"
            inputMode="numeric"
            value={draft.estimatedMinutes}
            onChange={(e) => {
              set('estimatedMinutes', e.target.value);
              set('estimateOverridden', true);
            }}
          />
          <span className="hint">
            {item.plan?.minutes && !draft.estimateOverridden && Number(draft.estimatedMinutes) === item.plan.minutes.value ? (
              <>
                <span className="ai-from">AI</span> {item.plan.minutes.why} <Sure c={item.plan.minutes.confidence} />
                {' · '}
              </>
            ) : null}
            Suggested {fmtMinutes(suggested)}
            {Number(draft.estimatedMinutes) !== suggested && (
              <>
                {' · '}
                <button type="button" className="muted" style={{ textDecoration: 'underline' }} onClick={() => { set('estimatedMinutes', String(suggested)); set('estimateOverridden', false); }}>
                  use suggested
                </button>
              </>
            )}
          </span>
        </label>
        <label className="field">
          <span>Start by</span>
          <input type="date" value={draft.startByOverride} onChange={(e) => set('startByOverride', e.target.value)} />
          {sched && (
            <span className="hint">
              {item.startByPlan && !draft.startByOverride && item.plan?.startBy ? (
                <>
                  <span className="ai-from">AI</span> {fmtDate(item.startByPlan, 'long')} <Sure c={item.plan.startBy.confidence} />
                  <span className="plan-why">{item.plan.startBy.why}</span>
                </>
              ) : (
                <>Computed {fmtDate(sched.startBy, 'long')}</>
              )}
            </span>
          )}
        </label>
      </div>
      {!isNew && (
        <div className="field">
          <span>Waiting on</span>
          {item.blocked && isBlocked(item, today) ? (
            <p className="hint">
              {blockPhrase(item, tz)} · back on Now {fmtDate(item.blocked.until, 'short')}.{' '}
              <button type="button" className="muted" style={{ textDecoration: 'underline' }} onClick={() => actions.upsertItem({ ...item, blocked: null })}>
                it's unblocked
              </button>
            </p>
          ) : (
            <select
              value=""
              aria-label="Waiting on"
              onChange={(e) => {
                const r = e.target.value as BlockReason | '';
                if (r) actions.upsertItem({ ...item, blocked: makeBlock(r, item, course, today, tz), startedAt: null });
              }}
            >
              <option value="">Nothing, it can be done</option>
              {BLOCK_REASONS.map((r) => (
                <option key={r} value={r}>
                  {BLOCK_WORDS[r].label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <div className="field-row">
        <label className="field">
          <span>Score</span>
          <input type="number" min={0} step="any" inputMode="decimal" value={draft.score} onChange={(e) => set('score', e.target.value)} placeholder="Not graded" />
        </label>
        <div className="field">
          <span>Flags</span>
          <div style={{ display: 'flex', gap: 12, minHeight: 44, alignItems: 'center' }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={draft.inClass} onChange={(e) => set('inClass', e.target.checked)} /> In class
            </label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={draft.group} onChange={(e) => set('group', e.target.checked)} /> Group
            </label>
          </div>
        </div>
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
      </label>
      {sched && (
        <p className="hint mono">
          Due {fmtDate(dateOf(item.dueAt, tz), 'long')}
          {inference ? ` · really ${fmtDate(dateOf(inference.deadlineAt, tz), 'long')}` : ''} · start by {fmtDate(sched.startBy, 'long')}
          {inference ? ` · ${inference.reasons.join('; ')}` : ''}
        </p>
      )}
      {item.topic && <p className="hint">{item.topic}</p>}
      {item.status === 'done' && (
        <p className="hint">
          Actually took{' '}
          <input
            type="number"
            min={0}
            className="inline-num"
            aria-label="Minutes it actually took"
            defaultValue={item.actualMinutes ?? ''}
            placeholder="min"
            onBlur={(e) => {
              const n = Number(e.target.value);
              if (e.target.value !== '' && Number.isFinite(n) && n >= 0 && n !== (item.actualMinutes ?? null)) actions.logActual(item.id, n || null);
            }}
          />{' '}
          minutes. Used to size future {TYPE_LABELS[item.type].toLowerCase()} in this class.
        </p>
      )}
      {!isNew && (
        <details className="unlocks">
          <summary className="hint">{item.blocks?.length ? `Unlocks ${item.blocks.length} item${item.blocks.length === 1 ? '' : 's'}` : 'Does other work wait on this?'}</summary>
          <p className="hint">Tick anything that cannot start until this is done. A small task that holds up bigger work is treated as urgent.</p>
          <ul className="unlocks-list">
            {data.items
              .filter((o) => o.id !== item.id && o.courseId === item.courseId && o.status !== 'done')
              .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
              .slice(0, 25)
              .map((o) => (
                <li key={o.id}>
                  <label>
                    <input type="checkbox" checked={item.blocks?.includes(o.id) ?? false} onChange={(e) => actions.upsertItem({ ...item, blocks: e.target.checked ? [...(item.blocks ?? []), o.id] : (item.blocks ?? []).filter((id) => id !== o.id) })} /> {o.label} <span className="muted mono">· {fmtDate(dateOf(o.dueAt, tz), 'short')}</span>
                  </label>
                </li>
              ))}
          </ul>
        </details>
      )}
      {item.snoozedUntil && item.snoozedUntil > today && (
        <p className="hint">
          Pushed down until {fmtDate(item.snoozedUntil, 'long')} ·{' '}
          <button type="button" className="muted" style={{ textDecoration: 'underline' }} onClick={() => { actions.upsertItem({ ...item, snoozedUntil: null, startByOverride: item.startByOverride === item.snoozedUntil ? null : item.startByOverride }); onClose(); }}>
            bring it back
          </button>
        </p>
      )}
    </>
  );
  const formActions = (
    <div className="modal-actions">
      {!isNew &&
        (confirmDelete ? (
          <button type="button" className="btn danger" onClick={() => { actions.deleteItem(item.id); onClose(); }}>
            Confirm delete
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        ))}
      <span className="spacer" />
      <button type="button" className="btn" onClick={onClose}>
        Cancel
      </button>
      <button type="submit" className="btn primary" disabled={!draft.title.trim()}>
        {isNew ? 'Add item' : 'Save changes'}
      </button>
    </div>
  );

  if (isNew)
    return (
      <Modal title="New item" onClose={onClose}>
        <form
          className="modal-body"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          {fields}
          {formActions}
        </form>
      </Modal>
    );

  // ---- the sheet ----------------------------------------------------------------------------------------------
  const done = item.status === 'done';
  const minutes = calibrate(item).minutes;
  const when = whenLine(item, minutes, tz, today);
  const nudge = nudgeLine(item, sched?.startBy ?? null, inference?.deadlineAt ?? null, today, tz);
  const lines = item.type === 'participation' ? [] : todoLines(item, tz);
  const doneCount = lines.filter((l) => l.done).length;
  const rules = (cleanAll(data.items).items.find((i) => i.id === item.id)?.requirements ?? []).filter((r) => r.scope === 'rule');
  const needsFirst = gatedBy(item, data.items);
  const impact = course ? skipLine(item, data.items, course.code, course) : null;
  const impactShort = impact?.match(/from (\d+)% to (\d+)%/);
  const description = item.notes?.trim() ?? '';
  const halo = item.source === 'halo' || item.source === 'ics' || item.source === 'parsed';
  const studyWith = decks.length > 0 || recs.length > 0 || !!sylLine || (item.plan?.sources.length ?? 0) > 0;
  const links = linksFor(item, data.settings.topicLinks ?? [], data.courses);
  const hasTodo = item.type === 'participation' || lines.length > 0 || rules.length > 0 || needsFirst.length > 0;

  const steps = item.steps?.length ? stepsFor(item) : [];
  const stepsDone = steps.filter((s) => s.done).length;
  const toggleStep = (id: string) => actions.upsertItem({ ...item, steps: steps.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });
  const toggleLine = (l: TodoLine) => {
    const now = new Date().toISOString();
    if (l.kind === 'req') actions.upsertItem({ ...item, requirements: (item.requirements ?? []).map((x) => (x.id === l.id ? { ...x, done: !x.done, doneAt: x.done ? null : now } : x)) });
    else {
      const key = askKey(l.text);
      const ticked = new Set(item.askDone ?? []);
      if (ticked.has(key)) ticked.delete(key);
      else ticked.add(key);
      actions.upsertItem({ ...item, askDone: [...ticked] });
    }
  };
  const markDone = () => {
    actions.setStatus(item.id, 'done');
    onClose();
  };

  return (
    <Modal title={effectiveLabel || item.title || 'Assignment'} onClose={onClose}>
      {course && <BriefReader item={item} course={course} />}
      <div className="modal-body sheet" data-type={item.type}>
        <header className="sheet-head">
          <div className="sheet-head-main">
            <p className="sheet-course">
              <CourseChip course={course} /> <span className="sheet-type">{TYPE_LABELS[item.type]}</span>
            </p>
            <p className="sheet-when">{when}</p>
            {nudge && <p className="sheet-nudge">{nudge}</p>}
          </div>
          <div className="sheet-head-actions">
            {done ? (
              <button type="button" className="btn sheet-done" data-done onClick={() => actions.setStatus(item.id, 'todo')} title="Not done after all">
                ✓ Done
              </button>
            ) : (
              <button type="button" className="btn primary sheet-done" onClick={markDone}>
                ✓ Done
              </button>
            )}
            {(item.source === 'halo' || item.url) && <HaloJump item={item} course={course} />}
            {!done && (
              <p className="sheet-quiet">
            {item.status === 'in_progress' ? (
              <>
                In progress ·{' '}
                <button type="button" className="hero-inline" onClick={() => actions.setStatus(item.id, 'todo')}>
                  not started after all
                </button>
              </>
            ) : (
              <button type="button" className="hero-inline" onClick={() => actions.setStatus(item.id, 'in_progress')}>
                Mark in progress
              </button>
            )}
            {item.blocked && isBlocked(item, today) && <span className="sheet-blocked"> · {blockPhrase(item, tz)}, back on Now {fmtDate(item.blocked.until, 'short')}</span>}
              </p>
            )}
          </div>
        </header>
        <Feedback item={item} />
        {item.haloLate && (
          <p className="hint late-note">
            <b>Halo says late:</b> {item.haloLate}{' '}
            <button type="button" className="muted" style={{ textDecoration: 'underline' }} onClick={() => actions.upsertItem({ ...item, haloLate: null })}>
              checked, clear this
            </button>
          </p>
        )}

        {hasTodo && (
          <section className="sheet-todo" aria-label="What to do">
            <p className="sheet-todo-head">
              <b>{item.type === 'participation' ? 'What earns the points' : 'What to do'}</b>
              {lines.length > 0 && (
                <span className="mono muted">
                  {doneCount} of {lines.length}
                </span>
              )}
            </p>
            {item.type === 'participation' ? (
              <ParticipationChecklist item={item} />
            ) : (
              <ul className="sheet-lines">
                {lines.map((l) => (
                  <SheetLine key={l.id} line={l} onToggle={() => toggleLine(l)} />
                ))}
              </ul>
            )}
            {needsFirst.length > 0 && (
              <p className="hint sheet-needs">
                Needs first: {needsFirst.map((g) => `${g.label} (${fmtDate(dateOf(g.dueAt, tz), 'short')})`).join(', ')}
              </p>
            )}
            {rules.length > 0 && (
              <p className="hint sheet-rules">
                <b>Class rules that apply:</b> {rules.map((r) => shortLine(r.text)).join(' · ')}
              </p>
            )}
          </section>
        )}

        {course && !done && (
          <div className="study-row sheet-actions">
            {isTest(item) ? (
              <a className="btn primary" href={`#/practice?i=${item.id}`} onClick={onClose}>
                Practice for this
              </a>
            ) : (
              <a className="btn primary" href={`#/ask?c=${item.courseId}&i=${item.id}&q=${encodeURIComponent(starterAsk(item))}`} onClick={onClose}>
                Get help
              </a>
            )}
            <span className="sheet-actions-quiet">
              {isTest(item) ? (
                <a className="btn small" href={`#/ask?c=${item.courseId}&i=${item.id}`} onClick={onClose}>
                  Ask about it
                </a>
              ) : (
                <>
                  <a className="btn small" href={`#/ask?c=${item.courseId}&i=${item.id}&m=question`} onClick={onClose}>
                    Ask a question
                  </a>
                  <a className="btn small" href={`#/check?i=${item.id}`} onClick={onClose}>
                    Check my work
                  </a>
                  <button type="button" className="btn small" onClick={() => setPrompt(true)}>
                    Get a prompt
                  </button>
                </>
              )}
            </span>
          </div>
        )}

        {steps.length > 0 && !done && (
          <Fold name="steps" summary={<FoldTitle title="Steps" meta={`${stepsDone} of ${steps.length}`} />}>
            <ul className="sheet-lines">
              {steps.map((s) => (
                <li key={s.id} className="sheet-line" data-done={s.done} data-kind="step">
                  <label className="sheet-line-row">
                    <input type="checkbox" checked={s.done} onChange={() => toggleStep(s.id)} aria-label={s.label} />
                  </label>
                  <div className="sheet-line-main">
                    <div className="sheet-line-top">
                      <span className="sheet-line-text">{s.label}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Fold>
        )}
        {item.rubric?.criteria.length ? (
          <Fold name="rubric" summary={<FoldTitle title="Rubric" meta={`${item.rubric.criteria.length} criteria${rubricTotal(item) > 0 ? `, ${rubricTotal(item)} pts` : ''}`} />}>
            <RubricList item={item} />
          </Fold>
        ) : null}
        {description && (
          <Fold name="halo" summary={<FoldTitle title={halo ? 'Full instructions from Halo' : 'Your notes'} meta={`${Math.min(description.split(/\s+/).length, 999)} words`} />}>
            <p className="sheet-text">{description}</p>
            {(item.plan?.sources.length ?? 0) > 0 && (
              <p className="hint">
                <b>Covered by:</b>{' '}
                {item.plan!.sources.map((s, i) =>
                  s.href ? (
                    <a key={i} className="diff-toggle" href={s.href} style={{ marginRight: 8 }} onClick={onClose}>
                      {s.label}
                    </a>
                  ) : (
                    <span key={i} style={{ marginRight: 8 }}>{s.label}</span>
                  ),
                )}
              </p>
            )}
          </Fold>
        )}
        {studyWith && (
          <Fold name="study" summary={<FoldTitle title="Study with" meta={[decks.length ? `${decks.length} slide deck${decks.length === 1 ? '' : 's'}` : '', recs.length ? `${recs.length} lecture${recs.length === 1 ? '' : 's'}` : '', sylLine ? 'the syllabus' : ''].filter(Boolean).join(', ')} />}>
            {decks.length > 0 && (
              <p className="hint">
                Slides:{' '}
                {decks.map((d) => (
                  <a key={d.id} className="diff-toggle" href={`#/library?v=slides&deck=${d.id}`} style={{ marginRight: 8 }} onClick={onClose}>
                    {d.title} ({fmtDate(d.date, 'short')})
                  </a>
                ))}
              </p>
            )}
            {recs.length > 0 && (
              <p className="hint">
                Lectures that week:{' '}
                {recs.map((r) => (
                  <a key={r.id} className="diff-toggle" href={`#/library?c=${item.courseId}`} style={{ marginRight: 8 }} onClick={onClose}>
                    {r.title} ({fmtDate(dateOf(r.startedAt, tz), 'short')})
                  </a>
                ))}
              </p>
            )}
            {recs.some((r) => r.notes?.knowledge?.examFlags.length) && (
              <p className="hint">
                <b>The professor flagged:</b>{' '}
                {recs
                  .flatMap((r) => (r.notes?.knowledge?.examFlags ?? []).map((f) => `“${f.point}” (${r.title}, ${fmtDate(dateOf(r.startedAt, tz), 'short')}${f.at ? ` at ${f.at}` : ''})`))
                  .slice(0, 3)
                  .join(' · ')}
              </p>
            )}
            {sylLine && <blockquote className="study-syllabus hint">{sylLine}</blockquote>}
            {links.map((l) => (
              <p key={`${l.other.id}-${l.topic}`} className="hint">
                <b>Connects to</b> {l.other.code} {l.topic}: {l.note}
              </p>
            ))}
          </Fold>
        )}
        {impact && (
          <Fold name="impact" summary={<FoldTitle title="Grade impact" meta={impactShort ? `skip it: ${impactShort[1]}% to ${impactShort[2]}%` : ''} />}>
            <p className="sheet-text">{impact} Nothing is decided yet: it is one of many, and the rest can hold.</p>
          </Fold>
        )}
        <Fold name="edit" summary={<FoldTitle title="Edit details" />}>
          <form
            className="sheet-form"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            {fields}
            {formActions}
          </form>
        </Fold>
        {/* Where it came from and when it last matched Halo: one muted line at the end, never a section of its own. */}
        <SourceBlock item={item} />
      </div>
      {prompt && course && <PromptPanel item={item} course={course} onClose={() => setPrompt(false)} />}
    </Modal>
  );
}

function FoldTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <>
      <span className="fold-title">{title}</span>
      {meta && <span className="fold-meta mono">{meta}</span>}
    </>
  );
}

/** One line of the checklist: a tick, the line, a tiny tag for where it came from; tapping the text shows the detail. */
function SheetLine({ line, onToggle }: { line: TodoLine; onToggle: () => void }) {
  const [open, setOpen] = useState(false);
  const more = !!line.detail || !!line.post;
  const body: ReactNode = more ? (
    <button type="button" className="sheet-line-text" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
      {line.text}
    </button>
  ) : (
    <span className="sheet-line-text">{line.text}</span>
  );
  return (
    <li className="sheet-line" data-done={line.done} data-kind={line.kind}>
      <label className="sheet-line-row">
        <input type="checkbox" checked={line.done} onChange={onToggle} aria-label={line.text} />
      </label>
      <div className="sheet-line-main">
        <div className="sheet-line-top">
          {body}
          <span className="sheet-tag" data-tag={line.tag}>
            {line.tag}
          </span>
        </div>
        {open && (
          <div className="sheet-line-detail">
            {line.detail && <p>{line.detail}</p>}
            {line.post && <a href={line.post}>See full announcement</a>}
          </div>
        )}
      </div>
    </li>
  );
}
