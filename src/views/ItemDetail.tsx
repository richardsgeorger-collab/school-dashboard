import { useMemo, useState } from 'react';
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
            {sched && <span className="hint">Computed {fmtDate(sched.startBy, 'long')}</span>}
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
        {item.snoozedUntil && item.snoozedUntil > today && (
          <p className="hint">
            Pushed down until {fmtDate(item.snoozedUntil, 'long')} ·{' '}
            <button type="button" className="muted" style={{ textDecoration: 'underline' }} onClick={() => { actions.upsertItem({ ...item, snoozedUntil: null }); onClose(); }}>
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
