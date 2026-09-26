import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { healEntries, saveAnnouncements, saveExtras, type ReadEntry } from '../halo/announce';
import { countsLine, pullCounts } from '../halo/counts';
import { referenceLine, referencePlan, referenceTotal, type ReferenceCounts } from '../halo/reference';
import { autoResultLine, emptyOutcome, groupFailures, needsRead, planFromActions, readReason, type AutoOutcome, type AutoPlan } from '../halo/autoRead';
import { costOf, loadPrices, type ApiUsage } from '../ai/usage';
import { readGuard } from '../halo/readCost';
import { readActions } from '../halo/actions';
import { describeAiError } from '../ai/client';
import { withRetry } from '../halo/readAll';
import { announceDb, bodyHash, readLedger, type StoredAnnouncement } from '../halo/announce';
import { aiAvailable, loadApiKey } from '../chat/key';
import { useAccount } from '../auth/AccountContext';
import { can } from '../config/flags';
import { problemGroups, problemLine, pullsFrom, staleBookmarkLine } from '../halo/freshness';
import { BOOKMARKLET_BUILD } from '../halo/bookmarklet';
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
  const { tier } = useAccount();
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

  // Everything Halo asserts about work already in the planner is written now, not on the apply button. A sync
  // whose assignment list happens to be unchanged must not be able to discard 47 announcements on Cancel.
  const savedFor = useRef<HaloExport | null>(null);
  useEffect(() => {
    if (source !== 'halo' || savedFor.current === payload) return;
    savedFor.current = payload;
    void (async () => {
      const at = new Date().toISOString();
      const courseIdOf = (classId: string, code: string) => data.courses.find((c) => c.haloClassId === classId)?.id ?? data.courses.find((c) => normCode(c.code) === normCode(code))?.id ?? null;
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
      actions.updateSettings({ haloPulls: pullsFrom(payload, courseIdOf, data.settings.haloPulls, at), lastPull: { at, build: payload.build ?? null, counts: { ...pullCounts(payload) } } });
      setKept({ facts: plan.facts.length, classes: plan.courses.length, announcements: ann.saved, fresh: ann.fresh, messages: extra.messages, resources: extra.resources, alerts: extra.alerts });
      // New and edited posts are read now, in this sync, not on a button and not on the next one. Professors post
      // assignments in announcements constantly; anything that waits arrives late.
      void readNew(ann.records);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event(SYNC_EVENT));
    })();
    // The diff is derived from the payload, and the payload is what this is keyed on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, source]);

  /**
   * Reads only the posts that are new or that the professor has edited since they were last read, then puts what
   * they ask for straight onto the planner. Removals are the one thing held back for approval.
   */
  const readNew = async (fresh: StoredAnnouncement[], opts?: { approved?: boolean }) => {
    const key = loadApiKey() || undefined;
    const ids = new Set(data.courses.map((c) => c.id));
    // Everything on file that has never been read, not only what this sync carried. A post that arrived before the
    // automatic pass existed is exactly the kind that costs points, and it would otherwise sit there for ever.
    // The freshly written records win over the stored copies, which can still be a moment behind.
    const byId = new Map<string, StoredAnnouncement>();
    for (const a of await announceDb.list().catch(() => [])) byId.set(a.id, a);
    for (const a of fresh) byId.set(a.id, a);
    // What has been read lives in its own ledger, which a sync never rewrites. A post is read only when it has no
    // entry there or its words no longer match the ones it was read with. A ledger that cannot be opened is not an
    // empty ledger: treating it as one would read, and pay for, every post on file.
    let ledger: Map<string, ReadEntry>;
    try {
      ledger = await readLedger.all();
    } catch (e) {
      setAuto({ ...emptyOutcome(), ledgerError: e instanceof Error ? e.message : String(e) });
      return;
    }
    const onFile = [...byId.values()].filter((a) => ids.has(a.courseId));
    // Posts stamped by an earlier build but missing from the ledger get their entries back before anything is read.
    for (const h of healEntries(onFile, ledger)) {
      await readLedger.put(h).catch(() => undefined);
      ledger.set(h.id, h);
    }
    const todo = needsRead(onFile, ids, ledger);
    if (todo.length === 0) return;
    // A large run, or one that would read most of what is on file, stops and asks first with the count and cost.
    const guard = readGuard({ todo: todo.length, onFile: onFile.length, fresh: todo.filter((a) => !ledger.has(a.id)).length, edited: todo.filter((a) => ledger.has(a.id)).length });
    if (!opts?.approved && guard.ask) {
      setConfirmRead({ posts: todo, line: guard.line });
      return;
    }
    // No way to read (no account, no plan, or in development no key): the posts stay unstamped and the next sync
    // that can read them will.
    if (!aiAvailable() || !can('announcementAI', tier)) {
      setAuto({ ...emptyOutcome(), todo: todo.length, noKey: true });
      return;
    }
    const at = new Date().toISOString();
    const total: AutoPlan = { upserts: [], courses: [], added: [], moved: [], attached: 0, noted: 0, updated: [], needsApproval: [] };
    const spend = { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
    let failed = 0;
    let read = 0;
    const why: string[] = [];
    // Each post's result is applied before the next one runs, so a failure halfway keeps what came before it.
    let items = data.items;
    let courses = data.courses;
    for (let n = 0; n < todo.length; n++) {
      const a = todo[n];
      const course = courses.find((c) => c.id === a.courseId);
      if (!course) continue;
      setReading({ done: n + 1, total: todo.length, title: a.title || '(untitled)', why: readReason(a) });
      try {
        const r = await withRetry(() => readActions({ apiKey: key, announcement: a, course, items, tz }));
        const p = planFromActions({ actions: r.actions, announcement: a, course, items, courses, now: at });
        for (const i of p.upserts) {
          actions.upsertItem(i);
          items = [...items.filter((x) => x.id !== i.id), i];
        }
        for (const c of p.courses) {
          actions.upsertCourse(c);
          courses = courses.map((x) => (x.id === c.id ? c : x));
        }
        total.added.push(...p.added);
        total.moved.push(...p.moved);
        total.attached += p.attached;
        total.noted += p.noted;
        total.updated.push(...p.updated);
        total.needsApproval.push(...p.needsApproval);
        const u = r.usage as ApiUsage | undefined;
        if (u) {
          spend.calls += 1;
          spend.input += u.input_tokens ?? 0;
          spend.output += u.output_tokens ?? 0;
          spend.cacheRead += u.cache_read_input_tokens ?? 0;
          spend.cacheWrite += u.cache_creation_input_tokens ?? 0;
        }
        read += 1;
        // The ledger entry is what stops this post being read again; it is written only after a read succeeds.
        await readLedger.put({ id: a.id, hash: bodyHash(a), at, summary: r.summary, count: r.actions.length });
        await announceDb.put({ ...a, actionsAt: at, actionsModifiedAt: a.modifiedAt ?? null, actionsSummary: r.summary, actionCount: r.actions.length });
      } catch (e) {
        // A post that could not be read is left unstamped, so the next sync tries it again. One post failing
        // costs that post: the loop carries on with the rest.
        failed += 1;
        why.push(await describeAiError(e));
      }
    }
    setReading(null);
    setAuto({ todo: todo.length, read, failed, noKey: false, failures: groupFailures(why), cost: costOf(spend, loadPrices()), plan: total });
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(SYNC_EVENT));
  };

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
  const stale = useMemo(() => (source === 'halo' ? staleBookmarkLine(payload, BOOKMARKLET_BUILD) : null), [payload, source]);
  const groups = useMemo(() => problemGroups(payload), [payload]);
  const counts = useMemo(() => pullCounts(payload), [payload]);
  const [copied, setCopied] = useState(false);
  const [kept, setKept] = useState<ReferenceCounts | null>(null);
  const [reading, setReading] = useState<{ done: number; total: number; title: string; why: string } | null>(null);
  const [auto, setAuto] = useState<AutoOutcome | null>(null);
  const [confirmRead, setConfirmRead] = useState<{ posts: StoredAnnouncement[]; line: string } | null>(null);

  const apply = async () => {
    if (!sel) return;
    const plan = planFromDiff(diff, sel);
    actions.applyHaloSync(plan);
    const summary = { added: sel.added.size, changed: sel.changed.size, removed: sel.missing.size, completed: plan.complete.length, scored: plan.scores.length, linked: diff.unchanged.length };
    // Announcements are not planner rows, so they are stored rather than approved; what they change is approved later,
    // one finding at a time. The same pass records what this pull actually carried, per class. Awaited, so the screen
    // never says it is done while the write is still in flight and a navigation could cut it off.
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
          {source === 'halo' && <li className="pull-tally">Pulled: {countsLine(counts)}</li>}
          {stale && <li className="diff-gap">{stale}</li>}
          {gaps && <li className="diff-gap">{gaps}</li>}
          {kept && referenceLine(kept) && (
            <li>
              {referenceLine(kept)}{' '}
              <a className="diff-toggle" href="#/inbox">
                read them
              </a>
            </li>
          )}
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
      {stale && (
        <p className="hint diff-gap" role="alert">
          {stale}
        </p>
      )}
      {reading && (
        <p className="hint pull-tally" role="status">
          Reading {reading.why} announcement {reading.done} of {reading.total}: “{reading.title}”…
        </p>
      )}
      {confirmRead && (
        <p className="hint diff-gap" role="status">
          {confirmRead.line} Until they are read I do not know what they ask.{' '}
          <button
            type="button"
            className="btn small primary"
            onClick={() => {
              const posts = confirmRead.posts;
              setConfirmRead(null);
              void readNew(posts, { approved: true });
            }}
          >
            Read {confirmRead.posts.length} anyway
          </button>{' '}
          <button type="button" className="hero-skip" onClick={() => setConfirmRead(null)}>
            Not now
          </button>
        </p>
      )}
      {auto && autoResultLine(auto) && (
        <p className={auto.failed > 0 || auto.noKey ? 'hint diff-gap' : 'hint pull-tally'} role="status">
          {autoResultLine(auto)}
          {auto.plan.added.length > 0 && (
            <>
              <br />
              {auto.plan.added.map((i) => i.label).join(', ')} {auto.plan.added.length === 1 ? 'is' : 'are'} on your agenda now, from an announcement.
            </>
          )}
          {auto.plan.moved.length > 0 && (
            <>
              <br />
              {auto.plan.moved.map((m) => `${m.item.label}: ${fmtDate(dateOf(m.from, tz), 'short')} → ${fmtDate(dateOf(m.to, tz), 'short')}`).join(' · ')}
            </>
          )}
        </p>
      )}
      {source === 'halo' && (
        <p className="hint pull-tally">
          <b>This sync pulled:</b> {countsLine(counts)}
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
          <details className="gap-detail" open>
            <summary className="hint">What Halo actually said</summary>
            <p className="hint">
              <button
                type="button"
                className="btn small"
                onClick={() => void navigator.clipboard.writeText(JSON.stringify({ problems: payload.problems ?? [], schema: payload.schema ?? null }, null, 1)).then(() => setCopied(true))}
              >
                {copied ? 'Copied' : 'Copy this for Claude'}
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
          {kept && referenceTotal(kept) > 0 && n === 0 ? 'Close' : 'Cancel'}
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
          {confirmZone ? 'Apply anyway, dates may be wrong' : n > 0 ? `Apply ${n} change${n === 1 ? '' : 's'}` : diff.unchanged.length > 0 ? 'Link items, nothing else changes' : kept && referenceTotal(kept) > 0 ? 'Done, nothing needs approving' : 'Nothing to apply'}
        </button>
      </div>
    </>
  );
}
