import { useEffect, useMemo, useRef, useState } from 'react';
import { CourseChip } from '../components/CourseChip';
import { Modal } from '../components/Modal';
import { COURSE_DEFAULTS, PALETTE } from '../data/courseDefaults';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { stableId } from '../domain/ids';
import type { Course } from '../domain/types';
import { icsLocations, icsToExport, parseIcs, suggestCourse, type IcsFile, type IcsLocation } from '../ics/parse';
import { useStore } from '../storage/store';
import { DiffReview } from './DiffReview';

const NEW = '__new__';

/** Days since the export was made, from its DTSTAMP. */
export function exportAgeDays(stamp: string | null, now = Date.now()): number | null {
  if (!stamp) return null;
  const ms = now - new Date(stamp).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : null;
}

export function StaleLine({ stamp }: { stamp: string | null }) {
  const { data } = useStore();
  const tz = data.settings.timezone;
  const age = exportAgeDays(stamp);
  if (age === null) return <p className="stale" data-level="unknown">This export carries no timestamp, so its age is unknown.</p>;
  const when = stamp ? `${fmtDate(dateOf(stamp, tz), 'short')} ${fmtTime(stamp, tz)}` : '';
  if (age === 0) return <p className="stale" data-level="fresh">This export is from today, {when}.</p>;
  if (age <= 7) return <p className="stale" data-level="ok">This export is {age} day{age === 1 ? '' : 's'} old ({when}).</p>;
  return (
    <p className="stale" data-level="loud" role="alert">
      This export is {age} days old ({when}). Export a fresh one from Halo before applying.
    </p>
  );
}

function newCourse(location: string, code: string, index: number, template: Course | undefined, now: string): Course {
  const d = COURSE_DEFAULTS[code.toUpperCase()] ?? {};
  return {
    id: stableId(`course|ics|${location}|${code}`),
    code,
    name: location,
    color: d.color ?? PALETTE[index % PALETTE.length],
    credits: 3,
    instructors: [],
    meetings: d.meetings ?? [],
    online: d.online ?? false,
    termStart: template?.termStart ?? dateOf(now, 'America/Phoenix'),
    termEnd: template?.termEnd ?? dateOf(now, 'America/Phoenix'),
    updatedAt: now,
  };
}

/**
 * The primary data path: drop the .ics that Better Halo's "Export Assignments" makes, confirm which class each
 * LOCATION means (once), review the diff, apply.
 */
export function SyncAssignments({ initialFile = null, onClose }: { initialFile?: File | null; onClose: () => void }) {
  const { data, actions } = useStore();
  const tz = data.settings.timezone;
  const [file, setFile] = useState<IcsFile | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [locations, setLocations] = useState<IcsLocation[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [newCodes, setNewCodes] = useState<Record<string, string>>({});
  const [step, setStep] = useState<'drop' | 'map' | 'diff'>('drop');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const now = useMemo(() => new Date().toISOString(), []);

  const readFile = async (f: File) => {
    setError(null);
    try {
      const parsed = parseIcs(await f.text());
      if (parsed.events.length === 0) throw new Error('No events in that file. Use the .ics from Better Halo’s Export Assignments button.');
      const locs = icsLocations(parsed);
      const saved = data.settings.icsClassMap ?? {};
      const initial: Record<string, string> = {};
      for (const l of locs) initial[l.location] = saved[l.location] && data.courses.some((c) => c.id === saved[l.location]) ? saved[l.location] : (suggestCourse(l.location, l.codeHint, data.courses)?.id ?? NEW);
      setFile(parsed);
      setFileName(f.name);
      setLocations(locs);
      setChoice(initial);
      const allSaved = locs.every((l) => saved[l.location] && data.courses.some((c) => c.id === saved[l.location]));
      setStep(allSaved ? 'diff' : 'map');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  useEffect(() => {
    if (initialFile) void readFile(initialFile);
  }, [initialFile]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = useMemo(() => {
    const out: Course[] = [];
    locations.forEach((l, i) => {
      if (choice[l.location] === NEW && newCodes[l.location]?.trim()) out.push(newCourse(l.location, newCodes[l.location].trim().toUpperCase(), data.courses.length + i, data.courses[0], now));
    });
    return out;
  }, [locations, choice, newCodes, data.courses, now]);
  const allCourses = useMemo(() => [...data.courses, ...pending], [data.courses, pending]);
  const mapping = useMemo(() => {
    const m: Record<string, string> = {};
    for (const l of locations) {
      const c = choice[l.location];
      if (c === NEW) {
        const p = pending.find((x) => x.name === l.location);
        if (p) m[l.location] = p.id;
      } else if (c) m[l.location] = c;
    }
    return m;
  }, [locations, choice, pending]);
  const mapComplete = locations.every((l) => mapping[l.location]);
  const payload = useMemo(() => (file && step === 'diff' ? icsToExport(file, mapping, allCourses, tz, now) : null), [file, step, mapping, allCourses, tz, now]);
  const byId = useMemo(() => new Map(allCourses.map((c) => [c.id, c])), [allCourses]);
  const resolveCourse = useMemo(() => (c: { name: string }) => byId.get(mapping[c.name] ?? ''), [byId, mapping]);

  const confirmMap = () => {
    actions.updateSettings({ icsClassMap: { ...(data.settings.icsClassMap ?? {}), ...mapping } });
    setStep('diff');
  };

  return (
    <Modal title="Sync assignments" onClose={onClose}>
      <div className="modal-body">
        {step === 'drop' && (
          <>
            <p className="hint">In Halo, press Better Halo’s <b>Export Assignments</b> button, then drop the .ics file here. You will see every change before anything is applied.</p>
            <label
              className="sync-drop"
              data-dragging={dragging}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) void readFile(f);
              }}
            >
              <input ref={inputRef} type="file" accept=".ics,text/calendar" className="visually-hidden" onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])} />
              <b>Drop the .ics here</b>
              <span className="hint">or tap to choose the file</span>
            </label>
            {error && (
              <p className="hint" style={{ color: 'var(--overdue)' }}>
                {error}
              </p>
            )}
            <p className="hint">The export carries no submission status: this never marks anything done or undone, and never touches your notes, estimates, snoozes, or items you added yourself.</p>
          </>
        )}

        {step === 'map' && file && (
          <>
            <p className="hint mono">
              {fileName} · {file.events.length} assignments · {locations.length} classes
            </p>
            <StaleLine stamp={file.stamp} />
            <p className="hint">Which class is each of these? Your answers are remembered, so later imports skip this step.</p>
            <table className="sync-map">
              <thead>
                <tr>
                  <th>In the export</th>
                  <th>Class here</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((l) => (
                  <tr key={l.location}>
                    <td>
                      <div>{l.location}</div>
                      <div className="hint mono">
                        {l.count} item{l.count === 1 ? '' : 's'}
                        {l.codeHint ? ` · titles say ${l.codeHint}` : ''}
                      </div>
                    </td>
                    <td>
                      <select value={choice[l.location] ?? NEW} onChange={(e) => setChoice((c) => ({ ...c, [l.location]: e.target.value }))} aria-label={`Class for ${l.location}`}>
                        {data.courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.code} {c.name}
                          </option>
                        ))}
                        <option value={NEW}>New class…</option>
                      </select>
                      {choice[l.location] === NEW && (
                        <input className="sync-code" placeholder="Code, e.g. MAT-261" value={newCodes[l.location] ?? l.codeHint ?? ''} onChange={(e) => setNewCodes((n) => ({ ...n, [l.location]: e.target.value }))} aria-label={`Code for new class ${l.location}`} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
              <span className="spacer" />
              <button type="button" className="btn primary" disabled={!mapComplete} onClick={confirmMap}>
                Continue to the changes
              </button>
            </div>
          </>
        )}

        {step === 'diff' && file && payload && (
          <DiffReview
            payload={payload}
            source="ics"
            resolveCourse={resolveCourse}
            missingLabel="No longer in the export"
            banner={
              <>
                <p className="hint mono">
                  {fileName} · {file.events.length} assignments ·{' '}
                  {locations.map((l) => (
                    <CourseChip key={l.location} course={byId.get(mapping[l.location] ?? '')} />
                  ))}{' '}
                  <button type="button" className="diff-toggle" onClick={() => setStep('map')}>
                    change classes
                  </button>
                </p>
                <StaleLine stamp={file.stamp} />
              </>
            }
            onApplied={() => actions.updateSettings({ syncedAt: new Date().toISOString(), syncStamp: file.stamp })}
            onClose={onClose}
          />
        )}
      </div>
    </Modal>
  );
}
