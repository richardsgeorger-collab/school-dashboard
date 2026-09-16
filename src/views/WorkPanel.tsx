import { useEffect, useMemo, useState } from 'react';
import { describeError } from '../chat/client';
import { loadApiKey } from '../chat/key';
import type { Brief, Course, Item, Step } from '../domain/types';
import { libraryDb, type Deck } from '../library/db';
import { decksForItem } from '../library/links';
import { useStore } from '../storage/store';
import { loadPool } from '../quiz/pool';
import { gatherSources, sourcesBlock } from '../quiz/sources';
import { briefItem, checkDraft, checkMethod, localBrief, type DraftCheck, type MethodCheck } from '../work/brief';
import { isMilestoneWork, makeSteps, stepProgress, stepsFor } from '../work/steps';

const RUBRIC_WORDS = /rubric|guidelines?|instructions?|handout|assignment sheet|prompt/i;

/** The text on file that reads like this item's rubric or handout: a linked deck named for it, else nothing. */
async function rubricTextFor(item: Item, decks: Deck[]): Promise<string> {
  const mine = decksForItem(item, decks).filter((d) => RUBRIC_WORDS.test(`${d.title} ${d.tag} ${d.fileName}`) || d.title.toLowerCase().includes(item.title.toLowerCase().slice(0, 12)));
  const texts: string[] = [];
  for (const d of mine.slice(0, 2)) {
    const pages = await libraryDb.pages(d.id);
    texts.push(`[${d.title}]\n${pages.map((p) => p.text).join('\n')}`);
  }
  return texts.join('\n\n').slice(0, 40_000);
}

/**
 * What the work actually is: what it asks for and what earns points, the steps inside it, and a draft check against
 * the real rubric. Lives inside the item. Nothing here makes a new row anywhere.
 */
export function WorkPanel({ item: given, course }: { item: Item; course: Course }) {
  const { actions, data } = useStore();
  const item = data.items.find((i) => i.id === given.id) ?? given;
  const hasKey = loadApiKey() !== '';
  const [reading, setReading] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [check, setCheck] = useState<DraftCheck | null>(null);
  const [showDraft, setShowDraft] = useState(false);
  const [work, setWork] = useState('');
  const [showWork, setShowWork] = useState(false);
  const [checkingWork, setCheckingWork] = useState(false);
  const [method, setMethod] = useState<MethodCheck | null>(null);
  const tz = data.settings.timezone;
  const problemSet = item.type === 'homework' || item.type === 'lab' || item.type === 'quiz' || item.type === 'exam';
  const runMethod = async () => {
    if (!work.trim()) return;
    setCheckingWork(true);
    setNote(null);
    try {
      const pool = await loadPool(course.id).catch(() => null);
      const material = pool ? sourcesBlock(gatherSources(course, item.topic ?? item.title, pool, tz)) : '';
      setMethod(await checkMethod({ apiKey: loadApiKey(), item, course, description, material, work }));
    } catch (e) {
      setNote(await describeError(e));
    } finally {
      setCheckingWork(false);
    }
  };
  const description = item.notes?.trim() ?? '';
  const big = isMilestoneWork(item);

  // The brief, once, when there is something to read it from.
  useEffect(() => {
    if (item.brief || reading) return;
    if (!description && !hasKey) return;
    let live = true;
    (async () => {
      const decks = await libraryDb.listDecks().catch(() => [] as Deck[]);
      const rubricText = await rubricTextFor(item, decks).catch(() => '');
      if (!description && !rubricText) return;
      setReading(true);
      let brief: Brief;
      try {
        brief = hasKey ? await briefItem({ apiKey: loadApiKey(), item, course, description, rubricText }) : localBrief({ item, course, description, rubricText });
      } catch (e) {
        brief = localBrief({ item, course, description, rubricText });
        setNote(await describeError(e));
      }
      if (!live) return;
      const steps = item.steps?.length ? item.steps : big ? makeSteps(brief.steps.length >= 2 ? brief.steps : stepsFor(item).map((s) => s.label)) : item.steps;
      actions.upsertItem({ ...item, brief, ...(steps ? { steps } : {}) });
      setReading(false);
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.brief, description, hasKey]);

  const steps = useMemo(() => (big ? stepsFor(item) : []), [item, big]);
  const progress = stepProgress(steps);
  const toggle = (s: Step) => actions.upsertItem({ ...item, steps: steps.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) });

  const run = async () => {
    if (!item.brief || !draft.trim()) return;
    setDrafting(true);
    setNote(null);
    try {
      const decks = await libraryDb.listDecks().catch(() => [] as Deck[]);
      const rubricText = await rubricTextFor(item, decks).catch(() => '');
      setCheck(await checkDraft({ apiKey: loadApiKey(), item, course, description, rubricText, brief: item.brief, draft }));
    } catch (e) {
      setNote(await describeError(e));
    } finally {
      setDrafting(false);
    }
  };

  const brief = item.brief;
  if (!brief && !big && !description) return null;
  return (
    <div className="work">
      {(brief || reading) && (
        <div className="work-brief">
          <p className="hint">
            <b>What it asks for</b>
            {reading && <span className="mono"> · reading…</span>}
            {brief?.source === 'local' && <span className="mono"> · from the description only</span>}
          </p>
          {brief && brief.asks.length > 0 && (
            <ul className="work-asks">
              {brief.asks.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
          {brief && brief.asks.length === 0 && !reading && <p className="hint">Nothing on file says what it asks for. Drop the rubric or handout into the class library and it will read that.</p>}
          {brief && brief.rubric.length > 0 && (
            <>
              <p className="hint">
                <b>What earns points</b>
              </p>
              <ul className="work-rubric">
                {brief.rubric.map((r, i) => (
                  <li key={i}>
                    <span className="work-crit">
                      {r.criterion}
                      {r.points !== null && <span className="mono muted"> · {r.points} pts</span>}
                    </span>
                    {r.how && <span className="hint">{r.how}</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
      {!brief && !reading && description && <p className="hint">{description.slice(0, 400)}</p>}

      {big && steps.length > 0 && (
        <details className="work-steps">
          <summary className="hint">
            <span className="work-steps-bar" aria-hidden>
              <span style={{ width: `${(progress ?? 0) * 100}%` }} />
            </span>
            {steps.filter((s) => s.done).length} of {steps.length} steps
          </summary>
          <ul>
            {steps.map((s) => (
              <li key={s.id}>
                <label>
                  <input type="checkbox" checked={s.done} onChange={() => toggle(s)} /> {s.label}
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}

      {brief && hasKey && (item.type === 'paper' || item.type === 'project' || item.type === 'discussion' || item.type === 'other' || brief.rubric.length > 0) && (
        <div className="work-draft">
          {!showDraft ? (
            <button type="button" className="btn small" onClick={() => setShowDraft(true)}>
              Check my draft
            </button>
          ) : (
            <>
              <textarea className="halo-paste" rows={6} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste your draft. You get a checklist against the rubric: what it hits, what's missing. Not a grade, not a rewrite." aria-label="Your draft" />
              <div className="settings-actions">
                <button type="button" className="btn small primary" disabled={drafting || !draft.trim()} onClick={() => void run()}>
                  {drafting ? 'Checking…' : 'Check it'}
                </button>
                <button type="button" className="btn small" onClick={() => setShowDraft(false)}>
                  Close
                </button>
              </div>
              {check && (
                <div className="work-check">
                  {check.hits.length > 0 && (
                    <ul className="work-hits">
                      {check.hits.map((h, i) => (
                        <li key={i}>
                          <b>{h.criterion}</b> — {h.note}
                        </li>
                      ))}
                    </ul>
                  )}
                  {check.misses.length > 0 && (
                    <ul className="work-misses">
                      {check.misses.map((m, i) => (
                        <li key={i}>
                          <b>{m.criterion}</b> — {m.what}
                        </li>
                      ))}
                    </ul>
                  )}
                  {check.next && <p className="work-next">Next: {check.next}</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}
      {hasKey && problemSet && (
        <div className="work-draft">
          {!showWork ? (
            <button type="button" className="btn small" onClick={() => setShowWork(true)}>
              Check my method
            </button>
          ) : (
            <>
              <textarea className="halo-paste" rows={6} value={work} onChange={(e) => setWork(e.target.value)} placeholder="Paste your work: the setup, the steps, what you got. You get a check on the method against how the class teaches it. Never the answer." aria-label="Your work" />
              <div className="settings-actions">
                <button type="button" className="btn small primary" disabled={checkingWork || !work.trim()} onClick={() => void runMethod()}>
                  {checkingWork ? 'Checking…' : 'Check it'}
                </button>
                <button type="button" className="btn small" onClick={() => setShowWork(false)}>
                  Close
                </button>
              </div>
              {method && (
                <div className="work-check">
                  <ul className="work-method">
                    {method.problems.map((p, i) => (
                      <li key={i} data-setup={p.setup}>
                        <b>{p.label || `Problem ${i + 1}`}</b> <span className="mono muted">· setup {p.setup}</span> — {p.note}
                        {p.step && <span className="hint"> Look again at: {p.step}</span>}
                      </li>
                    ))}
                  </ul>
                  {method.next && <p className="work-next">Next: {method.next}</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}
      {note && (
        <p className="hint" style={{ color: 'var(--overdue)' }}>
          {note}
        </p>
      )}
    </div>
  );
}
