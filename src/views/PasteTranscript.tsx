import { useState } from 'react';
import { describeAiError } from '../ai/client';
import { loadApiKey } from '../chat/key';
import { Modal } from '../components/Modal';
import type { Course } from '../domain/types';
import { libraryDb } from '../library/db';
import { notifyLibraryChanged } from '../library/ingest';
import { recordingsDb, type Recording } from '../record/db';
import type { LectureNotes } from '../record/notes';
import { createPastedRecording, pastedTitle, wordCount } from '../record/paste';
import { summarizeLecture } from '../record/summarize';
import { useStore } from '../storage/store';
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
  const hasKey = loadApiKey() !== '';
  const words = wordCount(text);

  const save = async () => {
    setBusy('saving');
    setNote(null);
    try {
      const rec = await createPastedRecording({ courseId: course.id, courseCode: course.code, date, title, text, tz });
      notifyLibraryChanged();
      setSaved(true);
      if (!hasKey) {
        setNote(`Saved: ${rec.title}, ${words.toLocaleString()} words. It is searchable now and the tutor can teach from it. Connect the key on Now and "Read notes" on it pulls out what the professor stressed.`);
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
    <Modal title={`Paste a lecture transcript · ${course.code}`} onClose={onClose}>
      <div className="modal-body">
        <p className="hint">In Voice Memos: open the memo, open its transcript, select all, copy. Paste it here with the day of the lecture. It becomes searchable, the tutor teaches from it, and Claude pulls out what the professor stressed, called exam material, or said was due.</p>
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
        <textarea className="halo-paste paste-transcript" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the transcript here." aria-label="Transcript" disabled={saved} />
        <p className="hint mono">
          {words ? `${words.toLocaleString()} words` : ''}
          {!hasKey && words ? ' · no key on this device, so it is saved and searchable; the extraction runs once a key is connected' : ''}
        </p>
        {note && <p className="hint">{note}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>
            {saved ? 'Close' : 'Cancel'}
          </button>
          <span className="spacer" />
          {!saved && (
            <button type="button" className="btn primary" disabled={busy !== null || words < 20} onClick={() => void save()}>
              {busy === 'saving' ? 'Saving…' : busy === 'reading' ? 'Reading it…' : hasKey ? 'Save and read it' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
