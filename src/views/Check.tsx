import { useEffect, useRef, useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { describeError } from '../chat/client';
import { loadApiKey } from '../chat/key';
import { isWorkFile, textFromFile } from '../check/extract';
import { CourseChip } from '../components/CourseChip';
import { SegmentedControl } from '../components/SegmentedControl';
import { Locked } from '../config/Locked';
import { useAiAllowed } from '../config/useCan';
import { dateOf, fmtDate } from '../domain/dates';
import type { Brief, Course, Item } from '../domain/types';
import { libraryDb, type Deck } from '../library/db';
import { loadPool } from '../quiz/pool';
import { gatherSources, sourcesBlock } from '../quiz/sources';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { checkableWork, inDays } from '../study/upcoming';
import { briefItem, checkDraft, checkMethod, localBrief, type DraftCheck, type MethodCheck } from '../work/brief';
import { PromptPanel } from './PromptPanel';
import { rubricTextFor } from './WorkPanel';

type Mode = 'writing' | 'method';
const modeFor = (i: Item): Mode => (i.type === 'homework' || i.type === 'lab' || i.type === 'quiz' || i.type === 'exam' ? 'method' : 'writing');

/**
 * Check: paste or drop the work, get it checked against the rubric (writing) or against how the class teaches the
 * method (problem sets). Never a grade, never a rewrite, never the answer. Ends with what to do next.
 */
export function Check() {
  const { data, today, courseById } = useStore();
  const { params } = useRoute();
  const { tier } = useAccount();
  const tz = data.settings.timezone;
  const item = data.items.find((i) => i.id === params.get('i')) ?? null;
  const course = item ? (courseById.get(item.courseId) ?? null) : null;
  const work = checkableWork(data.items, today, tz);
  return (
    <div className="check-page">
      <div className="lib-head">
        <div>
          <a className="diff-toggle" href="#/study">
            ← Study
          </a>
          <h1 className="page-title lib-class-title">
            {course && <CourseChip course={course} />} <span>{item ? `Check my work · ${item.label}` : 'Check my work'}</span>
          </h1>
          <p className="hint study-lead">{item ? (modeFor(item) === 'writing' ? 'Paste your draft or drop the file. You get a checklist against the rubric: what it hits, what is missing, the one next thing. Not a grade, not a rewrite.' : `Paste your work: the setup, the steps, what you got. It is checked against how ${course?.code ?? 'the class'} teaches it. Never the answer.`) : 'Pick the assignment, then paste your work or drop the file. It is checked against the rubric, or against how the class teaches the method. Never a grade, never a rewrite.'}</p>
        </div>
      </div>
      {!item && (
        <section className="card study-block">
          <h2 className="section-title">Which assignment?</h2>
          {work.length === 0 && <p className="hint">Nothing open to check right now. Anything due in the next month shows here.</p>}
          <ul className="study-tests">
            {work.map((w) => (
              <li key={w.id} className="study-test">
                <div className="study-test-main">
                  <span className="study-test-title">{w.label}</span>
                  <span className="hint mono">
                    <CourseChip course={courseById.get(w.courseId)} /> · {fmtDate(dateOf(w.dueAt, tz), 'long')} · {inDays(w, today, tz)} · {w.points} pts
                  </span>
                </div>
                <a className="btn small primary" href={`#/check?i=${w.id}`}>
                  Check
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      {item && course && (
        <Locked feature="aiChat" tier={tier} line="Check my work is part of Max: your draft against the rubric, your problem set against the class's method.">
          <Checker key={item.id} item={item} course={course} />
        </Locked>
      )}
    </div>
  );
}

function Checker({ item: given, course }: { item: Item; course: Course }) {
  const { data, actions } = useStore();
  const item = data.items.find((i) => i.id === given.id) ?? given;
  const allowed = useAiAllowed('aiChat');
  const tz = data.settings.timezone;
  const [mode, setMode] = useState<Mode>(modeFor(item));
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftCheck | null>(null);
  const [method, setMethod] = useState<MethodCheck | null>(null);
  const [prompt, setPrompt] = useState(false);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const description = item.notes?.trim() ?? '';
  useEffect(() => {
    setDraft(null);
    setMethod(null);
  }, [mode]);

  const takeFile = async (f: File) => {
    setNote(null);
    if (!isWorkFile(f.name, f.type)) {
      setNote('Drop a .docx, .pdf, .txt or .md, or paste the text.');
      return;
    }
    setBusy(`Reading ${f.name}…`);
    try {
      setText(await textFromFile(f));
      setFileName(f.name);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const run = async () => {
    if (!text.trim() || !allowed) return;
    setNote(null);
    setDraft(null);
    setMethod(null);
    try {
      if (mode === 'writing') {
        setBusy(`Checking against the ${course.code} rubric…`);
        const decks = await libraryDb.listDecks().catch(() => [] as Deck[]);
        const rubricText = await rubricTextFor(item, decks).catch(() => '');
        let brief: Brief | undefined = item.brief ?? undefined;
        if (!brief) {
          brief = await briefItem({ apiKey: loadApiKey(), item, course, description, rubricText }).catch(() => localBrief({ item, course, description, rubricText }));
          actions.upsertItem({ ...item, brief });
        }
        setDraft(await checkDraft({ apiKey: loadApiKey(), item, course, description, rubricText, brief, draft: text }));
      } else {
        setBusy(`Checking your setup against how ${course.code} teaches it…`);
        const pool = await loadPool(course.id).catch(() => null);
        const material = pool ? sourcesBlock(gatherSources(course, item.topic ?? item.title, pool, tz)) : '';
        setMethod(await checkMethod({ apiKey: loadApiKey(), item, course, description, material, work: text }));
      }
    } catch (e) {
      setNote(`${await describeError(e)} Press Check again, or paste a shorter piece.`);
    } finally {
      setBusy(null);
    }
  };

  const firstMiss = draft?.misses[0]?.criterion ?? method?.problems.find((p) => p.setup !== 'right')?.label ?? null;
  const askHref = `#/ask?c=${course.id}&i=${item.id}&q=${encodeURIComponent(firstMiss ? `How do I fix this on ${item.label}: ${firstMiss}` : `Help me with ${item.label}`)}`;
  const result = draft || method;

  return (
    <>
      <section className="card check-card">
        <SegmentedControl label="What to check" value={mode} options={[{ value: 'writing', label: 'The writing, against the rubric' }, { value: 'method', label: 'The method, against the class' }]} onChange={(v) => setMode(v as Mode)} />
        <div
          className="check-drop"
          data-over={over}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) void takeFile(f);
          }}
        >
          <textarea className="halo-paste check-text" rows={10} value={text} onChange={(e) => { setText(e.target.value); setFileName(null); }} placeholder={mode === 'writing' ? 'Paste your draft here, or drop the file on this box.' : 'Paste your work: the setup, the steps, what you got. Or drop the file on this box.'} aria-label="Your work" disabled={!allowed || !!busy} />
          <div className="settings-actions">
            <button type="button" className="btn primary" disabled={!allowed || !!busy || !text.trim()} onClick={() => void run()}>
              {busy && !busy.startsWith('Reading') ? busy : result ? 'Check again' : 'Check it'}
            </button>
            <button type="button" className="btn" disabled={!allowed || !!busy} onClick={() => fileRef.current?.click()}>
              {busy?.startsWith('Reading') ? busy : 'Drop a file'}
            </button>
            <input ref={fileRef} type="file" accept=".docx,.pdf,.txt,.md,application/pdf,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void takeFile(f); e.target.value = ''; }} />
            {fileName && <span className="hint mono">{fileName} · {text.split(/\s+/).filter(Boolean).length} words</span>}
            {!fileName && text.trim() && <span className="hint mono">{text.split(/\s+/).filter(Boolean).length} words</span>}
          </div>
          {note && (
            <p className="hint" style={{ color: 'var(--overdue)' }}>
              {note}
            </p>
          )}
        </div>
      </section>

      {draft && (
        <section className="card work-check check-result" aria-label="What the check found">
          <h2 className="section-title">Against the rubric</h2>
          {draft.hits.length > 0 && (
            <ul className="work-hits">
              {draft.hits.map((h, i) => (
                <li key={i}>
                  <b>{h.criterion}</b>: {h.note}
                </li>
              ))}
            </ul>
          )}
          {draft.misses.length > 0 && (
            <ul className="work-misses">
              {draft.misses.map((m, i) => (
                <li key={i}>
                  <b>{m.criterion}</b>: {m.what}
                </li>
              ))}
            </ul>
          )}
          {draft.hits.length === 0 && draft.misses.length === 0 && <p className="hint">Nothing on file says what earns points here, so there was nothing to check against. Drop the rubric into the class library, or ask.</p>}
          {draft.next && <p className="work-next">Next: {draft.next}</p>}
        </section>
      )}
      {method && (
        <section className="card work-check check-result" aria-label="What the check found">
          <h2 className="section-title">Your method</h2>
          <ul className="work-method">
            {method.problems.map((p, i) => (
              <li key={i} data-setup={p.setup}>
                <b>{p.label || `Problem ${i + 1}`}</b> <span className="mono muted">· setup {p.setup}</span>: {p.note}
                {p.step && <span className="hint"> Look again at: {p.step}</span>}
              </li>
            ))}
          </ul>
          {method.problems.length === 0 && <p className="hint">It could not find a problem to check in what was pasted. Paste the setup and the steps, not just the answer.</p>}
          {method.next && <p className="work-next">Next: {method.next}</p>}
        </section>
      )}
      {result && (
        <div className="settings-actions practice-next">
          <a className="btn small primary" href={askHref}>
            {firstMiss ? `Ask how to fix: ${firstMiss}` : 'Ask about this'}
          </a>
          <a className="btn small" href={`#/class?c=${course.id}&i=${item.id}`}>
            Open the assignment
          </a>
          <button type="button" className="btn small" onClick={() => setPrompt(true)}>
            Get a prompt
          </button>
        </div>
      )}
      {prompt && <PromptPanel item={item} course={course} onClose={() => setPrompt(false)} />}
    </>
  );
}
