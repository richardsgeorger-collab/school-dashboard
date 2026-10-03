import { useEffect, useRef, useState } from 'react';
import '../../extension/celebrate.js';
import { BrandMark } from '../components/BrandMark';
import { Ring } from '../components/Ring';
import { burstAt, joy, setPreviewReducedMotion } from '../joy/JoyHost';
import { CLEAR, HALO_CARD_LINE, MOMENTS, playAll, SAMPLE_WRAP_LINE, type Moment, type PreviewSink } from '../joy/preview';
import { WrapCardView } from '../joy/WrapCard';
import { LevelUp } from './Celebrate';

type HaloCelebrate = (text: string, opts?: { still?: boolean }) => void;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Admin → Celebrations preview (2026-10-02). Plays each reward with sample data, through the same components and
 * builders students see (JoyHost's toast, card and confetti, the Ring, the level-up overlay, the halo mark, the
 * Monday card, and the extension's own confetti file). Preview only: it shows things and nothing else, so no XP,
 * streak, badge or "shown once" flag is written and no push is sent (joy/preview.ts, held by preview.test.ts). It
 * ignores the Celebrations switch so an admin can always see them; the switch here asks for the reduced-motion versions.
 */
export function AdminCelebrations() {
  const [reduced, setReduced] = useState(false);
  const [running, setRunning] = useState(false);
  const [ring, setRing] = useState<{ key: number; value: number; clear: boolean } | null>(null);
  const [level, setLevel] = useState(1);
  const [overlay, setOverlay] = useState<number | null>(null);
  const [wrap, setWrap] = useState(false);
  const [push, setPush] = useState<{ title: string; body: string } | null>(null);
  const stop = useRef(false);
  const timers = useRef<number[]>([]);
  const later = (fn: () => void, ms: number) => void timers.current.push(window.setTimeout(fn, ms));

  useEffect(() => {
    setPreviewReducedMotion(reduced);
    document.documentElement.toggleAttribute('data-preview-reduced', reduced);
  }, [reduced]);
  useEffect(
    () => () => {
      stop.current = true;
      timers.current.forEach(clearTimeout);
      setPreviewReducedMotion(false);
      document.documentElement.removeAttribute('data-preview-reduced');
    },
    [],
  );

  const sink: PreviewSink = {
    say: (e) => joy(e),
    burst: () => {
      const b = document.querySelector('[data-pv="checkoff"]')?.getBoundingClientRect();
      burstAt(b ? b.left + b.width / 2 : innerWidth / 2, b ? b.top + b.height / 2 : innerHeight / 3);
    },
    ring: () => {
      setRing((r) => ({ key: (r?.key ?? 0) + 1, value: 1, clear: false }));
      later(() => setRing((r) => r && { ...r, value: 2 }), 900);
      later(() => {
        setRing((r) => r && { ...r, clear: true });
        joy({ ...CLEAR, preview: true });
      }, 1500);
    },
    level: (n, over, auto) => {
      setLevel(n);
      if (!over) return;
      setOverlay(n);
      if (auto) later(() => setOverlay((o) => (o === n ? null : o)), 1200);
    },
    wrap: () => {
      setWrap(true);
      later(() => setWrap(false), 6000);
    },
    haloCard: (text) => (globalThis as { haloPlusCelebrate?: HaloCelebrate }).haloPlusCelebrate?.(text, { still: reduced }),
    push: (title, body) => setPush({ title, body }),
  };
  const run = (m: Moment) => m.play(sink, { auto: false });
  const all = async () => {
    stop.current = false;
    setRunning(true);
    await playAll(sink, () => stop.current, wait);
    setRunning(false);
  };
  const groups = [...new Set(MOMENTS.map((m) => m.group))];

  return (
    <section className="card settings-card admin-celebrations" aria-label="Celebrations preview">
      <h2 className="section-title">Celebrations preview</h2>
      <p className="hint">Plays each reward right here with sample data. Nothing is saved (no XP, streaks, badges or "shown once" flags) and no push is sent. It ignores the Celebrations switch.</p>
      <div className="pv-bar">
        <button type="button" className="btn primary" onClick={running ? () => (stop.current = true) : () => void all()}>
          {running ? 'Stop' : 'Play all'}
        </button>
        <label className="pv-switch">
          <input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} /> Preview reduced motion
        </label>
      </div>
      {groups.map((g) => (
        <div className="pv-group" key={g}>
          <span className="pv-label">{g}</span>
          <div className="pv-row">
            {MOMENTS.filter((m) => m.group === g).map((m) => (
              <button type="button" className="btn small" key={m.id} data-pv={m.id} onClick={() => run(m)}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="pv-stage" aria-live="polite">
        <div className="pv-item">
          <span className="pv-label">Now ring</span>
          {ring ? (
            <div className="now-ring" data-clear={ring.clear || undefined}>
              <Ring key={ring.key} value={ring.value} max={2} label={`${ring.value} of 2 due today done`} size={56} />
            </div>
          ) : (
            <span className="hint">Play “Ring fills”.</span>
          )}
        </div>
        <div className="pv-item">
          <span className="pv-label">Top-bar halo · level {level}</span>
          <BrandMark level={level} />
        </div>
        {push && (
          <div className="pv-item pv-push">
            <span className="pv-label">The push would say (not sent)</span>
            <b>{push.title}</b>
            <span>{push.body}</span>
          </div>
        )}
        {wrap && <WrapCardView line={SAMPLE_WRAP_LINE} best onDone={() => setWrap(false)} />}
      </div>
      <p className="hint">Confetti on Halo plays over this page with the extension’s own code: “{HALO_CARD_LINE}”.</p>
      {overlay !== null && <LevelUp level={overlay} onClose={() => setOverlay(null)} />}
    </section>
  );
}
