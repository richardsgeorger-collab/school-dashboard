import { useCallback, useEffect, useMemo, useState } from 'react';
import { describeAiError } from '../ai/client';
import { loadApiKey } from '../chat/key';
import { useAiAllowed } from '../config/useCan';
import { CourseChip } from '../components/CourseChip';
import { dateOf, fmtDate } from '../domain/dates';
import type { Course } from '../domain/types';
import { announceDb, announceStores, bodyHash, readAnnouncement, readLedger, type ReadEntry, type StoredAnnouncement, type StoredMessage } from '../halo/announce';
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
  const [ledger, setLedger] = useState<Map<string, ReadEntry>>(new Map());
  const [open, setOpen] = useState<string | null>(params.get('a'));
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [review, setReview] = useState<StoredAnnouncement | null>(null);
  const [readAll, setReadAll] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const hasKey = useAiAllowed('announcementAI');

  const refresh = useCallback(async () => {
    setList(await announceDb.list().catch(() => []));
    setMessages(await announceStores.messages().catch(() => []));
    setLedger(await readLedger.all().catch(() => new Map()));
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

  // Read for requirements means an entry in the ledger whose words still match the post. Nothing else counts.
  const unreadForReqs = shown.filter((a) => ledger.get(a.id)?.hash !== bodyHash(a)).length;
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
          <p className="hint mono">
            {list === null
              ? 'Reading…'
              : shown.length === 0
                ? 'Nothing here yet. Press Sync and your announcements arrive with your assignments.'
                : // The only one that matters is whether they have been read for requirements. Whether the student
                  // has personally opened one is a different thing and no longer shares a sentence with it.
                  unreadForReqs === 0
                  ? `${shown.length} on file, all read for requirements.`
                  : `${shown.length} on file. ${unreadForReqs} not yet read for requirements — your next sync reads ${unreadForReqs === 1 ? 'it' : 'them'}.`}
          </p>
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
      {!only && data.courses.length > 1 && (
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
                  {a.actionsAt && (a.actionCount ?? 0) === 0 && <span className="news-quiet"> · nothing to do</span>}
                  {(a.actionCount ?? 0) > 0 && (
                    <span className="news-added">
                      {' '}
                      · {a.actionCount} thing{a.actionCount === 1 ? '' : 's'} added
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
      {readAll && <ReadAll list={shown} ledger={ledger} onClose={() => setReadAll(false)} onDone={() => void refresh()} />}
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
