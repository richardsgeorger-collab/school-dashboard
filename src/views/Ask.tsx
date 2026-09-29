import { useEffect, useMemo, useRef, useState } from 'react';
import { appSteps, askBlocks, askLoadingLine, askSuggestions, sendAsk, type AskScope } from '../ask/ask';
import { useAccount } from '../auth/AccountContext';
import { describeError, type ChatTurn } from '../chat/client';
import { loadApiKey } from '../chat/key';
import { Locked } from '../config/Locked';
import { useAiAllowed } from '../config/useCan';
import { weakConcepts } from '../domain/concepts';
import { announceContext, announceDb, type StoredAnnouncement } from '../halo/announce';
import { libraryDb, type Deck, type DeckPage } from '../library/db';
import { materialsContext } from '../library/retrieve';
import { EMPTY_POOL, loadPool } from '../quiz/pool';
import type { Recording } from '../record/db';
import { gatherSources, type QuizSource } from '../quiz/sources';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { syllabusContext } from '../syllabus/context';
import { syllabiDb } from '../syllabus/db';
import { citedSources, tutorSituation } from '../tutor/tutor';

const NOTES_KEY = 'school-dashboard:chat-notes';
const slot = (courseId: string | null) => `school-dashboard:ask:${courseId ?? 'all'}`;

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

interface Turn extends ChatTurn {
  /** The model's follow-ups, shown as buttons under its last answer. */
  next?: string[];
}

/**
 * Ask: one chat that knows the classes. Unscoped it is the planner's coach; with a class in focus it also teaches
 * from that class's own material with citations. Every answer ends with buttons for what to do next.
 */
export function Ask() {
  const { data, schedule, derived, nudges, today, actions } = useStore();
  const { params } = useRoute();
  const { tier } = useAccount();
  const tz = data.settings.timezone;
  const allowed = useAiAllowed('aiChat');
  const item = data.items.find((i) => i.id === params.get('i')) ?? null;
  const course = data.courses.find((c) => c.id === (params.get('c') ?? item?.courseId)) ?? null;
  const scope: AskScope = useMemo(() => ({ course, item }), [course, item]);
  const topic = params.get('t') ?? item?.topic ?? item?.title ?? '';

  const [history, setHistory] = useState<Turn[]>(() => load<Turn[]>(slot(course?.id ?? null), []));
  const [notes, setNotes] = useState<string[]>(() => load<string[]>(NOTES_KEY, []));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [syllabi, setSyllabi] = useState('');
  const [decks, setDecks] = useState<Deck[]>([]);
  const [pages, setPages] = useState<DeckPage[]>([]);
  const [news, setNews] = useState<StoredAnnouncement[]>([]);
  const [sources, setSources] = useState<QuizSource[] | null>(course ? null : []);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  // A different scope is a different conversation.
  useEffect(() => {
    setHistory(load<Turn[]>(slot(course?.id ?? null), []));
  }, [course?.id]);
  useEffect(() => save(slot(course?.id ?? null), history.slice(-40)), [history, course?.id]);
  useEffect(() => save(NOTES_KEY, notes), [notes]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [history, busy]);

  // What it knows: the syllabi, every deck, the announcements, and the focused class's own material.
  useEffect(() => {
    let live = true;
    syllabiDb.list().then((docs) => live && setSyllabi(syllabusContext(data.courses, docs))).catch(() => undefined);
    Promise.all([libraryDb.listDecks(), libraryDb.allPages()])
      .then(([d, p]) => {
        if (!live) return;
        setDecks(d);
        setPages(p);
      })
      .catch(() => undefined);
    announceDb.list().then((l) => live && setNews(l)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [data.courses]);
  useEffect(() => {
    if (!course) {
      setSources([]);
      setRecordings([]);
      return;
    }
    let live = true;
    setSources(null);
    loadPool(course.id)
      .catch(() => EMPTY_POOL)
      .then((pool) => {
        if (!live) return;
        setSources(gatherSources(course, topic, pool, tz));
        setRecordings(pool.recordings);
      });
    return () => {
      live = false;
    };
  }, [course?.id, topic, tz]);

  const weak = useMemo(() => (course ? weakConcepts(course.id, data.items, data.settings.quizStats).map((w) => w.topic) : []), [course, data.items, data.settings.quizStats]);
  const situation = useMemo(() => {
    if (!course) return null;
    const s = tutorSituation(course, data.items, recordings, weak, data.settings.topicLinks ?? [], data.courses, today, tz, topic, item);
    const ann = announceContext(news, course.id, tz);
    return ann ? { ...s, announcements: ann } : s;
  }, [course, data.items, recordings, weak, data.settings.topicLinks, data.courses, today, tz, topic, item, news]);

  const ready = allowed && sources !== null;

  const send = async (text: string) => {
    const userText = text.trim();
    if (!userText || busy || !ready) return;
    setInput('');
    setBusy(askLoadingLine(scope, userText, data.courses));
    const at = new Date().toISOString();
    const next = [...history, { role: 'user' as const, text: userText, at }];
    setHistory(next);
    const localNotes = [...notes];
    try {
      const materials = decks.length ? materialsContext(userText, decks, pages, data.courses, today) : '';
      const blocks = askBlocks({
        context: { items: data.items, courses: data.courses, settings: data.settings, schedule, derived, nudges, today, notes },
        courses: data.courses,
        syllabi,
        materials,
        sources: sources ?? [],
        situation,
      });
      const reply = await sendAsk({
        apiKey: loadApiKey() || undefined,
        history,
        userText,
        blocks,
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
      setHistory([...next, reply.text ? { role: 'assistant', text: reply.text, next: reply.next, at: new Date().toISOString() } : { role: 'assistant', text: 'That came back empty. Nothing was wrong with your question; ask it again, or in two shorter parts.', at: new Date().toISOString(), failed: true }]);
    } catch (e) {
      // The failure belongs in the conversation, where the answer would have been, with what to do about it.
      const why = await describeError(e);
      setHistory([...next, { role: 'assistant', text: `${why} Press Try again, or ask it another way.`, at: new Date().toISOString(), failed: true }]);
    } finally {
      setBusy(null);
    }
  };

  // Handed a question from Study, an assignment or Now: ask it once, then drop it from the address so a reload does not ask again.
  const starter = params.get('q');
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!starter || !ready || busy || asked.current === starter) return;
    asked.current = starter;
    const rest = new URLSearchParams(params);
    rest.delete('q');
    window.history.replaceState(null, '', `#/ask${rest.toString() ? `?${rest.toString()}` : ''}`);
    void send(starter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starter, ready]);

  const last = history.length ? history[history.length - 1] : null;
  const lastUser = [...history].reverse().find((t) => t.role === 'user');
  const steps = last && last.role === 'assistant' && !last.failed ? appSteps(scope, last.text, data.items, today, tz) : [];
  const suggestions = askSuggestions(scope, data.items, today, tz);
  const known = [
    `${data.items.filter((i) => i.status !== 'done' && i.type !== 'participation').length} open things`,
    syllabi ? 'the syllabi on file' : null,
    decks.length ? `${decks.length} slide deck${decks.length === 1 ? '' : 's'}` : null,
    course && sources && sources.length ? `${course.code}: ${sources.filter((s) => s.kind === 'slide').length} slides, ${sources.filter((s) => s.kind === 'recording').length} lecture stretch${sources.filter((s) => s.kind === 'recording').length === 1 ? '' : 'es'}` : null,
  ].filter(Boolean);

  const scopeHref = (c: string | null) => `#/ask${c ? `?c=${c}` : ''}`;

  return (
    <div className="ask">
      <div className="lib-head">
        <div>
          <a className="diff-toggle" href="#/study">
            ← Study
          </a>
          <h1 className="page-title">Ask</h1>
          <p className="hint study-lead">Anything about your classes: what to do next, what a professor wants, how a topic works. It knows your assignments, grades, slides, lectures and announcements. Pick a class to have it teach from that class's material.</p>
        </div>
      </div>

      <div className="ask-scope" role="group" aria-label="Class in focus">
        <a className={`quiz-chip${!course ? ' on' : ''}`} href={scopeHref(null)}>
          All classes
        </a>
        {data.courses.map((c) => (
          <a key={c.id} className={`quiz-chip${course?.id === c.id ? ' on' : ''}`} href={scopeHref(c.id)}>
            {c.code}
          </a>
        ))}
        {item && course && (
          <span className="pill ask-about">
            About: {item.label}{' '}
            <a href={scopeHref(course.id)} aria-label="Stop focusing on this assignment">
              ×
            </a>
          </span>
        )}
      </div>

      <Locked feature="aiChat" tier={tier}>
        <section className="chat ask-card" aria-label="Ask">
          <div className="chat-log ask-log" ref={logRef}>
            {history.length === 0 && (
              <div className="chat-suggest">
                {suggestions.map((s) => (
                  <button key={s} type="button" className="btn small" disabled={!ready} onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            )}
            {history.map((t, i) => (
              <div key={i} className="ask-turn" data-role={t.role}>
                <div className="chat-msg" data-role={t.role} data-failed={t.failed ? 'true' : undefined}>
                  {t.text}
                </div>
                {t.role === 'assistant' && sources && citedSources(t.text, sources).length > 0 && (
                  <p className="hint tutor-cites">
                    {citedSources(t.text, sources).map((s) => (
                      <a key={s.id} className="diff-toggle" href={s.href}>
                        [{s.id}] {s.label}
                      </a>
                    ))}
                  </p>
                )}
                {i === history.length - 1 && t.role === 'assistant' && (
                  <div className="ask-next">
                    {t.failed && lastUser && (
                      <button type="button" className="btn small primary" disabled={!ready || !!busy} onClick={() => void send(lastUser.text)}>
                        Try again
                      </button>
                    )}
                    {!t.failed &&
                      (t.next ?? []).map((n) => (
                        <button key={n} type="button" className="btn small" disabled={!ready || !!busy} onClick={() => void send(n)}>
                          {n}
                        </button>
                      ))}
                    {!t.failed &&
                      steps.map((s) => (
                        <a key={s.href} className="btn small" href={s.href}>
                          {s.label}
                        </a>
                      ))}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className="chat-msg" data-role="assistant" aria-live="polite">
                <span className="chat-dots" aria-label="Thinking">
                  <i />
                  <i />
                  <i />
                </span>{' '}
                <span className="hint">{busy}</span>
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
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={course ? `Ask about ${course.code}, or paste where you got stuck` : 'Ask anything about your classes'} aria-label="Your question" disabled={!ready || !!busy} enterKeyHint="send" />
            <button type="submit" className="btn primary" disabled={!ready || !!busy || !input.trim()}>
              Ask
            </button>
          </form>
          <p className="hint mono ask-known">
            {sources === null ? `Reading your ${course?.code ?? ''} material…` : `Knows: ${known.join(' · ')}.`}
            {history.length > 0 && (
              <>
                {' '}
                <button type="button" className="muted" style={{ textDecoration: 'underline' }} onClick={() => setHistory([])}>
                  Clear
                </button>
              </>
            )}
            {notes.length > 0 && (
              <>
                {' '}
                <button type="button" className="muted" style={{ textDecoration: 'underline' }} onClick={() => setNotes([])} title={notes.join('\n')}>
                  Forget {notes.length} note{notes.length === 1 ? '' : 's'}
                </button>
              </>
            )}
          </p>
        </section>
      </Locked>
    </div>
  );
}
