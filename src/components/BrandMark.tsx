import { IconHalo } from './Icons';

/** The top bar's halo: a little thicker and brighter at each of eight level steps (joy.css). */
export function BrandMark({ level }: { level: number }) {
  return (
    <span className="brand-mark" aria-hidden data-level-step={Math.min(8, Math.max(1, level))} title={`Level ${level}`}>
      <IconHalo />
    </span>
  );
}
