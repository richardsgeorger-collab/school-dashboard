import { installedVersion } from '../config/extension';

/**
 * Halo's files, through the extension (George, 2026-10-08). The page asks the extension on this computer for the
 * bytes of the assignment's files; the extension mints each download link in the student's own Halo tab (the way the
 * sync reads Halo) and fetches it, which the page itself cannot (the files live on a host that does not answer
 * pages). The first time, Chrome asks the student to allow that host; until they do, the kit lists the files instead.
 */
export type ExtFile = { resourceId: string; name: string; ok: true; type: string | null; bytes: Uint8Array } | { resourceId: string; name: string; ok: false; error: string };
export type ExtFetch = { status: 'no-extension' } | { status: 'need-permission' } | { status: 'busy' } | { status: 'error'; error: string } | { status: 'done'; files: ExtFile[] };

export const KIT_EXTENSION_MIN = '0.6.0';
const cmp = (a: string, b: string): number => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};
/** The extension on this computer can fetch files (0.6.0 and up). */
export const extensionCanFetch = (): boolean => {
  const v = installedVersion();
  return !!v && cmp(v, KIT_EXTENSION_MIN) >= 0;
};

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function fetchViaExtension(files: { resourceId: string; name: string; alts?: string[] }[], onProgress: (note: string) => void, timeoutMs = 120_000): Promise<ExtFetch> {
  if (!extensionCanFetch()) return Promise.resolve({ status: 'no-extension' });
  const requestId = `kit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  onProgress(`Grabbing ${files.length} file${files.length === 1 ? '' : 's'} from Halo…`);
  return new Promise((resolve) => {
    const done = (r: ExtFetch) => {
      window.removeEventListener('message', onMsg);
      window.clearTimeout(t);
      resolve(r);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || !e.data || e.data.requestId !== requestId) return;
      if (e.data.kind === 'halo-kit-progress') return onProgress(String(e.data.note ?? ''));
      if (e.data.kind !== 'halo-kit-files-result') return;
      const d = e.data as { status: string; error?: string; files?: { resourceId: string; name: string; ok: boolean; type?: string | null; base64?: string; error?: string }[] };
      if (d.status === 'need-permission' || d.status === 'busy' || d.status === 'no-extension') return done({ status: d.status });
      if (d.status !== 'done') return done({ status: 'error', error: d.error ?? 'The extension could not fetch the files.' });
      done({ status: 'done', files: (d.files ?? []).map((f) => (f.ok && f.base64 ? { resourceId: f.resourceId, name: f.name, ok: true, type: f.type ?? null, bytes: decode(f.base64) } : { resourceId: f.resourceId, name: f.name, ok: false, error: f.error ?? 'not fetched' })) });
    };
    const t = window.setTimeout(() => done({ status: 'error', error: 'The extension did not answer in time.' }), timeoutMs);
    window.addEventListener('message', onMsg);
    window.postMessage({ kind: 'halo-kit-files', requestId, files }, location.origin);
  });
}

/** Resolves once the student has answered Chrome's permission prompt (opened by the extension), or after a while. */
export function waitForPermission(timeoutMs = 90_000): Promise<boolean> {
  return new Promise((resolve) => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== window || !e.data || e.data.kind !== 'halo-kit-permission') return;
      window.removeEventListener('message', onMsg);
      window.clearTimeout(t);
      resolve(!!e.data.granted);
    };
    const t = window.setTimeout(() => {
      window.removeEventListener('message', onMsg);
      resolve(false);
    }, timeoutMs);
    window.addEventListener('message', onMsg);
  });
}
