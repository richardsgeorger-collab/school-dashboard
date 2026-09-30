import { InviteButton } from '../referral/Invite';
import { report } from '../monitor/report';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { saveAnnouncements, saveExtras } from '../halo/announce';
import { countsLine, pullCounts } from '../halo/counts';
import { referenceLine, referencePlan, referenceTotal, type ReferenceCounts } from '../halo/reference';
import { bookmarkAge, problemGroups, problemLine, pullsFrom } from '../halo/freshness';
import { BOOKMARKLET_BUILD } from '../halo/bookmarklet';
import { BookmarkButton, useBookmarkHref } from './BookmarkButton';
import { SYNC_EVENT } from '../ingest/auto';
import { ReadStatusLines } from './ReadStatus';
import { normCode } from '../halo/normalize';
import { CourseChip } from '../components/CourseChip';
import { SegmentedControl } from '../components/SegmentedControl';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { TYPE_LABELS, type AppData, type Course } from '../domain/types';
import { countVisible, defaultSelection, planFromDiff, type Selection } from '../halo/apply';
import { diffHalo, type FieldChange } from '../halo/diff';
import type { BareDateMode, SyncSource } from '../halo/normalize';
import type { HaloClass, HaloExport } from '../halo/types';
import { useStore } from '../storage/store';
import { BOOKMARK_NAME } from '../halo/bookmarkName';
import { useAccount } from '../auth/AccountContext';
import { REFERRAL, TIER_NAMES } from '../config/tiers';

type Group = keyof Selection;
const cityOf = (tz: string) => tz.split('/').pop()?.replace(/_/g, ' ') ?? tz;

export interface AppliedSummary {
  added: number;
  changed: number;
  removed: number;
  completed: number;
  scored: number;
  linked: number;
  /** Removals a quiet (background) apply left for the student to approve. */
  held?: number;
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
  // An empty section is a row of zeros a first-time student has to read past; the summary line already says it.
  if (count === 0) return null;
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
  autoApply = false,
  keepRemovals = false,
}: {
  payload: HaloExport;
  source: SyncSource;
  resolveCourse?: (c: HaloClass) => Course | undefined;
  banner?: ReactNode;
  missingLabel?: string;
  onApplied?: (s: AppliedSummary) => void;
  onClose: () => void;
  /** The first sync ever (an empty planner): nothing to compare or lose, so it applies itself and closes. */
  autoApply?: boolean;
  /** Apply everything except removals (a background sync never deletes on its own). */
  keepRemovals?: boolean;
}) {
  const { data, actions, undo } = useStore();
  const { auth, profile } = useAccount();
  const tz = data.settings.timezone;
  const [bareAs, setBareAs] = useState<BareDateMode>('utc');
  const [includeZero, setIncludeZero] = useState(false);
  const [sel, setSel] = useState<Selection | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [confirmZone, setConfirmZone] = useState(false);
  const [applied, setApplied] = useState<AppliedSummary | null>(null);
  // A sync from an older bookmark is held: nothing is written until the student reinstalls or says to use it anyway.
  const age = useMemo(() => (source === 'halo' ? bookmarkAge(payload, BOOKMARKLET_BUILD) : null), [payload, source]);
  const [override, setOverride] = useState(false);
  const held = age?.kind === 'older' && !override;
  const [reinstall, setReinstall] = useState(false);
  const [dragNote, setDragNote] = useState<string | null>(null);
  const [hrefCopied, setHrefCopied] = useState(false);
  const bookmarkHref = useBookmarkHref();
  const reinstallNow = () => {
    setReinstall(true);
    navigator.clipboard?.writeText(bookmarkHref).then(() => setHrefCopied(true)).catch(() => setHrefCopied(false));
  };
  // Frozen per payload so the diff does not drift while it is on screen.
  const now = useMemo(() => new Date().toISOString(), [payload]); // eslint-disable-line react-hooks/exhaustive-deps
  const diff = useMemo(
    () => diffHalo(payload, data, { tz, now, bareAs, includeZeroPoint: includeZero, source, resolveCourse }),
    [payload, data, tz, now, bareAs, includeZero, source, resolveCourse],
  );
  useEffect(() => {
    setSel(keepRemovals ? { ...defaultSelection(diff), missing: new Set<string>() } : defaultSelection(diff));
    setConfirmZone(false);
  }, [diff]);

  // Everything Halo asserts about work already in the planner is written now, not on the apply button. A sync
  // whose assignment list happens to be unchanged must not be able to discard 47 announcements on Cancel.
  const savedFor = useRef<HaloExport | null>(null);
  useEffect(() => {
    if (source !== 'halo' || held || savedFor.current === payload) return;
    savedFor.current = payload;
    void (async () => {
      const at = new Date().toISOString();
      // A class this sync is creating counts too: its announcements are kept under the id it is about to get, or a
      // new student's first sync (every class new) would lose every announcement and the reader would have nothing.
      // Linked first: a class re-pointed by this sync (a lecture taking its link back from a merged lab) wins.
      const known = [...diff.courses.linked, ...diff.courses.created, ...data.courses];
      const courseIdOf = (classId: string, code: string) => known.find((c) => c.haloClassId === classId)?.id ?? known.find((c) => normCode(c.code) === normCode(code))?.id ?? null;
      const plan = referencePlan(diff, data);
      if (plan.facts.length > 0 || plan.courses.length > 0) actions.applyHaloSync(plan);
      let ann: Awaited<ReturnType<typeof saveAnnouncements>> = { saved: 0, fresh: 0, records: [] };
      let extra = { messages: 0, resources: 0, alerts: 0 };
      try {
        ann = await saveAnnouncements(payload, courseIdOf, at);
        extra = await saveExtras(payload, courseIdOf, at).catch(() => extra);
      } catch {
        // The planner keeps what it got; the next sync brings these again.
      }
      // Silent failures (monitor/): a sync that came back short is reported, counts only, never what is in it.
      checkShortSync(payload, data);
      // Stamped with when Halo was read, not when this tab applied it: a 6:08 AM extension sync taken at 8:00 is as of
      // 6:08. Never in the future (a clock ahead of this one), and it says where it came from.
      const readAt = payload.exportedAt && Date.parse(payload.exportedAt) < Date.parse(at) ? new Date(payload.exportedAt).toISOString() : at;
      const via = payload.source === 'extension' ? 'extension' : payload.source === 'paste' ? 'paste' : 'bookmark';
      actions.updateSettings({ haloPulls: pullsFrom(payload, courseIdOf, data.settings.haloPulls, readAt), lastPull: { at: readAt, build: payload.build ?? null, counts: { ...pullCounts(payload) }, via } });
      setKept({ facts: plan.facts.length, classes: plan.courses.length, announcements: ann.saved, fresh: ann.fresh, messages: extra.messages, resources: extra.resources, alerts: extra.alerts });
      // The sync event is what starts the background read (halo/backgroundRead.ts): new and edited posts are read
      // now, by the app, whether or not this sheet stays open.
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(SYNC_EVENT));
    })();
    // The diff is derived from the payload, and the payload is what this is keyed on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, source, held]);

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
  const gaps = useMemo(() => problemLine(payload), [payload]);
  const groups = useMemo(() => problemGroups(payload), [payload]);
  const counts = useMemo(() => pullCounts(payload), [payload]);
  const [copied, setCopied] = useState(false);
  const [kept, setKept] = useState<ReferenceCounts | null>(null);

  const apply = async () => {
    if (!sel) return;
    const plan = planFromDiff(diff, sel);
    actions.applyHaloSync(plan);
    const summary = { added: sel.added.size, changed: sel.changed.size, removed: sel.missing.size, completed: plan.complete.length, scored: plan.scores.length, linked: diff.unchanged.length, held: keepRemovals ? diff.missing.filter((e) => e.suggestRemove).length : 0 };
    // Announcements are not planner rows, so they are stored rather than approved; what they change is approved later,
    // one finding at a time. The same pass records what this pull actually carried, per class. Awaited, so the screen
    // never says it is done while the write is still in flight and a navigation could cut it off.
    setApplied(summary);
    onApplied?.(summary);
    // Announcements live in their own store, which no React state watches; this is what tells Now to look again.
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(SYNC_EVENT));
  };

  // First sync: once the announcements and class facts are saved and the selection exists, apply everything and close.
  const autoDone = useRef(false);
  useEffect(() => {
    if (!autoApply || autoDone.current || !sel || (source === 'halo' && !kept)) return;
    autoDone.current = true;
    void apply().then(() => onClose());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoApply, sel, kept]);

  const ChangeLine = ({ c }: { c: FieldChange }) => {
    const label = c.field === 'dueAt' ? 'Due' : c.field === 'points' ? 'Points' : c.field === 'course' ? 'Class' : 'Title';
    const f = (v: string | number | null) => (c.field === 'dueAt' && typeof v === 'string' ? when(v) : c.field === 'course' ? (data.courses.find((x) => x.id === v)?.code ?? diff.courses.created.find((x) => x.id === v)?.code ?? '—') : String(v ?? '—'));
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
          {source === 'halo' && <li className="pull-tally">Pulled: {countsLine(counts)}</li>}
          {age && <li className="diff-gap">{age.line}</li>}
          {gaps && <li className="diff-gap">{gaps}</li>}
          {kept && referenceLine(kept) && (
            <li>
              {referenceLine(kept)}{' '}
              <a className="diff-toggle" href="#/inbox">
                read them
              </a>
            </li>
          )}
          {/* The moment a sync lands is the moment a student thinks of the friend in the same section. One line. */}
          {source === 'halo' && auth.session && profile?.referralCode && (
            <li className="diff-invite">
              Someone in your section would want this too. You both get {TIER_NAMES[REFERRAL.rewardTier]} free for {REFERRAL.days} days.{' '}
              <InviteButton label="Invite a friend" small />
            </li>
          )}
        </ul>
        <div className="modal-actions">
          {/* Everything this sync changed goes back in one tap, until the next sync replaces the batch. */}
          {undo && undo.count > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                actions.undoLast();
                onClose();
              }}
            >
              Undo this sync
            </button>
          )}
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
      <p className="hint">
        {payload.classes.length} class{payload.classes.length === 1 ? '' : 'es'} · {source === 'ics' ? 'exported' : 'read'} {when(payload.exportedAt)}
        {diff.courses.created.length > 0 && ` · new classes: ${diff.courses.created.map((c) => c.code).join(', ')}`}
      </p>
      {age?.kind === 'older' && (
        <div className="diff-stale" role="alert">
          <p>
            <b>Your {payload.source === 'extension' ? 'Halo+ extension' : `${BOOKMARK_NAME} bookmark`} is out of date.</b> {age.line}
            {held ? ' Nothing from this sync has been applied.' : ''}
          </p>
          <div className="diff-stale-actions">
            {payload.source !== 'extension' && (
              <button type="button" className="btn primary" onClick={reinstallNow}>
                Reinstall the bookmark
              </button>
            )}
            {held && (
              <button type="button" className="btn" onClick={() => setOverride(true)}>
                Use this sync anyway
              </button>
            )}
          </div>
          {reinstall && (
            <div className="diff-stale-install">
              <p className="hint">
                {hrefCopied ? 'The new address is on your clipboard. ' : ''}Drag <BookmarkButton onClickNote={setDragNote} /> to your bookmarks bar and delete the old one, or right-click the old Sync Halo bookmark, choose Edit, and paste the new address over the old one. Then click it on Halo once more. The new bookmark fetches the current sync every time, so this is the last reinstall.
              </p>
              {dragNote && <p className="hint">{dragNote}</p>}
            </div>
          )}
        </div>
      )}
      {age?.kind === 'newer' && (
        <p className="hint diff-gap" role="alert">
          {age.line}{' '}
          <button type="button" className="hero-inline" onClick={() => window.location.reload()}>
            Reload
          </button>
        </p>
      )}
      <ReadStatusLines />
      {source === 'halo' && !held && (
        <p className="hint pull-tally">
          {/* Zero classes is not "everything": Halo showed none (logged out mid-way, or a new term not open yet). */}
          <b>{payload.classes.length === 0 ? 'Halo sent no classes.' : gaps ? 'Not everything came through.' : 'Everything in Halo is in Halo+.'}</b>{' '}
          {payload.classes.length === 0 ? 'Nothing here changes. Open Halo, check your classes are there, and sync again.' : countsLine(counts)}
          {kept && referenceLine(kept) ? (
            <>
              <br />
              {referenceLine(kept)} <a href="#/inbox">See announcements</a>
            </>
          ) : null}
        </p>
      )}
      {gaps && (
        <div className="diff-gap">
          <p className="hint" role="status" style={{ margin: 0 }}>
            {gaps}
          </p>
          <details className="gap-detail">
            <summary className="hint">What Halo actually said</summary>
            <p className="hint">
              <button
                type="button"
                className="btn small"
                onClick={() => void navigator.clipboard.writeText(JSON.stringify({ problems: payload.problems ?? [], schema: payload.schema ?? null }, null, 1)).then(() => setCopied(true))}
              >
                {copied ? 'Copied' : 'Copy the error'}
              </button>
            </p>
            <ul className="gap-list">
              {groups.map((g, i) => (
                <li key={i}>
                  <span className="hint mono">
                    {g.op ?? g.kind}
                    {g.status !== null ? ` HTTP ${g.status}` : ''}
                    {g.courses.length > 0 ? ` \u00b7 ${g.courses.join(', ')}` : ''}
                  </span>
                  {g.errors.map((e, j) => (
                    <code key={j} className="gap-err">
                      {e}
                    </code>
                  ))}
                  {g.sent ? <span className="hint mono">sent {g.sent}</span> : null}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
      {/* How Halo's times are read, only when that is in question: a calendar export, bare timestamps, or an odd hour. */}
      {sample && (source === 'ics' || diff.bareDates || diff.zoneWarning) && (
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
          ) : diff.zoneWarning ? null : (
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
          {kept && referenceTotal(kept) > 0 && n === 0 ? 'Close' : 'Cancel'}
        </button>
        <span className="spacer" />
        <button
          type="button"
          className={confirmZone ? 'btn danger' : held ? 'btn' : 'btn primary'}
          onClick={() => {
            if (diff.zoneWarning && !confirmZone) {
              setConfirmZone(true);
              return;
            }
            if (held) setOverride(true);
            apply();
          }}
          disabled={n === 0 && diff.unchanged.length === 0 && diff.courses.created.length === 0}
        >
          {confirmZone ? 'Apply anyway, dates may be wrong' : held ? `Apply anyway, from the old ${payload.source === 'extension' ? 'extension' : 'bookmark'}` : n > 0 ? `Apply ${n} change${n === 1 ? '' : 's'}` : diff.unchanged.length > 0 ? 'Link items, nothing else changes' : kept && referenceTotal(kept) > 0 ? 'Done, nothing needs approving' : 'Nothing to apply'}
        </button>
      </div>
    </>
  );
}

/**
 * Syncs that came back short, the kind nobody noticed before (2026-09-30): fewer classes than the last sync, or a
 * class that had assignments (or grades) coming back with none. Reported as silent failures, with counts only.
 */
export function shortSync(payload: HaloExport, data: Pick<AppData, 'courses' | 'items' | 'settings'>): { fewer: { before: number; after: number } | null; emptyClasses: number; noGrades: number } {
  const before = Number(data.settings.lastPull?.counts?.classes ?? 0);
  const fewer = before > 0 && payload.classes.length < before ? { before, after: payload.classes.length } : null;
  let emptyClasses = 0;
  let noGrades = 0;
  const askedGrades = !payload.pulls || payload.pulls.includes('grades');
  for (const cls of payload.classes) {
    const course = data.courses.find((c) => c.haloClassId === cls.id);
    if (!course) continue;
    const mine = data.items.filter((i) => i.courseId === course.id && i.source === 'halo');
    if (mine.length > 0 && cls.assessments.length === 0) emptyClasses++;
    const hadGrades = mine.some((i) => i.score !== null && i.score !== undefined);
    if (askedGrades && hadGrades && cls.assessments.length > 0 && !cls.assessments.some((a) => a.score !== null && a.score !== undefined)) noGrades++;
  }
  return { fewer, emptyClasses, noGrades };
}

function checkShortSync(payload: HaloExport, data: Pick<AppData, 'courses' | 'items' | 'settings'>) {
  if (payload.source === 'ics') return;
  const s = shortSync(payload, data);
  const via = payload.source ?? 'bookmark';
  if (s.fewer) report({ kind: 'silent', title: 'A sync returned fewer classes than the last one', place: `sync:${via}`, details: { before: s.fewer.before, after: s.fewer.after, via } });
  if (s.emptyClasses) report({ kind: 'silent', title: 'A sync returned 0 assignments for a class that had them', place: `sync:${via}`, details: { classes: s.emptyClasses, of: payload.classes.length, via } });
  if (s.noGrades) report({ kind: 'silent', title: 'A sync returned no grades for a class that had them', place: `sync:${via}`, details: { classes: s.noGrades, of: payload.classes.length, via } });
}
