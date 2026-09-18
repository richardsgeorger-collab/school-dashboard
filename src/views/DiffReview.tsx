import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { saveAnnouncements, saveExtras } from '../halo/announce';
import { pullsFrom } from '../halo/freshness';
import { SYNC_EVENT } from '../ingest/auto';
import { normCode } from '../halo/normalize';
import { CourseChip } from '../components/CourseChip';
import { SegmentedControl } from '../components/SegmentedControl';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { TYPE_LABELS, type Course } from '../domain/types';
import { countVisible, defaultSelection, planFromDiff, type Selection } from '../halo/apply';
import { diffHalo, type FieldChange } from '../halo/diff';
import type { BareDateMode, SyncSource } from '../halo/normalize';
import type { HaloClass, HaloExport } from '../halo/types';
import { useStore } from '../storage/store';

type Group = keyof Selection;
const cityOf = (tz: string) => tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;

export interface AppliedSummary {
  added: number;
  changed: number;
  removed: number;
  completed: number;
  scored: number;
  linked: number;
}

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

/**
 * The approve-before-apply screen shared by the .ics import and the Halo bookmark.
 * Every row is a checkbox; nothing is written until Apply.
 */
export function DiffReview({
  payload,
  source,
  resolveCourse,
  banner,
  missingLabel = 'No longer in Halo',
  onApplied,
  onClose,
}: {
  payload: HaloExport;
  source: SyncSource;
  resolveCourse?: (c: HaloClass) => Course | undefined;
  banner?: ReactNode;
  missingLabel?: string;
  onApplied?: (s: AppliedSummary) => void;
  onClose: () => void;
}) {
  const { data, actions } = useStore();
  const tz = data.settings.timezone;
  const [bareAs, setBareAs] = useState<BareDateMode>('utc');
  const [includeZero, setIncludeZero] = useState(false);
  const [sel, setSel] = useState<Selection | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [confirmZone, setConfirmZone] = useState(false);
  const [applied, setApplied] = useState<AppliedSummary | null>(null);
  // Frozen per payload so the diff does not drift while it is on screen.
  const now = useMemo(() => new Date().toISOString(), [payload]); // eslint-disable-line react-hooks/exhaustive-deps
  const diff = useMemo(
    () => diffHalo(payload, data, { tz, now, bareAs, includeZeroPoint: includeZero, source, resolveCourse }),
    [payload, data, tz, now, bareAs, includeZero, source, resolveCourse],
  );
  useEffect(() => {
    setSel(defaultSelection(diff));
    setConfirmZone(false);
  }, [diff]);

  const when = (iso: string) => `${fmtDate(dateOf(iso, tz), 'short')} ${fmtTime(iso, tz)}`;
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
  const [stored, setStored] = useState<{ saved: number; fresh: number; messages?: number; resources?: number; alerts?: number } | null>(null);

  const apply = async () => {
    if (!sel) return;
    const plan = planFromDiff(diff, sel);
    actions.applyHaloSync(plan);
    const summary = { added: sel.added.size, changed: sel.changed.size, removed: sel.missing.size, completed: plan.complete.length, scored: plan.scores.length, linked: diff.unchanged.length };
    // Announcements are not planner rows, so they are stored rather than approved; what they change is approved later,
    // one finding at a time. The same pass records what this pull actually carried, per class. Awaited, so the screen
    // never says it is done while the write is still in flight and a navigation could cut it off.
    const now = new Date().toISOString();
    const courseIdOf = (classId: string, code: string) => data.courses.find((c) => c.haloClassId === classId)?.id ?? data.courses.find((c) => normCode(c.code) === normCode(code))?.id ?? null;
    try {
      const r = await saveAnnouncements(payload, courseIdOf, now);
      const x = await saveExtras(payload, courseIdOf, now).catch(() => ({ messages: 0, resources: 0, alerts: 0 }));
      if (r.saved > 0 || x.messages > 0 || x.resources > 0) setStored({ ...r, ...x });
    } catch {
      // The planner is already written; all of this can come again on the next run.
    }
    actions.updateSettings({ haloPulls: pullsFrom(payload, courseIdOf, data.settings.haloPulls, now) });
    setApplied(summary);
    onApplied?.(summary);
    // Announcements live in their own store, which no React state watches; this is what tells Now to look again.
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(SYNC_EVENT));
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

  if (applied) {
    return (
      <>
        <p>
          <b>Applied.</b>
        </p>
        <ul className="diff-list">
          <li>{applied.added} added</li>
          <li>{applied.changed} updated</li>
          {source === 'halo' && <li>{applied.completed} marked done</li>}
          {source === 'halo' && <li>{applied.scored} scores from the gradebook</li>}
          <li>{applied.removed} removed</li>
          <li>{applied.linked} linked with nothing else touched</li>
          {stored && (stored.saved > 0 || (stored.messages ?? 0) > 0) && (
            <li>
              {stored.saved} announcement{stored.saved === 1 ? '' : 's'}
              {(stored.messages ?? 0) > 0 ? ` and ${stored.messages} message${stored.messages === 1 ? '' : 's'}` : ''} stored{stored.fresh > 0 ? `, ${stored.fresh} new` : ''} ·{' '}
              <a className="diff-toggle" href="#/news">
                read them
              </a>
            </li>
          )}
          {stored && (stored.resources ?? 0) > 0 && <li>{stored.resources} class resource{stored.resources === 1 ? '' : 's'} listed</li>}
        </ul>
        <div className="modal-actions">
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={onClose}>
            Close
          </button>
        </div>
      </>
    );
  }
  if (!sel) return null;
  const n = countVisible(sel);
  const sample = diff.sample;

  return (
    <>
      {banner}
      <p className="hint mono">
        {payload.classes.length} classes · {source === 'ics' ? 'exported' : 'read'} {when(payload.exportedAt)}
        {diff.courses.created.length > 0 && ` · new classes: ${diff.courses.created.map((c) => c.code).join(', ')}`}
      </p>
      {sample && (
        <div className="diff-zone" data-warn={diff.zoneWarning ? 'true' : 'false'} role={diff.zoneWarning ? 'alert' : undefined}>
          <div className="diff-zone-grid">
            <span className="diff-zone-k">{source === 'ics' ? 'Export says' : 'Halo says'}</span>
            <code>{sample.raw}</code>
            <span className="diff-zone-k">Read as</span>
            <b>{when(sample.dueAt)}</b>
          </div>
          {source === 'ics' ? (
            <p className="hint" style={{ margin: 0 }}>
              Times in the export are {cityOf(tz)} local and are read as written.
            </p>
          ) : diff.bareDates ? (
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
              {e.changes.some((c) => c.field === 'dueAt') && e.halo.dueDate && <div className="diff-raw">{source === 'ics' ? 'Export' : 'Halo'}: {e.halo.rawDue ?? e.halo.dueDate}</div>}
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

      {source === 'halo' && (
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
      )}

      {source === 'halo' && (
        <Section title="Grades from the gradebook" count={diff.graded.length} onAll={() => setAll('graded', diff.graded.map((e) => e.key))} onNone={() => setAll('graded', [])}>
          {diff.graded.map((e) => (
            <label key={e.key} className="diff-row">
              <input type="checkbox" checked={sel.graded.has(e.key)} onChange={() => toggle('graded', e.key)} />
              <div>
                <div className="title">
                  {e.title} <CourseChip course={e.course} />
                </div>
                <div className="diff-change">
                  Score: <span className="old">{e.previous == null ? '—' : e.previous}</span> → <mark>{e.score}</mark> / {e.points}
                </div>
              </div>
            </label>
          ))}
        </Section>
      )}

      <Section title={missingLabel} count={diff.missing.length} onAll={() => setAll('missing', diff.missing.map((e) => e.key))} onNone={() => setAll('missing', [])}>
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
      <Section title={source === 'ics' ? 'Not in the export, left alone' : 'Not in Halo, left alone'} count={diff.untouched.length} collapsible open={!!open.untouched} onToggle={() => flip('untouched')}>
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
          disabled={n === 0 && diff.unchanged.length === 0 && diff.courses.created.length === 0}
        >
          {confirmZone ? 'Apply anyway, dates may be wrong' : n > 0 ? `Apply ${n} change${n === 1 ? '' : 's'}` : diff.unchanged.length > 0 ? 'Link items, nothing else changes' : 'Nothing to apply'}
        </button>
      </div>
    </>
  );
}
