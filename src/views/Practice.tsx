import { useEffect, useMemo, useState } from 'react';
import { describeAiError } from '../ai/client';
import { useAccount } from '../auth/AccountContext';
import { loadApiKey } from '../chat/key';
import { CourseChip } from '../components/CourseChip';
import { SegmentedControl } from '../components/SegmentedControl';
import { Locked } from '../config/Locked';
import { useAiAllowed } from '../config/useCan';
import { weakConcepts } from '../domain/concepts';
import { dateOf, fmtDate, fmtMinutes } from '../domain/dates';
import { examPressure } from '../domain/exam';
import type { Course, Item } from '../domain/types';
import { aiDb, studyKey } from '../ingest/db';
import { planForTest, testTopics, topicsForTest } from '../practice/plan';
import { buildWorksheet, download, worksheetDoc, worksheetFileName, worksheetHash, type Worksheet } from '../practice/worksheet';
import { wantsWorkedProblems } from '../quiz/generate';
import { EMPTY_POOL, loadPool } from '../quiz/pool';
import { gatherSources, type SourcePool } from '../quiz/sources';
import { weakTopics } from '../quiz/stats';
import { useRoute } from '../router';
import { announceStores } from '../halo/announce';
import { ingestFile } from '../library/ingest';
import { studyFilesFor } from '../study/haloFiles';
import { HALO_HOME } from '../domain/heroFacts';
import { useStore } from '../storage/store';
import { buildKit, kitHash, type KitKind, type StudyKit as Kit } from '../study/kits';
import { topicCovered } from '../study/topic';
import { inDays, isTest, upcomingTests } from '../study/upcoming';
import { QuizRunner } from './QuizRunner';

type Tab = 'plan' | 'worksheet' | 'quiz' | 'cards' | 'sheet';
const TABS: { value: Tab; label: string }[] = [
  { value: 'plan', label: 'Plan' },
  { value: 'worksheet', label: 'Worksheet' },
  { value: 'quiz', label: 'Quiz me' },
  { value: 'cards', label: 'Flashcards' },
  { value: 'sheet', label: 'One-pager' },
];
const uniqueNames = (names: string[]): string[] => [...new Set(names)].slice(0, 5);
/** The material for the topic; with a topic nothing on file matches, everything on file rather than an empty sheet. */
function sourcesFor(course: Course, topic: string, pool: SourcePool | null, tz: string) {
  if (!pool) return [];
  const byTopic = gatherSources(course, topic, pool, tz);
  return byTopic.length ? byTopic : gatherSources(course, '', pool, tz);
}
const worksheetKey = (courseId: string, itemId: string | null, topic: string) => `worksheet:${courseId}:${itemId ?? (topic.toLowerCase().replace(/\s+/g, '-') || 'all')}`;

/**
 * Practice: pick the quiz or exam (the coming ones first) or any class, then a study plan for the time left, a
 * worksheet as a real document with the answers on its own last page, quiz me one question at a time, flashcards
 * and a one-page sheet, all from the class's own material, the test's topics and the weak ones first.
 */
export function Practice() {
  const { data, today, actions } = useStore();
  // The welcome checklist's "Practice for your next quiz" ticks itself the first time Practice opens.
  useEffect(() => {
    if (!data.settings.welcomeList?.practice) actions.updateSettings({ welcomeList: { ...(data.settings.welcomeList ?? {}), practice: new Date().toISOString() } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { params, navigate } = useRoute();
  const { tier } = useAccount();
  const tz = data.settings.timezone;
  const test = data.items.find((i) => i.id === params.get('i') && isTest(i)) ?? null;
  const course = data.courses.find((c) => c.id === (test?.courseId ?? params.get('c'))) ?? null;
  if (!course) return <Picker />;
  return <ForCourse key={`${course.id}:${test?.id ?? ''}`} course={course} test={test} tab={(TABS.some((t) => t.value === params.get('k')) ? params.get('k') : 'plan') as Tab} topicParam={params.get('t') ?? ''} setTab={(k, t) => navigate('practice', { ...(test ? { i: test.id } : { c: course.id }), k, ...(t ? { t } : {}) })} tier={tier} today={today} tz={tz} />;
}

function Picker() {
  const { data, today, courseById } = useStore();
  const tz = data.settings.timezone;
  const tests = upcomingTests(data.items, today, tz);
  return (
    <div className="practice">
      <div className="lib-head">
        <div>
          <a className="diff-toggle" href="#/study">
            ← Study
          </a>
          <h1 className="page-title">Practice</h1>
          <p className="hint study-lead">Pick what it is for. Everything is built from that class's own slides, lectures and syllabus, the test's topics and your weak spots first.</p>
        </div>
      </div>
      <section className="card study-block">
        <h2 className="section-title">Coming up</h2>
        {tests.length === 0 && <p className="hint">No quiz or exam on the calendar yet.</p>}
        <ul className="study-tests">
          {tests.map((t) => (
            <li key={t.id} className="study-test">
              <div className="study-test-main">
                <span className="study-test-title">{t.label}</span>
                <span className="hint mono">
                  <CourseChip course={courseById.get(t.courseId)} /> · {fmtDate(dateOf(t.dueAt, tz), 'long')} · {inDays(t, today, tz)} · {t.points} pts
                </span>
              </div>
              <a className="btn small primary" href={`#/practice?i=${t.id}`}>
                Practice
              </a>
            </li>
          ))}
        </ul>
        <p className="study-chips">
          <span className="hint">Any class:</span>
          {data.courses.map((c) => (
            <a key={c.id} className="quiz-chip" href={`#/practice?c=${c.id}`}>
              {c.code}
            </a>
          ))}
        </p>
      </section>
    </div>
  );
}

function ForCourse({ course, test, tab, topicParam, setTab, tier, today, tz }: { course: Course; test: Item | null; tab: Tab; topicParam: string; setTab: (k: Tab, t?: string) => void; tier: ReturnType<typeof useAccount>['tier']; today: string; tz: string }) {
  const { data, schedule, calibrate } = useStore();
  const allowed = useAiAllowed('flashcards');
  const [pool, setPool] = useState<SourcePool | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    loadPool(course.id)
      .then((p) => live && setPool(p))
      .catch(() => live && setPool(EMPTY_POOL));
    return () => {
      live = false;
    };
  }, [course.id, reload]);
  // What the professor posted in Halo, named so the student knows which file to fetch and drop here.
  const [haloFiles, setHaloFiles] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    announceStores
      .resources()
      .then((rs) => live && setHaloFiles(studyFilesFor(rs, course.id, test?.topic ?? '')))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [course.id, test?.topic]);
  const [dropNote, setDropNote] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const drop = async (files: File[]) => {
    setDropping(true);
    setDropNote(null);
    const lines: string[] = [];
    for (const f of files) {
      try {
        const r = await ingestFile(f, course, tz, today);
        lines.push(`${r.title}: ${r.detail}`);
      } catch (e) {
        lines.push(`${f.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setDropNote(lines.join(' '));
    setDropping(false);
    setReload((k) => k + 1);
  };

  // The topic: what was asked for, else the test's own; blank means the newest material.
  const ownTopics = test ? testTopics(test) : [];
  const topic = topicParam || ownTopics[0] || '';
  // With a topic that nothing on file matches, fall back to everything on file rather than an empty sheet.
  const use = sourcesFor(course, topic, pool, tz);
  // A test's own topic that the material does not mention by name ("Topic 4: Molecular Shapes" over stoichiometry
  // slides) makes the model write nothing, honestly; then the material on file is the topic.
  const effectiveTopic = pool && topic && !topicCovered(topic, use) ? '' : topic;
  const weak = weakTopics(data.settings.quizStats, course.id);
  const weakNames = uniqueNames([...weak.map((w) => w.topic), ...weakConcepts(course.id, data.items, data.settings.quizStats).map((w) => w.topic)]);
  const flagged = useMemo(() => (pool ? pool.recordings.flatMap((r) => r.notes?.knowledge?.examFlags.map((f) => f.point) ?? []).slice(0, 10) : []), [pool]);
  const plan = useMemo(() => (test ? planForTest(test, data.items, schedule, data.settings, today, (i) => calibrate(i).minutes) : null), [test, data.items, schedule, data.settings, today, calibrate]);
  const sessionTopicList = useMemo(() => (test && pool && plan ? topicsForTest(test, plan.sessions.length, pool.decks, pool.pages, data.settings.quizStats) : []), [test, pool, plan, data.settings.quizStats]);

  const counts = { slides: use.filter((s) => s.kind === 'slide').length, lectures: use.filter((s) => s.kind === 'recording').length, syllabus: use.some((s) => s.kind === 'syllabus') };
  const materialLine = !pool
    ? `Reading your ${course.code} material…`
    : use.length === 0
      ? `Nothing on file for ${course.code} yet. Drop the slides, a recording or the syllabus into the class library and everything here builds from it.`
      : `From your own ${course.code} material: ${[counts.slides ? `${counts.slides} slide${counts.slides === 1 ? '' : 's'}` : null, counts.lectures ? `${counts.lectures} lecture stretch${counts.lectures === 1 ? '' : 'es'}` : null, counts.syllabus ? 'the syllabus' : null].filter(Boolean).join(', ')}${weakNames.length ? ` · weak first: ${weakNames.slice(0, 3).join(', ')}` : ''}${flagged.length ? ` · ${flagged.length} thing${flagged.length === 1 ? '' : 's'} the professor called exam material` : ''}.`;
  const askHref = (t: string) => `#/ask?c=${course.id}${test ? `&i=${test.id}` : ''}${t ? `&t=${encodeURIComponent(t)}` : ''}&q=${encodeURIComponent(`Explain ${t || topic || 'this'} like I'm behind`)}`;
  const day = test ? dateOf(test.dueAt, tz) : null;

  return (
    <div className="practice">
      <div className="lib-head">
        <div>
          <a className="diff-toggle" href="#/study">
            ← Study
          </a>
          <h1 className="page-title lib-class-title">
            <CourseChip course={course} /> <span>{test ? `Practice for ${test.label}` : 'Practice'}</span>
          </h1>
          {test && day && (
            <p className="hint">
              {fmtDate(day, 'long')} · {inDays(test, today, tz)} · {test.points} pts{ownTopics.length ? ` · on ${ownTopics.join(', ')}` : ''}
            </p>
          )}
          <p className="hint mono">{materialLine}</p>
        </div>
        {pool && use.length === 0 && (
          <a className="btn small" href={`#/library?c=${course.id}`}>
            Open the class library
          </a>
        )}
      </div>

      {pool && use.length === 0 && (
        <label
          className="sync-drop rec-import lib-drop practice-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            void drop(Array.from(e.dataTransfer.files));
          }}
        >
          <input type="file" multiple accept=".pdf,.pptx,.txt,application/pdf,audio/*,.m4a,.mp3" className="visually-hidden" aria-label={`Drop ${course.code} slides here`} onChange={(e) => { void drop(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
          <b>{dropping ? 'Reading the file…' : `Drop your ${course.code} slides here`}</b>
          <span className="hint">
            {haloFiles.length ? <>Your professor posted {haloFiles.join(', ')} in Halo. Download one from <a className="diff-toggle" href={HALO_HOME} target="_blank" rel="noreferrer">Halo</a> and drop it here; everything below builds from it.</> : 'A PDF or PowerPoint of the lecture slides, or a lecture recording. Everything below builds from it.'}
          </span>
        </label>
      )}
      {dropNote && <p className="hint">{dropNote}</p>}

      <SegmentedControl label="Practice" value={tab} options={TABS} onChange={(v) => setTab(v)} />

      <Locked feature="flashcards" tier={tier}>
        {tab === 'plan' && (
          <section className="card practice-plan">
            {!test && (
              <>
                <p className="hint">A plan is for one test. Pick it:</p>
                <ul className="study-tests">
                  {upcomingTests(data.items, today, tz, 60)
                    .filter((t) => t.courseId === course.id)
                    .map((t) => (
                      <li key={t.id} className="study-test">
                        <div className="study-test-main">
                          <span className="study-test-title">{t.label}</span>
                          <span className="hint mono">
                            {fmtDate(dateOf(t.dueAt, tz), 'long')} · {inDays(t, today, tz)} · {t.points} pts
                          </span>
                        </div>
                        <a className="btn small primary" href={`#/practice?i=${t.id}`}>
                          Plan it
                        </a>
                      </li>
                    ))}
                </ul>
                {!data.items.some((t) => t.courseId === course.id && isTest(t) && t.status !== 'done' && dateOf(t.dueAt, tz) >= today) && <p className="hint">No quiz or exam ahead in {course.code}. The worksheet, quiz and flashcards work without one.</p>}
              </>
            )}
            {test && plan && (
              <>
                <p className="hint">
                  About {fmtMinutes(plan.remainingMinutes)} of study, spread over the days before it inside your study hours, the test's own topics first.{plan.remainingMinutes > 0 && plan.sessions.length === 0 ? ' No room is left at your current hours; add some under You, Study time.' : ''}
                </p>
                {plan.sessions.length > 0 && (
                  <ul className="exam-sessions practice-sessions">
                    {plan.sessions.map((s, idx) => (
                      <li key={s.day} className="exam-session" data-today={s.day === today}>
                        <span>
                          <b>{s.label}</b>
                          {sessionTopicList[idx] && (
                            <span className="exam-topic" data-weak={sessionTopicList[idx].weak}>
                              {' '}
                              · {sessionTopicList[idx].text}
                            </span>
                          )}
                        </span>
                        {sessionTopicList[idx]?.topic && (
                          <button type="button" className="btn small" onClick={() => setTab('quiz', sessionTopicList[idx].topic)}>
                            Quiz me on this
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {examPressure(plan) && <p className="hint">{examPressure(plan)}</p>}
                <div className="settings-actions">
                  <button type="button" className="btn primary" onClick={() => setTab('worksheet')}>
                    Make the worksheet
                  </button>
                  <button type="button" className="btn" onClick={() => setTab('quiz')}>
                    Quiz me now
                  </button>
                  <a className="btn" href={askHref(ownTopics[0] ?? '')}>
                    Ask about it
                  </a>
                </div>
              </>
            )}
            {test && !plan && <p className="hint">That test has passed. Pick a coming one from Study.</p>}
          </section>
        )}
        {tab === 'worksheet' && <WorksheetTab course={course} test={test} topic={topic} sources={use} weak={weakNames} pool={pool} allowed={allowed} day={day} onQuiz={() => setTab('quiz')} askHref={askHref} />}
        {tab === 'quiz' && pool && <QuizRunner course={course} topic={effectiveTopic} sources={use} weak={weak} askHref={askHref} />}
        {tab === 'quiz' && !pool && <p className="hint mono">Reading your {course.code} material…</p>}
        {(tab === 'cards' || tab === 'sheet') && <KitTab course={course} kind={tab === 'cards' ? 'cards' : wantsWorkedProblems(course) ? 'formulas' : 'onepager'} allowSheetKinds={tab === 'sheet' && wantsWorkedProblems(course)} topic={effectiveTopic} sources={use} weak={weakNames} flagged={flagged} pool={pool} allowed={allowed} onQuiz={() => setTab('quiz')} />}
      </Locked>
    </div>
  );
}

function WorksheetTab({ course, test, topic, sources, weak, pool, allowed, day, onQuiz, askHref }: { course: Course; test: Item | null; topic: string; sources: ReturnType<typeof gatherSources>; weak: string[]; pool: SourcePool | null; allowed: boolean; day: string | null; onQuiz: () => void; askHref: (t: string) => string }) {
  const [ws, setWs] = useState<Worksheet | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState<'docx' | 'pdf' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  // A closed <details> prints nothing but its summary, so Print opens the answers first and closes them after.
  const [answersOpen, setAnswersOpen] = useState(false);
  useEffect(() => {
    const after = () => setAnswersOpen(false);
    window.addEventListener('afterprint', after);
    return () => window.removeEventListener('afterprint', after);
  }, []);
  const print = () => {
    setAnswersOpen(true);
    setTimeout(() => window.print(), 80);
  };
  const topics = useMemo(() => (test ? testTopics(test) : topic ? [topic] : []), [test, topic]);
  const hash = useMemo(() => worksheetHash(test, topics, weak, sources), [test, topics, weak, sources]);
  const key = worksheetKey(course.id, test?.id ?? null, topic);
  useEffect(() => {
    if (!pool) return;
    let live = true;
    setWs(null);
    aiDb
      .get<Worksheet>(key)
      .then((w) => live && w && w.sourcesHash === hash && setWs(w))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [key, hash, pool]);

  const make = async () => {
    if (!allowed || sources.length === 0) return;
    setBusy(true);
    setNote(null);
    try {
      const w = await buildWorksheet({ apiKey: loadApiKey(), course, test, testDate: day ? fmtDate(day, 'long') : '', topics, weakTopics: weak, sources });
      setWs(w);
      await aiDb.put(key, w).catch(() => undefined);
    } catch (e) {
      setNote(`${await describeAiError(e)} Press the button to try again.`);
    } finally {
      setBusy(false);
    }
  };
  const saveAs = async (ext: 'docx' | 'pdf') => {
    if (!ws) return;
    setSaving(ext);
    try {
      const blob = ext === 'docx' ? await (await import('../practice/docx')).worksheetDocx(ws) : await (await import('../practice/pdf')).worksheetPdf(ws);
      download(blob, worksheetFileName(ws, ext));
    } catch (e) {
      setNote(`Could not make the ${ext === 'docx' ? 'Word file' : 'PDF'}: ${e instanceof Error ? e.message : String(e)}. Print works as a PDF too.`);
    } finally {
      setSaving(null);
    }
  };

  const doc = ws ? worksheetDoc(ws) : [];
  const cut = doc.findIndex((b) => b.kind === 'break');
  const front = cut >= 0 ? doc.slice(0, cut) : doc;
  const back = cut >= 0 ? doc.slice(cut + 1) : [];

  return (
    <>
      <section className="card kit-setup">
        <p className="hint">A practice sheet the way a professor hands one out: about ten problems from your own {course.code} material, answers with the working on the last page. Open it on your phone, print it, or download it as Word or PDF.</p>
        {note && (
          <p className="hint" style={{ color: 'var(--overdue)' }}>
            {note}
          </p>
        )}
        <div className="settings-actions">
          <button type="button" className="btn primary" disabled={!allowed || busy || !pool || sources.length === 0} onClick={() => void make()}>
            {busy ? `Writing about ten problems from your ${course.code} material…` : ws ? 'Remake the worksheet' : 'Make the worksheet'}
          </button>
          {ws && (
            <>
              <button type="button" className="btn" disabled={!!saving} onClick={() => void saveAs('docx')}>
                {saving === 'docx' ? 'Making the Word file…' : 'Download .docx'}
              </button>
              <button type="button" className="btn" disabled={!!saving} onClick={() => void saveAs('pdf')}>
                {saving === 'pdf' ? 'Making the PDF…' : 'Download PDF'}
              </button>
              <button type="button" className="btn" onClick={print}>
                Print
              </button>
            </>
          )}
        </div>
      </section>
      {ws && (
        <section className="card ws-doc" aria-label="Worksheet">
          {front.map((b, i) => (
            <Block key={i} b={b} />
          ))}
          <details className="ws-answers" open={answersOpen} onToggle={(e) => setAnswersOpen((e.currentTarget as HTMLDetailsElement).open)}>
            <summary className="hint">Answers (the last page)</summary>
            {back.map((b, i) => (
              <Block key={i} b={b} />
            ))}
          </details>
        </section>
      )}
      {ws && (
        <div className="settings-actions practice-next">
          <button type="button" className="btn small" onClick={onQuiz}>
            Quiz me on these
          </button>
          <a className="btn small" href={askHref(ws.problems[0]?.topic ?? topic)}>
            Explain {ws.problems[0]?.topic ?? 'this'}
          </a>
        </div>
      )}
    </>
  );
}

function Block({ b }: { b: ReturnType<typeof worksheetDoc>[number] }) {
  if (b.kind === 'break') return null;
  switch (b.kind) {
    case 'title':
      return <h2 className="ws-title">{b.text}</h2>;
    case 'subtitle':
      return <p className="hint mono">{b.text}</p>;
    case 'note':
      return <p className="hint">{b.text}</p>;
    case 'heading':
      return <h3 className="ws-heading">{b.text}</h3>;
    case 'problem':
      return <p className="ws-problem">{b.text}</p>;
    case 'choice':
      return <p className="ws-choice">{b.text}</p>;
    case 'answer':
      return <p className="ws-answer">{b.text}</p>;
    case 'step':
      return <p className="ws-step mono">{b.text}</p>;
    case 'rule':
      return <p className="hint ws-rule">{b.text}</p>;
  }
}

function KitTab({ course, kind: initial, allowSheetKinds, topic, sources, weak, flagged, pool, allowed, onQuiz }: { course: Course; kind: KitKind; allowSheetKinds: boolean; topic: string; sources: ReturnType<typeof gatherSources>; weak: string[]; flagged: string[]; pool: SourcePool | null; allowed: boolean; onQuiz: () => void }) {
  const [kind, setKind] = useState<KitKind>(initial);
  const [kit, setKit] = useState<Kit | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});
  const hash = useMemo(() => kitHash(kind, topic, sources, weak), [kind, topic, sources, weak]);
  useEffect(() => setKind(initial), [initial]);
  useEffect(() => {
    if (!pool) return;
    let live = true;
    setKit(null);
    setFlipped({});
    aiDb
      .get<Kit>(studyKey(course.id, kind, topic))
      .then((k) => live && k && k.sourcesHash === hash && setKit(k))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [course.id, kind, topic, pool, hash]);
  const build = async () => {
    if (!allowed || sources.length === 0) return;
    setBusy(true);
    setNote(null);
    try {
      let k = await buildKit({ apiKey: loadApiKey(), course, kind, topic, sources, weak, flagged });
      if (topic && k.cards.length + k.sections.length + k.formulas.length === 0) k = { ...(await buildKit({ apiKey: loadApiKey(), course, kind, topic: '', sources, weak, flagged })), topic };
      setKit(k);
      setFlipped({});
      await aiDb.put(studyKey(course.id, kind, topic), k).catch(() => undefined);
    } catch (e) {
      setNote(`${await describeAiError(e)} Press the button to try again.`);
    } finally {
      setBusy(false);
    }
  };
  const word = kind === 'cards' ? 'flashcards' : kind === 'formulas' ? 'formula sheet' : 'one-pager';
  const Cite = ({ id }: { id: string }) => <CiteChip id={id} sources={sources} />;
  return (
    <>
      <section className="card kit-setup">
        <p className="hint">{kind === 'cards' ? `Twelve to twenty cards from your own ${course.code} material, weak spots first. Tap a card to turn it over.` : kind === 'formulas' ? `Every formula, relationship and constant your ${course.code} material carries, written the way the class writes it, with when to use each.` : `${course.code} in one page you can read in five minutes: what it is, how the professor framed it, the method, the traps, what was called exam material.`}</p>
        {allowSheetKinds && <SegmentedControl label="Sheet" value={kind} options={[{ value: 'formulas', label: 'Formula sheet' }, { value: 'onepager', label: 'One-pager' }]} onChange={(v) => setKind(v as KitKind)} />}
        {note && (
          <p className="hint" style={{ color: 'var(--overdue)' }}>
            {note}
          </p>
        )}
        <div className="settings-actions">
          <button type="button" className="btn primary" disabled={!allowed || busy || !pool || sources.length === 0} onClick={() => void build()}>
            {busy ? `Writing the ${word} from your ${course.code} material…` : kit ? `Remake the ${word}` : `Make the ${word}`}
          </button>
          {kit && (
            <button type="button" className="btn" onClick={() => window.print()}>
              Print
            </button>
          )}
        </div>
      </section>
      {kit && kit.kind === 'formulas' && (
        <section className="card kit kit-formulas">
          <h2 className="section-title">
            {course.code} formula sheet{topic ? ` · ${topic}` : ''} <span className="count">{kit.formulas.length}</span>
          </h2>
          {kit.formulas.length === 0 && <p className="hint">The material on file carries no formulas for this.</p>}
          <table className="kit-table">
            <tbody>
              {kit.formulas.map((f, i) => (
                <tr key={i}>
                  <td className="kit-name">{f.name}</td>
                  <td className="kit-formula mono">{f.formula}</td>
                  <td className="kit-when hint">
                    {f.when} <Cite id={f.sourceId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {kit && kit.kind === 'cards' && (
        <section className="card kit kit-cards">
          <h2 className="section-title">
            Flashcards{topic ? ` · ${topic}` : ''} <span className="count">{kit.cards.length}</span>
          </h2>
          {kit.cards.length === 0 && <p className="hint">Nothing on file carries {topic ? `“${topic}”` : 'this'} yet. Remake it without a topic, or drop the slides for it into the class library.</p>}
          <ul className="kit-card-list">
            {kit.cards.map((c, i) => (
              <li key={i}>
                <button type="button" className="kit-card" data-flipped={!!flipped[i]} onClick={() => setFlipped((f) => ({ ...f, [i]: !f[i] }))} aria-label={flipped[i] ? 'Back of card' : 'Front of card'}>
                  <span className="kit-card-face">{flipped[i] ? c.back : c.front}</span>
                  <span className="kit-card-foot mono">{flipped[i] ? 'back' : 'front'}</span>
                </button>
                <Cite id={c.sourceId} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {kit && kit.kind === 'onepager' && (
        <section className="card kit kit-onepager">
          <h2 className="section-title">
            {course.code}{topic ? ` · ${topic}` : ''} in one page
          </h2>
          {kit.sections.length === 0 && <p className="hint">Nothing on file carries {topic ? `“${topic}”` : 'this'} yet. Remake it without a topic, or drop the slides for it into the class library.</p>}
          {kit.sections.map((s, i) => (
            <div key={i} className="kit-section">
              <h3>
                {s.heading} <Cite id={s.sourceId} />
              </h3>
              <ul>
                {s.lines.map((l, j) => (
                  <li key={j}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {kit && (
        <div className="settings-actions practice-next">
          <button type="button" className="btn small" onClick={onQuiz}>
            Quiz me on these
          </button>
          <span className="hint kit-sources">Sources: {kit.sources.map((s) => `[${s.id}] ${s.label}`).join(' · ')}</span>
        </div>
      )}
    </>
  );
}

function CiteChip({ id, sources }: { id: string; sources: ReturnType<typeof gatherSources> }) {
  const s = sources.find((x) => x.id === id);
  return s ? (
    <a className="kit-cite mono" href={s.href} title={s.label}>
      {id}
    </a>
  ) : null;
}
