import { useEffect, useRef, useState } from 'react';

/** A title that turns into a text box when clicked. Enter or blur saves; Escape cancels. */
export function InlineTitle({ value, onSave, className = 'rec-card-title', label = 'Rename' }: { value: string; onSave: (v: string) => void; className?: string; label?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== value) onSave(v);
  };
  if (!editing) {
    return (
      <button type="button" className={`${className} inline-title`} title={`${label}: ${value}`} onClick={() => setEditing(true)}>
        {value}
      </button>
    );
  }
  return (
    <input
      ref={ref}
      className="inline-title-input"
      value={draft}
      aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
}
