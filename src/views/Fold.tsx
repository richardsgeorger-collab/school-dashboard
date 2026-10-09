import { useState, type ReactNode } from 'react';

const KEY = 'school-dashboard:sheet-folds';

const read = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
};

/** A section of the assignment sheet that is closed by default and remembers, on this device, whether it was opened. */
export function Fold({ name, summary, children, defaultOpen = false }: { name: string; summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(() => read()[name] ?? defaultOpen);
  const toggle = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...read(), [name]: next }));
    } catch {
      /* storage unavailable */
    }
  };
  return (
    <details className="fold" data-fold={name} open={open} onToggle={(e) => toggle((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="fold-head">{summary}</summary>
      <div className="fold-body">{children}</div>
    </details>
  );
}
