import { dateOf } from '../domain/dates';
import { newId } from '../domain/ids';
import type { Course, DateStr } from '../domain/types';
import { extractLines } from '../parser/pdfText';
import { importAudioFile } from '../record/db';
import { audioMime, isAudioFile, memoTitle } from '../record/format';
import { syllabiDb } from '../syllabus/db';
import { tidySyllabusText } from '../syllabus/context';
import { libraryDb, type Deck } from './db';
import { extractDeck, isDeckFile, titleFromFileName } from './extract';

export type FileKind = 'audio' | 'deck' | 'syllabus' | 'unknown';

/** Fired after anything in the Library changes, so counts and search reload without wiring every view together. */
export const LIBRARY_EVENT = 'library-changed';
export function notifyLibraryChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(LIBRARY_EVENT));
}

/** What a dropped file is, from its name and type. A PDF named "syllabus" is the syllabus; other PDFs and PPTX are slides. */
export function classifyFile(name: string, type?: string): FileKind {
  if (isAudioFile(name, type)) return 'audio';
  if (/syllabus/i.test(name) && (/\.(pdf|txt)$/i.test(name) || type === 'application/pdf' || type === 'text/plain')) return 'syllabus';
  if (isDeckFile(name, type)) return 'deck';
  return 'unknown';
}

const GENERIC_KEYS = new Set(['lecture', 'slides', 'slide', 'notes', 'week', 'topic', 'class', 'recording', 'memo', 'new', 'untitled', 'deck', 'audio', 'voice', 'file', 'document', 'presentation', 'ch', 'chapter', 'unit', 'lesson']);

/** The first word of a file name, when it is distinctive enough to remember a class by ("CHM113_Topic3.pdf" → "chm113"). */
export function fileKey(name: string): string | null {
  const m = /^[^\p{L}\p{N}]*([\p{L}\p{N}]+)/u.exec(name.replace(/\.[a-z0-9]+$/i, ''));
  if (!m) return null;
  const key = m[1].toLowerCase();
  return key.length >= 3 && !GENERIC_KEYS.has(key) && !/^\d+$/.test(key) ? key : null;
}

export interface Ingested {
  kind: Exclude<FileKind, 'unknown'>;
  title: string;
  detail: string;
  warnings: string[];
}

/** Length of an audio file by letting the browser read its header. Zero when it cannot. */
export function probeDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    let done = false;
    const finish = (ms: number) => {
      if (done) return;
      done = true;
      URL.revokeObjectURL(url);
      resolve(ms);
    };
    a.preload = 'metadata';
    a.onloadedmetadata = () => finish(Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : 0);
    a.onerror = () => finish(0);
    setTimeout(() => finish(0), 5000);
    a.src = url;
  });
}

/** Save a dropped file into a class with no further questions: recording, slides, or syllabus. */
export async function ingestFile(file: File, course: Course, tz: string, today: DateStr, probe: (f: File) => Promise<number> = probeDuration): Promise<Ingested> {
  const kind = classifyFile(file.name, file.type);
  if (kind === 'audio') {
    const title = memoTitle(course.code, dateOf(new Date(file.lastModified || Date.now()).toISOString(), tz));
    await importAudioFile(file, course.id, title, await probe(file), audioMime(file.name, file.type), newId());
    notifyLibraryChanged();
    return { kind, title, detail: 'Recording saved. Paste its transcript to make it searchable.', warnings: [] };
  }
  if (kind === 'syllabus') {
    const raw = /\.txt$/i.test(file.name) ? await file.text() : (await extractLines(await file.arrayBuffer())).join('\n');
    const text = tidySyllabusText(raw);
    if (text.length < 200) throw new Error(`Very little text came out of ${file.name}. If the PDF is a scan, it has no text layer to read.`);
    await syllabiDb.put({ courseId: course.id, name: file.name, text, chars: text.length, addedAt: new Date().toISOString() });
    notifyLibraryChanged();
    return { kind, title: file.name, detail: `Syllabus saved, ${Math.round(text.length / 1000)}k characters. The coach can quote it.`, warnings: [] };
  }
  if (kind === 'deck') {
    const r = await extractDeck(file);
    const chars = r.pages.reduce((n, p) => n + p.length, 0);
    if (chars < 40) throw new Error(`No readable text came out of ${file.name}. ${r.kind === 'pptx' ? 'Export it as PDF from PowerPoint and drop that.' : 'A scanned PDF has no text layer.'}`);
    const id = newId();
    const deck: Deck = {
      id,
      courseId: course.id,
      title: titleFromFileName(file.name),
      tag: '',
      date: dateOf(new Date(file.lastModified || Date.now()).toISOString(), tz) || today,
      fileName: file.name,
      kind: r.kind,
      mimeType: file.type || (r.kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
      bytes: file.size,
      pages: r.pages.length,
      chars,
      addedAt: new Date().toISOString(),
      recordingId: null,
      fileDeleted: false,
    };
    await libraryDb.putFile(id, file);
    await libraryDb.putPages(id, r.pages);
    await libraryDb.putDeck(deck);
    notifyLibraryChanged();
    return { kind, title: deck.title, detail: `${r.pages.length} ${r.kind === 'pptx' ? 'slides' : 'pages'} saved with their text.`, warnings: r.warnings };
  }
  throw new Error('Drop audio (.m4a, .mp3, .wav), slides (.pdf, .pptx), or a file named syllabus.');
}

/** Everything on file for one class, for counts and for deleting with the class. */
export async function materialsFor(courseId: string): Promise<{ recordings: number; decks: number; syllabus: boolean }> {
  const [recs, decks, syl] = await Promise.all([
    import('../record/db').then((m) => m.recordingsDb.list()),
    libraryDb.listDecks(),
    syllabiDb.get(courseId),
  ]);
  return { recordings: recs.filter((r) => r.courseId === courseId).length, decks: decks.filter((d) => d.courseId === courseId).length, syllabus: !!syl };
}

export async function deleteMaterials(courseId: string): Promise<number> {
  const { recordingsDb } = await import('../record/db');
  const recs = (await recordingsDb.list()).filter((r) => r.courseId === courseId);
  const decks = (await libraryDb.listDecks()).filter((d) => d.courseId === courseId);
  for (const r of recs) await recordingsDb.remove(r.id);
  for (const d of decks) await libraryDb.removeDeck(d.id);
  const syl = await syllabiDb.get(courseId);
  if (syl) await syllabiDb.remove(courseId);
  notifyLibraryChanged();
  return recs.length + decks.length + (syl ? 1 : 0);
}

/** Move a recording or a deck to another class. Links and text come along. */
export async function moveMaterial(kind: 'recording' | 'deck', id: string, courseId: string): Promise<void> {
  if (kind === 'deck') {
    const d = await libraryDb.getDeck(id);
    if (d) await libraryDb.putDeck({ ...d, courseId });
  } else {
    const { recordingsDb } = await import('../record/db');
    const r = await recordingsDb.get(id);
    if (r) await recordingsDb.put({ ...r, courseId });
  }
  notifyLibraryChanged();
}

export async function renameMaterial(kind: 'recording' | 'deck', id: string, title: string): Promise<void> {
  const t = title.trim();
  if (!t) return;
  if (kind === 'deck') {
    const d = await libraryDb.getDeck(id);
    if (d) await libraryDb.putDeck({ ...d, title: t });
  } else {
    const { recordingsDb } = await import('../record/db');
    const r = await recordingsDb.get(id);
    if (r) await recordingsDb.put({ ...r, title: t });
  }
  notifyLibraryChanged();
}
