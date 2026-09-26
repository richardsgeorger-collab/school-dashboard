import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../components/Modal';
import { CourseChip } from '../components/CourseChip';
import { dateOf, fmtDate } from '../domain/dates';
import type { Item } from '../domain/types';
import { useRoute, type Route } from '../router';
import { useStore } from '../storage/store';
import { syncPress } from '../ui/presses';
import { bump } from '../analytics/usage';
import { ItemDetail } from './ItemDetail';
import { QuickCapture } from './QuickCapture';

type Hit = { id: string; kind: 'screen' | 'class' | 'item' | 'action' | 'capture'; label: string; meta?: string; run: () => void; course?: string };

const SCREENS: { route: Route; label: string; words: string }[] = [
  { route: 'now', label: 'Now', words: 'now today home' },
  { route: 'calendar', label: 'Calendar', words: 'calendar agenda month week' },
  { route: 'classes', label: 'Classes', words: 'classes courses' },
  { route: 'inbox', label: 'Inbox', words: 'inbox announcements messages' },
  { route: 'you', label: 'You', words: 'you settings account plan profile' },
  { route: 'load', label: 'Workload', words: 'load workload hours weeks' },
  { route: 'grades', label: 'Grades', words: 'grades gpa' },
  { route: 'ai', label: 'Coach', words: 'coach tutor ai ask' },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const matches = (hay: string, q: string) => {
  const h = norm(hay);
  return q.split(' ').every((w) => h.includes(w));
};

/**
 * ⌘K. One box: type a few letters to jump to a screen, a class or an assignment, sync, switch the theme, or add
 * something. Anything that matches nothing becomes a quick capture ("chem quiz moved to friday").
 */
export function Palette({ onClose }: { onClose: () => void }) {
  const { data, actions } = useStore();
  const { navigate } = useRoute();
  const tz = data.settings.timezone;
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState<Item | null>(null);
  const [capture, setCapture] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const hits = useMemo<Hit[]>(() => {
    const query = norm(q);
    const out: Hit[] = [];
    const go = (route: Route, params?: Record<string, string>) => () => {
      navigate(route, params);
      onClose();
    };
    if (!query) {
      out.push({ id: 'sync', kind: 'action', label: 'Sync from Halo', run: () => { onClose(); syncPress.current?.(); } });
      out.push({ id: 'add', kind: 'action', label: 'Add something', meta: 'quick capture', run: () => setCapture('') });
      out.push({ id: 'theme', kind: 'action', label: 'Switch theme', run: () => { actions.updateSettings({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }); onClose(); } });
      for (const s of SCREENS.slice(0, 5)) out.push({ id: `s:${s.route}`, kind: 'screen', label: s.label, run: go(s.route) });
      return out;
    }
    for (const s of SCREENS) if (matches(`${s.label} ${s.words}`, query)) out.push({ id: `s:${s.route}`, kind: 'screen', label: s.label, meta: 'screen', run: go(s.route) });
    if (matches('sync from halo', query)) out.push({ id: 'sync', kind: 'action', label: 'Sync from Halo', run: () => { onClose(); syncPress.current?.(); } });
    if (matches('switch theme dark light', query)) out.push({ id: 'theme', kind: 'action', label: 'Switch theme', run: () => { actions.updateSettings({ theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' }); onClose(); } });
    for (const c of data.courses) if (matches(`${c.code} ${c.name}`, query)) out.push({ id: `c:${c.id}`, kind: 'class', label: c.name, meta: c.code, course: c.id, run: go('class', { c: c.id }) });
    const items = data.items
      .filter((i) => i.status !== 'done' && matches(`${i.label} ${i.title} ${data.courses.find((c) => c.id === i.courseId)?.code ?? ''}`, query))
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
      .slice(0, 8);
    for (const i of items) out.push({ id: `i:${i.id}`, kind: 'item', label: i.label, meta: `due ${fmtDate(dateOf(i.dueAt, tz), 'short')}`, course: i.courseId, run: () => setOpen(i) });
    out.push({ id: 'capture', kind: 'capture', label: `Add: “${q.trim()}”`, meta: 'quick capture', run: () => setCapture(q) });
    return out.slice(0, 12);
  }, [q, data.courses, data.items, tz, navigate, onClose, actions]);

  useEffect(() => setCursor(0), [q]);

  if (capture !== null) return <QuickCapture initial={capture} onClose={onClose} />;
  if (open) return <ItemDetail key={open.id} item={open} onClose={onClose} />;

  const pick = (h: Hit) => {
    bump(`palette:${h.kind}`);
    h.run();
  };
  return (
    <Modal title="Go to" onClose={onClose}>
      <div className="modal-body palette">
        <input
          ref={input}
          className="capture-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="A class, an assignment, a screen, or something to add…"
          aria-label="Search"
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(hits.length - 1, c + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
            else if (e.key === 'Enter' && hits[cursor]) { e.preventDefault(); pick(hits[cursor]); }
          }}
        />
        <ul className="palette-list" role="listbox">
          {hits.map((h, i) => (
            <li key={h.id}>
              <button type="button" className="palette-row" role="option" aria-selected={i === cursor} onMouseEnter={() => setCursor(i)} onClick={() => pick(h)}>
                {h.course ? <CourseChip course={data.courses.find((c) => c.id === h.course)} /> : <span className="palette-kind">{h.kind === 'screen' ? 'Go' : h.kind === 'action' ? 'Do' : h.kind === 'capture' ? 'Add' : ''}</span>}
                <span className="palette-label">{h.label}</span>
                {h.meta && <span className="palette-meta">{h.meta}</span>}
              </button>
            </li>
          ))}
        </ul>
        <p className="hint">
          ↑↓ to move, ⏎ to open, esc to close. On Now: <kbd>d</kbd> done, <kbd>n</kbd> not today, <kbd>s</kbd> start, <kbd>o</kbd> open.
        </p>
      </div>
    </Modal>
  );
}
