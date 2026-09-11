import { useEffect, useRef, useState } from 'react';
import { useStore } from '../storage/store';
import { describeError, sendChat, type ChatTurn } from './client';
import { buildContext } from './context';
import { syllabusContext } from '../syllabus/context';
import { syllabiDb } from '../syllabus/db';

const KEY_KEY = 'school-dashboard:anthropic-key';
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

export function ChatCard() {
  const { data, schedule, derived, nudges, today, actions } = useStore();
  const [apiKey, setApiKey] = useState<string>(() => load<string>(KEY_KEY, ''));
  const [keyDraft, setKeyDraft] = useState('');
  const [history, setHistory] = useState<ChatTurn[]>(() => load<ChatTurn[]>(HISTORY_KEY, []));
  const [notes, setNotes] = useState<string[]>(() => load<string[]>(NOTES_KEY, []));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const connect = () => {
    const k = keyDraft.trim();
    if (!k) return;
    save(KEY_KEY, k);
    setApiKey(k);
    setKeyDraft('');
  };
  const disconnect = () => {
    try {
      localStorage.removeItem(KEY_KEY);
    } catch {
      /* ignore */
    }
    setApiKey('');
  };

  const send = async (text: string) => {
    const userText = text.trim();
    if (!userText || busy || !apiKey) return;
    setInput('');
    setError(null);
    setBusy(true);
    const at = new Date().toISOString();
    const next = [...history, { role: 'user' as const, text: userText, at }];
    setHistory(next);
    const localNotes = [...notes];
    try {
      const reply = await sendChat({
        apiKey,
        history,
        userText,
        context: buildContext({ items: data.items, courses: data.courses, settings: data.settings, schedule, derived, nudges, today, notes }),
        syllabi,
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
      setHistory([...next, { role: 'assistant', text: reply, at: new Date().toISOString() }]);
    } catch (e) {
      setError(await describeError(e));
      setHistory(history);
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
          {apiKey && (
            <button type="button" className="btn small" onClick={disconnect} title="Forget the API key on this device">
              Disconnect
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

      {!apiKey ? (
        <form
          className="chat-connect"
          onSubmit={(e) => {
            e.preventDefault();
            connect();
          }}
        >
          <p className="hint">
            Ask what to do next, tell it when you're slammed or ahead, and it adjusts. Runs on Claude with your own Anthropic API key, stored only on this device and sent only to Anthropic.
          </p>
          <div className="chat-connect-row">
            <input type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="sk-ant-…" autoComplete="off" aria-label="Anthropic API key" />
            <button type="submit" className="btn primary" disabled={!keyDraft.trim()}>
              Connect
            </button>
          </div>
        </form>
      ) : (
        <>
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
              <div key={i} className="chat-msg" data-role={t.role}>
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
            {error && <p className="hint" style={{ color: 'var(--overdue)' }}>{error}</p>}
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
        </>
      )}
    </section>
  );
}
