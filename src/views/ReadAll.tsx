import { useMemo, useRef, useState } from 'react';
import { loadApiKey } from '../chat/key';
import { useAiAllowed } from '../config/useCan';
import { Modal } from '../components/Modal';
import { dateOf, fmtDate } from '../domain/dates';
import { mergeNotes, mergeRequirements } from '../domain/requirements';
import type { Item } from '../domain/types';
import { announceDb, readLedger, type ReadEntry, type StoredAnnouncement } from '../halo/announce';
import { needsRead } from '../halo/autoRead';
import { errorGroups, genuinelyNothing, readAllAnnouncements, readAllLine, stampRead, type ReadAllResult, type ReadProgress } from '../halo/readAll';
import { useStore } from '../storage/store';

/**
 * Reads the whole backlog of announcements at once. A class is run from these posts, so a requirement from week two
 * is still graded in week six; until this runs, nothing in the app knows those requirements exist.
 */
export function ReadAll({ list, ledger, onClose, onDone }: { list: StoredAnnouncement[]; ledger: Map<string, ReadEntry>; onClose: () => void; onDone: () => void }) {
  const { data, actions } = useStore();
  const tz = data.settings.timezone;
  const [progress, setProgress] = useState<ReadProgress | null>(null);
  const [result, setResult] = useState<ReadAllResult | null>(null);
  const [counts, setCounts] = useState<{ attached: number; noted: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const stop = useRef({ stopped: false });
  const hasKey = useAiAllowed('announcementAI');

  const courseIds = useMemo(() => new Set(data.courses.map((c) => c.id)), [data.courses]);
  // The same ledger the sync and the News header use, so all three always agree on what is left.
  const todo = useMemo(() => needsRead(list, courseIds, ledger), [list, courseIds, ledger]);
  const already = list.filter((a) => courseIds.has(a.courseId)).length - todo.length;

  const run = async (only: StoredAnnouncement[]) => {
    setError(null);
    stop.current = { stopped: false };
    const at = new Date().toISOString();
    try {
      const r = await readAllAnnouncements({ apiKey: loadApiKey(), list: only, courses: data.courses, items: data.items, tz, at, onProgress: setProgress, signal: stop.current });
      // Parts and notes describe work the student already has: they are facts, and they save on arrival.
      let attached = 0;
      let noted = 0;
      for (const [itemId, reqs] of r.requirements) {
        const item = data.items.find((i) => i.id === itemId);
        if (!item) continue;
        const merged = mergeRequirements(item.requirements, reqs);
        attached += merged.length - (item.requirements?.length ?? 0);
        actions.upsertItem({ ...item, requirements: merged } as Item);
      }
      for (const [courseId, notes] of r.notes) {
        const course = data.courses.find((c) => c.id === courseId);
        if (!course) continue;
        const merged = mergeNotes(course.notes, notes);
        noted += merged.length - (course.notes?.length ?? 0);
        actions.upsertCourse({ ...course, notes: merged });
      }
      await stampRead(r.results, at);
      setCounts({ attached, noted });
      setResult(r);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const failures = useMemo(() => (result ? errorGroups(result.results) : []), [result]);

  const byCourse = useMemo(() => {
    if (!result) return [];
    const m = new Map<string, { code: string; rows: { post: StoredAnnouncement; text: string; quote: string | null; kind: string; due: string | null }[] }>();
    for (const r of result.results) {
      for (const a of r.actions) {
        const row = m.get(r.course.id) ?? { code: r.course.code, rows: [] };
        row.rows.push({ post: r.announcement, text: a.text, quote: a.source.quote, kind: a.kind, due: a.dueAt });
        m.set(r.course.id, row);
      }
    }
    return [...m.values()].sort((a, b) => a.code.localeCompare(b.code));
  }, [result]);

  return (
    <Modal title="Read every announcement" onClose={onClose}>
      <div className="modal-body">
        {!result && (
          <>
            <p className="hint">
              Your instructors put real requirements in announcements that never appear in the assignment. This reads all of them and attaches what it finds to the work it belongs to,
              quoting the post every time.
            </p>
            <p className="hint mono">
              {todo.length} to read{already > 0 ? ` · ${already} already read` : ''}
            </p>
            {!hasKey && <p className="hint">Reading announcements needs a Pro or Max plan.</p>}
            {progress && (
              <p className="hint mono" role="status">
                Reading {progress.done} of {progress.total}: {progress.course} “{progress.title}”
              </p>
            )}
            {error && <p className="hint" style={{ color: 'var(--overdue)' }}>{error}</p>}
            <div className="modal-actions">
              {progress ? (
                <button type="button" className="btn" onClick={() => (stop.current.stopped = true)}>
                  Stop
                </button>
              ) : (
                <button type="button" className="btn" onClick={onClose}>
                  Not now
                </button>
              )}
              <span className="spacer" />
              <button type="button" className="btn primary" disabled={!hasKey || !!progress || todo.length === 0} onClick={() => void run(todo)}>
                {progress ? 'Reading…' : `Read ${todo.length}`}
              </button>
              {already > 0 && !progress && (
                <button type="button" className="btn" onClick={() => void run(list.filter((a) => courseIds.has(a.courseId)))}>
                  Re-read all {list.filter((a) => courseIds.has(a.courseId)).length}
                </button>
              )}
            </div>
          </>
        )}

        {result && counts && (
          <>
            <p>
              <b>{readAllLine(result, counts.attached, counts.noted)}</b>
            </p>
            {result.failed > 0 && result.read > 0 && (
              <p className="hint">What follows is only from the {result.read} that were read.</p>
            )}
            {result.changes.length > 0 && (
              <p className="hint">
                {result.changes.length} of them would add or move something on your calendar. Those wait for you: they are on the next sync&apos;s review screen.
              </p>
            )}
            {failures.length > 0 && (
              <div className="diff-gap">
                <p className="hint" style={{ margin: 0 }}>
                  <b>Why they could not be read.</b> {failures.length === 1 ? 'Every failure had the same cause.' : `${failures.length} different causes.`}
                </p>
                <ul className="gap-list">
                  {failures.map((f, i) => (
                    <li key={i}>
                      <span className="hint mono">
                        {f.count} announcement{f.count === 1 ? '' : 's'}
                        {f.status !== null ? ` · HTTP ${f.status}` : ''}
                      </span>
                      <code className="gap-err">{f.message}</code>
                      <span className="hint">{f.plain}</span>
                    </li>
                  ))}
                </ul>
                <p className="hint">
                  <button type="button" className="btn small" onClick={() => void navigator.clipboard.writeText(JSON.stringify(failures, null, 1)).then(() => setCopied(true))}>
                    {copied ? 'Copied' : 'Copy this for Claude'}
                  </button>{' '}
                  <button type="button" className="btn small" onClick={() => void run(result.results.filter((x) => x.error).map((x) => x.announcement))}>
                    Try those again
                  </button>
                </p>
              </div>
            )}
            {/* The all-clear is the one sentence that has to be backed by a complete pass. */}
            {genuinelyNothing(result, counts.attached, counts.noted) && <p className="hint">Every one was read, and none of them asks anything of you.</p>}
            {byCourse.map((c) => (
              <section key={c.code} className="readall-class">
                <h3 className="section-title">
                  {c.code} <span className="mono muted">· {c.rows.length}</span>
                </h3>
                <ul className="reqs-list">
                  {c.rows.map((r, i) => (
                    <li key={i}>
                      <span className="reqs-text">{r.text}</span>
                      <span className="hint mono">
                        {r.kind.replace('_', ' ')}
                        {r.due ? ` · due ${fmtDate(dateOf(r.due, tz), 'short')}` : ''}
                      </span>
                      {r.quote && (
                        <span className="reqs-src hint">
                          <q>{r.quote}</q> <a href={`#/inbox?a=${r.post.id}`}>read it</a>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <div className="modal-actions">
              <span className="spacer" />
              <button type="button" className="btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/** How many posts are not yet read for what they ask, by the same ledger the sync uses. */
export async function unreadCount(courseIds: Set<string>): Promise<number> {
  const list = await announceDb.list().catch(() => []);
  return needsRead(list, courseIds, await readLedger.all().catch(() => new Map())).length;
}
