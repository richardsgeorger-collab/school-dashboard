import { useEffect } from 'react';
import { acceptHandoff, HALO_ORIGIN } from './handoff';
import type { HaloExport } from './types';

/** Origins a Halo export may arrive from. Only Halo itself in production; the dev server too while developing. */
export function allowedSenders(): string[] {
  return import.meta.env.DEV ? [HALO_ORIGIN, window.location.origin] : [HALO_ORIGIN];
}

/** Listen for the bookmark's postMessage and acknowledge it so the Halo tab stops resending. */
export function useHaloHandoff(onPayload: (p: HaloExport) => void): void {
  useEffect(() => {
    const allowed = allowedSenders();
    const handler = (e: MessageEvent) => {
      const payload = acceptHandoff(e, allowed);
      if (!payload) return;
      try {
        (e.source as WindowProxy | null)?.postMessage({ kind: 'halo-received', exportedAt: payload.exportedAt }, e.origin);
      } catch {
        /* the sender may already be gone */
      }
      onPayload(payload);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onPayload]);
}
