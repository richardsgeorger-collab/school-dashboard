import { useMemo, useState } from 'react';
import { Modal } from '../components/Modal';
import { COURSE_DEFAULTS, PALETTE } from '../data/courseDefaults';
import { dateOf, fmtDate, fmtMinutes } from '../domain/dates';
import { TYPE_LABELS } from '../domain/types';
import { parseGcuSyllabus, type ParsedSyllabus } from '../parser/gcuSyllabus';
import { extractLines } from '../parser/pdfText';
import { toAppData } from '../parser/toAppData';
import { useStore } from '../storage/store';

export function ImportSyllabus({ onClose }: { onClose: () => void }) {
  const { data, actions } = useStore();
  const tz = data.settings.timezone;
  const [parsed, setParsed] = useState<ParsedSyllabus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [includeZero, setIncludeZero] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'replace' | 'merge'>('merge');

  const existing = parsed ? data.courses.find((c) => c.code === parsed.code) : undefined;

  const preview = useMemo(() => {
    if (!parsed) return null;
    const defaults =
      existing ? { color: existing.color, meetings: existing.meetings, online: existing.online } : (COURSE_DEFAULTS[parsed.code] ?? { color: PALETTE[data.courses.length % PALETTE.length] });
    return toAppData(parsed, { includeZeroPoint: includeZero, tz, defaults, existingCourseId: existing?.id });
  }, [parsed, includeZero, tz, existing, data.courses.length]);

  const handleFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setParsed(null);
    try {
      const lines = /\.txt$/i.test(file.name) ? (await file.text()).split('\n') : await extractLines(await file.arrayBuffer());
      setParsed(parseGcuSyllabus(lines, { tz }));
      setExcluded(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const doImport = () => {
    if (!preview) return;
    const items = preview.items.filter((i) => !excluded.has(i.id));
    actions.importParsed(preview.course, items, existing ? mode : 'replace');
    onClose();
  };

  return (
    <Modal title="Import a syllabus" onClose={onClose}>
      <div className="modal-body">
        {!parsed && (
          <>
            <label
              className="dropzone"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f) void handleFile(f);
              }}
            >
              <input type="file" accept="application/pdf,.pdf,.txt" className="visually-hidden" onChange={(e) => e.target.files?.[0] && void handleFile(e.target.files[0])} />
              <b>{busy ? 'Reading…' : 'Choose a GCU syllabus PDF'}</b>
              <span className="hint">Download it from the class page in Halo. Drop it here or tap to browse.</span>
            </label>
            {error && <p className="hint" style={{ color: 'var(--overdue)' }}>{error}</p>}
          </>
        )}
        {parsed && preview && (
          <>
            <div>
              <h3 style={{ fontSize: 18 }}>
                {parsed.code} <span className="muted" style={{ fontWeight: 500 }}>{parsed.name}</span>
              </h3>
              <p className="hint mono">
                {parsed.credits} credits · {fmtDate(parsed.termStart, 'short')} – {fmtDate(parsed.termEnd, 'short')} · {parsed.assessments.length} assessments found
              </p>
              {parsed.warnings.length > 0 && (
                <p className="hint" style={{ color: 'var(--risk)' }}>
                  Check these: {parsed.warnings.join('; ')}
                </p>
              )}
            </div>
            {existing && (
              <div className="field">
                <span>{existing.code} is already in your dashboard</span>
                <div className="segmented" role="group" aria-label="Import mode">
                  <button type="button" aria-pressed={mode === 'merge'} onClick={() => setMode('merge')}>
                    Merge (keep my scores and done marks)
                  </button>
                  <button type="button" aria-pressed={mode === 'replace'} onClick={() => setMode('replace')}>
                    Replace
                  </button>
                </div>
              </div>
            )}
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <input type="checkbox" checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} />
              Include zero-point items (introductions, day-of participation)
            </label>
            <div className="preview-wrap">
              <table className="preview">
                <thead>
                  <tr>
                    <th aria-label="Include" />
                    <th>Item</th>
                    <th>Type</th>
                    <th>Due</th>
                    <th>Pts</th>
                    <th>Est.</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((i) => (
                    <tr key={i.id} data-excluded={excluded.has(i.id)}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!excluded.has(i.id)}
                          aria-label={`Include ${i.title}`}
                          onChange={(e) => {
                            const next = new Set(excluded);
                            if (e.target.checked) next.delete(i.id);
                            else next.add(i.id);
                            setExcluded(next);
                          }}
                        />
                      </td>
                      <td className="preview-title">{i.title}</td>
                      <td>{TYPE_LABELS[i.type]}</td>
                      <td className="mono">{fmtDate(dateOf(i.dueAt, tz), 'numeric')}</td>
                      <td className="mono">{i.points}</td>
                      <td className="mono">{fmtMinutes(i.estimatedMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setParsed(null)}>
                Choose another file
              </button>
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={doImport}>
                Import {preview.items.length - excluded.size} items
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
