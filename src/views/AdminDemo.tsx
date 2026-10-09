import { DEMO_STUDENT, isDemo } from '../demo/demo';
import { enterDemo, leaveDemo } from '../demo/DemoHost';

/**
 * Admin → Demo mode (George, 2026-10-08): the student market table. One button loads Maya Torres, a made-up GCU
 * freshman, onto this device; the chip in the top bar plays the wow moments and leaves. Her data stays on this
 * device under its own keys and never reaches the server (demo/demo.ts).
 */
export function AdminDemo() {
  const on = isDemo();
  return (
    <section className="card settings-card" aria-label="Demo mode">
      <h2 className="section-title">Demo mode</h2>
      <p className="hint">
        {on
          ? `${DEMO_STUDENT} is loaded on this device. Her classes are made up and stay here; nothing goes to the server. Load again to start her over for the next visitor.`
          : `Loads ${DEMO_STUDENT}, a made-up GCU freshman, onto this device: six classes, a due date found in an announcement, Calculus in the red, a grade that went up, and "since you last looked". Your own planner comes back when you leave.`}
      </p>
      <div className="settings-actions">
        <button type="button" className="btn small primary" onClick={enterDemo}>
          {on ? 'Start her over' : 'Load the demo student'}
        </button>
        {on && (
          <button type="button" className="btn small" onClick={leaveDemo}>
            Leave the demo
          </button>
        )}
      </div>
      {!on && <p className="hint">Then press ▶ Play the wow moments in the top bar: the announcement on the assignment, a check-off with confetti, the class progress, the Cooked meter, and Ask.</p>}
    </section>
  );
}
