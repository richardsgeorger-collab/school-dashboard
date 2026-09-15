import { useEffect, useMemo, useRef, useState } from 'react';
import { loadApiKey } from '../chat/key';
import { describeError } from '../chat/client';
import { CourseChip } from '../components/CourseChip';
import { Modal } from '../components/Modal';
import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { classWords } from '../domain/pace';
import type { Course, HaloCheckRecord } from '../domain/types';
import { auditOutcomes, buildAuditPrompt, bulkImports, HALO_URL, openItemsFor, parseAuditResults, remainingCourses, type AuditParse, type BulkImport, type ClassOutcome } from '../halo/audit';
import { clearPendingCheck, pendingCheck, setPendingCheck } from '../halo/checkState';
import { markLines, readAudit } from '../halo/read';
import { localSummary, summarizeAudit, type AuditSummary, type SummaryInput } from '../halo/summary';
import { matchMention, proposalFor, type Proposal } from '../record/match';
import type { Mention } from '../record/notes';
import { useStore } from '../storage/store';
import { applyProposal, describeProposal, LectureReview, type Decision } from './LectureReview';

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
    case 'flag':
      return p.text;
    case 'confirm':
      return p.text;
    default:
      return m.audit?.status === 'schedule' ? 'Halo lists different meeting days or times for this class.' : m.audit?.status === 'rubric' ? `An attached file for ${m.title} carries a date or requirement${m.note ? `: ${m.note}` : ''}.` : p.text;
  }
}

function SummaryBlock({ summary, reading, lowConfidence, bulk, onBulk, added }: { summary: AuditSummary; reading: boolean; lowConfidence: boolean; bulk: BulkImport[]; onBulk: (b: BulkImport) => void; added: Record<string, number> }) {
  return (
    <section className="halo-summary" data-source={summary.source} aria-label="What the audit found">
      <p className="halo-verdict">{summary.verdict}</p>
      {lowConfidence && <p className="halo-partial">I&apos;m not confident I read this right. Check each row before approving; nothing is recorded as clean from this.</p>}
      {summary.matters.length > 0 && (
        <ul className="halo-matters">
          {summary.matters.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
      {bulk.map((b) => (
        <p key={b.course.id} className="halo-bulk">
          {added[b.course.id] !== undefined ? (
            <span className="hint">Added {added[b.course.id]} {b.course.code} item{added[b.course.id] === 1 ? '' : 's'}.</span>
          ) : (
            <button type="button" className="btn small primary" onClick={() => onBulk(b)}>
              Add all {b.ids.length} {b.course.code} items
            </button>
          )}
        </p>
      ))}
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

function RawView({ text, parse }: { text: string; parse: AuditParse | null }) {
  const lines = useMemo(() => (parse ? markLines(text, parse) : text.split(/\r?\n/).map((line) => ({ line, kind: 'unknown' as const }))), [text, parse]);
  const counts: Record<string, number> = {};
  for (const l of lines) counts[l.kind] = (counts[l.kind] ?? 0) + 1;
  return (
    <details className="halo-rawwrap">
      <summary className="hint">
        What was and wasn&apos;t recognized: {counts.finding ?? 0} finding line{counts.finding === 1 ? '' : 's'}, {counts.coverage ?? 0} coverage line{counts.coverage === 1 ? '' : 's'}, {counts.unknown ?? 0} not recognized
      </summary>
      <pre className="halo-raw">
        {lines.map((l, i) => (
          <span key={i} data-kind={l.kind}>
            {l.line}
            {'\n'}
          </span>
        ))}
      </pre>
    </details>
  );
}

const outcomeWord = (o: ClassOutcome): SummaryInput['classes'][number]['outcome'] => (!o.reached || !o.outcome ? 'not reached' : o.outcome.partial ? 'partial' : o.outcome.clean ? 'clean' : 'findings');

type ReadState = { status: 'idle' | 'reading' | 'ok' | 'failed'; parse: AuditParse | null; error: string | null };

/** Where an audit lands: paste, read by Claude, an overview in plain words, then the rows. Never clean without proof. */
export function HaloCheck({ onClose, onHint, onSwitchClass }: { onClose: () => void; onHint: (text: string) => void; onSwitchClass: () => void }) {
  const { data, today, actions, courseById } = useStore();
  const tz = data.settings.timezone;
  const [text, setText] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<Record<string, number>>({});
  const [pending] = useState(() => pendingCheck());
  const [attempt, setAttempt] = useState(0);
  const now = useMemo(() => new Date().toISOString(), []);
  const words = useMemo(() => classWords(data.courses, data.items), [data.courses, data.items]);
  const hasKey = loadApiKey() !== '';

  const audited: Course[] = useMemo(() => {
    const ids = pending?.resume?.courseIds?.length ? pending.resume.courseIds : (pending?.courseIds ?? []);
    const list = ids.map((id) => courseById.get(id)).filter((c): c is Course => !!c);
    return list.length ? list : data.courses;
  }, [pending, courseById, data.courses]);
  const plannerLines = useMemo(
    () => audited.flatMap((c) => openItemsFor(data, tz, today, c.id).map((i) => `${c.code} · ${i.label} · ${i.title} · due ${dateOf(i.dueAt, tz)} · ${i.points} pts${i.score !== null ? ` · scored ${i.score}` : ''}`)).join('\n'),
    [audited, data, tz, today],
  );

  // Reading: the model when a key is here, the pipe-row fallback otherwise or when the model fails.
  const [read, setRead] = useState<ReadState>({ status: 'idle', parse: null, error: null });
  const latest = useRef({ audited, plannerLines });
  latest.current = { audited, plannerLines };
  useEffect(() => {
    const raw = text.trim();
    if (!raw) {
      setRead({ status: 'idle', parse: null, error: null });
      return;
    }
    const key = loadApiKey();
    const fallback = () => parseAuditResults(raw, data.courses, today, latest.current.audited);
    if (!key) {
      setRead({ status: 'ok', parse: fallback(), error: null });
      return;
    }
    let live = true;
    setRead({ status: 'reading', parse: null, error: null });
    const t = setTimeout(() => {
      readAudit({ apiKey: key, text: raw, courses: data.courses, planner: latest.current.plannerLines, today, audited: latest.current.audited })
        .then((p) => live && setRead({ status: 'ok', parse: p, error: null }))
        .catch(async (e) => {
          const msg = await describeError(e);
          if (live) setRead({ status: 'failed', parse: fallback(), error: msg });
        });
    }, 600);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text, attempt, data.courses, today]);

  const parsed = read.parse;
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
  const structure = !!parsed && (parsed.order.length > 0 || Object.values(parsed.classes).some((cc) => cc.coverage !== null || cc.visited.length > 0 || cc.plan !== null));
  const unreadable = !!parsed && findings.length === 0 && !structure;
  const lowConfidence = findings.length > 0 && findings.every((m) => m.confidence === 'low');
  const nothingFound = !!parsed && !unreadable && findings.length === 0;
  const allClean = nothingFound && parsed!.unread.length === 0 && outcomes.length > 0 && outcomes.every((o) => o.outcome?.clean);
  const stopped = parsed?.stopped ?? null;
  const remaining = useMemo(() => (parsed ? remainingCourses(parsed, audited) : []), [parsed, audited]);
  const stoppedLabel = stopped ? `${stopped.courseId ? (courseById.get(stopped.courseId)?.code ?? '') + ' — ' : ''}${stopped.page}` : null;
  // Decided once per paste, before anything is added, so the one-press import stays on screen after it runs.
  const dataRef = useRef(data);
  dataRef.current = data;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const bulk = useMemo(() => (parsed ? bulkImports(parsed, audited, (id) => openItemsFor(dataRef.current, tz, today, id).length) : []), [parsed, audited, tz, today]);
  const bulkIds = useMemo(() => new Set(bulk.flatMap((b) => b.ids)), [bulk]);
  const classesForSummary = useMemo(() => outcomes.map((o) => ({ code: o.course.code, word: words.get(o.course.id) ?? o.course.code, outcome: outcomeWord(o), reason: o.outcome?.reason ?? 'Not reached.', skipped: o.outcome?.skipped ?? [] })), [outcomes, words]);
  const partialLines = localSummary({ findings: [], planner: '', classes: classesForSummary }).partial;

  // The overview: local at once, Claude's wording when a key is here.
  const input: SummaryInput | null = useMemo(() => {
    if (!parsed || nothingFound || unreadable) return null;
    return {
      findings: findings.map((m) => {
        const p = proposals.get(m.id);
        return { id: m.id, classCode: p?.course.code ?? '?', classWord: p ? (words.get(p.course.id) ?? p.course.code) : '?', status: m.audit?.status ?? m.kind, title: m.title, quote: m.quote, proposal: p ? describeProposal(p.proposal, tz) : m.title, headline: p ? headlineFor(p.proposal, m, tz) : undefined, kind: p?.proposal.kind ?? 'none', confidence: m.confidence, date: m.date };
      }),
      classes: classesForSummary,
      planner: plannerLines,
      bulk: bulk.map((b) => ({ code: b.course.code, word: words.get(b.course.id) ?? b.course.code, ids: b.ids })),
    };
  }, [parsed, nothingFound, unreadable, findings, proposals, classesForSummary, words, tz, plannerLines, bulk]);
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
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
      setReading(false);
    };
  }, [parsed]);

  const records = (): HaloCheckRecord[] =>
    outcomes
      .filter((o) => o.reached && o.outcome)
      .map((o) => ({
        at: new Date().toISOString(),
        courseId: o.course.id,
        clean: o.outcome!.clean && !lowConfidence && (parsed?.unread.length ?? 0) === 0,
        partial: o.outcome!.partial || lowConfidence || (parsed?.unread.length ?? 0) > 0,
        findings: parsed ? parsed.mentions.filter((m) => m.courseId === o.course.id && m.audit?.status !== 'note' && !bulkIds.has(m.id)).length : o.findings,
        coverage: o.outcome!.coverage,
        skipped: o.outcome!.skipped,
      }));
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
    onHint(`Copied the ${audited.length === 1 ? audited[0].code : 'all-classes'} audit. Paste it into Claude in Chrome on the Halo tab, then come back and press Check Halo.`);
    onClose();
  };
  const decide = (id: string, d: Decision, text?: string) => {
    setDecisions((s) => ({ ...s, [id]: d }));
    if (text) setApplied((s) => ({ ...s, [id]: text }));
  };
  const addAll = (b: BulkImport) => {
    if (!parsed) return;
    let n = 0;
    for (const m of parsed.mentions) {
      if (!b.ids.includes(m.id) || decisions[m.id]) continue;
      const p = proposals.get(m.id);
      if (!p || p.proposal.kind !== 'add') continue;
      decide(m.id, 'approved', applyProposal(p.proposal, m, actions, tz, today, false, {}, data.items));
      n++;
    }
    setAdded((s) => ({ ...s, [b.course.id]: n }));
  };

  const title = `Check Halo · ${audited.length === 1 ? audited[0].code : audited.length === data.courses.length ? 'all classes' : `${audited.length} classes`}`;
  const summaryNode = summary ? <SummaryBlock summary={summary} reading={reading} lowConfidence={lowConfidence} bulk={bulk} onBulk={addAll} added={added} /> : null;

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
        onDecide={decide}
        applied={applied}
        summary={summaryNode}
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
  const readerNote = read.status === 'failed' ? `Claude couldn't read this (${read.error ?? 'no answer'}), so only pipe-delimited rows were used.` : parsed?.source === 'pipes' && !hasKey ? 'No key on this device, so only pipe-delimited rows were read. Connect the key on Now to have Claude read the whole paste.' : null;

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
        <textarea className="halo-paste" value={text} onChange={(e) => setText(e.target.value)} rows={8} spellCheck={false} placeholder={'Paste the whole audit, headings, narration and all.\nClaude reads it; rows like\nCHM-113 | Topic 3 Quiz | changed | 2026-09-27 23:59 | was 2026-09-25\nare read even without a key.'} aria-label="What Claude found" />

        {read.status === 'reading' && <p className="hint mono halo-reading">Reading the paste…</p>}
        {readerNote && parsed && !unreadable && <p className="hint mono">{readerNote}</p>}

        {parsed && unreadable && (
          <section className="halo-summary halo-unreadable" aria-label="Could not read">
            <p className="halo-verdict">Couldn&apos;t read these results.</p>
            <p className="halo-partial">
              Nothing in the paste was recognized as a finding or a coverage line, so nothing is recorded. This is not a clean check.
              {read.status === 'failed' ? ` Claude's reading failed: ${read.error}.` : !hasKey ? ' Without a key only pipe-delimited rows can be read; connect the key on Now and paste again.' : ''}
            </p>
            <RawView text={text} parse={parsed} />
          </section>
        )}
        {parsed && nothingFound && (
          <section className="halo-summary" data-source={parsed.source} aria-label="What the audit found">
            <p className="halo-verdict">{allClean ? 'Nothing to fix — your planner matches Halo.' : parsed.unread.length ? "Nothing different was read, but some of the paste couldn't be understood, so this is not a clean check." : partialLines.length ? 'Nothing different was found, but the check is not complete.' : 'Nothing different was found.'}</p>
            {parsed.unread.length > 0 && <p className="halo-partial">{parsed.unread.length} line{parsed.unread.length === 1 ? '' : 's'} couldn&apos;t be read. Look at them below before trusting this.</p>}
            {partialLines.map((p, i) => (
              <p key={i} className="halo-partial">
                {p}
              </p>
            ))}
            <RawView text={text} parse={parsed} />
          </section>
        )}
        {parsed && !nothingFound && !unreadable && summaryNode}
        {parsed && !nothingFound && !unreadable && <RawView text={text} parse={parsed} />}

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
          {parsed && (unreadable || read.status === 'failed') && hasKey && (
            <button type="button" className="btn" onClick={() => setAttempt((a) => a + 1)}>
              Read again
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
                onHint(allClean ? 'Verified against Halo. Nothing to fix.' : 'Recorded what was checked. Not a clean check yet.');
                onClose();
              }}
            >
              {allClean ? 'Record it' : 'Record what was checked'}
            </button>
          ) : (
            <button type="button" className="btn primary" disabled={!parsed || unreadable || !summary || read.status === 'reading'} onClick={() => setReviewing(true)}>
              Review {findings.length ? `${findings.length} finding${findings.length === 1 ? '' : 's'}` : ''}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
