import { useRef, useState } from 'react';
import { CourseChip } from '../components/CourseChip';
import { SegmentedControl } from '../components/SegmentedControl';
import { PALETTE } from '../data/courseDefaults';
import { fmtClock, hhmmToMinutes } from '../domain/dates';
import { newId } from '../domain/ids';
import type { Course } from '../domain/types';
import { useStore } from '../storage/store';
import { CourseEditor } from './CourseEditor';
import { ImportSyllabus } from './ImportSyllabus';
import { blankItem, ItemDetail } from './ItemDetail';
import { SyncPanel } from './SyncPanel';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ZONES = ['America/Phoenix', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'UTC'];

function meetingSummary(c: Course): string {
  if (c.online) return 'Online';
  if (c.meetings.length === 0) return 'No meeting times';
  return c.meetings
    .map((m) => {
      const s = hhmmToMinutes(m.start);
      return `${DAYS[m.day]} ${fmtClock(Math.floor(s / 60), s % 60)}`;
    })
    .join(' · ');
}

export function Settings() {
  const { data, today, actions } = useStore();
  const [editing, setEditing] = useState<Course | null>(null);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const blob = new Blob([actions.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `school-dashboard-${today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importJson = async (file: File) => {
    try {
      const r = actions.importJson(await file.text());
      setNote(`Imported ${r.courses} classes and ${r.items} items.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };

  const hours = (min: number) => (min / 60).toString();

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <div className="settings-grid">
        <SyncPanel />

        <section className="card settings-card">
          <h2 className="section-title">Study time and display</h2>
          <div className="field-row" style={{ marginTop: 10 }}>
            <label className="field">
              <span>Weekday study hours</span>
              <input
                type="number"
                min={0}
                max={16}
                step={0.5}
                inputMode="decimal"
                value={hours(data.settings.weekdayMinutes)}
                onChange={(e) => actions.updateSettings({ weekdayMinutes: Math.round(Number(e.target.value) * 60) })}
              />
            </label>
            <label className="field">
              <span>Weekend study hours</span>
              <input
                type="number"
                min={0}
                max={16}
                step={0.5}
                inputMode="decimal"
                value={hours(data.settings.weekendMinutes)}
                onChange={(e) => actions.updateSettings({ weekendMinutes: Math.round(Number(e.target.value) * 60) })}
              />
            </label>
          </div>
          <p className="hint">Hours per day of focused schoolwork outside class. Start-by dates and the workload view are computed from these.</p>
          <div className="field-row" style={{ marginTop: 12 }}>
            <div className="field">
              <span>Week starts on</span>
              <SegmentedControl
                label="Week starts on"
                value={String(data.settings.weekStartsOn) as '0' | '1'}
                options={[
                  { value: '0', label: 'Sunday' },
                  { value: '1', label: 'Monday' },
                ]}
                onChange={(v) => actions.updateSettings({ weekStartsOn: Number(v) as 0 | 1 })}
              />
            </div>
            <div className="field">
              <span>Theme</span>
              <SegmentedControl
                label="Theme"
                value={data.settings.theme}
                options={[
                  { value: 'system', label: 'Auto' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
                onChange={(v) => actions.updateSettings({ theme: v })}
              />
            </div>
          </div>
          <label className="field" style={{ marginTop: 12 }}>
            <span>Time zone</span>
            <input list="zones" value={data.settings.timezone} onChange={(e) => actions.updateSettings({ timezone: e.target.value })} />
            <datalist id="zones">
              {ZONES.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </label>
        </section>

        <section className="card settings-card">
          <div className="grade-head">
            <h2 className="section-title">Classes</h2>
            <button
              type="button"
              className="btn small"
              onClick={() =>
                setEditing({
                  id: newId(),
                  code: '',
                  name: '',
                  color: PALETTE[data.courses.length % PALETTE.length],
                  credits: 3,
                  instructors: [],
                  meetings: [],
                  online: false,
                  termStart: data.courses[0]?.termStart ?? today,
                  termEnd: data.courses[0]?.termEnd ?? today,
                  updatedAt: '',
                })
              }
            >
              Add class
            </button>
          </div>
          <ul className="course-list">
            {data.courses.map((c) => (
              <li key={c.id}>
                <button type="button" className="course-row" onClick={() => setEditing(c)}>
                  <CourseChip course={c} />
                  <span className="course-row-name">{c.name}</span>
                  <span className="hint">{meetingSummary(c)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="hint">Tap a class to change its color, meeting times, or delete it.</p>
        </section>

        <section className="card settings-card">
          <h2 className="section-title">Your data</h2>
          <div className="settings-actions">
            <button type="button" className="btn" onClick={() => setImporting(true)}>
              Import syllabus PDF
            </button>
            <button type="button" className="btn" onClick={() => setAdding(true)}>
              Add an item by hand
            </button>
            <button type="button" className="btn" onClick={exportJson}>
              Export backup (JSON)
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Restore backup
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="visually-hidden" onChange={(e) => e.target.files?.[0] && void importJson(e.target.files[0])} />
            {confirmReset ? (
              <button type="button" className="btn danger" onClick={() => { actions.resetToSeed(); setConfirmReset(false); setNote('Reset to the six Fall 2026 syllabi.'); }}>
                Confirm reset, this wipes scores and done marks
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => setConfirmReset(true)}>
                Reset to seed
              </button>
            )}
          </div>
          {note && <p className="hint" style={{ marginTop: 8 }}>{note}</p>}
          <p className="hint" style={{ marginTop: 8 }}>
            {data.courses.length} classes, {data.items.length} items. Estimates and start-by rules live in the source under src/domain if you want to tune them.
          </p>
        </section>
      </div>

      {editing && <CourseEditor key={editing.id} course={editing} onClose={() => setEditing(null)} />}
      {importing && <ImportSyllabus onClose={() => setImporting(false)} />}
      {adding && <ItemDetail item={blankItem(data.courses[0]?.id ?? '', data.settings.timezone, today)} isNew onClose={() => setAdding(false)} />}
    </>
  );
}
