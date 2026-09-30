import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isChunkError } from '../monitor/install';
import { report } from '../monitor/report';

/**
 * Nothing in the app is allowed to blank the screen. A render error inside the boundary shows its fallback: an
 * inline line where the piece is small (the sync sheet), or the last-resort card with Reload around the whole app.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback: (error: Error, reset: () => void) => ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Halo+ caught a render error:', error);
    // Reported (monitor/report.ts): the screen, the message, the stack and which components it was drawing.
    if (!isChunkError(error)) report({ kind: 'crash', title: `Screen crashed: ${error.message.split('\n')[0].slice(0, 100)}`, message: error.message, stack: `${error.stack ?? ''}\n--- components ---${(info.componentStack ?? '').split('\n').slice(0, 12).join('\n')}` });
  }
  render() {
    if (this.state.error) return this.fallback(this.state.error);
    return this.props.children;
  }
  private fallback(error: Error) {
    return this.props.fallback(error, () => this.setState({ error: null }));
  }
}

/** The last resort: the whole app failed to draw. Reload keeps every local record; nothing is lost. */
export function AppFailed({ error }: { error: Error }) {
  return (
    <div className="app-failed" role="alert">
      <div className="card app-failed-card">
        <p className="eyebrow">Something broke</p>
        <h1 className="calm-title">This screen could not draw.</h1>
        <p className="hint">Your classes and work are safe on this device and in your account. Reload and it should come back; if it keeps happening, send the line below from You, Feedback.</p>
        <code className="gap-err">{error.message}</code>
        <div className="settings-actions">
          <button type="button" className="btn primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
