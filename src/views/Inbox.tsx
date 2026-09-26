import { useCallback, useEffect, useMemo, useState } from 'react';
import { describeAiError } from '../ai/client';
import { loadApiKey } from '../chat/key';
import { useAiAllowed } from '../config/useCan';
import { CourseChip } from '../components/CourseChip';
import { EmptyState } from '../components/EmptyState';
import { syncPress } from '../ui/presses';
import { dateOf, fmtDate } from '../domain/dates';
import type { Course } from '../domain/types';
import { announceDb, announceStores, readAnnouncement, readLedger, readState, type ReadEntry, type StoredAnnouncement, type StoredMessage } from '../halo/announce';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { LectureReview, type Decision } from './LectureReview';
import { ReadAll } from './ReadAll';

/**
 * The inbox: announcements, newest first. At GCU the week's real instructions often live here, so this is where they are read,
 * and where what they change goes through the same approval flow as everything else.
 */
export function Inbox() {
  const { data, today, courseById } = useStore();
  const { params } = useRoute();
  const tz = data.settings.timezone;
  const only = params.get('c');
  const [list, setList] = useState<StoredAnnouncement[] | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [ledger, setLedger] = useState<Map<string, ReadEntry> | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(params.get('a'));
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [review, setReview] = useState<StoredAnnouncement | null>(null);
  const [readAll, setReadAll] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const hasKey = useAiAllowed('announcementAI');

  const refresh = useCallback(async () => {
    // The list and the ledger land together: a list next to a ledger that has not loaded reads as "all unread".
    const [l, m] = await Promise.all([announceDb.list().catch(() => []), announceStores.messages().catch(() => [])]);
    let led: Map<string, ReadEntry> | null = null;
    try {
      led = await readLedger.all();
      setLedgerError(null);
    } catch (e) {
      setLedgerError(e instanceof Error ? e.message : String(e));
    }
    setList(l);
    setMessages(m);
    setLedger(led);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const shown = useMemo(() => (list ?? []).filter((a) => (only ? a.courseId === only : true) && (filter === 'all' || a.courseId === filter) && courseById.has(a.courseId)), [list, only, filter, courseById]);

  const markRead = async (a: StoredAnnouncement) => {
    if (a.readAt) return;
    await announceDb.put({ ...a, readAt: new Date().toISOString() });
    await refresh();
  };
  const toggle = async (a: StoredAnnouncement) => {
    const next = open === a.id ? null : a.id;
    setOpen(next);
    if (next) await markRead(a);
  };
  const read = async (a: StoredAnnouncement) => {
    const course = courseById.get(a.courseId);
    if (!course || !hasKey) return;
    setBusy(a.id);
    setNote(null);
    try {
      const r = await readAnnouncement({ apiKey: loadApiKey(), announcement: a, course, items: data.items, tz });
      const updated: StoredAnnouncement = { ...a, processedAt: new Date().toISOString(), findings: r.findings, readAt: a.readAt ?? new Date().toISOString(), text: a.text };
      await announceDb.put(updated);
      await refresh();
      if (r.findings.length === 0) setNote(`${course.code}: nothing in "${a.title}" changes your planner. ${r.summary}`);
      else setReview(updated);
    } catch (e) {
      setNote(await describeAiError(e));
    } finally {
      setBusy(null);
    }
  };
  const decide = async (id: string, d: Decision, applied: string) => {
    if (!review) return;
    if (applied) setNote(applied);
    const updated = { ...review, review: { ...review.review, [id]: d } };
    await announceDb.put(updated);
    setReview(updated);
    await refresh();
  };

  // Read for requirements is one question with one answer per post, and the header count and each row's label are
  // both read off it, so they cannot contradict each other. A stamped post the ledger has lost is healed here too.
  const states = useMemo(() => new Map(ledger ? shown.map((a) => [a.id, readState(a, ledger)] as const) : []), [shown, ledger]);
  useEffect(() => {
    for (const s of states.values()) if (s.heal) void readLedger.put(s.heal).catch(() => undefined);
  }, [states]);
  const unreadForReqs = ledger ? [...states.values()].filter((s) => !s.read).length : 0;
  const course: Course | undefined = only ? courseById.get(only) : undefined;

  return (
    <>
      <div className="lib-head">
        <div>
          {course && (
            <a className="diff-toggle" href={`#/class?c=${course.id}`}>
              ← {course.code}
            </a>
          )}
          <h1 className="page-title lib-class-title">
            {course && <CourseChip course={course} />} <span>Inbox</span>
          </h1>
          {list !== null && shown.length > 0 && ledgerError && (
            <p className="hint" data-tone="danger">
              {shown.length} on file. The record of what has been read could not be opened ({ledgerError}), so which ones still need reading is unknown.
            </p>
          )}
          {list !== null && shown.length > 0 && ledger && (
            <p className="hint">
              {/* The only one that matters is whether they have been read for requirements. Whether the student has
                  personally opened one is a different thing and no longer shares a sentence with it. */}
              {unreadForReqs === 0 ? `${shown.length} on file, all read for requirements.` : `${shown.length} on file. ${unreadForReqs} not yet read for requirements; your next sync reads ${unreadForReqs === 1 ? 'it' : 'them'}.`}
            </p>
          )}
        </div>
      </div>
      {shown.length > 0 && (
        <p className="hint news-readall">
          <button type="button" className="btn small primary" onClick={() => setReadAll(true)} disabled={!hasKey}>
            Read all for what they ask
          </button>{' '}
          {unreadForReqs > 0
            ? `Your next sync reads ${unreadForReqs === 1 ? 'it' : `the ${unreadForReqs} that are left`} on its own. Press this only if you want ${unreadForReqs === 1 ? 'it' : 'them'} now.`
            : 'All read. Anything they asked for is on the assignment it belongs to.'}
        </p>
      )}
      {note && <p className="hint news-note">{note}</p>}
      {messages.filter((m) => (only ? m.courseId === only : true) && courseById.has(m.courseId)).length > 0 && (
        <section className="news-messages">
          <h2 className="section-title">messages from your instructor</h2>
          <ul className="news-list">
            {messages
              .filter((m) => (only ? m.courseId === only : true) && courseById.has(m.courseId))
              .slice(0, 8)
              .map((m) => {
                const mc = courseById.get(m.courseId);
                return (
                  <li key={m.id} className="news-item" data-unread={m.fromInstructor && !m.readAt}>
                    <div className="news-head" style={{ cursor: 'default' }}>
                      <span className="news-meta mono">
                        {mc && <CourseChip course={mc} />} {m.publishedAt ? fmtDate(dateOf(m.publishedAt, tz), 'short') : ''}
                        {m.author ? ` · ${m.author}` : ''}
                        {!m.fromInstructor && <span className="muted"> · you</span>}
                      </span>
                      <span className="news-text">{m.text}</span>
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      )}
      {list !== null && shown.length === 0 && filter === 'all' && (
        <EmptyState>
          <p>
            <b>Nothing here yet.</b>
          </p>
          <p>Your professors' announcements arrive with every sync, and anything they ask for lands on the assignment it belongs to.</p>
          <p className="empty-actions">
            <button type="button" className="btn primary" onClick={() => syncPress.current?.()}>
              Sync Halo
            </button>
          </p>
        </EmptyState>
      )}
      {!only && data.courses.length > 1 && (list?.length ?? 0) > 0 && (
        <div className="news-filter">
          <button type="button" className="chip" data-on={filter === 'all'} onClick={() => setFilter('all')}>
            All
          </button>
          {data.courses.map((c) => (
            <button key={c.id} type="button" className="chip" data-on={filter === c.id} onClick={() => setFilter(c.id)}>
              {c.code}
            </button>
          ))}
        </div>
      )}
      <ul className="news-list news-announcements">
        {shown.map((a) => {
          const c = courseById.get(a.courseId);
          const isOpen = open === a.id;
          return (
            <li key={a.id} className="news-item" data-unread={!a.readAt} data-open={isOpen}>
              <button type="button" className="news-head" onClick={() => void toggle(a)} aria-expanded={isOpen}>
                <span className="news-title">
                  {/* A list of 47 titles, many of them "Attached", is not scannable. What it asks for is. */}
                  {a.actionsSummary || a.title || '(untitled)'}
                  {states.get(a.id)?.read && (states.get(a.id)?.count ?? 0) === 0 && <span className="news-quiet"> · nothing to do</span>}
                  {states.get(a.id)?.read && (states.get(a.id)?.count ?? 0) > 0 && (
                    <span className="news-added">
                      {' '}
                      · {states.get(a.id)?.count} thing{states.get(a.id)?.count === 1 ? '' : 's'} added
                    </span>
                  )}
                </span>
                <span className="news-meta mono">
                  {c && <CourseChip course={c} />} {a.publishedAt ? fmtDate(dateOf(a.publishedAt, tz), 'short') : ''}
                  {a.author ? ` · ${a.author}` : ''}
                  {!a.readAt && <span className="news-dot" aria-label="unread" />}
                </span>
              </button>
              {isOpen && (
                <div className="news-body">
                  <p className="news-text">{a.text}</p>
                  {a.resources.length > 0 && (
                    <p className="hint">
                      Attached in Halo: {a.resources.map((r) => r.name).join(', ')}
                    </p>
                  )}
                  <div className="settings-actions">
                    {a.findings === null ? (
                      <button type="button" className="btn small primary" disabled={!hasKey || busy === a.id} onClick={() => void read(a)}>
                        {busy === a.id ? 'Reading…' : 'What does this change?'}
                      </button>
                    ) : a.findings.length === 0 ? (
                      <span className="hint">Read on {a.processedAt ? fmtDate(dateOf(a.processedAt, tz), 'short') : ''}: nothing here changes your planner.</span>
                    ) : (
                      <button type="button" className="btn small" onClick={() => setReview(a)}>
                        {a.findings.length} thing{a.findings.length === 1 ? '' : 's'} it changes
                      </button>
                    )}
                    {!hasKey && a.findings === null && <span className="hint">Reading announcements is part of Pro.</span>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {readAll && ledger && <ReadAll list={shown} ledger={ledger} onClose={() => setReadAll(false)} onDone={() => void refresh()} />}
      {review && courseById.get(review.courseId) && (
        <LectureReview
          title={review.title}
          notes={{ summary: [], concepts: [], mentions: review.findings ?? [], model: 'capture', createdAt: review.processedAt ?? '' }}
          transcript={review.text}
          course={courseById.get(review.courseId)!}
          lectureDate={review.publishedAt ? dateOf(review.publishedAt, tz) : today}
          dryRun={false}
          decisions={review.review}
          onDecide={(id, d, applied) => void decide(id, d, applied)}
          onClose={() => setReview(null)}
        />
      )}
    </>
  );
}
