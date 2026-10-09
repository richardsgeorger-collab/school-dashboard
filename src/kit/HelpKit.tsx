import { useState } from 'react';
import { useCan } from '../config/useCan';
import { todoLines } from '../domain/sheet';
import type { Course, Item } from '../domain/types';
import { announceDb, announceStores } from '../halo/announce';
import { useStore } from '../storage/store';
import { syllabiDb } from '../syllabus/db';
import { extensionCanFetch, fetchViaExtension, waitForPermission } from './extFiles';
import { buildKit, fileKey, type KitAnnouncement, type KitOutcome, type KitResource } from './kit';

type Phase = 'idle' | 'building' | 'done' | 'partial' | 'links' | 'error';

/** A safe file name inside the zip. */
const fileName = (name: string): string => name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'file';

/**
 * "Download help kit" in the assignment sheet's quiet row (George, 2026-10-08; Max, like the Study tab). Builds the
 * zip here in the browser from what the planner holds and what the extension fetches; nothing goes to a server.
 */
export function HelpKitButton({ item, course }: { item: Item; course: Course }) {
  const { data } = useStore();
  const canChat = useCan('aiChat');
  const canCards = useCan('flashcards');
  const allowed = canChat && canCards;
  const [phase, setPhase] = useState<Phase>('idle');
  const [note, setNote] = useState<string | null>(null);
  if (!allowed) return null;
  const tz = data.settings.timezone;

  const build = async () => {
    setPhase('building');
    setNote('Gathering the assignment…');
    try {
      const lines = todoLines(item, tz);
      // The posts this assignment's parts, origin or moved date came from.
      const postIds = new Set<string>();
      for (const r of item.requirements ?? []) if (r.source.kind === 'announcement' && r.source.id) postIds.add(r.source.id);
      if (item.origin?.kind === 'announcement' && item.origin.id) postIds.add(item.origin.id);
      if (item.dateChange?.source.kind === 'announcement' && item.dateChange.source.id) postIds.add(item.dateChange.source.id);
      const all = await announceStores.resources().catch(() => []);
      const resources: KitResource[] = all.filter((r) => r.courseId === item.courseId && !!item.topic && r.unit === item.topic).map((r) => ({ title: r.title, unit: r.unit, description: r.description, files: r.files }));
      // Also any post in this class that carries one of the assignment's files (the professor's copy of a walk-through).
      const topicKeys = new Set([...resources.flatMap((r) => r.files.filter((f) => (f.kind ?? '').toUpperCase() !== 'URL').map((f) => fileKey(f.name))), ...(item.attachments ?? []).map((a) => fileKey(a.title))]);
      const posts = (await announceDb.list().catch(() => [])).filter((a) => a.courseId === item.courseId);
      for (const a of posts) if ((a.resources ?? []).some((f) => (f.kind ?? '').toUpperCase() !== 'URL' && topicKeys.has(fileKey(f.name)))) postIds.add(a.id);
      const announcements: KitAnnouncement[] = [];
      for (const id of postIds) {
        const a = posts.find((p) => p.id === id) ?? (await announceDb.get(id).catch(() => null));
        if (a) announcements.push({ id: a.id, title: a.title, text: a.text, author: a.author, publishedAt: a.publishedAt, resources: a.resources ?? [] });
      }
      announcements.sort((a, b) => (a.publishedAt ?? '').localeCompare(b.publishedAt ?? ''));
      const siblings = data.items.filter((i) => i.courseId === item.courseId && i.id !== item.id).map((i) => ({ title: i.title, label: i.label }));
      const syllabusText = (await syllabiDb.get(item.courseId).catch(() => null))?.text ?? null;
      const draft = buildKit({ item, course, tz, lines, announcements, resources, syllabusText, siblings });

      // Halo's files, through the extension; the first time Chrome asks the student to allow the file host.
      const outcome: KitOutcome = { got: [], failed: {}, noExtension: !extensionCanFetch() };
      const bytes = new Map<string, { name: string; bytes: Uint8Array }>();
      if (draft.files.length > 0 && !outcome.noExtension) {
        const wanted = draft.files.map((f) => ({ resourceId: f.resourceId!, name: f.name, alts: f.altIds }));
        let r = await fetchViaExtension(wanted, setNote);
        if (r.status === 'need-permission') {
          setNote('Chrome is asking to let Halo+ fetch course files. Allow it to include them.');
          const granted = await waitForPermission();
          r = granted ? await fetchViaExtension(wanted, setNote) : { status: 'error', error: 'not allowed' };
        }
        if (r.status === 'done') {
          for (const f of r.files) {
            if (f.ok) {
              bytes.set(f.resourceId, { name: f.name, bytes: f.bytes });
              outcome.got.push(f.resourceId);
            } else outcome.failed[f.resourceId] = f.error;
          }
        } else if (r.status === 'busy') for (const f of draft.files) outcome.failed[f.resourceId!] = 'a sync is running, try again in a minute';
        else if (r.status === 'error') for (const f of draft.files) outcome.failed[f.resourceId!] = r.error;
      }
      const kit = buildKit({ item, course, tz, lines, announcements, resources, syllabusText, siblings, outcome });

      setNote('Zipping…');
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      zip.file('00-START-HERE.md', kit.startHere);
      if (kit.rubricMd) zip.file('rubric.md', kit.rubricMd);
      if (kit.announcementsMd) zip.file('announcements.md', kit.announcementsMd);
      const used = new Set<string>();
      for (const [, f] of bytes) {
        let name = fileName(f.name);
        if (used.has(name.toLowerCase())) name = `${Date.now() % 1000}-${name}`;
        used.add(name.toLowerCase());
        zip.file(`files/${name}`, f.bytes);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = kit.zipName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(a.href), 30_000);

      const got = outcome.got.length;
      const total = draft.files.length;
      const parts = [kit.rubricMd ? 'the rubric' : '', announcements.length ? `${announcements.length} announcement${announcements.length === 1 ? '' : 's'}` : ''].filter(Boolean);
      if (total === 0) {
        setPhase('done');
        setNote(`Help kit saved: the prompt${parts.length ? `, ${parts.join(' and ')}` : ''}${kit.links.length ? `, ${kit.links.length} link${kit.links.length === 1 ? '' : 's'}` : ''}.`);
      } else if (outcome.noExtension) {
        setPhase('links');
        setNote(`Help kit saved with ${total} file${total === 1 ? '' : 's'} listed as links. Download files on a computer with the Halo+ extension.`);
      } else if (got === total) {
        setPhase('done');
        setNote(`Help kit saved: ${got} file${got === 1 ? '' : 's'} from Halo${parts.length ? `, ${parts.join(' and ')}` : ''}.`);
      } else {
        setPhase('partial');
        const missed = draft.files.filter((f) => !outcome.got.includes(f.resourceId!));
        setNote(`Help kit saved with ${got} of ${total} files; not fetched: ${missed.map((f) => `${f.name} (${outcome.failed[f.resourceId!] ?? 'no reason given'})`).join('; ')}. They are listed in START-HERE with where to find them in Halo.`);
      }
    } catch (e) {
      setPhase('error');
      setNote(`Could not build the kit: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <span className="kit">
      <button type="button" className="btn small" onClick={() => void build()} disabled={phase === 'building'}>
        {phase === 'building' ? 'Building…' : 'Download help kit'}
      </button>
      {note && (
        <span className="kit-note" data-phase={phase} role="status">
          {note}
        </span>
      )}
    </span>
  );
}
