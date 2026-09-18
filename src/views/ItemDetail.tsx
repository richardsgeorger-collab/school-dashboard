import { useEffect, useMemo, useState } from 'react';
import { libraryDb, type Deck } from '../library/db';
import { decksForItem } from '../library/links';
import { terms } from '../library/search';
import { recordingsDb, type Recording } from '../record/db';
import { syllabiDb } from '../syllabus/db';
import { QuizLink } from './Quiz';
import { gatedBy } from '../domain/gating';
import { linksFor } from '../ingest/links';
import { BLOCK_REASONS, BLOCK_WORDS, blockPhrase, isBlocked, makeBlock } from '../domain/blocked';
import type { BlockReason } from '../domain/types';
import { Feedback, RubricBlock } from './Feedback';
import { Sure } from './PlanReview';
import { WorkPanel } from './WorkPanel';
import { addDays } from '../domain/dates';
import { Modal } from '../components/Modal';
import { SegmentedControl } from '../components/SegmentedControl';
import { dateOf, fmtDate, fmtMinutes, makeIso, zonedParts } from '../domain/dates';
import { estimateMinutes } from '../domain/estimate';
import { newId } from '../domain/ids';
import { shortLabel } from '../domain/labels';
import { DEFAULT_FLAGS, ITEM_TYPES, TYPE_LABELS, type Item, type ItemStatus, type ItemType } from '../domain/types';
import { useStore } from '../storage/store';

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
  status: ItemStatus;
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

export function ItemDetail({ item, isNew = false, onClose }: { item: Item; isNew?: boolean; onClose: () => void }) {
  const { data, courseById, schedule, actions, today, derived } = useStore();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [recs, setRecs] = useState<Recording[]>([]);
  const [sylLine, setSylLine] = useState<string | null>(null);
  useEffect(() => {
    libraryDb
      .listDecks()
      .then((all) => setDecks(decksForItem(item, all)))
      .catch(() => setDecks([]));
    const tzNow = data.settings.timezone;
    const due = dateOf(item.dueAt, tzNow);
    const from = addDays(due, -7);
    recordingsDb
      .list()
      .then((all) => setRecs(all.filter((r) => r.courseId === item.courseId && r.status !== 'recording' && dateOf(r.startedAt, tzNow) >= from && dateOf(r.startedAt, tzNow) <= due).slice(0, 3)))
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
  }, [item, data.settings.timezone]);
  const inference = derived[item.id];
  const tz = data.settings.timezone;
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
      status: item.status,
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
  const suggestedLabel = useMemo(
    () => shortLabel({ title: draft.title, courseCode: course?.code ?? '', type: draft.type }),
    [draft.title, draft.type, course?.code],
  );
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
      status: draft.status,
      completedAt: draft.status === 'done' ? (item.completedAt ?? new Date().toISOString()) : null,
      score: draft.score === '' ? null : Number(draft.score),
      notes: draft.notes,
      flags: { ...item.flags, inClass: draft.inClass, group: draft.group },
    };
    actions.upsertItem(next);
    onClose();
  };

  return (
    <Modal title={isNew ? 'New item' : effectiveLabel || 'Edit item'} onClose={onClose}>
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field">
          <span>Full name (from the syllabus)</span>
          <input value={draft.title} onChange={(e) => set('title', e.target.value)} required autoComplete="off" />
        </label>
        <label className="field">
          <span>Short label</span>
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
              'Shown on the calendar and in lists; the full name stays as the subtitle.'
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
            <span>Opens (optional)</span>
            <input type="date" value={draft.opensDate} onChange={(e) => set('opensDate', e.target.value)} />
          </label>
          <label className="field">
            <span>Points</span>
            <input type="number" min={0} step={1} inputMode="numeric" value={draft.points} onChange={(e) => set('points', e.target.value)} />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span>Estimated minutes</span>
            <input
              type="number"
              min={0}
              step={15}
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
            <span>Start by (override)</span>
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
        <div className="field">
          <span>Status</span>
          <SegmentedControl
            label="Status"
            value={draft.status}
            options={[
              { value: 'todo', label: 'To do' },
              { value: 'in_progress', label: 'In progress' },
              { value: 'done', label: 'Done' },
            ]}
            onChange={(v) => set('status', v)}
          />
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
                <option value="">Nothing — it can be done</option>
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
            <span>Score (points earned)</span>
            <input type="number" min={0} step={0.5} inputMode="decimal" value={draft.score} onChange={(e) => set('score', e.target.value)} placeholder="Not graded" />
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
        {!isNew && item.plan && (item.plan.asks || item.plan.prerequisites.some((p) => !p.itemId) || item.plan.sources.length > 0) && (
          <div className="plan-block">
            {item.plan.asks && !item.brief && (
              <p className="hint">
                <b>What it asks for</b> <span className="ai-from">AI</span>
                <span className="plan-why">{item.plan.asks}</span>
              </p>
            )}
            {item.plan.prerequisites.some((p) => !p.itemId) && (
              <p className="hint">
                <b>First:</b> {item.plan.prerequisites.filter((p) => !p.itemId).map((p) => `${p.text} (${p.source})`).join(' ')}
              </p>
            )}
            {item.plan.sources.length > 0 && (
              <p className="hint">
                <b>Covered by:</b>{' '}
                {item.plan.sources.map((s, i) =>
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
          </div>
        )}
        {!isNew && <Feedback item={item} />}
        {!isNew && <RubricBlock item={item} />}
        {!isNew && course && <WorkPanel item={item} course={course} />}
        {!isNew && (
          <div className="study">
            <p className="hint">
              <b>Study with</b>
            </p>
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
            <p className="hint">
              <QuizLink courseId={item.courseId} topic={item.title} label="Quiz me on this" />{' '}
              <a className="btn small" href={`#/tutor?c=${item.courseId}&t=${encodeURIComponent(item.topic ?? item.title)}&i=${item.id}`} onClick={onClose}>
                Explain this like I’m behind
              </a>
            </p>
          </div>
        )}
        {!isNew &&
          linksFor(item, data.settings.topicLinks ?? [], data.courses).map((l) => (
            <p key={`${l.other.id}-${l.topic}`} className="hint">
              <b>Connects to</b> {l.other.code} {l.topic}: {l.note}
            </p>
          ))}
        {item.haloLate && (
          <p className="hint late-note">
            <b>Halo says late:</b> {item.haloLate}{' '}
            <button type="button" className="muted" style={{ textDecoration: 'underline' }} onClick={() => actions.upsertItem({ ...item, haloLate: null })}>
              checked, clear this
            </button>
          </p>
        )}
        {!isNew && gatedBy(item, data.items).length > 0 && (
          <p className="hint">
            Needs first:{' '}
            {gatedBy(item, data.items).map((g) => (
              <span key={g.id} className="mono" style={{ marginRight: 8 }}>
                {g.label} ({fmtDate(dateOf(g.dueAt, tz), 'short')})
              </span>
            ))}
          </p>
        )}
        {!isNew && (
          <details className="unlocks">
            <summary className="hint">Unlocks {item.blocks?.length ? `${item.blocks.length} item${item.blocks.length === 1 ? '' : 's'}` : 'nothing'} — a small task that gates bigger work carries its urgency</summary>
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
        {item.url && (
          <p className="hint">
            <a href={item.url} target="_blank" rel="noreferrer">
              Open in Halo
            </a>
          </p>
        )}
        {item.snoozedUntil && item.snoozedUntil > today && (
          <p className="hint">
            Pushed down until {fmtDate(item.snoozedUntil, 'long')} ·{' '}
            <button type="button" className="muted" style={{ textDecoration: 'underline' }} onClick={() => { actions.upsertItem({ ...item, snoozedUntil: null, startByOverride: item.startByOverride === item.snoozedUntil ? null : item.startByOverride }); onClose(); }}>
              bring it back
            </button>
          </p>
        )}
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
      </form>
    </Modal>
  );
}
