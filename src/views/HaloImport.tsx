import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CourseChip } from '../components/CourseChip';
import { SegmentedControl } from '../components/SegmentedControl';
import { Modal } from '../components/Modal';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { TYPE_LABELS } from '../domain/types';
import { countVisible, defaultSelection, planFromDiff, type Selection } from '../halo/apply';
import { diffHalo, type FieldChange } from '../halo/diff';
import { parseHaloExport, saveLastSync } from '../halo/handoff';
import { parseHaloDate, type BareDateMode } from '../halo/normalize';
import type { HaloExport } from '../halo/types';
import { useStore } from '../storage/store';

type Group = keyof Selection;

const cityOf = (tz: string) => tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;

function Section({
  title,
  count,
  children,
  collapsible = false,
  open = true,
  onToggle,
  onAll,
  onNone,
}: {
  title: string;
  count: number;
  children?: ReactNode;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  onAll?: () => void;
  onNone?: () => void;
}) {
  return (
    <section className="diff-section">
      <h3>
        {title} <span className="count">{count}</span>
        {collapsible && count > 0 && (
          <button type="button" className="diff-toggle" onClick={onToggle}>
            {open ? 'hide' : 'show'}
          </button>
        )}
        {onAll && count > 1 && (
          <span className="diff-bulk">
            <button type="button" className="diff-toggle" onClick={onAll}>
              all
            </button>
            <button type="button" className="diff-toggle" onClick={onNone}>
              none
            </button>
          </span>
        )}
      </h3>
      {open && count > 0 && children}
    </section>
  );
}

export function HaloImport({ payload: initial = null, onClose }: { payload?: HaloExport | null; onClose: () => void }) {
  const { data, actions } = useStore();
  const tz = data.settings.timezone;
  const [payload, setPayload] = useState<HaloExport | null>(initial);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [bareAs, setBareAs] = useState<BareDateMode>('utc');
  const [includeZero, setIncludeZero] = useState(false);
  const [sel, setSel] = useState<Selection | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [confirmZone, setConfirmZone] = useState(false);
  const [applied, setApplied] = useState<{ added: number; changed: number; removed: number; completed: number; linked: number } | null>(null);
  // Frozen per payload so the diff does not drift while it is on screen.
  const now = useMemo(() => new Date().toISOString(), [payload]); // eslint-disable-line react-hooks/exhaustive-deps
  const diff = useMemo(
    () => (payload ? diffHalo(payload, data, { tz, now, bareAs, includeZeroPoint: includeZero }) : null),
    [payload, data, tz, now, bareAs, includeZero],
  );
  useEffect(() => {
    setSel(diff ? defaultSelection(diff) : null);
    setConfirmZone(false);
  }, [diff]);

  const when = (iso: string) => `${fmtDate(dateOf(iso, tz), 'short')} ${fmtTime(iso, tz)}`;
  const read = (t: string) => {
    try {
      setPayload(parseHaloExport(t));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const fromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      setText(t);
      read(t);
    } catch {
      setError('Could not read the clipboard. Paste into the box instead.');
    }
  };
  const toggle = (group: Group, key: string) =>
    setSel((s) => {
      if (!s) return s;
      const next = new Set(s[group]);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...s, [group]: next };
    });
  const setAll = (group: Group, keys: string[]) => setSel((s) => (s ? { ...s, [group]: new Set(keys) } : s));
  const flip = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const apply = () => {
    if (!diff || !sel) return;
    const plan = planFromDiff(diff, sel);
    actions.applyHaloSync(plan);
    const summary = { added: sel.added.size, changed: sel.changed.size, removed: sel.missing.size, completed: plan.complete.length, linked: diff.unchanged.length };
    saveLastSync({ at: now, added: summary.added, changed: summary.changed, removed: summary.removed, completed: summary.completed });
    setApplied(summary);
  };

  const ChangeLine = ({ c }: { c: FieldChange }) => {
    const label = c.field === 'dueAt' ? 'Due' : c.field === 'points' ? 'Points' : 'Title';
    const f = (v: string | number | null) => (c.field === 'dueAt' && typeof v === 'string' ? when(v) : String(v ?? '—'));
    return (
      <div className="diff-change">
        {label}: <span className="old">{f(c.from)}</span> → <mark>{f(c.to)}</mark>
      </div>
    );
  };

  return (
    <Modal title="Sync from Halo" onClose={onClose}>
      <div className="modal-body">
        {!payload && (
          <>
            <p className="hint">Click the Sync Halo bookmark while you are on halo.gcu.edu. If this tab did not pick it up on its own, paste the export here. It contains assignment data only, never your login.</p>
            <textarea
              className="halo-paste"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder='{"kind":"halo-export", …}'
              rows={6}
              spellCheck={false}
            />
            {error && (
              <p className="hint" style={{ color: 'var(--overdue)' }}>
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => void fromClipboard()}>
                Paste from clipboard
              </button>
              <span className="spacer" />
              <button type="button" className="btn primary" disabled={!text.trim()} onClick={() => read(text)}>
                Read export
              </button>
            </div>
          </>
        )}

        {payload && diff && sel && !applied && (
          <>
            <p className="hint mono">
              {payload.classes.length} classes · exported {when(payload.exportedAt)}
              {diff.courses.created.length > 0 && ` · new classes: ${diff.courses.created.map((c) => c.code).join(', ')}`}
            </p>
            {diff.rawDates[0] && (
              <div className="diff-zone" data-warn={diff.zoneWarning ? 'true' : 'false'} role={diff.zoneWarning ? 'alert' : undefined}>
                <div className="diff-zone-grid">
                  <span className="diff-zone-k">Halo says</span>
                  <code>{diff.rawDates[0]}</code>
                  <span className="diff-zone-k">Read as</span>
                  <b>{when(parseHaloDate(diff.rawDates[0], tz, bareAs) ?? now)}</b>
                </div>
                {diff.bareDates ? (
                  <div className="diff-zone-toggle">
                    <span className="diff-zone-k">Halo&apos;s clock is</span>
                    <SegmentedControl
                      label="How to read Halo times"
                      value={bareAs}
                      options={[
                        { value: 'utc', label: 'UTC' },
                        { value: 'local', label: cityOf(tz) },
                      ]}
                      onChange={(v) => setBareAs(v as BareDateMode)}
                    />
                  </div>
                ) : (
                  <p className="hint" style={{ margin: 0 }}>
                    These timestamps carry their own time zone, so no reading is needed.
                  </p>
                )}
                {diff.zoneWarning && <p className="diff-zone-warn">{diff.zoneWarning}</p>}
              </div>
            )}

            <Section title="New" count={diff.added.length} onAll={() => setAll('added', diff.added.map((e) => e.key))} onNone={() => setAll('added', [])}>
              {diff.added.map((e) => (
                <label key={e.key} className="diff-row">
                  <input type="checkbox" checked={sel.added.has(e.key)} onChange={() => toggle('added', e.key)} />
                  <div>
                    <div className="title">
                      {e.item.label} <CourseChip course={e.course} />
                    </div>
                    <div className="meta">
                      <span>due {when(e.item.dueAt)}</span>
                      <span>{e.item.points} pts</span>
                      <span>{TYPE_LABELS[e.item.type]}</span>
                      {e.submitted && <span>submitted in Halo</span>}
                      {e.oddTime && (
                        <span className="tag-zone" title="Ends in :59 at an odd hour. Usually a time-zone misread.">
                          zone? {e.oddTime}
                        </span>
                      )}
                    </div>
                  </div>
                </label>
              ))}
            </Section>

            <Section title="Changed" count={diff.changed.length} onAll={() => setAll('changed', diff.changed.map((e) => e.key))} onNone={() => setAll('changed', [])}>
              {diff.changed.map((e) => (
                <label key={e.key} className="diff-row">
                  <input type="checkbox" checked={sel.changed.has(e.key)} onChange={() => toggle('changed', e.key)} />
                  <div>
                    <div className="title">
                      {e.existing.label} <CourseChip course={e.course} />
                    </div>
                    {e.changes.map((c) => (
                      <ChangeLine key={c.field} c={c} />
                    ))}
                    {e.changes.some((c) => c.field === 'dueAt') && e.halo.dueDate && <div className="diff-raw">Halo: {e.halo.dueDate}</div>}
                    {e.oddTime && (
                      <div className="diff-change">
                        <span className="tag-zone" title="Ends in :59 at an odd hour. Usually a time-zone misread.">
                          zone? {e.oddTime}
                        </span>
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </Section>

            <Section title="Submitted in Halo, not done here" count={diff.submitted.length} onAll={() => setAll('submitted', diff.submitted.map((e) => e.key))} onNone={() => setAll('submitted', [])}>
              {diff.submitted.map((e) => (
                <label key={e.key} className="diff-row">
                  <input type="checkbox" checked={sel.submitted.has(e.key)} onChange={() => toggle('submitted', e.key)} />
                  <div>
                    <div className="title">
                      {e.title} <CourseChip course={e.course} />
                    </div>
                    <div className="meta">
                      <span>mark done as of {when(e.at)}</span>
                      {e.score != null && <span>score {e.score}</span>}
                    </div>
                  </div>
                </label>
              ))}
            </Section>

            <Section title="No longer in Halo" count={diff.missing.length} onAll={() => setAll('missing', diff.missing.map((e) => e.key))} onNone={() => setAll('missing', [])}>
              {diff.missing.map((e) => (
                <label key={e.key} className="diff-row">
                  <input type="checkbox" checked={sel.missing.has(e.key)} onChange={() => toggle('missing', e.key)} />
                  <div>
                    <div className="title">
                      {e.existing.label} <CourseChip course={e.course} />
                    </div>
                    <div className="meta">
                      <span>{sel.missing.has(e.key) ? 'remove' : 'keep'}</span>
                      <span>{e.existing.status === 'done' ? 'done here' : e.existing.status === 'in_progress' ? 'in progress here' : 'not started'}</span>
                    </div>
                  </div>
                </label>
              ))}
            </Section>

            <Section title="Unchanged" count={diff.unchanged.length} collapsible open={!!open.unchanged} onToggle={() => flip('unchanged')}>
              <ul className="diff-list">
                {diff.unchanged.map((e) => (
                  <li key={e.key}>{e.existing.label}</li>
                ))}
              </ul>
            </Section>
            <Section title="Skipped" count={diff.skipped.length} collapsible open={!!open.skipped} onToggle={() => flip('skipped')}>
              <ul className="diff-list">
                {diff.skipped.map((s, i) => (
                  <li key={i}>
                    {s.course} {s.title} · {s.reason}
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Not in Halo, left alone" count={diff.untouched.length} collapsible open={!!open.untouched} onToggle={() => flip('untouched')}>
              <ul className="diff-list">
                {diff.untouched.map((i) => (
                  <li key={i.id}>{i.label}</li>
                ))}
              </ul>
            </Section>

            <label className="hint" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input type="checkbox" checked={includeZero} onChange={(e) => setIncludeZero(e.target.checked)} />
              Include items worth 0 points
            </label>

            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose}>
                Cancel
              </button>
              <span className="spacer" />
              <button
                type="button"
                className={confirmZone ? 'btn danger' : 'btn primary'}
                onClick={() => {
                  if (diff.zoneWarning && !confirmZone) {
                    setConfirmZone(true);
                    return;
                  }
                  apply();
                }}
                disabled={countVisible(sel) === 0 && diff.unchanged.length === 0 && diff.courses.created.length === 0}>
                {confirmZone ? 'Apply anyway, dates may be wrong' : countVisible(sel) > 0 ? `Apply ${countVisible(sel)} change${countVisible(sel) === 1 ? '' : 's'}` : diff.unchanged.length > 0 ? 'Link items, nothing else changes' : 'Nothing to apply'}
              </button>
            </div>
          </>
        )}

        {applied && (
          <>
            <p>
              <b>Applied.</b>
            </p>
            <ul className="diff-list">
              <li>{applied.added} added</li>
              <li>{applied.changed} updated</li>
              <li>{applied.completed} marked done</li>
              <li>{applied.removed} removed</li>
              <li>{applied.linked} linked to Halo with nothing else touched</li>
            </ul>
            <div className="modal-actions">
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
