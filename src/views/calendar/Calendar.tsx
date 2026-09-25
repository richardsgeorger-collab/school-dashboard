import { useMemo, useState } from 'react';
import { useCourseColor } from '../../components/CourseChip';
import { SegmentedControl } from '../../components/SegmentedControl';
import { monthKey, shiftMonth } from '../../domain/calendar';
import { addDays, fmtDate, fmtMonth, weekStart } from '../../domain/dates';
import type { Course, Item } from '../../domain/types';
import { useRoute } from '../../router';
import { useStore } from '../../storage/store';
import { IconPlus } from '../../components/Icons';
import { blankItem, ItemDetail } from '../ItemDetail';
import { EmptyState } from '../../components/EmptyState';
import { syncPress } from '../../ui/presses';

import { AgendaView } from './AgendaView';
import { MonthView } from './MonthView';
import { WeekStrip } from './WeekStrip';
import { useFilteredItems } from './shared';

/** Agenda is the calendar. Month is the map. There is no Week: the seven-day strip on the agenda is what that was for. */
type View = 'agenda' | 'month';

const isDay = (s: string | null): s is string => !!s && s.length === 10 && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));

function FilterChip({ course, active, onToggle }: { course: Course; active: boolean; onToggle: () => void }) {
  const color = useCourseColor(course);
  return (
    <button type="button" className="filter-chip" aria-pressed={active} onClick={onToggle} style={{ '--course': color } as React.CSSProperties}>
      <span className="dot" />
      {course.code}
    </button>
  );
}

export function Calendar() {
  const { data, today } = useStore();
  const { params, navigate } = useRoute();
  const view: View = params.get('v') === 'month' ? 'month' : 'agenda';
  const anchor = isDay(params.get('d')) ? params.get('d')! : today;
  const filterParam = params.get('c');
  const codes = useMemo(() => (filterParam ? new Set(filterParam.split(',')) : null), [filterParam]);
  const items = useFilteredItems(codes);
  const [open, setOpen] = useState<{ item: Item; isNew: boolean } | null>(null);
  const openItem = (item: Item) => setOpen({ item, isNew: false });

  const set = (patch: Partial<{ v: View; d: string; c: string | null }>) => {
    const next: Record<string, string> = { v: view, d: anchor };
    if (filterParam) next.c = filterParam;
    for (const [k, val] of Object.entries(patch)) {
      if (val === null || val === undefined) delete next[k];
      else next[k] = val;
    }
    navigate('calendar', next);
  };

  const month = monthKey(anchor);
  const wkStart = weekStart(anchor, data.settings.weekStartsOn);
  const title = view === 'month' ? fmtMonth(`${month}-01`) : anchor === today ? 'Agenda' : `From ${fmtDate(anchor, 'long')}`;

  const step = (n: number) => {
    if (view === 'month') set({ d: `${shiftMonth(month, n)}-01` });
    else set({ d: addDays(wkStart, 7 * n) });
  };

  const toggleCourse = (code: string) => {
    const all = data.courses.map((c) => c.code);
    const current = codes ? [...codes] : all;
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    set({ c: next.length === all.length || next.length === 0 ? null : next.join(',') });
  };

  if (data.courses.length === 0) {
    return (
      <>
        <h1 className="page-title">Calendar</h1>
        <EmptyState>
          <p>
            <b>Your deadlines will land here.</b>
          </p>
          <p>Sync Halo once and every assignment, quiz and discussion shows up by day, with the time it takes.</p>
          <p className="empty-actions">
            <button type="button" className="btn primary" onClick={() => syncPress.current?.()}>
              Sync Halo
            </button>
            <a className="btn" href="#/you?s=classes">
              Add a class by hand
            </a>
          </p>
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <div className="cal-toolbar">
        <h1 className="page-title cal-title">{title}</h1>
        <div className="cal-nav">
          <button type="button" className="btn small" onClick={() => step(-1)} aria-label="Previous">
            ‹
          </button>
          <button type="button" className="btn small" onClick={() => set({ d: today })}>
            Today
          </button>
          <button type="button" className="btn small" onClick={() => step(1)} aria-label="Next">
            ›
          </button>
          <button
            type="button"
            className="btn small primary"
            aria-label="Add item"
            onClick={() => setOpen({ item: blankItem(data.courses[0]?.id ?? '', data.settings.timezone, today), isNew: true })}
          >
            <IconPlus />
          </button>
        </div>
      </div>

      <div className="cal-controls">
        <SegmentedControl
          label="Calendar view"
          value={view}
          options={[
            { value: 'agenda', label: 'Agenda' },
            { value: 'month', label: 'Month' },
          ]}
          onChange={(v) => set({ v })}
        />
        <div className="filter-chips">
          {data.courses.map((c) => (
            <FilterChip key={c.id} course={c} active={!codes || codes.has(c.code)} onToggle={() => toggleCourse(c.code)} />
          ))}
        </div>
      </div>
      <div className="cal-body">
        {view === 'agenda' && (
          <>
            <WeekStrip start={wkStart} selected={anchor} items={items} onPick={(d) => set({ d })} />
            <AgendaView from={anchor} items={items} onOpen={openItem} />
          </>
        )}
        {view === 'month' && <MonthView month={month} items={items} onOpen={openItem} />}
      </div>
      {open && <ItemDetail key={open.item.id} item={open.item} isNew={open.isNew} onClose={() => setOpen(null)} />}
    </>
  );
}
