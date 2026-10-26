import { useMemo, useState } from 'react';
import { bump } from '../analytics/usage';
import { CourseChip } from '../components/CourseChip';
import { Modal } from '../components/Modal';
import { creditsFor, cumulativeGpa, fmtGpa, letterForPercent, semesterGpa } from '../domain/gpa';
import type { Course } from '../domain/types';
import { useStore } from '../storage/store';

/**
 * The projected semester GPA (George, 2026-10-24): each class's current Halo grade on GCU's scale (domain/gpa.ts),
 * weighted by its credits. A side thing, not a banner: a small "GPA 3.54" chip beside "Add class" on Classes; tapped,
 * a sheet with a row per class and its credits (the student's edit is kept), a what-if for its final grade (marked,
 * one tap to reset, gone when the sheet closes, never saved), and, only when asked for, the GPA so far for the
 * projected cumulative GPA. Everyone gets it, Free included. No chip until a class has a Halo grade.
 */
export function GpaChip() {
  const { data } = useStore();
  const [open, setOpen] = useState(false);
  const real = useMemo(() => semesterGpa(data.courses), [data.courses]);
  if (!data.courses.length || real.gpa === null) return null;
  return (
    <>
      <button
        type="button"
        className="btn small gpa-chip"
        onClick={() => {
          setOpen(true);
          bump('gpa:open');
        }}
        aria-haspopup="dialog"
        title="Semester GPA: by class, credits, what-if"
      >
        GPA <b>{fmtGpa(real.gpa)}</b>
      </button>
      {open && (
        <Modal title="Semester GPA" onClose={() => setOpen(false)}>
          <GpaPanel />
        </Modal>
      )}
    </>
  );
}

function GpaPanel() {
  const { data, actions } = useStore();
  const [whatIf, setWhatIf] = useState<Record<string, number>>({});
  const [trying, setTrying] = useState<string | null>(null);
  const [soFarOpen, setSoFarOpen] = useState(false);
  const real = useMemo(() => semesterGpa(data.courses), [data.courses]);
  const tried = useMemo(() => semesterGpa(data.courses, whatIf), [data.courses, whatIf]);
  const anyWhatIf = Object.keys(whatIf).length > 0;
  const shown = anyWhatIf ? tried : real;
  const counted = shown.rows.filter((r) => r.left === null).length;
  const soFar = data.settings.gpaSoFar ?? null;
  const cumulative = soFar ? cumulativeGpa(soFar, shown) : null;
  const reset = () => {
    setWhatIf({});
    setTrying(null);
  };
  const setCredits = (c: Course, n: number) => {
    if (!Number.isFinite(n) || n < 0 || n > 12) return;
    actions.upsertCourse({ ...c, credits: n, creditsFrom: 'student' });
  };
  return (
    <div className="gpa">
      <p className="gpa-head">
        <span className="gpa-value" data-whatif={anyWhatIf || undefined}>
          {fmtGpa(shown.gpa)}
        </span>
        {anyWhatIf ? <span className="gpa-tag">What-if</span> : <span className="gpa-sub">projected</span>}
        {cumulative !== null && <span className="gpa-sub">· cumulative {fmtGpa(cumulative)}</span>}
      </p>
      <p className="hint gpa-note">
        From {counted} class{counted === 1 ? '' : 'es'}' current grade
        {counted === 1 ? '' : 's'}
        {shown.ungraded > 0 ? ` · ${shown.ungraded} with no Halo grade yet, left out` : ''}.
        {anyWhatIf && (
          <>
            {' '}
            Real: {fmtGpa(real.gpa)}.{' '}
            <button type="button" className="hero-inline gpa-reset" onClick={reset}>
              Reset what-if
            </button>
          </>
        )}
      </p>
      <div className="gpa-body">
        <ul className="gpa-rows">
          {shown.rows.map((r) => {
            const c = data.courses.find((x) => x.id === r.courseId)!;
            const isTrying = trying === r.courseId;
            const realPct = c.haloGrade?.percent ?? null;
            const tryPct = whatIf[r.courseId] ?? realPct ?? 85;
            return (
              <li key={r.courseId} className="gpa-row" data-whatif={r.whatIf || undefined} data-left={r.left ?? undefined}>
                <button type="button" className="gpa-class" aria-expanded={isTrying} onClick={() => setTrying(isTrying ? null : r.courseId)} title="Try a different final grade">
                  <CourseChip course={c} />
                  <span className="gpa-grade">
                    {r.left === 'no-grade' ? 'No Halo grade yet' : `${r.percent !== null ? `${r.percent.toFixed(1)}% · ` : ''}${r.letter ?? ''}${r.points !== null ? ` · ${r.points.toFixed(1)}` : ''}`}
                  </span>
                  {r.whatIf && <span className="gpa-tag">What-if</span>}
                  {r.left === 'no-points' && <span className="hint">not on GCU's scale, left out</span>}
                </button>
                <label className="gpa-credits">
                  <input
                    type="number"
                    min={0}
                    max={12}
                    step={1}
                    inputMode="numeric"
                    value={creditsFor(c)}
                    aria-label={`Credits for ${c.code}`}
                    onChange={(e) => setCredits(c, Number(e.target.value))}
                  />
                  <span>cr</span>
                </label>
                {isTrying && (
                  <div className="gpa-try">
                    <label>
                      <span>What if {c.code} ends at</span>
                      <input
                        type="range"
                        min={50}
                        max={100}
                        step={0.5}
                        value={tryPct}
                        onChange={(e) =>
                          setWhatIf((w) => ({
                            ...w,
                            [r.courseId]: Number(e.target.value),
                          }))
                        }
                        aria-label={`What-if final grade for ${c.code}`}
                      />
                      <b>
                        {tryPct.toFixed(1)}% · {letterForPercent(tryPct, c.gradeScale)}
                      </b>
                    </label>
                    {r.whatIf && (
                      <button
                        type="button"
                        className="hero-inline"
                        onClick={() =>
                          setWhatIf((w) => {
                            const n = { ...w };
                            delete n[r.courseId];
                            return n;
                          })
                        }
                      >
                        Back to {realPct !== null ? `${realPct.toFixed(1)}%` : 'no grade'}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {soFarOpen || soFar ? (
          <SoFar value={soFar} cumulative={cumulative} onChange={(v) => actions.updateSettings({ gpaSoFar: v })} />
        ) : (
          <button type="button" className="hero-inline gpa-sofar-open" onClick={() => setSoFarOpen(true)}>
            Add your GPA so far for a cumulative GPA
          </button>
        )}
        <p className="hint gpa-source">
          GCU's undergraduate scale (A 4.0, A- 3.7, B+ 3.3, B 3.0, B- 2.7, C+ 2.3, C 2.0, D 1.0, F 0.0), each class graded on its own cutoffs from Halo. Credits from Halo; change any to match your
          schedule.
        </p>
      </div>
    </div>
  );
}

/** The GPA and credits on the transcript so far: kept on the account, cleared with one tap. */
function SoFar({ value, cumulative, onChange }: { value: { gpa: number; credits: number } | null; cumulative: number | null; onChange: (v: { gpa: number; credits: number } | null) => void }) {
  const [gpa, setGpa] = useState(value ? String(value.gpa) : '');
  const [credits, setCredits] = useState(value ? String(value.credits) : '');
  const save = (g: string, c: string) => {
    const gn = Number(g);
    const cn = Number(c);
    if (g.trim() && c.trim() && Number.isFinite(gn) && gn >= 0 && gn <= 4 && Number.isFinite(cn) && cn >= 0 && cn <= 300) onChange({ gpa: gn, credits: cn });
  };
  return (
    <div className="gpa-sofar">
      <label>
        <span>GPA so far</span>
        <input
          type="number"
          min={0}
          max={4}
          step={0.01}
          inputMode="decimal"
          value={gpa}
          placeholder="3.40"
          onChange={(e) => {
            setGpa(e.target.value);
            save(e.target.value, credits);
          }}
        />
      </label>
      <label>
        <span>Credits so far</span>
        <input
          type="number"
          min={0}
          max={300}
          step={1}
          inputMode="numeric"
          value={credits}
          placeholder="30"
          onChange={(e) => {
            setCredits(e.target.value);
            save(gpa, e.target.value);
          }}
        />
      </label>
      <span className="gpa-cum">
        Cumulative, projected: <b>{fmtGpa(cumulative)}</b>
      </span>
      {value && (
        <button
          type="button"
          className="hero-inline"
          onClick={() => {
            setGpa('');
            setCredits('');
            onChange(null);
          }}
        >
          Clear
        </button>
      )}
    </div>
  );
}
