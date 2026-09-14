import { useStore } from '../storage/store';

/** "Move to" another class. Shown only when there is somewhere to move to. */
export function MoveSelect({ courseId, onMove, label }: { courseId: string; onMove: (courseId: string) => void; label: string }) {
  const { data } = useStore();
  if (data.courses.length < 2 && data.courses.some((c) => c.id === courseId)) return null;
  const known = data.courses.some((c) => c.id === courseId);
  return (
    <select
      className="deck-link"
      value={known ? courseId : ''}
      aria-label={label}
      onChange={(e) => {
        if (e.target.value && e.target.value !== courseId) onMove(e.target.value);
      }}
    >
      {!known && <option value="">Move to…</option>}
      {data.courses.map((c) => (
        <option key={c.id} value={c.id}>
          {known ? (c.id === courseId ? `In ${c.code}` : `Move to ${c.code}`) : c.code}
        </option>
      ))}
    </select>
  );
}
