import { useState } from 'react';
import { Modal } from '../components/Modal';
import { PALETTE } from '../data/courseDefaults';
import type { Course, Meeting } from '../domain/types';
import { useStore } from '../storage/store';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CourseEditor({ course, onClose }: { course: Course; onClose: () => void }) {
  const { actions, data } = useStore();
  const [draft, setDraft] = useState<Course>({ ...course, meetings: course.meetings.map((m) => ({ ...m })) });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof Course>(k: K, v: Course[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setMeeting = (idx: number, patch: Partial<Meeting>) =>
    set(
      'meetings',
      draft.meetings.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    );
  const itemCount = data.items.filter((i) => i.courseId === course.id).length;

  return (
    <Modal title={course.code ? `Edit ${course.code}` : 'New class'} onClose={onClose}>
      <form
        className="modal-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.code.trim()) return;
          actions.upsertCourse({ ...draft, code: draft.code.trim(), name: draft.name.trim() });
          onClose();
        }}
      >
        <div className="field-row">
          <label className="field">
            <span>Code</span>
            <input value={draft.code} onChange={(e) => set('code', e.target.value)} required />
          </label>
          <label className="field">
            <span>Credits</span>
            <input type="number" min={0} max={12} value={draft.credits} onChange={(e) => set('credits', Number(e.target.value) || 0)} />
          </label>
        </div>
        <label className="field">
          <span>Name</span>
          <input value={draft.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <div className="field">
          <span>Color</span>
          <div className="swatches">
            {PALETTE.map((hex) => (
              <button
                type="button"
                key={hex}
                className="swatch"
                style={{ background: hex }}
                aria-pressed={draft.color.toUpperCase() === hex}
                aria-label={hex}
                onClick={() => set('color', hex)}
              />
            ))}
          </div>
        </div>
        <div className="field-row">
          <label className="field">
            <span>Term start</span>
            <input type="date" value={draft.termStart} onChange={(e) => set('termStart', e.target.value)} required />
          </label>
          <label className="field">
            <span>Term end</span>
            <input type="date" value={draft.termEnd} onChange={(e) => set('termEnd', e.target.value)} required />
          </label>
        </div>
        <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={draft.online} onChange={(e) => set('online', e.target.checked)} />
          <span style={{ fontWeight: 500, fontSize: 14 }}>Online class (no meeting times)</span>
        </label>
        {!draft.online && (
          <div className="field">
            <span>Meetings</span>
            {draft.meetings.map((m, idx) => (
              <div key={idx} className="meeting-edit">
                <select value={m.day} onChange={(e) => setMeeting(idx, { day: Number(e.target.value) as Meeting['day'] })} aria-label="Day">
                  {DAYS.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
                <input type="time" value={m.start} onChange={(e) => setMeeting(idx, { start: e.target.value })} aria-label="Start" />
                <input type="time" value={m.end} onChange={(e) => setMeeting(idx, { end: e.target.value })} aria-label="End" />
                <button type="button" className="btn small" onClick={() => set('meetings', draft.meetings.filter((_, i) => i !== idx))} aria-label="Remove meeting">
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="btn small" onClick={() => set('meetings', [...draft.meetings, { day: 1, start: '09:00', end: '10:15' }])}>
              Add meeting
            </button>
          </div>
        )}
        <div className="modal-actions">
          {course.code &&
            (confirmDelete ? (
              <button type="button" className="btn danger" onClick={() => { actions.deleteCourse(course.id); onClose(); }}>
                Delete class and {itemCount} items
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>
                Delete class
              </button>
            ))}
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary">
            Save class
          </button>
        </div>
      </form>
    </Modal>
  );
}
