import { useSyncExternalStore } from 'react';
import { newId } from '../domain/ids';
import { recordingsDb, type Chunk, type Recording, type Segment } from './db';
import { BITRATE, FLUSH_MS, MIME } from './support';

export type SpeechState = 'off' | 'listening' | 'restarting' | 'unavailable';

export interface RecorderState {
  phase: 'idle' | 'starting' | 'recording' | 'stopping';
  recording: Recording | null;
  elapsedMs: number;
  bytes: number;
  chunks: number;
  finals: Segment[];
  interim: string;
  speech: SpeechState;
  speechNote: string | null;
  error: string | null;
}

const IDLE: RecorderState = { phase: 'idle', recording: null, elapsedMs: 0, bytes: 0, chunks: 0, finals: [], interim: '', speech: 'off', speechNote: null, error: null };

/* Minimal typing for Chrome's prefixed speech API. */
interface SRResultAlt {
  transcript: string;
}
interface SRResult {
  isFinal: boolean;
  0?: SRResultAlt;
}
interface SREvent {
  resultIndex: number;
  results: ArrayLike<SRResult>;
}
interface SRErrorEvent {
  error?: string;
}
interface SR {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
function speechCtor(): (new () => SR) | null {
  const w = window as unknown as { webkitSpeechRecognition?: new () => SR; SpeechRecognition?: new () => SR };
  return w.webkitSpeechRecognition ?? w.SpeechRecognition ?? null;
}

const warnUnload = (e: BeforeUnloadEvent) => {
  e.preventDefault();
  e.returnValue = '';
};

/**
 * One recorder for the whole app, so switching tabs mid-lecture does not stop it.
 * Audio chunks and final transcript segments are written to IndexedDB as they arrive.
 */
class Recorder {
  state: RecorderState = IDLE;
  private listeners = new Set<() => void>();
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private sr: SR | null = null;
  private current: Recording | null = null;
  private t0 = 0;
  private chunkSeq = 0;
  private segSeq = 0;
  private bytes = 0;
  private finals: Segment[] = [];
  private stopping = false;
  private timer: number | null = null;
  private restartTimer: number | null = null;
  private speechErrors = 0;
  private writes: Promise<unknown> = Promise.resolve();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;

  private patch(p: Partial<RecorderState>) {
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l();
  }

  private queue(work: () => Promise<unknown>) {
    this.writes = this.writes.then(work).catch(() => undefined);
  }

  async start(courseId: string, title: string): Promise<void> {
    if (this.current) return;
    this.patch({ ...IDLE, phase: 'starting' });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: true } });
    } catch {
      this.patch({ phase: 'idle', error: 'Microphone access was denied. Allow the microphone for this site in Chrome, then try again.' });
      return;
    }
    const recording: Recording = {
      id: newId(),
      courseId,
      title,
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: 'recording',
      durationMs: 0,
      bytes: 0,
      mimeType: MIME,
      chunkCount: 0,
      segmentCount: 0,
      audioDeleted: false,
      notes: null,
      processedAt: null,
      review: {},
    };
    try {
      await recordingsDb.put(recording);
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      this.patch({ phase: 'idle', error: `Could not open storage: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }
    void recordingsDb.persist();

    const rec = new MediaRecorder(stream, { mimeType: MIME, audioBitsPerSecond: BITRATE });
    this.rec = rec;
    this.stream = stream;
    this.current = recording;
    this.t0 = Date.now();
    this.chunkSeq = 0;
    this.segSeq = 0;
    this.bytes = 0;
    this.finals = [];
    this.stopping = false;
    this.speechErrors = 0;
    rec.ondataavailable = (e: BlobEvent) => {
      if (!e.data || e.data.size === 0 || !this.current) return;
      const chunk: Chunk = { recordingId: this.current.id, seq: ++this.chunkSeq, at: Date.now() - this.t0, blob: e.data };
      this.bytes += e.data.size;
      const snapshot: Recording = { ...this.current, bytes: this.bytes, chunkCount: this.chunkSeq, segmentCount: this.segSeq, durationMs: Date.now() - this.t0 };
      this.current = snapshot;
      this.queue(() => recordingsDb.addChunk(chunk).then(() => recordingsDb.put(snapshot)));
      this.patch({ bytes: this.bytes, chunks: this.chunkSeq });
    };
    rec.onerror = () => this.patch({ error: 'The recorder hit an error. Stop now; everything flushed so far is saved.' });
    rec.start(FLUSH_MS);
    this.timer = window.setInterval(() => this.patch({ elapsedMs: Date.now() - this.t0 }), 500);
    window.addEventListener('beforeunload', warnUnload);
    this.patch({ phase: 'recording', recording, speech: 'off' });
    this.startSpeech();
  }

  private startSpeech() {
    const Ctor = speechCtor();
    if (!Ctor) {
      this.patch({ speech: 'unavailable', speechNote: 'No live speech recognition in this browser. Audio still records.' });
      return;
    }
    const sr = new Ctor();
    sr.continuous = true;
    sr.interimResults = true;
    sr.lang = 'en-US';
    sr.maxAlternatives = 1;
    sr.onstart = () => {
      this.speechErrors = 0;
      this.patch({ speech: 'listening' });
    };
    sr.onresult = (e) => {
      if (!this.current) return;
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0]?.transcript?.trim();
        if (!text) continue;
        if (res.isFinal) {
          const seg: Segment = { recordingId: this.current.id, seq: ++this.segSeq, at: Date.now() - this.t0, text };
          this.finals = [...this.finals, seg];
          this.queue(() => recordingsDb.addSegment(seg));
        } else interim += (interim ? ' ' : '') + text;
      }
      this.patch({ finals: this.finals, interim });
    };
    sr.onerror = (e) => {
      const code = e?.error;
      if (code === 'not-allowed' || code === 'service-not-allowed') {
        this.sr = null;
        this.patch({ speech: 'unavailable', speechNote: 'Speech recognition was blocked. Audio still records.' });
        return;
      }
      if (code === 'network') {
        this.speechErrors++;
        this.patch({ speechNote: 'Speech recognition lost its connection and is retrying. Audio still records.' });
      }
      /* no-speech and aborted fall through to onend, which restarts */
    };
    sr.onend = () => {
      if (this.stopping || !this.current || this.sr !== sr) return;
      this.patch({ speech: 'restarting', interim: '' });
      const delay = Math.min(300 * 2 ** this.speechErrors, 10_000);
      this.restartTimer = window.setTimeout(() => {
        if (this.stopping || !this.current) return;
        try {
          sr.start();
        } catch {
          this.startSpeech();
        }
      }, delay);
    };
    this.sr = sr;
    try {
      sr.start();
    } catch {
      this.patch({ speech: 'unavailable', speechNote: 'Speech recognition could not start. Audio still records.' });
    }
  }

  async stop(): Promise<Recording | null> {
    const rec = this.rec;
    const recording = this.current;
    if (!rec || !recording) return null;
    this.stopping = true;
    this.patch({ phase: 'stopping' });
    if (this.timer) clearInterval(this.timer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    const sr = this.sr;
    this.sr = null;
    try {
      sr?.stop();
    } catch {
      /* already stopped */
    }
    await new Promise<void>((res) => {
      rec.onstop = () => res();
      if (rec.state !== 'inactive') rec.stop();
      else res();
    });
    await this.writes;
    this.stream?.getTracks().forEach((t) => t.stop());
    window.removeEventListener('beforeunload', warnUnload);
    const final: Recording = {
      ...(this.current ?? recording),
      status: 'done',
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - this.t0,
      bytes: this.bytes,
      chunkCount: this.chunkSeq,
      segmentCount: this.segSeq,
    };
    await recordingsDb.put(final);
    this.rec = null;
    this.stream = null;
    this.current = null;
    this.stopping = false;
    this.patch({ ...IDLE });
    return final;
  }
}

export const recorder = new Recorder();

export function useRecorder(): RecorderState {
  return useSyncExternalStore(recorder.subscribe, recorder.getState, recorder.getState);
}
