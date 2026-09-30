import { dateOf, fmtDate, fmtTime } from '../domain/dates';
import { haloLink } from '../domain/heroFacts';
import type { Item } from '../domain/types';
import { useStore } from '../storage/store';

const KIND_WORDS = { announcement: 'an announcement', syllabus: 'the syllabus', lecture: 'a lecture', manual: 'you' } as const;

/** Where this item came from and when it last matched Halo. Every item says its source; nothing appears from nowhere. */
export function SourceBlock({ item }: { item: Item }) {
  const { data, courseById } = useStore();
  const tz = data.settings.timezone;
  const course = courseById.get(item.courseId);
  // A class synced before per-class stamps existed counts as synced with the account's last sync.
  const pulled = data.settings.haloPulls?.[item.courseId]?.assessments ?? (course?.haloClassId ? (data.settings.lastPull?.at ?? null) : null);
  const stamp = (at: string) => `${fmtDate(dateOf(at, tz), 'short')} ${fmtTime(at, tz)}`;
  const from = item.source === 'halo' ? 'Halo' : item.source === 'ics' ? 'a calendar export' : item.source === 'parsed' ? `the ${course?.code ?? ''} syllabus` : 'you';
  const matched = item.source === 'halo' ? (item.halo?.checkedAt ? ` · matched Halo ${stamp(item.halo.checkedAt)}` : pulled ? ` · synced ${stamp(pulled)}` : ' · not synced since it was added') : '';
  const status = item.halo?.status ? ` · Halo says ${item.halo.status.toLowerCase().split('_').join(' ')}` : '';
  return (
    <div className="source-block" aria-label="Source">
      <p>
        <b>From {from}</b>
        {matched}
        {status}
      </p>
      {item.origin && item.origin.kind !== 'manual' && (
        <p>
          Added from {KIND_WORDS[item.origin.kind]}
          {item.origin.title ? ` “${item.origin.title}”` : ''}
          {item.origin.at ? ` on ${fmtDate(dateOf(item.origin.at, tz), 'short')}` : ''}.{item.origin.quote && <span className="source-quote"> “{item.origin.quote}”</span>}
        </p>
      )}
      {item.dateChange && (
        <p>
          Moved from {fmtDate(dateOf(item.dateChange.from, tz), 'short')}
          {item.dateChange.source.title ? ` by “${item.dateChange.source.title}”` : ''} on {fmtDate(dateOf(item.dateChange.at, tz), 'short')}.
        </p>
      )}
      {(item.url || item.haloId) && (
        <p>
          <a href={haloLink(item, course).href} target="_blank" rel="noreferrer">
            Open in Halo
          </a>
        </p>
      )}
    </div>
  );
}
