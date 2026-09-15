import { useEffect, useMemo, useRef, useState } from 'react';
import { loadApiKey } from '../chat/key';
import { describeError } from '../chat/client';
import { CourseChip } from '../components/CourseChip';
import { Modal } from '../components/Modal';
import { dateOf } from '../domain/dates';
import type { Course, HaloCheckRecord, Item } from '../domain/types';
import { auditOutcomes, buildAuditPrompt, bulkImports, HALO_URL, openItemsFor, parseAuditResults, remainingCourses, type AuditParse, type ClassOutcome } from '../halo/audit';
import { clearPendingCheck, pendingCheck, setPendingCheck } from '../halo/checkState';
import { judge, needLines, type Judged, type NeedLine } from '../halo/needs';
import { markLines, readAudit, unknownLines } from '../halo/read';
import { polishNeeds } from '../halo/summary';
import { applyProposal, describeProposal } from '../record/apply';
import { matchMention, proposalFor } from '../record/match';
import { useStore } from '../storage/store';
import { diffBatch } from '../storage/undo';
import { LectureReview, type Decision } from './LectureReview';

function RawView({ text, parse }: { text: string; parse: AuditParse }) {
  const lines = useMemo(() => markLines(text, parse), [text, parse]);
  const counts: Record<string, number> = {};
  for (const l of lines) counts[l.kind] = (counts[l.kind] ?? 0) + 1;
  const unknown = unknownLines(lines);
  return (
    <div className="halo-rawwrap">
      <p className="hint">
        {counts.finding ?? 0} finding line{counts.finding === 1 ? '' : 's'}, {counts.coverage ?? 0} coverage line{counts.coverage === 1 ? '' : 's'}, {(counts.noise ?? 0) + (counts.prose ?? 0)} narration, {unknown.length} not recognized
      </p>
      {unknown.length > 0 && (
        <div className="halo-unknown">
          <p className="hint">Not recognized — might be content I missed:</p>
          <ul>
            {unknown.slice(0, 20).map((l, i) => (
              <li key={i}>{l}</li>
            ))}
            {unknown.length > 20 && <li className="hint">+ {unknown.length - 20} more below</li>}
          </ul>
        </div>
      )}
      <pre className="halo-raw">
        {lines.map((l, i) => (
          <span key={i} data-kind={l.kind}>
            {l.line}
            {'\n'}
          </span>
        ))}
      </pre>
    </div>
  );
}

type ReadState = { status: 'idle' | 'reading' | 'ok' | 'failed'; parse: AuditParse | null; error: string | null };

/**
 * Where an audit lands. Safe changes apply on their own; the screen says how many and lists the few things that need
 * a person. Everything else waits behind "see details". Nothing applies when the paste could not be read or a class's
 * coverage came back short.
 */
export function HaloCheck({ onClose, onHint, onSwitchClass }: { onClose: () => void; onHint: (text: string) => void; onSwitchClass: () => void }) {
  const { data, today, actions, courseById, undo } = useStore();
  const tz = data.settings.timezone;
  const [text, setText] = useState('');
  const [pending] = useState(() => pendingCheck());
  const [attempt, setAttempt] = useState(0);
  const now = useMemo(() => new Date().toISOString(), []);
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
  const findings = useMemo(() => parsed?.mentions.filter((m) => m.audit?.status !== 'note') ?? [], [parsed]);
  const structure = !!parsed && (parsed.order.length > 0 || Object.values(parsed.classes).some((cc) => cc.coverage !== null || cc.visited.length > 0 || cc.plan !== null));
  const unreadable = !!parsed && findings.length === 0 && !structure;
  const stopped = parsed?.stopped ?? null;
  const remaining = useMemo(() => (parsed ? remainingCourses(parsed, audited) : []), [parsed, audited]);
  const stoppedLabel = stopped ? `${stopped.courseId ? (courseById.get(stopped.courseId)?.code ?? '') + ' — ' : ''}${stopped.page}` : null;

  // Judged once per paste, against the planner as it was before anything applied.
  const itemsAtRead = useRef<Item[]>(data.items);
  const judged = useMemo<Judged[]>(() => {
    if (!parsed || unreadable) return [];
    itemsAtRead.current = actions.snapshotItems();
    const items = itemsAtRead.current;
    const bulk = new Set(bulkImports(parsed, audited, (id) => items.filter((i) => i.courseId === id && i.status !== 'done' && dateOf(i.dueAt, tz) >= today).length).flatMap((b) => b.ids));
    const byCourse = new Map(outcomes.map((o) => [o.course.id, o]));
    return parsed.mentions
      .filter((m) => m.audit?.status !== 'note')
      .map((m) => {
        const course = (m.courseId && courseById.get(m.courseId)) || audited[0] || data.courses[0];
        const match = matchMention(m, items, course.id);
        const proposal = proposalFor(m, match, course, tz, today, now);
        return judge(m, course, proposal, match, byCourse.get(course.id), bulk);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, unreadable, outcomes, audited, courseById, tz, today, now]);

  // Auto-apply, once per paste, then record the checks and remember the batch for undo.
  const [applied, setApplied] = useState<{ count: number; lines: string[]; key: AuditParse | null }>({ count: 0, lines: [], key: null });
  const [needs, setNeeds] = useState<NeedLine[]>([]);
  const [polishing, setPolishing] = useState(false);
  const [decided, setDecided] = useState<Record<string, 'done' | 'skipped'>>({});
  const beforeRef = useRef<Item[] | null>(null);
  useEffect(() => {
    if (!parsed || unreadable || applied.key === parsed) return;
    const before = actions.snapshotItems();
    beforeRef.current = before;
    const lines: string[] = [];
    for (const j of judged) {
      if (j.lane !== 'auto') continue;
      lines.push(applyProposal(j.proposal, j.m, actions, tz, today, false, {}, before));
    }
    const after = actions.snapshotItems();
    const batch = diffBatch('Halo check', before, after);
    // A check that changed nothing leaves the previous batch in place, so the last real sync can still be undone.
    if (batch.count) actions.setUndo(batch);
    const skipRows = new Set(judged.flatMap((j) => (j.lane === 'auto' ? [] : [j.m.id])));
    const recs: HaloCheckRecord[] = outcomes
      .filter((o) => o.reached && o.outcome)
      .map((o) => ({ at: new Date().toISOString(), courseId: o.course.id, clean: o.outcome!.clean && (parsed.unread.length ?? 0) === 0, partial: o.outcome!.partial || parsed.unread.length > 0, findings: parsed.mentions.filter((m) => m.courseId === o.course.id && m.audit?.status !== 'note' && skipRows.has(m.id)).length, coverage: o.outcome!.coverage, skipped: o.outcome!.skipped }));
    actions.recordHaloChecks(recs);
    if (stopped && remaining.length > 0 && stoppedLabel) setPendingCheck(remaining.map((c) => c.id), { courseIds: remaining.map((c) => c.id), stoppedAt: stoppedLabel });
    else clearPendingCheck();
    setApplied({ count: lines.length, lines, key: parsed });
    const local = needLines(judged, before, tz);
    setNeeds(local);
    setDecided({});
    const key = loadApiKey();
    if (key && local.length) {
      setPolishing(true);
      const facts = judged.filter((j) => j.lane === 'needs').map((j) => ({ id: j.m.id, classCode: j.course.code, status: j.m.audit?.status ?? j.m.kind, title: j.m.title, note: j.m.note ?? '', quote: j.m.quote, proposal: describeProposal(j.proposal, tz) }));
      polishNeeds({ apiKey: key, lines: local, facts })
        .then((polished) => setNeeds(polished))
        .catch(() => undefined)
        .finally(() => setPolishing(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed, judged]);

  const doLine = (line: NeedLine) => {
    const items = actions.snapshotItems();
    for (const id of line.ids) {
      const j = judged.find((x) => x.m.id === id);
      if (!j) continue;
      if (line.action === 'note' && j.proposal.kind !== 'flag' && j.proposal.kind !== 'score') continue;
      if (j.proposal.kind === 'add' || j.proposal.kind === 'update' || j.proposal.kind === 'remove' || j.proposal.kind === 'flag' || j.proposal.kind === 'score') applyProposal(j.proposal, j.m, actions, tz, today, false, {}, items);
    }
    setDecided((d) => ({ ...d, [line.id]: 'done' }));
    // Approvals from these lines belong to the same batch as the automatic changes.
    if (beforeRef.current) {
      const batch = diffBatch('Halo check', beforeRef.current, actions.snapshotItems());
      if (batch.count) actions.setUndo(batch);
    }
  };
  const skipLine = (line: NeedLine) => setDecided((d) => ({ ...d, [line.id]: 'skipped' }));

  const [details, setDetails] = useState(false);
  const [rows, setRows] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const copyFor = (list: Course[], resumeFrom: string | null) => {
    const prompt = buildAuditPrompt(data.settings.haloAuditPrompt, data, tz, today, list, { resumeFrom });
    void navigator.clipboard?.writeText(prompt).catch(() => undefined);
    window.open(HALO_URL, '_blank', 'noopener');
    setPendingCheck(list.map((c) => c.id), resumeFrom ? { courseIds: list.map((c) => c.id), stoppedAt: resumeFrom } : null);
  };
  const resume = (list: Course[], from: string) => {
    copyFor(list, from);
    onHint(`Copied the audit for the ${list.length} remaining class${list.length === 1 ? '' : 'es'}, picking up at ${from}. Paste it into Claude in Chrome on the Halo tab, then come back and press Check Halo.`);
    onClose();
  };
  const again = () => {
    copyFor(audited, null);
    onHint(`Copied the ${audited.length === 1 ? audited[0].code : 'all-classes'} audit. Paste it into Claude in Chrome on the Halo tab, then come back and press Check Halo.`);
    onClose();
  };

  const title = `Check Halo · ${audited.length === 1 ? audited[0].code : audited.length === data.courses.length ? 'all classes' : `${audited.length} classes`}`;
  const pendingResume = pending?.resume ?? null;
  const resumeList = pendingResume ? pendingResume.courseIds.map((id) => courseById.get(id)).filter((c): c is Course => !!c) : [];
  const incomplete = outcomes.filter((o) => o.reached && o.outcome && (!o.outcome.coverageComplete || o.outcome.missingRows));
  const unreached = outcomes.filter((o) => !o.reached);
  const open = needs.filter((l) => !decided[l.id]);
  const readerNote = read.status === 'failed' ? `Claude couldn't read this (${read.error ?? 'no answer'}), so only pipe-delimited rows were used.` : parsed?.source === 'pipes' && !hasKey ? 'No key on this device, so only pipe-delimited rows were read. Connect the key on Now to have Claude read the whole paste.' : null;

  if (rows && parsed && audited[0]) {
    return (
      <LectureReview
        title={title}
        notes={{ summary: [], concepts: [], mentions: parsed.mentions, model: 'capture', createdAt: now }}
        transcript={text}
        course={audited[0]}
        lectureDate={today}
        dryRun={false}
        decisions={decisions}
        onDecide={(id, d) => setDecisions((s) => ({ ...s, [id]: d }))}
        onClose={() => setRows(false)}
      />
    );
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="modal-body">
        {!parsed && (
          <p className="hint">
            {audited.length === 1 && (
              <>
                <CourseChip course={audited[0]} /> {audited[0].name}.{' '}
              </>
            )}
            Paste what Claude found on the Halo tab. Safe changes go in on their own; you only see what needs you.{' '}
            <button type="button" className="diff-toggle" onClick={onSwitchClass}>
              Different class
            </button>
          </p>
        )}
        {!text.trim() && pendingResume && resumeList.length > 0 && (
          <p className="halo-resume hint">
            The last run stopped at {pendingResume.stoppedAt}. {resumeList.length} class{resumeList.length === 1 ? '' : 'es'} still to check.{' '}
            <button type="button" className="btn small" onClick={() => resume(resumeList, pendingResume.stoppedAt)}>
              Resume from here
            </button>
          </p>
        )}
        {(!parsed || read.status === 'reading') && <textarea className="halo-paste" value={text} onChange={(e) => setText(e.target.value)} rows={8} spellCheck={false} placeholder={'Paste the whole audit, headings, narration and all.'} aria-label="What Claude found" />}
        {read.status === 'reading' && <p className="hint mono halo-reading">Reading the paste…</p>}

        {parsed && unreadable && (
          <section className="halo-summary halo-unreadable" aria-label="Could not read">
            <p className="halo-verdict">Couldn&apos;t read these results.</p>
            <p className="halo-partial">
              Nothing in the paste was recognized as a finding or a coverage line, so nothing was applied and nothing is recorded.
              {read.status === 'failed' ? ` Claude's reading failed: ${read.error}.` : !hasKey ? ' Without a key only pipe-delimited rows can be read; connect the key on Now and paste again.' : ''}
            </p>
            <RawView text={text} parse={parsed} />
          </section>
        )}

        {parsed && !unreadable && applied.key === parsed && (
          <section className="halo-summary" data-source={parsed.source} aria-label="What happened">
            <p className="halo-verdict">
              {applied.count === 0 ? 'Nothing applied.' : `Applied ${applied.count} change${applied.count === 1 ? '' : 's'}.`}{' '}
              {open.length === 0 ? (needs.length ? 'All handled.' : 'Nothing needs you.') : `${open.length} thing${open.length === 1 ? '' : 's'} need${open.length === 1 ? 's' : ''} you:`}
            </p>
            {open.length > 0 && (
              <ul className="halo-needs-list">
                {open.map((l) => (
                  <li key={l.id}>
                    <span>{l.text}</span>
                    <span className="halo-need-actions">
                      {l.action !== 'none' && (
                        <button type="button" className={`btn small ${l.action === 'remove' ? 'danger' : 'primary'}`} onClick={() => doLine(l)}>
                          {l.action === 'add' ? 'Add it' : l.action === 'move' ? 'Move it' : l.action === 'remove' ? 'Remove it' : 'Note it'}
                        </button>
                      )}
                      <button type="button" className="btn small" onClick={() => skipLine(l)}>
                        {l.action === 'none' ? 'OK' : 'Skip'}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {polishing && <p className="hint mono">Wording these more plainly…</p>}
            {(incomplete.length > 0 || unreached.length > 0) && (
              <p className="halo-partial">
                {incomplete.map((o) => `Nothing applied for ${o.course.code}: ${o.outcome!.reason.charAt(0).toLowerCase()}${o.outcome!.reason.slice(1)}`).join(' ')}{incomplete.length ? ' ' : ''}
                {unreached.length > 0 ? `${unreached.map((o) => o.course.code).join(', ')} ${unreached.length === 1 ? "wasn't" : "weren't"} reached.` : ''}
              </p>
            )}
            {readerNote && <p className="hint mono">{readerNote}</p>}
            <p>
              <button type="button" className="diff-toggle" onClick={() => setDetails((d) => !d)}>
                {details ? 'Hide details' : 'See details'}
              </button>
            </p>
            {details && (
              <div className="halo-details">
                <h4 className="rev-group-title">Applied</h4>
                {applied.lines.length ? (
                  <ul className="diff-list">
                    {applied.lines.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="hint">Nothing.</p>
                )}
                <h4 className="rev-group-title">Coverage by class</h4>
                <ul className="diff-list">
                  {outcomes.map((o: ClassOutcome) => (
                    <li key={o.course.id}>
                      {o.course.code}: {!o.reached || !o.outcome ? 'not reached' : `${o.outcome.coverageComplete ? 'complete' : 'incomplete'}${o.outcome.coverage ? ` (${o.outcome.coverage.visited} of ${o.outcome.coverage.planned} pages)` : ''} — ${o.outcome.reason}`}
                    </li>
                  ))}
                </ul>
                <h4 className="rev-group-title">Every finding</h4>
                <p className="hint">
                  {findings.length} finding{findings.length === 1 ? '' : 's'} read.{' '}
                  <button type="button" className="diff-toggle" onClick={() => setRows(true)}>
                    Open the full list
                  </button>
                </p>
                <h4 className="rev-group-title">The paste</h4>
                <RawView text={text} parse={parsed} />
              </div>
            )}
          </section>
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
          {parsed && (unreadable || read.status === 'failed') && hasKey && (
            <button type="button" className="btn" onClick={() => setAttempt((a) => a + 1)}>
              Read again
            </button>
          )}
          {parsed && applied.key === parsed && undo && undo.count > 0 && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                actions.undoLast();
                onHint(`Put back ${undo.count} change${undo.count === 1 ? '' : 's'} from this check.`);
                onClose();
              }}
            >
              Undo this sync
            </button>
          )}
          {!parsed ? (
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
          ) : (
            <button type="button" className="btn primary" onClick={onClose}>
              Done
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
