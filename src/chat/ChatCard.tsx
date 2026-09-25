import { useEffect, useRef, useState } from 'react';
import { useStore } from '../storage/store';
import { describeError, sendChat, type ChatTurn } from './client';
import { buildContext } from './context';
import { loadApiKey } from './key';
import { syllabusContext } from '../syllabus/context';
import { syllabiDb } from '../syllabus/db';
import { libraryDb } from '../library/db';
import { materialsContext } from '../library/retrieve';

const HISTORY_KEY = 'school-dashboard:chat';
const NOTES_KEY = 'school-dashboard:chat-notes';

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

const SUGGESTIONS = ['What should I do right now?', "I'm slammed Thursday.", 'I did half the chem homework.'];

/** The coach. No key to enter: the call goes through the account. A refusal (plan, cap, budget) shows in the thread. */
export function ChatCard() {
  const { data, schedule, derived, nudges, today, actions } = useStore();
  const [history, setHistory] = useState<ChatTurn[]>(() => load<ChatTurn[]>(HISTORY_KEY, []));
  const [notes, setNotes] = useState<string[]>(() => load<string[]>(NOTES_KEY, []));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [syllabi, setSyllabi] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    syllabiDb
      .list()
      .then((docs) => setSyllabi(syllabusContext(data.courses, docs)))
      .catch(() => setSyllabi(''));
  }, [data.courses]);
  useEffect(() => save(HISTORY_KEY, history), [history]);
  useEffect(() => save(NOTES_KEY, notes), [notes]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [history, busy]);

  const send = async (text: string) => {
    const userText = text.trim();
    if (!userText || busy) return;
    setInput('');
    setBusy(true);
    const at = new Date().toISOString();
    const next = [...history, { role: 'user' as const, text: userText, at }];
    setHistory(next);
    const localNotes = [...notes];
    try {
      let materials = '';
      try {
        const [decks, pages] = await Promise.all([libraryDb.listDecks(), libraryDb.allPages()]);
        materials = materialsContext(userText, decks, pages, data.courses, today);
      } catch {
        materials = '';
      }
      const reply = await sendChat({
        apiKey: loadApiKey() || undefined,
        history,
        userText,
        context: buildContext({ items: data.items, courses: data.courses, settings: data.settings, schedule, derived, nudges, today, notes }),
        syllabi,
        materials,
        api: {
          items: data.items,
          addNote: (n) => {
            localNotes.push(n);
            setNotes([...localNotes]);
          },
          updateItem: (id, patch) => {
            const it = data.items.find((i) => i.id === id);
            if (!it) return;
            if (patch.status && patch.status !== it.status) actions.setStatus(id, patch.status);
            if (patch.estimatedMinutes !== undefined) actions.upsertItem({ ...it, status: patch.status ?? it.status, estimatedMinutes: patch.estimatedMinutes, estimateOverridden: true });
          },
        },
      });
      // A blank reply is not an answer. It has never been one, and rendering it makes an empty bubble that reads
      // as the coach ignoring the question.
      const reply2 = reply.trim();
      setHistory([...next, reply2 ? { role: 'assistant', text: reply2, at: new Date().toISOString() } : { role: 'assistant', text: 'That came back empty. Nothing was wrong with your question; ask it again, or in two shorter parts.', at: new Date().toISOString(), failed: true }]);
    } catch (e) {
      // The failure belongs in the conversation, where the answer would have been. The question stays: losing what
      // the student typed on top of not answering it is the worst of both.
      const why = await describeError(e);
      setHistory([...next, { role: 'assistant', text: why, at: new Date().toISOString(), failed: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="chat" aria-label="Coach">
      <div className="chat-head">
        <h2 className="section-title">Coach</h2>
        <div className="chat-head-actions">
          {notes.length > 0 && (
            <button type="button" className="btn small" onClick={() => setShowNotes((s) => !s)}>
              {showNotes ? 'Hide notes' : `Notes (${notes.length})`}
            </button>
          )}
          {history.length > 0 && (
            <button type="button" className="btn small" onClick={() => setHistory([])}>
              Clear
            </button>
          )}
        </div>
      </div>

      {showNotes && (
        <ul className="chat-notes">
          {notes.map((n, i) => (
            <li key={i}>
              <span>{n}</span>
              <button type="button" className="muted" aria-label="Forget note" onClick={() => setNotes(notes.filter((_, k) => k !== i))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="chat-log" ref={logRef}>
        {history.length === 0 && (
          <div className="chat-suggest">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="btn small" onClick={() => void send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {history.map((t, i) => (
          <div key={i} className="chat-msg" data-role={t.role} data-failed={t.failed ? 'true' : undefined}>
            {t.text}
          </div>
        ))}
        {busy && (
          <div className="chat-msg" data-role="assistant" aria-live="polite">
            <span className="chat-dots" aria-label="Thinking">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="What should I do right now?" aria-label="Message" disabled={busy} enterKeyHint="send" />
        <button type="submit" className="btn primary" disabled={busy || !input.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
