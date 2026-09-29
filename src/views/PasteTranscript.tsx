import { useEffect, useState } from 'react';
import { describeAiError } from '../ai/client';
import { loadApiKey } from '../chat/key';
import { useAiAllowed } from '../config/useCan';
import { Modal } from '../components/Modal';
import type { Course } from '../domain/types';
import { libraryDb } from '../library/db';
import { notifyLibraryChanged } from '../library/ingest';
import { recordingsDb, type Recording } from '../record/db';
import type { LectureNotes } from '../record/notes';
import { createPastedRecording, pastedTitle, wordCount } from '../record/paste';
import { summarizeLecture } from '../record/summarize';
import { useStore } from '../storage/store';
import { ACCEPT, acceptedFile, progressLine, transcribeFile, transcribeReady } from '../record/audioFile';
import { LectureReview, type Decision } from './LectureReview';

/**
 * The main way a lecture gets in: Voice Memos already wrote the transcript, so paste it with the day it happened.
 * No audio, no recording in the browser. It is stored like any recording, searchable and usable by the tutor, and
 * run through the same extraction: what the professor stressed, called exam material, said was due, and new terms.
 */
export function PasteTranscript({ course, onClose }: { course: Course; onClose: () => void }) {
  const { data, today } = useStore();
  const tz = data.settings.timezone;
  const [date, setDate] = useState(today);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'saving' | 'reading' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [review, setReview] = useState<{ recording: Recording; notes: LectureNotes } | null>(null);
  const hasKey = useAiAllowed('lectures');
  const words = wordCount(text);
  // Upload a recording (Max) or paste a transcript; both end in the same transcript box.
  const [mode, setMode] = useState<'upload' | 'paste'>(hasKey ? 'upload' : 'paste');
  const [ready, setReady] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [fromFile, setFromFile] = useState<string | null>(null);
  useEffect(() => {
    if (mode === 'upload' && hasKey && ready === null) void transcribeReady().then(setReady);
  }, [mode, hasKey, ready]);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setFileErr(null);
    if (!acceptedFile(file)) return setFileErr('That file is not one of these: MP4, M4A, MP3 or WAV.');
    try {
      const out = await transcribeFile(file, (stage, left, done, total) => setProgress(`${progressLine(stage, left)}${total > 1 ? ` · ${done} of ${total} parts done` : ''}`));
      if (wordCount(out) < 20) throw new Error('Almost no speech came out of that file. Is it the right recording?');
      setText(out);
      setFromFile(file.name);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, '').slice(0, 80));
      setMode('paste');
    } catch (e) {
      setFileErr(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const save = async () => {
    setBusy('saving');
    setNote(null);
    try {
      const rec = await createPastedRecording({ courseId: course.id, courseCode: course.code, date, title, text, tz });
      notifyLibraryChanged();
      setSaved(true);
      if (!hasKey) {
        setNote(`Saved: ${rec.title}, ${words.toLocaleString()} words. It is searchable now and the tutor can teach from it. On Max, "Read notes" pulls out what the professor stressed.`);
        return;
      }
      setBusy('reading');
      const decks = await libraryDb.listDecks().catch(() => []);
      const deck = decks.find((d) => d.courseId === course.id && d.date === date) ?? null;
      const deckOutline = deck ? { deckId: deck.id, title: deck.title, lines: (await libraryDb.pages(deck.id).catch(() => [])).slice(0, 80).map((p) => `${p.n}. ${(p.text.split(/\n+/).find((l) => l.trim().length > 2) ?? '').trim().slice(0, 90)}`) } : null;
      const notes = await summarizeLecture({ apiKey: loadApiKey(), transcript: text, course, lectureDate: date, items: data.items, tz, deckOutline });
      const updated = { ...rec, notes, processedAt: new Date().toISOString() };
      await recordingsDb.put(updated);
      notifyLibraryChanged();
      setReview({ recording: updated, notes });
    } catch (e) {
      setNote(`${await describeAiError(e)}${saved ? ' The transcript itself is saved.' : ''}`);
    } finally {
      setBusy(null);
    }
  };
  const decide = async (id: string, d: Decision, applied: string) => {
    if (!review) return;
    if (applied) setNote(applied);
    const updated = { ...review.recording, review: { ...review.recording.review, [id]: d } };
    await recordingsDb.put(updated);
    setReview({ ...review, recording: updated });
  };

  if (review) {
    return <LectureReview title={review.recording.title} notes={review.notes} transcript={text} course={course} lectureDate={date} dryRun={false} decisions={review.recording.review} onDecide={(id, d, applied) => void decide(id, d, applied)} onClose={onClose} />;
  }
  return (
    <Modal title={`Add a lecture · ${course.code}`} onClose={onClose}>
      <div className="modal-body">
        <div className="segmented lecture-mode" role="group" aria-label="How the lecture comes in">
          <button type="button" aria-pressed={mode === 'upload'} onClick={() => setMode('upload')} disabled={saved || progress !== null}>
            Upload a recording
          </button>
          <button type="button" aria-pressed={mode === 'paste'} onClick={() => setMode('paste')} disabled={progress !== null}>
            Paste transcript
          </button>
        </div>
        {mode === 'upload' ? (
          !hasKey ? (
            <p className="hint lecture-locked">Turning a recording into a transcript is part of Max. You can still paste a transcript.</p>
          ) : ready === false ? (
            <p className="hint lecture-locked">Transcribing files is not switched on yet. Paste a transcript for now.</p>
          ) : (
            <>
              <p className="hint">A video or audio file of the lecture: MP4, M4A, MP3 or WAV. Halo+ pulls out the sound and writes the transcript, then it works just like a pasted one.</p>
              <label className={`lecture-drop${progress ? ' busy' : ''}`}>
                <input type="file" accept={ACCEPT} disabled={progress !== null || ready === null} onChange={(e) => void upload(e.target.files?.[0])} />
                <span>{progress ?? (ready === null ? 'Checking…' : 'Choose a recording')}</span>
                {progress && <span className="lecture-bar" aria-hidden />}
              </label>
              {progress && (
                <p className="hint" role="status">
                  Keep this tab open until the transcript appears.
                </p>
              )}
              {fileErr && (
                <p className="hint signin-error" role="alert">
                  {fileErr}
                </p>
              )}
            </>
          )
        ) : (
          <p className="hint">{fromFile ? `Transcript from ${fromFile}. Check the date, then save it.` : 'In Voice Memos: open the memo, open its transcript, select all, copy. Paste it here with the day of the lecture. It becomes searchable, the tutor teaches from it, and Claude pulls out what the professor stressed, called exam material, or said was due.'}</p>
        )}
        <div className="field-row">
          <label className="field">
            <span>Lecture date</span>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value || today)} disabled={saved} />
          </label>
          <label className="field">
            <span>Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={pastedTitle(course.code, date)} disabled={saved} />
          </label>
        </div>
        {mode === 'paste' && <textarea className="halo-paste paste-transcript" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the transcript here." aria-label="Transcript" disabled={saved} />}
        <p className="hint mono">
          {words ? `${words.toLocaleString()} words` : ''}
          {!hasKey && words ? ' · saved and searchable; notes from it need a Max plan' : ''}
        </p>
        {note && <p className="hint">{note}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            {saved ? 'Close' : 'Cancel'}
          </button>
          <span className="spacer" />
          {!saved && (
            <button type="button" className="btn primary" disabled={busy !== null || words < 20 || mode !== 'paste'} onClick={() => void save()}>
              {busy === 'saving' ? 'Saving…' : busy === 'reading' ? 'Reading it…' : hasKey ? 'Save and read it' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
