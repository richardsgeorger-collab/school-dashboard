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
import { SegmentedControl } from '../components/SegmentedControl';
import { capWords } from '../halo/actions';
import { READ_EVENT, useReadStatus } from '../halo/backgroundRead';
import { ReadStatusLines, useReadNow } from './ReadStatus';

type Group = 'needs' | 'info' | 'empty' | 'unread';
const GROUP_LABEL: Record<Group, string> = { needs: 'Needs you', info: 'Info only', empty: 'Nothing in it', unread: 'Not read yet' };
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
  const [group, setGroup] = useState<Group | null>(null);
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
    // A background read finished: the piles change.
    window.addEventListener(READ_EVENT, refresh);
    return () => window.removeEventListener(READ_EVENT, refresh);
  }, [refresh]);
  const readNow = useReadNow();
  const reading = useReadStatus();

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
  // Four piles. What needs you leads; what was read and asks nothing is information; a post with no body is nothing.
  const groupOf = (a: StoredAnnouncement): Group => {
    const st = states.get(a.id);
    if (!st || !st.read) return 'unread';
    if ((st.count ?? 0) > 0) return 'needs';
    return (a.text ?? '').trim().length < 80 ? 'empty' : 'info';
  };
  const piles = useMemo(() => {
    const p: Record<Group, StoredAnnouncement[]> = { needs: [], info: [], empty: [], unread: [] };
    for (const a of shown) p[groupOf(a)].push(a);
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, states]);
  const order: Group[] = ['needs', 'info', 'empty', 'unread'];
  const current: Group = group && piles[group].length ? group : (order.find((g) => piles[g].length > 0) ?? 'needs');
  const visible = piles[current];
  const openPost = open ? (shown.find((a) => a.id === open) ?? null) : null;
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
              {unreadForReqs === 0 ? `${shown.length} on file, all read for what they ask.` : `${shown.length} on file, ${unreadForReqs} still to read for what ${unreadForReqs === 1 ? 'it asks' : 'they ask'}.`}
            </p>
          )}
        </div>
      </div>
      {shown.length > 0 && (
        <div className="news-groups">
          <SegmentedControl
            label="Announcements"
            value={current}
            options={order.filter((g) => piles[g].length > 0).map((g) => ({ value: g, label: `${GROUP_LABEL[g]} · ${piles[g].length}` }))}
            onChange={(v) => setGroup(v)}
          />
          <details className="menu">
            <summary aria-label="More">⋯</summary>
            <div className="menu-list">
              <button type="button" className="menu-item" onClick={() => setReadAll(true)} disabled={!hasKey}>
                Read all for what they ask
              </button>
              <span className="menu-hint">
                {unreadForReqs > 0 ? `${unreadForReqs} still to read; the app reads them on its own.` : 'All read. Anything they asked for is on the assignment it belongs to.'}
              </span>
            </div>
          </details>
        </div>
      )}
      {note && <p className="hint news-note">{note}</p>}
      <ReadStatusLines compact />
      {current === 'unread' && visible.length > 0 && !reading.running && hasKey && !reading.waiting && (
        <p className="hint news-note">
          The next sync reads {visible.length === 1 ? 'it' : 'them'}, or{' '}
          <button type="button" className="btn small primary" onClick={readNow}>
            Read {visible.length} now
          </button>
        </p>
      )}
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
        <EmptyState art="inbox">
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
      <div className="news-layout" data-open={!!openPost}>
      <ul className="news-list news-announcements">
        {visible.map((a) => {
          const c = courseById.get(a.courseId);
          const isOpen = open === a.id;
          const st = states.get(a.id);
          const summary = st?.summary || a.actionsSummary;
          return (
            <li key={a.id} className="news-item" data-unread={!a.readAt} data-open={isOpen}>
              <button type="button" className="news-head" onClick={() => void toggle(a)} aria-expanded={isOpen}>
                <span className="news-title">
                  {/* What the post asks leads; the professor's own title sits under it in small text. */}
                  <span className="news-summary">{capWords(summary || a.title || '(untitled)', 12)}</span>
                  {summary && a.title && <span className="news-raw">{a.title}</span>}
                  {st?.read && (st.count ?? 0) > 0 && (
                    <span className="news-added">
                      {st.count} thing{st.count === 1 ? '' : 's'} added
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
                    {/* Read for what it asks (the ledger) is the answer; the per-post button is only for a post nobody has read. */}
                    {st?.read && a.findings === null ? (
                      <span className="hint">{(st.count ?? 0) > 0 ? `Read. ${st.count} thing${st.count === 1 ? '' : 's'} added to your planner from this post.` : 'Read. Nothing here changes your planner.'}</span>
                    ) : a.findings === null ? (
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
                    {!hasKey && a.findings === null && !st?.read && <span className="hint">Reading announcements is part of Pro.</span>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {openPost && (
        <aside className="news-detail" aria-label="Announcement">
          <div className="news-detail-head">
            <span className="news-meta mono">
              {courseById.get(openPost.courseId) && <CourseChip course={courseById.get(openPost.courseId)!} />} {openPost.publishedAt ? fmtDate(dateOf(openPost.publishedAt, tz), 'long') : ''}
              {openPost.author ? ` · ${openPost.author}` : ''}
            </span>
            <h2 className="news-detail-title">{openPost.title || '(untitled)'}</h2>
            {(states.get(openPost.id)?.summary || openPost.actionsSummary) && <p className="news-detail-summary">{states.get(openPost.id)?.summary || openPost.actionsSummary}</p>}
          </div>
          <p className="news-text">{openPost.text}</p>
          {openPost.resources.length > 0 && <p className="hint">Attached in Halo: {openPost.resources.map((r) => r.name).join(', ')}</p>}
          <div className="settings-actions">
            {states.get(openPost.id)?.read && (states.get(openPost.id)?.count ?? 0) > 0 && (
              <span className="hint">
                {states.get(openPost.id)?.count} thing{states.get(openPost.id)?.count === 1 ? '' : 's'} added to your planner from this post.
              </span>
            )}
            {openPost.findings === null && states.get(openPost.id)?.read ? (
              (states.get(openPost.id)?.count ?? 0) === 0 ? <span className="hint">Read. Nothing here changes your planner.</span> : null
            ) : openPost.findings === null ? (
              <button type="button" className="btn small" disabled={!hasKey || busy === openPost.id} onClick={() => void read(openPost)}>
                {busy === openPost.id ? 'Reading…' : 'What does this change?'}
              </button>
            ) : openPost.findings.length === 0 ? (
              <span className="hint">Nothing here changes your planner.</span>
            ) : (
              <button type="button" className="btn small" onClick={() => setReview(openPost)}>
                {openPost.findings.length} thing{openPost.findings.length === 1 ? '' : 's'} it changes
              </button>
            )}
          </div>
        </aside>
      )}
      </div>
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
