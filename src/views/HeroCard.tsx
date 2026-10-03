import { useEffect, useMemo, useRef, useState } from 'react';
import { CourseChip, useCourseColor } from '../components/CourseChip';
import { IconCheck } from '../components/Icons';
import { BLOCK_REASONS, BLOCK_WORDS, blockPhrase, blockRanOut } from '../domain/blocked';
import { itemTopics, topicKey, weakConcepts } from '../domain/concepts';
import { addDays, dateOf, fmtDate } from '../domain/dates';
import { gatedBy } from '../domain/gating';
import { elapsedLine, elapsedMinutes, fitLine, haloLink, heroFacts } from '../domain/heroFacts';
import { TYPE_LABELS, type BlockReason, type Item } from '../domain/types';
import { linksFor } from '../ingest/links';
import { overlap } from '../domain/reqClean';
import { libraryDb, type Deck } from '../library/db';
import { decksForItem } from '../library/links';
import { recordingsDb, type Recording } from '../record/db';
import { useStore } from '../storage/store';
import { itemTone, toneLabel } from '../domain/status';
import { skipLine } from '../domain/impact';
import { bump } from '../analytics/usage';
import { starterAsk, starterPrompt } from '../work/starter';
import { isTest } from '../study/upcoming';
import { PromptPanel } from './PromptPanel';
import { Requirements } from './Requirements';
import { isMilestoneWork, nextStep, stepsFor } from '../work/steps';
import { AsOf } from './PlanWall';

/**
 * The one thing on Now. What it is, why it is the one, how long, how much, and Start. Everything a student might
 * need once they have started (what it asks for, the first step, the rubric, the slides that cover it, the
 * professor's warning, the tutor, Halo) sits behind one Details tap. No countdown, nothing red. Never a list.
 */
export interface HeroProps {
  item: Item;
  optional: boolean;
  /** One plain sentence on why this is the one. */
  why?: string | null;
  /** Set by the screen while the card animates out: after Done, or sliding aside for Not now. */
  leaving?: boolean | 'slide';
  onOpen: (i: Item) => void;
  /** Not now: not today, can't start yet (with what it is waiting on), or show me something else. */
  onNotNow: (i: Item, choice: NotNow) => void;
  onDone: (i: Item) => void;
}

export type NotNow = { kind: 'today' } | { kind: 'pass' } | { kind: 'block'; reason: BlockReason };

interface Material {
  decks: Deck[];
  recs: Recording[];
  flagged: { point: string; where: string }[];
}

/** The slides and lectures on file for this item, and anything the professor called exam material on its topic. */
function useMaterial(item: Item, tz: string): Material {
  const [m, setM] = useState<Material>({ decks: [], recs: [], flagged: [] });
  useEffect(() => {
    let live = true;
    (async () => {
      const [decks, recs] = await Promise.all([libraryDb.listDecks().catch(() => [] as Deck[]), recordingsDb.list().catch(() => [] as Recording[])]);
      if (!live) return;
      const due = dateOf(item.dueAt, tz);
      const mine = recs.filter((r) => r.courseId === item.courseId && r.status !== 'recording');
      const week = mine.filter((r) => {
        const d = dateOf(r.startedAt, tz);
        return d >= addDays(due, -10) && d <= due;
      });
      const words = [...new Set([...itemTopics(item).map(topicKey), ...item.title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4)])];
      const flagged = mine
        .flatMap((r) => (r.notes?.knowledge?.examFlags ?? []).filter((f) => words.some((w) => f.point.toLowerCase().includes(w))).map((f) => ({ point: f.point, where: `${r.title}, ${fmtDate(dateOf(r.startedAt, tz), 'short')}${f.at ? ` at ${f.at}` : ''}` })))
        .slice(0, 2);
      setM({ decks: decksForItem(item, decks), recs: week.slice(0, 3), flagged });
    })();
    return () => {
      live = false;
    };
  }, [item.id, item.courseId, item.dueAt, item.title, item.topic, tz]);
  return m;
}

/** The small menu behind "Not now": three plain choices, and one quick question for "Can't start yet". */
function NotNowMenu({ onPick, onClose }: { onPick: (c: NotNow) => void; onClose: () => void }) {
  const [asking, setAsking] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [asking, onClose]);
  return (
    <>
      <button type="button" className="notnow-scrim" aria-label="Close" onClick={onClose} />
      <div className="notnow-pop" role="menu" aria-label={asking ? 'Waiting on what?' : 'Not now'}>
        {!asking ? (
          <>
            <button ref={first} type="button" role="menuitem" className="notnow-item" onClick={() => onPick({ kind: 'today' })}>
              <b>Not today</b>
              <span>Hides it until tomorrow</span>
            </button>
            <button type="button" role="menuitem" className="notnow-item" onClick={() => setAsking(true)}>
              <b>Can't start yet</b>
              <span>Comes back when it can</span>
            </button>
            <button type="button" role="menuitem" className="notnow-item" onClick={() => onPick({ kind: 'pass' })}>
              <b>Show me something else</b>
              <span>Just the next thing</span>
            </button>
          </>
        ) : (
          <>
            <p className="notnow-q">Waiting on what?</p>
            <div className="notnow-reasons">
              {BLOCK_REASONS.map((r, i) => (
                <button key={r} ref={i === 0 ? first : undefined} type="button" role="menuitem" className="notnow-reason" onClick={() => onPick({ kind: 'block', reason: r })}>
                  {BLOCK_WORDS[r].label}
                </button>
              ))}
            </div>
            <button type="button" className="hero-inline notnow-back" onClick={() => setAsking(false)}>
              Back
            </button>
          </>
        )}
      </div>
    </>
  );
}

export function HeroCard({ item, optional, why, leaving = false, onOpen, onNotNow, onDone }: HeroProps) {
  const { courseById, schedule, data, today, actions, calibrate, derived } = useStore();
  const tz = data.settings.timezone;
  const cal = calibrate(item);
  const course = courseById.get(item.courseId);
  const color = useCourseColor(course);
  const done = item.status === 'done';
  const material = useMaterial(item, tz);
  const [notNow, setNotNow] = useState(false);
  // On a phone, swiping the card left opens the same menu.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState(0);
  const [details, setDetails] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [panel, setPanel] = useState(false);
  // The timer: once started, the elapsed time on the card keeps up without a reload.
  const [, tick] = useState(0);
  useEffect(() => {
    if (!item.startedAt || done) return;
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [item.startedAt, done]);
  const now = new Date().toISOString();

  const asks = item.plan?.asks?.trim() || item.brief?.asks.join(' ') || (item.title !== item.label ? item.title : '');
  const facts = heroFacts(item, data.items, cal.minutes, tz, today, derived[item.id]?.deadlineAt ?? null);
  const fit = done ? null : fitLine(item, cal.minutes, schedule, data.courses, today, now, tz);
  const gates = done ? [] : gatedBy(item, data.items);
  const steps = !done && isMilestoneWork(item) ? stepsFor(item) : (item.steps ?? []);
  const next = nextStep(steps);
  // Each thing once: a prerequisite that is also the first step shows as the step (it has the tick), not twice.
  const prereqs = (item.plan?.prerequisites.filter((p) => !p.itemId) ?? []).filter((p) => !next || overlap(p.text, next.label) < 0.75);
  const sources = item.plan?.sources ?? [];
  const weak = useMemo(() => weakConcepts(item.courseId, data.items, data.settings.quizStats), [item.courseId, data.items, data.settings.quizStats]);
  const shaky = weak.find((w) => itemTopics(item).some((t) => topicKey(t) === w.key || topicKey(t).includes(w.key) || w.key.includes(topicKey(t)))) ?? null;
  const link = linksFor(item, data.settings.topicLinks ?? [], data.courses)[0] ?? null;
  const rubric = item.rubric?.criteria.length ? item.rubric.criteria.slice(0, 2).map((c) => ({ criterion: c.name, points: c.points })) : (item.brief?.rubric.slice(0, 2) ?? []);
  const ranOut = blockRanOut(item, today);
  const elapsed = elapsedLine(item.startedAt, now);
  const pastDate = new Date(item.dueAt).getTime() < Date.now();
  const deckShown = (d: Deck) => !sources.some((s) => s.label.toLowerCase().includes(d.title.toLowerCase()));
  // Slides, readings, and lecture stretches are places to go. "the syllabus" on its own is not, so it never shows alone.
  const realSources = sources.filter((s) => s.kind !== 'syllabus');
  const covered = realSources.length + material.decks.filter(deckShown).length + material.recs.length;
  const halo = haloLink(item, course);
  // What a zero here does to the class grade, once enough is graded for that to mean something.
  const skip = !done && course ? skipLine(item, data.items, course.code, course) : null;

  const start = () => actions.upsertItem({ ...item, status: 'in_progress', startedAt: now });
  const finish = () => {
    const mins = elapsedMinutes(item.startedAt, now);
    bump('done');
    onDone(item);
    // The timer already knows how long it took: no question afterwards.
    if (mins >= 5) {
      actions.logActual(item.id, mins);
      actions.dismissTimeAsk();
    }
  };
  const toggleStep = (id: string) => actions.upsertItem({ ...item, steps: steps.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });
  const pick = (c: NotNow) => {
    setNotNow(false);
    onNotNow(item, c);
  };
  const starter = course ? starterPrompt({ item, course, sources: [...sources.map((s) => s.label), ...material.decks.filter(deckShown).map((d) => d.title)], nextStep: next?.label ?? null, flagged: material.flagged.map((f) => f.point) }) : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(starter);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the tutor button still carries it.
    }
  };
  // Get help: Ask, scoped to this assignment, with its opening question already asked.
  const openAsk = () => {
    window.location.hash = `/ask?c=${item.courseId}&i=${item.id}&q=${encodeURIComponent(starterAsk(item))}`;
  };
  // Ask a question: the same chat scoped to this assignment, empty box focused, nothing sent for them.
  const openQuestion = () => {
    window.location.hash = `/ask?c=${item.courseId}&i=${item.id}&m=question`;
  };

  // The pill follows the one colour rule: red late, amber due within a day and untouched, grey otherwise.
  const tone = itemTone(item, new Date().toISOString());
  const status = done ? (
    <span className="pill">Done</span>
  ) : item.startedAt && elapsed ? (
    <span className="pill">{elapsed}</span>
  ) : tone === 'late' || pastDate ? (
    <span className="pill" data-tone="late">
      Late
    </span>
  ) : tone === 'soon' ? (
    <span className="pill" data-tone="soon">
      {toneLabel(tone, item, today, tz)}
    </span>
  ) : optional ? (
    <span className="pill">Getting ahead</span>
  ) : null;


  return (
    <section
      key={item.id}
      className="hero"
      data-state={done ? 'done' : 'work'}
      data-leaving={leaving}
      style={{ '--course': color, ...(drag ? { transform: `translateX(${drag}px)`, transition: 'none' } : {}) } as React.CSSProperties}
      aria-label="Now"
      onTouchStart={(e) => { if (!done) swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchMove={(e) => {
        const s0 = swipe.current;
        if (!s0) return;
        const dx = e.touches[0].clientX - s0.x;
        const dy = e.touches[0].clientY - s0.y;
        if (Math.abs(dy) > 30 && Math.abs(dy) > Math.abs(dx)) { swipe.current = null; setDrag(0); return; }
        setDrag(Math.min(0, Math.max(-90, dx)));
      }}
      onTouchEnd={() => {
        if (swipe.current && drag <= -60) setNotNow(true);
        swipe.current = null;
        setDrag(0);
      }}
    >
      <div className="hero-top">
        <span className="hero-eyebrow">
          <CourseChip course={course} />
          <span className="hero-kind">{TYPE_LABELS[item.type]}</span>
        </span>
        {status}
      </div>
      <h2 className="hero-title">
        <button type="button" className="hero-title-btn" onClick={() => onOpen(item)} title="Open the details">
          {item.label}
        </button>
      </h2>
      {why && !done && <p className="hero-why">{why}</p>}
      <p className="hero-meta">
        {facts.map((f, i) =>
          f.itemId ? (
            <button key={i} type="button" className="pill hero-fact-link" onClick={() => { const t = data.items.find((x) => x.id === f.itemId); if (t) onOpen(t); }}>
              {f.text}
            </button>
          ) : (
            <span key={i} className="pill">
              {f.text}
              {f.text.startsWith('due ') && <AsOf item={item} />}
            </span>
          ),
        )}
      </p>

      {/* The product's promise, on the card itself: what the professor only said in an announcement, with the source one tap away. */}
      {!done && (item.requirements ?? []).some((r) => !r.done) && <Requirements item={item} compact onMore={() => onOpen(item)} />}

      {ranOut && item.blocked && (
        <p className="hero-line" style={{ marginTop: 12 }}>
          You were {blockPhrase(item, tz)}. Still stuck?{' '}
          <button type="button" className="hero-inline" onClick={() => onNotNow(item, { kind: 'block', reason: item.blocked!.reason })}>
            still blocked
          </button>
        </p>
      )}

      {!done && (
        <>
          {/* One clear row: start it, mark it done, or open it in Halo (2026-10-02 clarity pass: seven buttons in two
              rows was too much to read at a glance). Everything else is a quiet line under it. */}
          <div className="hero-actions">
            {item.startedAt ? (
              <button type="button" className="btn primary" onClick={finish}>
                <IconCheck /> Done
              </button>
            ) : (
              <>
                <button type="button" className="btn primary" onClick={start}>
                  Start
                </button>
                <button type="button" className="btn hero-phone-more hero-done" onClick={() => { bump('done'); onDone(item); }} aria-label="Mark done">
                  <IconCheck /> Done
                </button>
              </>
            )}
            {/* One of the most used buttons, so it is in the row, not behind Details (George, 2026-09-29). */}
            <a className="btn hero-halo" href={halo.href} target="_blank" rel="noreferrer" title={halo.label}>
              Open in Halo ↗
            </a>
            {/* The one study button on a test's card. */}
            {course && isTest(item) && (
              <a className="btn hero-study hero-phone-more" href={`#/practice?i=${item.id}`}>
                Practice
              </a>
            )}
            {/* A phone keeps Details in the row; the rest is inside it. */}
            <button type="button" className="btn quiet hero-phone-only" aria-expanded={details} onClick={() => setDetails((d) => !d)}>
              {details ? 'Less' : 'Details'}
            </button>
          </div>
          <div className="hero-more">
            {course && !isTest(item) && (
              <>
                <button type="button" className="hero-link" onClick={openAsk}>
                  Get help
                </button>
                <button type="button" className="hero-link" onClick={openQuestion}>
                  Ask a question
                </button>
              </>
            )}
            <button type="button" className="hero-link" aria-expanded={details} onClick={() => setDetails((d) => !d)}>
              {details ? 'Less' : 'Details'}
            </button>
            <span className="notnow-anchor">
              <button type="button" className="hero-link hero-notnow" aria-haspopup="menu" aria-expanded={notNow} onClick={() => setNotNow((o) => !o)}>
                Not now
              </button>
              {notNow && <NotNowMenu onPick={pick} onClose={() => setNotNow(false)} />}
            </span>
          </div>
        </>
      )}

      {details && (
        <div className="hero-details">
          {/* On a phone the row keeps Start and Open in Halo; the rest is here. */}
          {!done && (
            <div className="hero-phone-row">
              {!item.startedAt && (
                <button type="button" className="btn small" onClick={() => { bump('done'); onDone(item); }}>
                  <IconCheck /> Done
                </button>
              )}
              {course && (isTest(item) ? (
                <a className="btn small" href={`#/practice?i=${item.id}`}>
                  Practice
                </a>
              ) : (
                <>
                  <button type="button" className="btn small" onClick={openAsk}>
                    Get help
                  </button>
                  <button type="button" className="btn small" onClick={openQuestion}>
                    Ask a question
                  </button>
                </>
              ))}
              <span className="notnow-anchor">
                <button type="button" className="hero-notnow" aria-haspopup="menu" aria-expanded={notNow} onClick={() => setNotNow((o) => !o)}>
                  Not now
                </button>
                {notNow && <NotNowMenu onPick={pick} onClose={() => setNotNow(false)} />}
              </span>
            </div>
          )}
          {asks && <p className="hero-asks">{asks}</p>}
          {fit && <p className="hero-line">{fit}</p>}
          {skip && <p className="hero-line">{skip}</p>}
          {(gates.length > 0 || prereqs.length > 0) && (
            <div className="hero-needs">
              <b>Needs first</b>
              <ul>
                {gates.map((g) => (
                  <li key={g.id}>
                    <button type="button" className="hero-inline" onClick={() => onOpen(g)}>
                      {g.label}
                    </button>
                  </li>
                ))}
                {prereqs.map((p, i) => (
                  <li key={i}>
                    {p.text}
                    {p.source ? (
                      <span className="hero-src" title={p.source}>
                        source
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {next && (
            <div className="hero-first">
              <label className="hero-first-step">
                <input type="checkbox" checked={false} onChange={() => toggleStep(next.id)} aria-label={`Done: ${next.label}`} />
                <span>
                  <span className="hero-first-word">First</span>
                  {next.label}
                </span>
              </label>
              {steps.length > 1 && (
                <button type="button" className="hero-fold" onClick={() => setShowSteps((s) => !s)} aria-expanded={showSteps}>
                  {steps.filter((s) => s.done).length} of {steps.length} steps
                </button>
              )}
              {showSteps && (
                <ul className="hero-steps-list">
                  {steps.map((s) => (
                    <li key={s.id} data-next={s.id === next.id} data-done={s.done}>
                      <label>
                        <input type="checkbox" checked={s.done} onChange={() => toggleStep(s.id)} /> {s.label}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {steps.length > 0 && !next && <p className="hero-line">Every step is ticked. Hand it in.</p>}
          {rubric.length > 0 && (
            <p className="hero-line">
              <b>Full credit needs</b> {rubric.map((r) => `${r.criterion}${r.points !== null ? ` (${r.points} pts)` : ''}`).join(' · ')}
            </p>
          )}
          {covered > 0 && (
            <p className="hero-covers">
              <b>Covered by</b>
              {realSources.map((s, i) =>
                s.href ? (
                  <a key={`s${i}`} className="hero-chip" href={s.href}>
                    {s.label}
                  </a>
                ) : (
                  <span key={`s${i}`} className="hero-chip">
                    {s.label}
                  </span>
                ),
              )}
              {material.decks.filter(deckShown).map((d) => (
                <a key={d.id} className="hero-chip" href={`#/library?v=slides&deck=${d.id}`}>
                  {d.title}
                </a>
              ))}
              {material.recs.map((r) => (
                <a key={r.id} className="hero-chip" href={`#/library?c=${item.courseId}`}>
                  {r.title} · {fmtDate(dateOf(r.startedAt, tz), 'short')}
                </a>
              ))}
            </p>
          )}
          {material.flagged.length > 0 && (
            <p className="hero-line">
              <b>Your professor flagged</b> “{material.flagged[0].point}”{' '}
              <a className="hero-src" href={`#/library?c=${item.courseId}`} title={material.flagged[0].where}>
                source
              </a>
            </p>
          )}
          {shaky && (
            <p className="hero-line">
              <b>You've been shaky on {shaky.topic}</b>
              {shaky.pct !== null ? ` (${shaky.pct}% so far)` : ''}. Start with the slides above, or{' '}
              <a className="hero-inline" href={`#/ask?c=${item.courseId}&t=${encodeURIComponent(shaky.topic)}&i=${item.id}&q=${encodeURIComponent(`Explain ${shaky.topic} like I'm behind`)}`}>
                ask about it
              </a>
              .
            </p>
          )}
          {link && (
            <p className="hero-line">
              <b>Same idea as</b> {link.other.code} {link.topic}: {link.note}
            </p>
          )}
          {/* Two actions in view (go do it; get a prompt for it); the rest behind More. */}
          <div className="hero-more">
            {course && (
              <button type="button" className="btn small" onClick={() => setPanel(true)}>
                Get a prompt
              </button>
            )}
            {course && (
              <button type="button" className="hero-inline hero-copy" onClick={() => void copy()}>
                {copied ? 'Copied' : 'Copy a short prompt'}
              </button>
            )}
          </div>
        </div>
      )}
      {panel && course && <PromptPanel item={item} course={course} onClose={() => setPanel(false)} />}
    </section>
  );
}
