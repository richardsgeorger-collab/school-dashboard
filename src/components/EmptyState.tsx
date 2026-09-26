import { Illustration, type Art } from './Illustration';

/** A sentence, one button, and a small drawing: an empty screen reads as a pause, never as an error. */
export function EmptyState({ children, art }: { children: React.ReactNode; art?: Art }) {
  return (
    <div className="empty">
      {art && <Illustration art={art} />}
      {children}
    </div>
  );
}
