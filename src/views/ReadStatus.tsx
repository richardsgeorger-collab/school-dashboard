import { useAccount } from '../auth/AccountContext';
import { Locked } from '../config/Locked';
import { dateOf, fmtDate } from '../domain/dates';
import { autoResultLine } from '../halo/autoRead';
import { readBacklog, useReadStatus } from '../halo/backgroundRead';
import { useStore } from '../storage/store';

/** One tap that reads whatever is waiting, with the reader's own approval. Shared by the Inbox, Now and the review. */
export function useReadNow(): () => void {
  const { data, actions } = useStore();
  const { tier } = useAccount();
  return () => void readBacklog({ items: data.items, courses: data.courses, tier, tz: data.settings.timezone, upsertItem: actions.upsertItem, upsertCourse: actions.upsertCourse, approved: true });
}

/** Where the background read is: reading, waiting for a yes, or what the last run did. Nothing when idle. */
export function ReadStatusLines({ compact = false }: { compact?: boolean }) {
  const s = useReadStatus();
  const { data } = useStore();
  const tz = data.settings.timezone;
  const readNow = useReadNow();
  if (s.running && s.progress) {
    return (
      <p className="hint pull-tally" role="status">
        Reading {s.progress.why} announcement {s.progress.done} of {s.progress.total}
        {compact ? '' : `: “${s.progress.title}”`}…
      </p>
    );
  }
  if (s.waiting) {
    return (
      <p className="hint diff-gap" role="status">
        {s.waiting.line} Until they are read I do not know what they ask.{' '}
        <button type="button" className="btn small primary" onClick={readNow}>
          Read {s.waiting.count} now
        </button>
      </p>
    );
  }
  const o = s.outcome;
  if (!o) return null;
  const line = autoResultLine(o);
  if (!line) return null;
  // A plan without reading: the locked card says what reading does and carries the trial, once.
  if (o.locked && !o.noKey) {
    return compact ? (
      <Locked feature="announcementAI" tier="free" compact>
        {null}
      </Locked>
    ) : (
      <p className="hint diff-gap" role="status">
        {line}
      </p>
    );
  }
  return (
    <p className={o.failed > 0 || o.noKey || o.ledgerError ? 'hint diff-gap' : 'hint pull-tally'} role="status">
      {line}
      {!compact && o.plan.added.length > 0 && (
        <>
          <br />
          {o.plan.added.map((i) => i.label).join(', ')} {o.plan.added.length === 1 ? 'is' : 'are'} on your agenda now, from an announcement.
        </>
      )}
      {!compact && o.plan.moved.length > 0 && (
        <>
          <br />
          {o.plan.moved.map((m) => `${m.item.label}: ${fmtDate(dateOf(m.from, tz), 'short')} → ${fmtDate(dateOf(m.to, tz), 'short')}`).join(' · ')}
        </>
      )}
    </p>
  );
}
