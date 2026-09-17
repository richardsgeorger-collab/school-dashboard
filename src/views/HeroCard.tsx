import { useEffect, useMemo, useState } from 'react';
import { CourseChip, useCourseColor } from '../components/CourseChip';
import { IconCheck } from '../components/Icons';
import { BLOCK_REASONS, BLOCK_WORDS, blockPhrase, blockRanOut, makeBlock } from '../domain/blocked';
import { itemTopics, topicKey, weakConcepts } from '../domain/concepts';
import { addDays, dateOf, fmtDate, weekdayOf } from '../domain/dates';
import { gatedBy } from '../domain/gating';
import { elapsedLine, elapsedMinutes, fitLine, haloLink, heroFacts } from '../domain/heroFacts';
import { TYPE_LABELS, type BlockReason, type DateStr, type Item } from '../domain/types';
import { linksFor } from '../ingest/links';
import { libraryDb, type Deck } from '../library/db';
import { decksForItem } from '../library/links';
import { recordingsDb, type Recording } from '../record/db';
import { useStore } from '../storage/store';
import { starterPrompt } from '../work/starter';
import { isMilestoneWork, nextStep, stepsFor } from '../work/steps';

/**
 * The one thing on Now, with everything needed to start it: what it asks for, the facts, the first step, what has to
 * happen first, the material that covers it, a starter prompt for the tutor, and a way in to Halo for the moment of
 * handing in. No countdown, nothing red. One piece of work, never a list.
 */
export interface HeroProps {
  item: Item;
  optional: boolean;
  onOpen: (i: Item) => void;
  onSkip: (i: Item, day: DateStr) => void;
  onDone: (i: Item) => void;
}

interface Material {
  decks: Deck[];
  recs: Recording[];
  flagged: { point: string; where: string }[];
}

export const STARTER_SLOT = (itemId: string) => `school-dashboard:starter:${itemId}`;

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

function BlockChooser({ onPick, onClose }: { onPick: (reason: BlockReason, note: string) => void; onClose: () => void }) {
  const [note, setNote] = useState('');
  return (
    <div className="hero-chooser" role="group" aria-label="What is in the way">
      <span className="hint">I can't yet because I'm</span>
      {BLOCK_REASONS.map((r) => (
        <button key={r} type="button" className="btn small" onClick={() => onPick(r, note)}>
          {BLOCK_WORDS[r].label.toLowerCase()}
        </button>
      ))}
      <input className="hero-chooser-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="a word on why, if you like" aria-label="Why" />
      <button type="button" className="hero-skip" onClick={onClose}>
        never mind
      </button>
    </div>
  );
}

/** "Not today" → pick when instead. The choice sets both the snooze and the start-by day, so the plan moves with it. */
function SnoozeChooser({ today, deadlineDay, onPick, onClose }: { today: DateStr; deadlineDay: DateStr; onPick: (day: DateStr) => void; onClose: () => void }) {
  const [custom, setCustom] = useState('');
  const options: { day: DateStr; label: string }[] = [];
  const tomorrow = addDays(today, 1);
  options.push({ day: tomorrow, label: 'Tomorrow' });
  for (let k = 2; k <= 7; k++) {
    const d = addDays(today, k);
    const wd = weekdayOf(d);
    if (wd === 6 || wd === 0) options.push({ day: d, label: wd === 6 ? 'Saturday' : 'Sunday' });
    if (options.length >= 3) break;
  }
  const usable = options.filter((o) => o.day < deadlineDay);
  return (
    <div className="hero-chooser" role="group" aria-label="When instead">
      <span className="hint">Do it</span>
      {usable.map((o) => (
        <button key={o.day} type="button" className="btn small" onClick={() => onPick(o.day)}>
          {o.label}
        </button>
      ))}
      {usable.length > 0 ? (
        <input type="date" className="hero-chooser-note" value={custom} min={tomorrow} max={addDays(deadlineDay, -1)} aria-label="Pick a day" onChange={(e) => { setCustom(e.target.value); if (e.target.value && e.target.value < deadlineDay) onPick(e.target.value); }} />
      ) : (
        <span className="hint">It is due too soon to push.</span>
      )}
      <button type="button" className="hero-skip" onClick={onClose}>
        never mind
      </button>
    </div>
  );
}

export function HeroCard({ item, optional, onOpen, onSkip, onDone }: HeroProps) {
  const { courseById, schedule, data, today, actions, calibrate } = useStore();
  const tz = data.settings.timezone;
  const cal = calibrate(item);
  const course = courseById.get(item.courseId);
  const color = useCourseColor(course);
  const now = new Date().toISOString();
  const done = item.status === 'done';
  const material = useMaterial(item, tz);
  const [choosing, setChoosing] = useState<'block' | 'snooze' | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  const asks = item.plan?.asks?.trim() || item.brief?.asks.join(' ') || (item.title !== item.label ? item.title : '');
  const facts = heroFacts(item, data.items, cal.minutes, tz, today);
  const fit = done ? null : fitLine(item, cal.minutes, schedule, data.courses, today, now, tz);
  const gates = done ? [] : gatedBy(item, data.items);
  const prereqs = item.plan?.prerequisites.filter((p) => !p.itemId) ?? [];
  const steps = !done && isMilestoneWork(item) ? stepsFor(item) : (item.steps ?? []);
  const next = nextStep(steps);
  const sources = item.plan?.sources ?? [];
  const weak = useMemo(() => weakConcepts(item.courseId, data.items, data.settings.quizStats), [item.courseId, data.items, data.settings.quizStats]);
  const shaky = weak.find((w) => itemTopics(item).some((t) => topicKey(t) === w.key || topicKey(t).includes(w.key) || w.key.includes(topicKey(t)))) ?? null;
  const link = linksFor(item, data.settings.topicLinks ?? [], data.courses)[0] ?? null;
  const rubric = item.brief?.rubric.slice(0, 2) ?? [];
  const ranOut = blockRanOut(item, today);
  const elapsed = elapsedLine(item.startedAt, now);
  const pastDate = new Date(item.dueAt).getTime() < Date.now();
  const deadlineDay = schedule.byItem[item.id]?.deadlineDay ?? dateOf(item.dueAt, tz);
  const deckShown = (d: Deck) => !sources.some((s) => s.label.toLowerCase().includes(d.title.toLowerCase()));
  const covered = sources.length + material.decks.filter(deckShown).length + material.recs.length;

  const start = () => actions.upsertItem({ ...item, status: 'in_progress', startedAt: now });
  const finish = () => {
    const mins = elapsedMinutes(item.startedAt, now);
    onDone(item);
    // The timer already knows how long it took: no question afterwards.
    if (mins >= 5) {
      actions.logActual(item.id, mins);
      actions.dismissTimeAsk();
    }
  };
  const toggleStep = (id: string) => actions.upsertItem({ ...item, steps: steps.map((s) => (s.id === id ? { ...s, done: !s.done } : s)) });
  const block = (reason: BlockReason, note: string) => {
    actions.upsertItem({ ...item, blocked: makeBlock(reason, item, course, today, tz, note), startedAt: null });
    setChoosing(null);
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
  const openTutor = () => {
    try {
      sessionStorage.setItem(STARTER_SLOT(item.id), starter);
    } catch {
      // Same: the tutor falls back to its own opening line.
    }
    window.location.hash = `/tutor?c=${item.courseId}&i=${item.id}&starter=1`;
  };

  return (
    <section key={item.id} className="hero" data-state={done ? 'done' : 'work'} style={{ '--course': color } as React.CSSProperties} aria-label="Now">
      <div className="hero-eyebrow">
        <span className="hero-eyebrow-left">
          <CourseChip course={course} />
          <span className="hero-kind">{TYPE_LABELS[item.type]}</span>
        </span>
        <span className="hero-eyebrow-right">{done ? 'done' : item.startedAt && elapsed ? elapsed.toLowerCase() : pastDate ? 'past its date' : optional ? 'getting ahead' : ''}</span>
      </div>
      <h1 className="hero-title">
        <button type="button" className="hero-title-btn" onClick={() => onOpen(item)} title="Open the details">
          {item.label}
        </button>
      </h1>
      {asks && <p className="hero-asks">{asks}</p>}
      <p className="hero-facts mono">
        {facts.map((f, i) =>
          f.itemId ? (
            <button key={i} type="button" className="hero-fact hero-fact-link" onClick={() => { const t = data.items.find((x) => x.id === f.itemId); if (t) onOpen(t); }}>
              {f.text}
            </button>
          ) : (
            <span key={i} className="hero-fact">
              {f.text}
            </span>
          ),
        )}
        {fit && <span className="hero-fact hero-fit">{fit}</span>}
      </p>

      {ranOut && item.blocked && (
        <p className="hero-line">
          You were {blockPhrase(item, tz)}. Still stuck?{' '}
          <button type="button" className="hero-inline" onClick={() => block(item.blocked!.reason, item.blocked!.note)}>
            still blocked
          </button>
        </p>
      )}
      {(gates.length > 0 || prereqs.length > 0) && (
        <p className="hero-line">
          <b>Needs first</b>{' '}
          {gates.map((g) => (
            <button key={g.id} type="button" className="hero-inline" onClick={() => onOpen(g)}>
              {g.label}
            </button>
          ))}
          {prereqs.map((p, i) => (
            <span key={i}>
              {p.text}
              {p.source ? <span className="muted"> ({p.source})</span> : null}
            </span>
          ))}
        </p>
      )}

      {!done && next && (
        <div className="hero-first">
          <label className="hero-first-step">
            <input type="checkbox" checked={false} onChange={() => toggleStep(next.id)} aria-label={`Done: ${next.label}`} />
            <span>
              <span className="hero-first-word">First</span> {next.label}
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
      {!done && steps.length > 0 && !next && <p className="hero-line">Every step is ticked. Hand it in.</p>}

      {rubric.length > 0 && (
        <p className="hero-line">
          <b>Full credit needs</b> {rubric.map((r) => `${r.criterion}${r.points !== null ? ` (${r.points} pts)` : ''}`).join(' · ')}
        </p>
      )}
      {covered > 0 && (
        <p className="hero-covers">
          <b>Covered by</b>
          {sources.map((s, i) =>
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
          <b>Your professor flagged</b> “{material.flagged[0].point}” <span className="muted">({material.flagged[0].where})</span>
        </p>
      )}
      {shaky && (
        <p className="hero-line">
          <b>You've been shaky on {shaky.topic}</b>
          {shaky.pct !== null ? ` (${shaky.pct}% so far)` : ''}. Start with the slides above, or{' '}
          <a className="hero-inline" href={`#/tutor?c=${item.courseId}&t=${encodeURIComponent(shaky.topic)}&i=${item.id}`}>
            ask the tutor
          </a>
          .
        </p>
      )}
      {link && (
        <p className="hero-line">
          <b>Same idea as</b> {link.other.code} {link.topic}: {link.note}
        </p>
      )}

      {!done && course && (
        <p className="hero-starter">
          <button type="button" className="btn small" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy a prompt'}
          </button>
          <button type="button" className="btn small" onClick={openTutor}>
            Ask the tutor
          </button>
        </p>
      )}

      {!done && (
        <div className="hero-actions">
          {item.startedAt ? (
            <button type="button" className="btn primary hero-btn" onClick={finish}>
              <IconCheck /> Done
            </button>
          ) : (
            <>
              <button type="button" className="btn primary hero-btn" onClick={start}>
                Start
              </button>
              <button type="button" className="btn hero-btn" onClick={() => onDone(item)}>
                <IconCheck /> Done
              </button>
            </>
          )}
          <a className="btn hero-btn hero-halo" href={haloLink(item, course?.code).href} target="_blank" rel="noreferrer">
            {haloLink(item, course?.code).label} ↗
          </a>
          <span className="hero-secondary">
            <button type="button" className="hero-skip" onClick={() => setChoosing((c) => (c === 'block' ? null : 'block'))}>
              Can't do this yet
            </button>
            <button type="button" className="hero-skip" onClick={() => setChoosing((c) => (c === 'snooze' ? null : 'snooze'))}>
              Not today
            </button>
          </span>
          {choosing === 'block' && <BlockChooser onPick={block} onClose={() => setChoosing(null)} />}
          {choosing === 'snooze' && (
            <SnoozeChooser
              today={today}
              deadlineDay={deadlineDay}
              onPick={(day) => {
                onSkip(item, day);
                setChoosing(null);
              }}
              onClose={() => setChoosing(null)}
            />
          )}
        </div>
      )}
    </section>
  );
}
