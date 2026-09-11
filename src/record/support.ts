/** Recording is built for Chrome on the MacBook. Everything else gets told so, up front. */
export const MIME = 'audio/webm;codecs=opus';
export const BITRATE = 24_000;
/** Audio and transcript are written to IndexedDB this often, so a closed tab loses at most this much. */
export const FLUSH_MS = 10_000;

export interface Support {
  /** All four capabilities present. */
  ok: boolean;
  chrome: boolean;
  mediaRecorder: boolean;
  opus: boolean;
  speech: boolean;
  indexedDb: boolean;
  /** Plain-language reason when something is missing or untested, else null. */
  reason: string | null;
}

export interface Probe {
  userAgent?: string;
  brands?: string[];
  hasMediaRecorder: boolean;
  opus: boolean;
  hasSpeech: boolean;
  hasIdb: boolean;
}

export function evaluateSupport(p: Probe): Support {
  const ua = p.userAgent ?? '';
  const chrome = (p.brands ?? []).some((b) => /Google Chrome/i.test(b)) || (/Chrome\//.test(ua) && !/Edg\/|OPR\/|Brave|Vivaldi/.test(ua));
  const ok = p.hasMediaRecorder && p.opus && p.hasSpeech && p.hasIdb;
  let reason: string | null = null;
  if (!p.hasMediaRecorder || !p.opus) reason = 'This browser cannot record Opus audio. Use Chrome on the MacBook.';
  else if (!p.hasSpeech) reason = 'This browser has no live speech recognition. Use Chrome on the MacBook.';
  else if (!p.hasIdb) reason = 'Storage is unavailable here, maybe a private window. Recordings need IndexedDB.';
  else if (!chrome) reason = 'Built and tested for Chrome on the MacBook. This browser may record, but transcription is untested.';
  return { ok, chrome, mediaRecorder: p.hasMediaRecorder, opus: p.opus, speech: p.hasSpeech, indexedDb: p.hasIdb, reason };
}

export function detectSupport(): Support {
  const w = window as unknown as Record<string, unknown>;
  const nav = navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } };
  const hasMediaRecorder = typeof MediaRecorder !== 'undefined';
  return evaluateSupport({
    userAgent: navigator.userAgent,
    brands: nav.userAgentData?.brands?.map((b) => b.brand),
    hasMediaRecorder,
    opus: hasMediaRecorder && MediaRecorder.isTypeSupported(MIME),
    hasSpeech: 'webkitSpeechRecognition' in w || 'SpeechRecognition' in w,
    hasIdb: typeof indexedDB !== 'undefined',
  });
}
