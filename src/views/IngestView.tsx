import { useCallback, useEffect, useMemo, useState } from 'react';
import { describeAiError } from '../ai/client';
import { costOf, fmtDollars, loadPrices } from '../ai/usage';
import { loadApiKey } from '../chat/key';
import { useAiAllowed } from '../config/useCan';
import { CourseChip } from '../components/CourseChip';
import { dateOf, fmtDate, fmtMinutes } from '../domain/dates';
import type { DateStr, Item } from '../domain/types';
import { applyPlan, countSelected, type PlanSelection } from '../ingest/apply';
import { approxTokens, gatherClassContext, type ClassContext } from '../ingest/context';
import { diffPlan, diffSummary, proposedStart } from '../ingest/diff';
import { canLink, findLinks } from '../ingest/links';
import { browserCache, browserLoaders } from '../ingest/loaders';
import type { ClassPlan } from '../ingest/plan';
import { loadPlan, loadTerm, NO_COST, planState, runClassPass, runTermPass, STEP_WORDS, type RunCost, type Step } from '../ingest/run';
import type { TermResult } from '../ingest/term';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { ItemDetail } from './ItemDetail';
import { DateAudit } from './DateAudit';
import { PlanReview, Sure } from './PlanReview';

/**
 * The compare screen for one class: what the rule-based parser says next to what the AI pass reasoned, one row per
 * item, and the switch that makes the AI version this class's default once it has proved better.
 */
export function IngestView() {
  const { data, schedule, today, actions } = useStore();
  const { params } = useRoute();
  const tz = data.settings.timezone;
  const course = data.courses.find((c) => c.id === params.get('c')) ?? null;
  const hasKey = useAiAllowed('syllabusAI');
  const [plan, setPlan] = useState<ClassPlan | null>(null);
  const [term, setTerm] = useState<TermResult | null>(null);
  const [ctx, setCtx] = useState<ClassContext | null>(null);
  const [step, setStep] = useState<Step | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [spent, setSpent] = useState<RunCost | null>(null);
  const [review, setReview] = useState(false);
  const [open, setOpen] = useState<Item | null>(null);
  const startByOf = useCallback((id: string): DateStr | undefined => schedule.byItem[id]?.startBy, [schedule]);
  const items = useMemo(() => (course ? data.items.filter((i) => i.courseId === course.id).sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0) || a.dueAt.localeCompare(b.dueAt)) : []), [course, data.items]);

  useEffect(() => {
    if (!course) return;
    let live = true;
    (async () => {
      const [p, t, c] = await Promise.all([loadPlan(browserCache, course.id).catch(() => null), loadTerm(browserCache).catch(() => null), gatherClassContext(course, data, today, startByOf, browserLoaders).catch(() => null)]);
      if (!live) return;
      setPlan(p);
      setTerm(t);
      setCtx(c);
    })();
    return () => {
      live = false;
    };
    // The context only needs to follow the items of this class and what is on file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course?.id, items]);

  const run = async (force: boolean) => {
    if (!course || !hasKey) return;
    setNote(null);
    setSpent(null);
    const deps = { apiKey: loadApiKey(), loaders: browserLoaders, cache: browserCache };
    const onStep = (s: Step) => setStep(s);
    try {
      const r = await runClassPass(course, data, today, startByOf, deps, { force, onStep });
      setPlan(r.plan);
      setCtx(r.ctx);
      const plans: Record<string, ClassPlan | null> = {};
      for (const c of data.courses) plans[c.id] = c.id === course.id ? r.plan : await loadPlan(browserCache, c.id).catch(() => null);
      const t = await runTermPass(data, plans, today, startByOf, deps, { force, onStep });
      setTerm(t.term);
      actions.updateSettings({ termPlan: { weeks: t.term.weeks, chains: t.term.chains, model: t.term.model, at: t.term.at, inputHash: t.term.inputHash } });
      const cost = [r.cost, t.cost].reduce((acc, c) => ({ calls: acc.calls + c.calls, input: acc.input + c.input, output: acc.output + c.output, cacheRead: acc.cacheRead + c.cacheRead, cacheWrite: acc.cacheWrite + c.cacheWrite }), NO_COST);
      setSpent(cost.calls ? cost : null);
      setNote(r.cached && t.cached ? 'Nothing on file changed since the last pass, so it cost nothing: this is the same read.' : r.plan.incomplete.length ? `Read, except for ${r.plan.incomplete.join(' and ')}. Run it again to try that part.` : null);
    } catch (e) {
      // Nothing is written until the review is applied, so a failed pass leaves the planner exactly as it was.
      setNote(`${await describeAiError(e)} Nothing was changed.`);
    } finally {
      setStep(null);
    }
  };

  const diff = useMemo(() => (course && plan ? diffPlan(course, items, plan, term, startByOf) : null), [course, items, plan, term, startByOf]);

  const apply = (sel: PlanSelection) => {
    if (!course || !plan || !diff) return;
    const now = new Date().toISOString();
    const before = actions.snapshotItems();
    const out = applyPlan(before, course, plan, diff, sel, { now, tz });
    actions.applyIngest(out.items, out.touched, `AI plan ${course.code}`);
    const updated = { ...course, ingest: 'ai' as const, topics: plan.topics };
    actions.upsertCourse(updated);
    const courses = data.courses.map((c) => (c.id === course.id ? updated : c));
    if (canLink(courses)) {
      findLinks({ apiKey: loadApiKey(), courses })
        .then((links) => actions.updateSettings({ topicLinks: links }))
        .catch(() => undefined);
    }
    setReview(false);
    const n = countSelected(sel);
    setNote(`Applied ${n} change${n === 1 ? '' : 's'}${out.added.length ? `, added ${out.added.length}` : ''}. ${course.code} now runs on the AI version; the parser stays as fallback.`);
  };

  if (!course) {
    return (
      <>
        <h1 className="page-title">AI plan</h1>
        <p className="hint">
          Pick a class from <a href="#/classes">Classes</a>.
        </p>
      </>
    );
  }

  const state = ctx ? planState(plan, ctx) : 'none';
  const tokens = ctx ? approxTokens(ctx) : 0;
  const prices = loadPrices();
  // Pass A writes the context to the cache; B and C read it back at a tenth of the price.
  const est = ctx ? costOf({ calls: 3, input: Math.round(tokens * 0.2), output: 220 * Math.max(1, ctx.assessments.length), cacheRead: tokens * 2, cacheWrite: tokens }, prices) : 0;
  const read = plan ? Object.keys(plan.items).length : 0;
  const brutal = (term?.weeks ?? []).filter((w) => w.load === 'brutal' && w.start >= today).slice(0, 3);

  return (
    <>
      <div className="lib-head">
        <div>
          <a className="diff-toggle" href={`#/class?c=${course.id}`}>
            ← {course.code}
          </a>
          <h1 className="page-title lib-class-title">
            <CourseChip course={course} /> <span>AI plan</span>
          </h1>
          <p className="hint mono">
            {course.ingest === 'ai' ? 'Running on the AI version · parser is the fallback' : 'Running on the parser'}
            {plan ? ` · last pass ${fmtDate(dateOf(plan.at, tz), 'short')}${state === 'stale' ? ' · changed since (new file or sync)' : ''}` : ' · never run'}
          </p>
        </div>
      </div>

      <DateAudit course={course} />

      <section className="card ingest-status">
        {!hasKey && <p className="hint">The AI pass needs a Pro or Max plan. Until then this class runs on the parser.</p>}
        {ctx?.syllabusInfo && (
          <p className="hint mono" data-full={ctx.syllabusInfo.dropped.length === 0 && !ctx.syllabusInfo.storedTruncated}>
            Syllabus: {ctx.syllabusInfo.sent.toLocaleString()} of {ctx.syllabusInfo.stored.toLocaleString()} stored characters go to the model
            {ctx.syllabusInfo.dropped.length > 0 ? `, leaving out ${ctx.syllabusInfo.dropped.join(', ')}` : ', all of it'}.
            {ctx.syllabusInfo.storedTruncated && ' The stored copy itself was cut at 30,000 characters when it was added, so its last topics are gone. Drop the file into the class library again to store all of it.'}
          </p>
        )}
        {hasKey && ctx && (
          <p className="hint">
            It reads {ctx.assessments.length} item{ctx.assessments.length === 1 ? '' : 's'} with their descriptions, {ctx.syllabus ? 'the syllabus' : 'no syllabus'}, {ctx.rubrics.length} rubric file{ctx.rubrics.length === 1 ? '' : 's'}, {ctx.decks.length} deck{ctx.decks.length === 1 ? '' : 's'}, and {ctx.lectures.length} lecture{ctx.lectures.length === 1 ? '' : 's'} in three passes over one cached copy of it: about {Math.round(tokens / 1000)}k tokens the first time, roughly {fmtDollars(est)} at current prices. Then a cheap pass over every class sets start dates against everything else due.
          </p>
        )}
        <div className="settings-actions">
          {hasKey && (
            <button type="button" className="btn primary" disabled={step !== null} onClick={() => void run(state === 'fresh')}>
              {step ? `${STEP_WORDS[step]}…` : plan ? (state === 'fresh' ? 'Re-run anyway' : 'Re-run the AI pass') : 'Run the AI pass'}
            </button>
          )}
          {diff && diff.total > 0 && (
            <button type="button" className="btn" onClick={() => setReview(true)}>
              Review {diff.total} change{diff.total === 1 ? '' : 's'}
            </button>
          )}
          {course.ingest === 'ai' && (
            <button type="button" className="btn small" onClick={() => actions.upsertCourse({ ...course, ingest: 'parser' })}>
              Back to the parser
            </button>
          )}
        </div>
        {note && <p className="hint ingest-note">{note}</p>}
        {spent && (
          <p className="hint mono">
            That run: {spent.calls} call{spent.calls === 1 ? '' : 's'}, {Math.round((spent.input + spent.cacheRead + spent.cacheWrite) / 1000)}k tokens in, {Math.round(spent.output / 1000) || '<1'}k out, {fmtDollars(costOf(spent, prices))}.
          </p>
        )}
        {diff && <p className="ingest-summary">{diffSummary(diff, course, read)}</p>}
        {plan && plan.incomplete.length > 0 && <p className="hint">Thinner than usual: {plan.incomplete.join(' and ')} did not come back on the last run.</p>}
        {plan?.notes && <p className="hint">{plan.notes}</p>}
        {brutal.length > 0 && (
          <p className="hint">
            Heaviest weeks ahead: {brutal.map((w) => `${fmtDate(w.start, 'short')}${w.why ? ` (${w.why})` : ''}`).join('; ')}.
          </p>
        )}
      </section>

      {plan && (
        <section className="section">
          <h2 className="section-title">
            parser vs AI <span className="count">{items.length}</span>
          </h2>
          <ul className="ingest-table">
            <li className="ingest-head mono" aria-hidden>
              <span>item</span>
              <span>parser</span>
              <span>AI</span>
            </li>
            {items.map((i) => {
              const p = plan.items[i.id];
              const start = p ? proposedStart(p, term) : null;
              const ruleStart = startByOf(i.id);
              return (
                <li key={i.id} className="ingest-row" data-done={i.status === 'done'}>
                  <span className="ingest-item">
                    <button type="button" className="ingest-title" onClick={() => setOpen(i)}>
                      {i.label}
                    </button>
                    <span className="hint mono">
                      due {fmtDate(dateOf(i.dueAt, tz), 'short')} · {i.points} pts{i.status === 'done' ? ' · done' : ''}
                    </span>
                  </span>
                  <span className="ingest-parser mono">
                    start {ruleStart ? fmtDate(ruleStart, 'short') : '—'} · {fmtMinutes(i.estimatedMinutes)}
                    {i.startByOverride && <span className="hint"> (start set by you)</span>}
                    {i.estimateOverridden && <span className="hint"> (estimate set by you)</span>}
                  </span>
                  <span className="ingest-ai">
                    {!p ? (
                      <span className="hint">not read</span>
                    ) : (
                      <>
                        <span className="mono">
                          start {start ? fmtDate(start.value, 'short') : '—'}
                          {start && <Sure c={start.confidence} />} · {p.minutes ? fmtMinutes(p.minutes.value) : '—'}
                          {p.minutes && <Sure c={p.minutes.confidence} />}
                        </span>
                        {start?.why && <span className="hint plan-why">{start.why}</span>}
                        {p.minutes?.why && p.minutes.why !== start?.why && <span className="hint plan-why">{p.minutes.why}</span>}
                        {p.asks && <span className="ingest-asks">{p.asks}</span>}
                        <span className="hint mono">
                          {[p.milestones.length ? `${p.milestones.length} milestones` : null, p.prerequisites.length ? `${p.prerequisites.length} prerequisite${p.prerequisites.length === 1 ? '' : 's'}` : null, [p.flags.lopesWrite && 'LopesWrite', p.flags.timed && 'timed', p.flags.group && 'group', p.flags.inPerson && 'in person'].filter(Boolean).join(', ') || null, p.sources.length ? `${p.sources.length} source${p.sources.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}
                        </span>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {review && diff && <PlanReview course={course} diff={diff} onApply={apply} onClose={() => setReview(false)} />}
      {open && <ItemDetail key={open.id} item={open} onClose={() => setOpen(null)} />}
    </>
  );
}
