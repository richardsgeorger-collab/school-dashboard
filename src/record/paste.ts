import { makeIso } from '../domain/dates';
import { newId } from '../domain/ids';
import type { DateStr } from '../domain/types';
import { recordingsDb, type Recording } from './db';

/**
 * A lecture with no audio: the transcript Voice Memos already wrote, pasted in with a date. It is a recording in
 * every way that matters — searchable, tutor material, run through the same extraction — minus the file.
 */
const CHUNK = 700;

/** Paragraphs first; long ones cut at sentence ends into stretches the search and the tutor can quote. */
export function chunkTranscript(text: string, max = CHUNK): string[] {
  const paras = text
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of paras) {
    if (p.length <= max) {
      out.push(p);
      continue;
    }
    let cur = '';
    for (const sentence of p.split(/(?<=[.!?])\s+/)) {
      if (cur && cur.length + sentence.length + 1 > max) {
        out.push(cur);
        cur = sentence;
      } else cur = cur ? `${cur} ${sentence}` : sentence;
    }
    if (cur) out.push(cur);
  }
  return out;
}

export const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

export interface PasteInput {
  courseId: string;
  courseCode: string;
  /** The day the lecture happened. */
  date: DateStr;
  title?: string;
  text: string;
  tz: string;
}

export const pastedTitle = (code: string, date: DateStr): string => `${code} lecture ${date}`;

/** Store the transcript as a recording with no audio. Returns it; the caller runs the extraction. */
export async function createPastedRecording(input: PasteInput): Promise<Recording> {
  const chunks = chunkTranscript(input.text);
  if (wordCount(input.text) < 20) throw new Error('That is too short to be a lecture transcript.');
  const id = newId();
  const startedAt = makeIso(input.date, '12:00', input.tz);
  const rec: Recording = {
    id,
    courseId: input.courseId,
    title: (input.title ?? '').trim() || pastedTitle(input.courseCode, input.date),
    startedAt,
    endedAt: startedAt,
    status: 'done',
    durationMs: 0,
    bytes: 0,
    mimeType: '',
    chunkCount: 0,
    segmentCount: chunks.length,
    audioDeleted: true,
    notes: null,
    processedAt: null,
    review: {},
    kind: 'imported',
    transcriptSource: 'pasted',
  };
  await recordingsDb.put(rec);
  let seq = 0;
  for (const text of chunks) await recordingsDb.addSegment({ recordingId: id, seq: ++seq, at: 0, text });
  return rec;
}
