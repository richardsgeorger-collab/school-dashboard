import { getAccessToken } from '../auth/client';
import { reportFunctionFailure } from '../monitor/report';
import { ENV } from '../env';

/**
 * Lecture recordings to text. The file (MP4, M4A, MP3, WAV) is decoded in the browser, which also pulls the sound out
 * of a video, resampled to 16 kHz mono (what the speech model hears anyway), cut into 5-minute WAV pieces, and each
 * piece goes to the `transcribe` function, three at a time. The text that comes back is joined in order and then
 * handled exactly like a pasted transcript.
 */
export const ACCEPT = '.mp4,.m4a,.mp3,.wav,audio/mp4,audio/x-m4a,audio/mpeg,audio/wav,audio/x-wav,video/mp4';
export const RATE = 16_000;
export const PIECE_SECONDS = 300;

export function acceptedFile(f: { name: string; type: string }): boolean {
  return /\.(mp4|m4a|mp3|wav)$/i.test(f.name) || /^(audio\/(mp4|x-m4a|mpeg|mp3|wav|x-wav|wave)|video\/mp4)$/i.test(f.type);
}

/** Average the channels into one. */
export function downmix(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const out = new Float32Array(channels[0].length);
  for (const ch of channels) for (let i = 0; i < out.length; i += 1) out[i] += ch[i] / channels.length;
  return out;
}

/** 16-bit PCM WAV of mono samples. */
export function wav(samples: Float32Array, rate = RATE): Blob {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/** Cut into pieces of about `seconds`; a last sliver under 20 seconds joins the piece before it. */
export function pieces(samples: Float32Array, rate = RATE, seconds = PIECE_SECONDS): Float32Array[] {
  const size = rate * seconds;
  const out: Float32Array[] = [];
  for (let at = 0; at < samples.length; at += size) {
    const end = samples.length - (at + size) < rate * 20 ? samples.length : at + size;
    out.push(samples.subarray(at, end));
    if (end === samples.length) break;
  }
  return out;
}

/** "Transcribing, about 3 minutes left." */
export function progressLine(stage: 'reading' | 'transcribing', secondsLeft: number | null): string {
  if (stage === 'reading') return 'Pulling the audio out of the file…';
  if (secondsLeft === null) return 'Transcribing…';
  if (secondsLeft < 60) return 'Transcribing, less than a minute left';
  const m = Math.round(secondsLeft / 60);
  return `Transcribing, about ${m} minute${m === 1 ? '' : 's'} left`;
}

/** Decodes the file (a video's sound track included) to 16 kHz mono. */
export async function decodeMono(file: Blob): Promise<Float32Array> {
  const data = await file.arrayBuffer();
  const ctx = new OfflineAudioContext(1, RATE, RATE);
  let audio: AudioBuffer;
  try {
    audio = await ctx.decodeAudioData(data);
  } catch {
    throw new Error('This browser could not read the sound in that file. Try the M4A from Voice Memos, or an MP3.');
  }
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
  return downmix(channels);
}

const url = () => (ENV.SUPABASE_URL ? `${ENV.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/transcribe` : '');

/** Whether the server can transcribe files (its key is set). */
export async function transcribeReady(): Promise<boolean> {
  if (!url()) return false;
  try {
    const token = (await getAccessToken()) ?? ENV.SUPABASE_ANON_KEY ?? '';
    const r = await fetch(url(), { headers: { apikey: ENV.SUPABASE_ANON_KEY ?? '', authorization: `Bearer ${token}` } });
    return r.ok && ((await r.json()) as { ready?: boolean }).ready === true;
  } catch {
    return false;
  }
}

export class TranscribeError extends Error {}

async function sendPiece(samples: Float32Array, token: string): Promise<string> {
  const body = wav(samples);
  for (let attempt = 0; ; attempt += 1) {
    let r: Response;
    try {
      r = await fetch(url(), { method: 'POST', headers: { authorization: `Bearer ${token}`, apikey: ENV.SUPABASE_ANON_KEY ?? '', 'content-type': 'audio/wav', 'x-seconds': String(Math.ceil(samples.length / RATE)) }, body });
    } catch {
      if (attempt < 3) {
        await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
        continue;
      }
      throw new TranscribeError('Could not reach Halo+. Check your connection and try again.');
    }
    const out = (await r.json().catch(() => ({}))) as { ok?: boolean; text?: string; why?: string; retry?: boolean };
    if (r.ok && out.ok) return out.text ?? '';
    if (out.retry && attempt < 3) {
      await new Promise((res) => setTimeout(res, 4000 * (attempt + 1)));
      continue;
    }
    reportFunctionFailure('transcribe', r.status, out.why);
    throw new TranscribeError(out.why ?? `Transcribing stopped (${r.status}).`);
  }
}

/** The whole file to text, with progress: (done pieces, all pieces, seconds left or null). */
export async function transcribeFile(file: Blob, onProgress: (stage: 'reading' | 'transcribing', secondsLeft: number | null, done: number, total: number) => void): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new TranscribeError('Sign in to transcribe a recording.');
  onProgress('reading', null, 0, 0);
  const all = await decodeMono(file);
  const parts = pieces(all);
  const texts: string[] = Array.from({ length: parts.length }, () => '');
  const started = Date.now();
  let done = 0;
  let next = 0;
  // Until the first piece is back, a fair guess: about 15 seconds a piece, three at a time.
  onProgress('transcribing', Math.ceil(parts.length / 3) * 15, 0, parts.length);
  const worker = async () => {
    while (next < parts.length) {
      const i = next;
      next += 1;
      texts[i] = await sendPiece(parts[i], token);
      done += 1;
      const per = (Date.now() - started) / done / 1000;
      onProgress('transcribing', Math.round(per * (parts.length - done)), done, parts.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, parts.length) }, worker));
  return texts.map((t) => t.trim()).filter(Boolean).join('\n\n');
}
