import { useEffect, useMemo, useRef, useState } from 'react';
import { loadApiKey } from '../chat/key';
import { CourseChip } from '../components/CourseChip';
import { Modal } from '../components/Modal';
import { dateOf } from '../domain/dates';
import { classWords } from '../domain/pace';
import type { Course, HaloCheckRecord } from '../domain/types';
import { auditOutcomes, buildAuditPrompt, HALO_URL, openItemsFor, parseAuditResults, remainingCourses, type ClassOutcome } from '../halo/audit';
import { clearPendingCheck, pendingCheck, setPendingCheck } from '../halo/checkState';
import { localSummary, summarizeAudit, type AuditSummary, type SummaryInput } from '../halo/summary';
import { matchMention, proposalFor, type Proposal } from '../record/match';
import { useStore } from '../storage/store';
import { describeProposal, LectureReview, type Decision } from './LectureReview';
import { fmtDate, fmtTime } from '../domain/dates';
import type { Mention } from '../record/notes';

/** The fact from the student's side, for the overview's bullets. */
function headlineFor(p: Proposal, m: Mention, tz: string): string {
  const day = (iso: string) => fmtDate(dateOf(iso, tz), 'short');
  switch (p.kind) {
    case 'update':
      return `${p.item.label} moved: ${day(p.item.dueAt)} → ${day(p.dueAt)}${fmtTime(p.dueAt, tz) !== fmtTime(p.item.dueAt, tz) ? ` ${fmtTime(p.dueAt, tz)}` : ''}.`;
    case 'add':
      return `Halo has ${p.item.title} (due ${day(p.item.dueAt)}${p.item.points ? `, ${p.item.points} pts` : ''}) that your planner doesn't.`;
    case 'score':
      return `${p.item.label} is graded: ${p.score} of ${p.item.points}.`;
    case 'remove':
      return `${p.item.label} is no longer in Halo.`;
    case 'confirm':
      return m.audit?.status === 'overdue' ? `Halo flags ${p.item?.label ?? m.title} as overdue.` : p.text;
    default:
      return m.audit?.status === 'schedule' ? `Halo lists different meeting days or times for this class.` : m.audit?.status === 'rubric' ? `An attached file for ${m.title} carries a date or requirement: ${m.quote.split('|').at(-1)?.trim() ?? ''}` : p.text;
  }
}

function SummaryBlock({ summary, reading }: { summary: AuditSummary; reading: boolean }) {
  return (
    <section className="halo-summary" data-source={summary.source} aria-label="What the audit found">
      <p className="halo-verdict">{summary.verdict}</p>
      {summary.matters.length > 0 && (
        <ul className="halo-matters">
          {summary.matters.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
      <p className="halo-plan">{summary.plan}</p>
      {summary.needsYou.length > 0 && (
        <div className="halo-needs">
          <p className="hint">Needs your eye:</p>
          <ul>
            {summary.needsYou.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {summary.partial.map((p, i) => (
        <p key={i} className="halo-partial">
          {p}
        </p>
      ))}
      {reading && <p className="hint mono">Reading it more carefully…</p>}
    </section>
  );
}

const outcomeWord = (o: ClassOutcome): SummaryInput['classes'][number]['outcome'] => (!o.reached || !o.outcome ? 'not reached' : o.outcome.partial ? 'partial' : o.outcome.clean ? 'clean' : 'findings');

/** Where an audit lands: paste, read, an overview in plain words, then the rows. Recorded per class, clean only with proof. */
export function HaloCheck({ onClose, onHint, onSwitchClass }: { onClose: () => void; onHint: (text: string) => void; onSwitchClass: () => void }) {
  const { data, today, actions, courseById } = useStore();
  const tz = data.settings.timezone;
  const [text, setText] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [pending] = useState(() => pendingCheck());
  const now = useMemo(() => new Date().toISOString(), []);
  const words = useMemo(() => classWords(data.courses, data.items), [data.courses, data.items]);

  const audited: Course[] = useMemo(() => {
    const ids = pending?.resume?.courseIds?.length ? pending.resume.courseIds : (pending?.courseIds ?? []);
    const list = ids.map((id) => courseById.get(id)).filter((c): c is Course => !!c);
    return list.length ? list : data.courses;
  }, [pending, courseById, data.courses]);

  const parsed = useMemo(() => (text.trim() ? parseAuditResults(text, data.courses, today, audited) : null), [text, data.courses, today, audited]);
  const outcomes = useMemo(() => (parsed ? auditOutcomes(parsed, audited) : []), [parsed, audited]);
  const proposals = useMemo(() => {
    const map = new Map<string, { course: Course; proposal: Proposal }>();
    if (!parsed) return map;
    for (const m of parsed.mentions) {
      const course = (m.courseId && courseById.get(m.courseId)) || audited[0] || data.courses[0];
      if (!course) continue;
      const match = matchMention(m, data.items, course.id);
      map.set(m.id, { course, proposal: proposalFor(m, match, course, tz, today, now) });
    }
    return map;
  }, [parsed, courseById, audited, data.courses, data.items, tz, today, now]);

  const findings = useMemo(() => parsed?.mentions.filter((m) => m.audit?.status !== 'note') ?? [], [parsed]);
  const nothingFound = !!parsed && findings.length === 0;
  const allClean = nothingFound && outcomes.length > 0 && outcomes.every((o) => o.outcome?.clean);
  const stopped = parsed?.stopped ?? null;
  const remaining = useMemo(() => (parsed ? remainingCourses(parsed, audited) : []), [parsed, audited]);
  const stoppedLabel = stopped ? `${stopped.courseId ? (courseById.get(stopped.courseId)?.code ?? '') + ' — ' : ''}${stopped.page}` : null;
  const partialLines = localSummary({ findings: [], planner: '', classes: outcomes.map((o) => ({ code: o.course.code, word: words.get(o.course.id) ?? o.course.code, outcome: outcomeWord(o), reason: o.outcome?.reason ?? 'Not reached.', skipped: o.outcome?.skipped ?? [] })) }).partial;

  // The overview: local at once, Claude's wording when a key is here.
  const input: SummaryInput | null = useMemo(() => {
    if (!parsed || nothingFound) return null;
    return {
      findings: findings.map((m) => {
        const p = proposals.get(m.id);
        return { id: m.id, classCode: p?.course.code ?? '?', classWord: p ? (words.get(p.course.id) ?? p.course.code) : '?', status: m.audit?.status ?? m.kind, title: m.title, quote: m.quote, proposal: p ? describeProposal(p.proposal, tz) : m.title, headline: p ? headlineFor(p.proposal, m, tz) : undefined, kind: p?.proposal.kind ?? 'none', confidence: m.confidence, date: m.date };
      }),
      classes: outcomes.map((o) => ({ code: o.course.code, word: words.get(o.course.id) ?? o.course.code, outcome: outcomeWord(o), reason: o.outcome?.reason ?? 'Not reached.', skipped: o.outcome?.skipped ?? [] })),
      planner: audited
        .flatMap((c) => openItemsFor(data, tz, today, c.id).map((i) => `${c.code} · ${i.label} · ${i.title} · due ${dateOf(i.dueAt, tz)} · ${i.points} pts${i.score !== null ? ` · scored ${i.score}` : ''}`))
        .join('\n'),
    };
  }, [parsed, nothingFound, findings, proposals, outcomes, words, tz, audited, data, today]);
  const inputRef = useRef(input);
  inputRef.current = input;
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [reading, setReading] = useState(false);
  useEffect(() => {
    const cur = inputRef.current;
    if (!cur) {
      setSummary(null);
      setReading(false);
      return;
    }
    setSummary(localSummary(cur));
    const key = loadApiKey();
    if (!key) return;
    let live = true;
    setReading(true);
    const t = setTimeout(() => {
      summarizeAudit({ ...cur, apiKey: key })
        .then((s) => live && setSummary(s))
        .catch(() => undefined)
        .finally(() => live && setReading(false));
    }, 700);
    return () => {
      live = false;
      clearTimeout(t);
      setReading(false);
    };
  }, [text]);

  const records = (): HaloCheckRecord[] =>
    outcomes.filter((o) => o.reached && o.outcome).map((o) => ({ at: new Date().toISOString(), courseId: o.course.id, clean: o.outcome!.clean, partial: o.outcome!.partial, findings: o.findings, coverage: o.outcome!.coverage, skipped: o.outcome!.skipped }));
  const finish = () => {
    actions.recordHaloChecks(records());
    if (stopped && remaining.length > 0 && stoppedLabel) setPendingCheck(remaining.map((c) => c.id), { courseIds: remaining.map((c) => c.id), stoppedAt: stoppedLabel });
    else clearPendingCheck();
  };
  const copyFor = (list: Course[], resumeFrom: string | null) => {
    const prompt = buildAuditPrompt(data.settings.haloAuditPrompt, data, tz, today, list, { resumeFrom });
    void navigator.clipboard?.writeText(prompt).catch(() => undefined);
    window.open(HALO_URL, '_blank', 'noopener');
    setPendingCheck(list.map((c) => c.id), resumeFrom ? { courseIds: list.map((c) => c.id), stoppedAt: resumeFrom } : null);
  };
  const resume = (list: Course[], from: string) => {
    if (parsed) actions.recordHaloChecks(records());
    copyFor(list, from);
    onHint(`Copied the audit for the ${list.length} remaining class${list.length === 1 ? '' : 'es'}, picking up at ${from}. Paste it into Claude in Chrome on the Halo tab, then come back and press Check Halo.`);
    onClose();
  };
  const again = () => {
    copyFor(audited, null);
    onHint(`Copied the ${audited.length === 1 ? audited[0].code : `all-classes`} audit. Paste it into Claude in Chrome on the Halo tab, then come back and press Check Halo.`);
    onClose();
  };

  const title = `Check Halo · ${audited.length === 1 ? audited[0].code : audited.length === data.courses.length ? 'all classes' : `${audited.length} classes`}`;

  if (reviewing && parsed && audited[0] && summary) {
    return (
      <LectureReview
        title={title}
        notes={{ summary: [], concepts: [], mentions: parsed.mentions, model: 'capture', createdAt: now }}
        transcript={text}
        course={audited[0]}
        lectureDate={today}
        dryRun={false}
        decisions={decisions}
        onDecide={(id, d, text) => {
          setDecisions((s) => ({ ...s, [id]: d }));
          if (text) setApplied((s) => ({ ...s, [id]: text }));
        }}
        applied={applied}
        summary={<SummaryBlock summary={summary} reading={reading} />}
        plan={summary.decisions}
        onClose={() => {
          finish();
          onClose();
        }}
      />
    );
  }

  const pendingResume = pending?.resume ?? null;
  const resumeList = pendingResume ? pendingResume.courseIds.map((id) => courseById.get(id)).filter((c): c is Course => !!c) : [];

  return (
    <Modal title={title} onClose={onClose}>
      <div className="modal-body">
        <p className="hint">
          {audited.length === 1 && (
            <>
              <CourseChip course={audited[0]} /> {audited[0].name}.{' '}
            </>
          )}
          Paste what Claude found on the Halo tab. You get the short version first, then each change to approve or adjust.{' '}
          <button type="button" className="diff-toggle" onClick={onSwitchClass}>
            Different class
          </button>
        </p>
        {!text.trim() && pendingResume && resumeList.length > 0 && (
          <p className="halo-resume hint">
            The last run stopped at {pendingResume.stoppedAt}. {resumeList.length} class{resumeList.length === 1 ? '' : 'es'} still to check.{' '}
            <button type="button" className="btn small" onClick={() => resume(resumeList, pendingResume.stoppedAt)}>
              Resume from here
            </button>
          </p>
        )}
        <textarea className="halo-paste" value={text} onChange={(e) => setText(e.target.value)} rows={8} spellCheck={false} placeholder={'=== CLASS: CHM-113 ===\nCOVERAGE PLAN — CHM-113 — 11 pages\nVISITED — Topic 1 — 4 items found\nCHM-113 | Topic 3 Quiz | changed | 2026-09-27 23:59 | was 2026-09-25\nCOVERAGE — CHM-113 — visited 11 of 11 pages\n…\nFINAL COVERAGE\nCHM-113 — visited 11 of 11 pages — 1 finding\nEND OF FINDINGS — 1 items'} aria-label="What Claude found" />

        {parsed && nothingFound && (
          <section className="halo-summary" data-source="local" aria-label="What the audit found">
            <p className="halo-verdict">{allClean ? 'Nothing to fix — your planner matches Halo.' : partialLines.length ? 'Nothing different was found, but the check is not complete.' : 'Nothing different was found.'}</p>
            {partialLines.map((p, i) => (
              <p key={i} className="halo-partial">
                {p}
              </p>
            ))}
          </section>
        )}
        {parsed && !nothingFound && summary && <SummaryBlock summary={summary} reading={reading} />}
        {parsed && parsed.unread.length > 0 && (
          <p className="hint mono">
            {parsed.unread.length} line{parsed.unread.length === 1 ? '' : 's'} I couldn&apos;t read {findings.length ? 'sit at the bottom of the review' : 'are kept'}: {parsed.unread.slice(0, 2).join(' · ')}
            {parsed.unread.length > 2 ? ' …' : ''}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="diff-toggle" onClick={again}>
            Copy the prompt and open Halo again
          </button>
          <span className="spacer" />
          {parsed && stopped && remaining.length > 0 && stoppedLabel && (
            <button type="button" className="btn" onClick={() => resume(remaining, stoppedLabel)}>
              Resume from here ({remaining.length} left)
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => {
              clearPendingCheck();
              onClose();
            }}
          >
            Not now
          </button>
          {parsed && nothingFound ? (
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                finish();
                onHint(allClean ? `Verified against Halo. Nothing to fix.` : `Recorded. ${partialLines.length} class${partialLines.length === 1 ? '' : 'es'} still need${partialLines.length === 1 ? 's' : ''} a full check.`);
                onClose();
              }}
            >
              {allClean ? 'Record it' : 'Record what was checked'}
            </button>
          ) : (
            <button type="button" className="btn primary" disabled={!parsed || !summary} onClick={() => setReviewing(true)}>
              Review {findings.length ? `${findings.length} finding${findings.length === 1 ? '' : 's'}` : ''}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

