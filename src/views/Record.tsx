import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CourseChip } from '../components/CourseChip';
import { loadApiKey } from '../chat/key';
import { describeError } from '../chat/client';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { recordingsDb, recoverInterrupted, type Recording, type Segment } from '../record/db';
import { fmtBytes, fmtDuration, hoursOfAudio, snippets, wordCount } from '../record/format';
import type { LectureNotes } from '../record/notes';
import { recorder, useRecorder } from '../record/recorder';
import { SAMPLE_TRANSCRIPT, sampleNotes } from '../record/sample';
import { summarizeLecture } from '../record/summarize';
import { detectSupport, BITRATE, FLUSH_MS } from '../record/support';
import { useStore } from '../storage/store';
import { LectureReview, type Decision } from './LectureReview';

type ReviewState = { recording: Recording | null; notes: LectureNotes; transcript: string; courseId: string; lectureDate: string; dryRun: boolean; title: string };

export function Record() {
  const { data, today, courseById } = useStore();
  const tz = data.settings.timezone;
  const support = useMemo(() => detectSupport(), []);
  const rec = useRecorder();
  const [courseId, setCourseId] = useState(data.courses[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [list, setList] = useState<Recording[]>([]);
  const [interrupted, setInterrupted] = useState<Recording[]>([]);
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);
  const [query, setQuery] = useState('');
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const apiKey = loadApiKey();

  const refresh = useCallback(async () => {
    try {
      setList(await recordingsDb.list());
      setQuota(await recordingsDb.estimate());
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    void (async () => {
      try {
        setInterrupted(await recoverInterrupted());
      } catch {
        /* storage unavailable; the support banner says so */
      }
      await refresh();
    })();
  }, [refresh]);
  useEffect(() => {
    if (rec.phase === 'idle') void refresh();
  }, [rec.phase, refresh]);
  useEffect(() => {
    liveRef.current?.scrollTo({ top: liveRef.current.scrollHeight });
  }, [rec.finals, rec.interim]);

  const loadTranscript = useCallback(async (id: string): Promise<string> => {
    if (transcripts[id] !== undefined) return transcripts[id];
    const segs = await recordingsDb.segments(id);
    const text = segs.map((s: Segment) => s.text).join(' ');
    setTranscripts((t) => ({ ...t, [id]: text }));
    return text;
  }, [transcripts]);
  useEffect(() => {
    if (!query.trim()) return;
    for (const r of list) if (transcripts[r.id] === undefined) void loadTranscript(r.id);
  }, [query, list, transcripts, loadTranscript]);
  useEffect(() => {
    if (openId && transcripts[openId] === undefined) void loadTranscript(openId);
  }, [openId, transcripts, loadTranscript]);

  const course = courseById.get(courseId);
  const defaultTitle = course ? `${course.code} lecture, ${fmtDate(today, 'short')}` : `Lecture, ${fmtDate(today, 'short')}`;
  const canRecord = support.mediaRecorder && support.opus && support.indexedDb && data.courses.length > 0;

  const start = () => void recorder.start(courseId, title.trim() || defaultTitle);
  const stop = async () => {
    await recorder.stop();
    setTitle('');
    await refresh();
  };

  const play = async (r: Recording) => {
    if (playing?.id === r.id) {
      URL.revokeObjectURL(playing.url);
      setPlaying(null);
      return;
    }
    const blob = await recordingsDb.audioBlob(r.id, r.mimeType);
    if (!blob) {
      setNote('No audio saved for that recording.');
      return;
    }
    if (playing) URL.revokeObjectURL(playing.url);
    setPlaying({ id: r.id, url: URL.createObjectURL(blob) });
  };
  const keepInterrupted = async (r: Recording) => {
    await recordingsDb.put({ ...r, status: 'done' });
    setInterrupted((l) => l.filter((x) => x.id !== r.id));
    await refresh();
  };
  const remove = async (r: Recording) => {
    if (playing?.id === r.id) {
      URL.revokeObjectURL(playing.url);
      setPlaying(null);
    }
    await recordingsDb.remove(r.id);
    setConfirmDelete(null);
    setInterrupted((l) => l.filter((x) => x.id !== r.id));
    await refresh();
  };
  const dropAudio = async (r: Recording) => {
    if (playing?.id === r.id) {
      URL.revokeObjectURL(playing.url);
      setPlaying(null);
    }
    await recordingsDb.deleteAudio(r.id);
    await refresh();
  };

  const openReview = (r: Recording, notes: LectureNotes, transcript: string) =>
    setReview({ recording: r, notes, transcript, courseId: r.courseId, lectureDate: dateOf(r.startedAt, tz), dryRun: false, title: r.title });
  const summarize = async (r: Recording) => {
    const c = courseById.get(r.courseId);
    if (!c) return;
    setBusyId(r.id);
    setNote(null);
    try {
      const transcript = await loadTranscript(r.id);
      if (wordCount(transcript) < 20) throw new Error('The transcript is too short to summarize. The audio is still there to re-listen.');
      const notes = await summarizeLecture({ apiKey, transcript, course: c, lectureDate: dateOf(r.startedAt, tz), items: data.items, tz });
      const updated = { ...r, notes, processedAt: new Date().toISOString() };
      await recordingsDb.put(updated);
      await refresh();
      openReview(updated, notes, transcript);
    } catch (e) {
      setNote(await describeError(e));
    } finally {
      setBusyId(null);
    }
  };
  const previewSample = () => {
    const c = data.courses.find((x) => x.code === 'CHM-113') ?? data.courses[0];
    if (!c) return;
    setReview({ recording: null, notes: sampleNotes(today, data.items, c, tz), transcript: SAMPLE_TRANSCRIPT, courseId: c.id, lectureDate: today, dryRun: true, title: `${c.code} sample lecture` });
  };
  const [sampleDecisions, setSampleDecisions] = useState<Record<string, Decision>>({});
  const decide = async (id: string, d: Decision, applied: string) => {
    if (!review) return;
    if (applied) setNote(applied);
    if (!review.recording) {
      setSampleDecisions((s) => ({ ...s, [id]: d }));
      return;
    }
    const updated = { ...review.recording, review: { ...review.recording.review, [id]: d } };
    await recordingsDb.put(updated);
    setReview({ ...review, recording: updated });
    await refresh();
  };

  const filtered = query.trim() ? list.filter((r) => (transcripts[r.id] ?? '').toLowerCase().includes(query.trim().toLowerCase()) || r.title.toLowerCase().includes(query.trim().toLowerCase())) : list;
  const byCourse = new Map<string, Recording[]>();
  for (const r of filtered) byCourse.set(r.courseId, [...(byCourse.get(r.courseId) ?? []), r]);
  const free = quota ? Math.max(0, quota.quota - quota.usage) : null;
  const liveText = rec.finals.map((s) => s.text).join(' ');

  return (
    <>
      <h1 className="page-title">
        Record <span className="light">lectures</span>
      </h1>

      {support.reason && (
        <div className="rec-banner" data-level={support.ok ? 'warn' : 'stop'} role="status">
          {support.reason}
        </div>
      )}

      {interrupted.map((r) => (
        <div key={r.id} className="rec-banner" data-level="warn" role="status">
          <b>Recording interrupted:</b> {r.title}, {fmtDuration(r.durationMs)} and {fmtBytes(r.bytes)} were saved before the tab closed.
          <span className="rec-banner-actions">
            <button type="button" className="btn small primary" onClick={() => void keepInterrupted(r)}>
              Keep it
            </button>
            <button type="button" className="btn small danger" onClick={() => void remove(r)}>
              Delete
            </button>
          </span>
        </div>
      ))}

      <div className="rec-grid">
        <section className="card rec-panel">
          {rec.phase === 'idle' ? (
            <>
              <h2 className="section-title">New recording</h2>
              <div className="field-row" style={{ marginTop: 10 }}>
                <label className="field">
                  <span>Class</span>
                  <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                    {data.courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Title</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle} />
                </label>
              </div>
              <button type="button" className="btn primary rec-big" onClick={start} disabled={!canRecord || rec.phase !== 'idle'}>
                <span className="rec-dot" /> Record
              </button>
              {rec.error && <p className="hint rec-error">{rec.error}</p>}
              <p className="hint">
                Audio is saved as Opus at 24 kbps, about 11 MB an hour. The live transcript comes from Chrome&apos;s speech recognition: it is rough in a lecture hall and
                the audio is the real record. Both are written to this browser every {FLUSH_MS / 1000} seconds, so a closed tab loses at most that much. Keep the lid open;
                the tab can be in the background.
              </p>
            </>
          ) : (
            <div className="rec-live">
              <div className="rec-live-head">
                <span className="rec-pill" data-state={rec.phase === 'recording' ? 'on' : 'off'}>
                  <span className="rec-dot" /> {rec.phase === 'starting' ? 'Starting…' : rec.phase === 'stopping' ? 'Saving…' : 'Recording'}
                </span>
                <span className="mono rec-clock">{fmtDuration(rec.elapsedMs)}</span>
              </div>
              <p className="rec-live-title">
                {rec.recording?.title} <CourseChip course={courseById.get(rec.recording?.courseId ?? '')} />
              </p>
              <button type="button" className="btn danger rec-big rec-stop" onClick={() => void stop()} disabled={rec.phase !== 'recording'}>
                Stop
              </button>
              <p className="hint mono">
                {fmtBytes(rec.bytes)} saved in {rec.chunks} chunk{rec.chunks === 1 ? '' : 's'} · speech:{' '}
                {rec.speech === 'listening' ? 'listening' : rec.speech === 'restarting' ? 'reconnecting' : rec.speech === 'unavailable' ? 'unavailable' : 'starting'}
              </p>
              {rec.speechNote && <p className="hint rec-error">{rec.speechNote}</p>}
              <div className="rec-transcript rec-transcript-live" ref={liveRef} aria-live="polite">
                {liveText || rec.interim ? (
                  <>
                    {liveText} <span className="muted">{rec.interim}</span>
                  </>
                ) : (
                  <span className="muted">Waiting for speech… The audio is recording either way.</span>
                )}
              </div>
              <p className="hint">Rough transcript. Re-listen to the audio for anything that matters.</p>
            </div>
          )}
        </section>

        <section className="card rec-panel">
          <div className="grade-head">
            <h2 className="section-title">Recordings</h2>
            <input className="rec-search" type="search" placeholder="Search transcripts" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search transcripts" />
          </div>
          <p className="hint mono">
            {quota && free !== null
              ? `${fmtBytes(quota.usage)} used of ${fmtBytes(quota.quota)} this browser allows · about ${Math.round(hoursOfAudio(free)).toLocaleString()} more hours at ${BITRATE / 1000} kbps`
              : 'Storage quota unknown.'}
          </p>
          {list.length === 0 && <p className="hint">No recordings yet.</p>}
          {[...byCourse.entries()].map(([cid, recs]) => (
            <div key={cid} className="rec-group">
              <h3>
                <CourseChip course={courseById.get(cid)} /> <span className="count">{recs.length}</span>
              </h3>
              <ul className="rec-list">
                {recs.map((r) => {
                  const text = transcripts[r.id];
                  const hits = query.trim() && text ? snippets(text, query, 50) : [];
                  const open = openId === r.id;
                  return (
                    <li key={r.id} className="rec-card" data-status={r.status}>
                      <div className="rec-card-head">
                        <div>
                          <div className="rec-card-title">{r.title}</div>
                          <div className="hint mono">
                            {fmtDate(dateOf(r.startedAt, tz), 'short')} {fmtTime(r.startedAt, tz)} · {fmtDuration(r.durationMs)} · {r.audioDeleted ? 'audio deleted' : fmtBytes(r.bytes)}
                            {text !== undefined && ` · ${wordCount(text).toLocaleString()} words`}
                            {r.status === 'interrupted' && ' · interrupted'}
                            {r.notes && ' · notes ready'}
                          </div>
                        </div>
                      </div>
                      {hits.length > 0 && (
                        <ul className="rec-hits">
                          {hits.map((h, i) => (
                            <li key={i}>{h}</li>
                          ))}
                        </ul>
                      )}
                      <div className="rec-card-actions">
                        {!r.audioDeleted && (
                          <button type="button" className="btn small" onClick={() => void play(r)}>
                            {playing?.id === r.id ? 'Close player' : 'Play'}
                          </button>
                        )}
                        <button type="button" className="btn small" onClick={() => setOpenId(open ? null : r.id)}>
                          {open ? 'Hide transcript' : 'Transcript'}
                        </button>
                        {r.notes ? (
                          <button type="button" className="btn small" onClick={() => void loadTranscript(r.id).then((t) => openReview(r, r.notes!, t))}>
                            Review notes
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn small"
                            disabled={!apiKey || busyId === r.id}
                            title={apiKey ? 'Send the transcript to Claude for a summary and deadline mentions' : 'Connect your Anthropic key in the coach on the Now tab first'}
                            onClick={() => void summarize(r)}
                          >
                            {busyId === r.id ? 'Summarizing…' : 'Summarize'}
                          </button>
                        )}
                        {!r.audioDeleted && (
                          <button type="button" className="btn small" onClick={() => void dropAudio(r)} title="Free the space; the transcript stays">
                            Delete audio
                          </button>
                        )}
                        {confirmDelete === r.id ? (
                          <button type="button" className="btn small danger" onClick={() => void remove(r)}>
                            Confirm delete
                          </button>
                        ) : (
                          <button type="button" className="btn small" onClick={() => setConfirmDelete(r.id)}>
                            Delete
                          </button>
                        )}
                      </div>
                      {playing?.id === r.id && <audio className="rec-audio" controls autoPlay src={playing.url} />}
                      {open && <div className="rec-transcript">{text === undefined ? 'Loading…' : text || 'No speech was recognized. The audio may still be fine.'}</div>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {!apiKey && list.length > 0 && <p className="hint">Summaries and deadline extraction run on Claude with your own key, which is not set. Recording never needs it.</p>}
          <div className="settings-actions" style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={previewSample}>
              Preview the review flow with a sample lecture
            </button>
          </div>
          {note && <p className="hint" style={{ marginTop: 8 }}>{note}</p>}
        </section>
      </div>

      {review && courseById.get(review.courseId) && (
        <LectureReview
          title={review.title}
          notes={review.notes}
          transcript={review.transcript}
          course={courseById.get(review.courseId)!}
          lectureDate={review.lectureDate}
          dryRun={review.dryRun}
          decisions={review.recording ? review.recording.review : sampleDecisions}
          onDecide={(id, d, applied) => void decide(id, d, applied)}
          onClose={() => {
            setReview(null);
            setSampleDecisions({});
          }}
        />
      )}
    </>
  );
}
