import { useMemo, useState } from 'react';
import { useCourseColor } from '../../components/CourseChip';
import { SegmentedControl } from '../../components/SegmentedControl';
import { monthKey, shiftMonth } from '../../domain/calendar';
import { addDays, fmtDate, fmtMonth, weekStart } from '../../domain/dates';
import type { Course, Item } from '../../domain/types';
import { useRoute } from '../../router';
import { useStore } from '../../storage/store';
import { ItemDetail } from '../ItemDetail';
import { AgendaView } from './AgendaView';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { useFilteredItems } from './shared';

type View = 'month' | 'week' | 'agenda';

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
  const view = (['month', 'week', 'agenda'].includes(params.get('v') ?? '') ? params.get('v') : 'month') as View;
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(params.get('d') ?? '') ? params.get('d')! : today;
  const filterParam = params.get('c');
  const codes = useMemo(() => (filterParam ? new Set(filterParam.split(',')) : null), [filterParam]);
  const items = useFilteredItems(codes);
  const [open, setOpen] = useState<Item | null>(null);

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
  const title =
    view === 'month' ? fmtMonth(`${month}-01`) : view === 'week' ? `${fmtDate(wkStart, 'short')} – ${fmtDate(addDays(wkStart, 6), 'short')}` : `From ${fmtDate(anchor, 'long')}`;

  const step = (n: number) => {
    if (view === 'month') set({ d: `${shiftMonth(month, n)}-01` });
    else if (view === 'week') set({ d: addDays(wkStart, 7 * n) });
    else set({ d: addDays(anchor, 7 * n) });
  };

  const toggleCourse = (code: string) => {
    const all = data.courses.map((c) => c.code);
    const current = codes ? [...codes] : all;
    const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code];
    set({ c: next.length === all.length || next.length === 0 ? null : next.join(',') });
  };

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
        </div>
      </div>
      <div className="cal-controls">
        <SegmentedControl
          label="Calendar view"
          value={view}
          options={[
            { value: 'month', label: 'Month' },
            { value: 'week', label: 'Week' },
            { value: 'agenda', label: 'Agenda' },
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
        {view === 'month' && <MonthView month={month} items={items} onOpen={setOpen} />}
        {view === 'week' && <WeekView start={wkStart} items={items} onOpen={setOpen} />}
        {view === 'agenda' && <AgendaView from={anchor} items={items} onOpen={setOpen} />}
      </div>
      {open && <ItemDetail key={open.id} item={open} onClose={() => setOpen(null)} />}
    </>
  );
}
