import { useEffect, useMemo, useState } from 'react';
import { courseGrade } from '../domain/grades';
import type { Course, Item } from '../domain/types';
import { libraryDb, type Deck } from '../library/db';
import { decksForItem } from '../library/links';
import { recordingsDb, type Recording } from '../record/db';
import { dateOf, fmtDate } from '../domain/dates';
import { itemTopics, topicKey } from '../domain/concepts';
import { useStore } from '../storage/store';
import { handoffPrompt } from '../work/handoff';

/**
 * One prompt for one assignment, ready to paste into Claude in another tab. No call is made from here: the tailored
 * half was written during ingestion and stored on the item, so this opens instantly and works offline.
 */
export function PromptPanel({ item, course, onClose }: { item: Item; course: Course; onClose: () => void }) {
  const { data, today } = useStore();
  const tz = data.settings.timezone;
  const [ctx, setCtx] = useState<{ sources: string[]; flagged: string[] } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      const [decks, recs] = await Promise.all([libraryDb.listDecks().catch(() => [] as Deck[]), recordingsDb.list().catch(() => [] as Recording[])]);
      if (!live) return;
      const mine = recs.filter((r) => r.courseId === item.courseId);
      const words = [...new Set([...itemTopics(item).map(topicKey), ...item.title.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4)])];
      const flagged = mine
        .flatMap((r) => [...(r.notes?.knowledge?.examFlags ?? []), ...(r.notes?.knowledge?.emphasized ?? [])].filter((f) => words.some((w) => f.point.toLowerCase().includes(w))).map((f) => `"${f.point}" — ${r.title}, ${fmtDate(dateOf(r.startedAt, tz), 'short')}`))
        .slice(0, 3);
      const sources = [...new Set([...(item.plan?.sources.map((s) => s.label) ?? []), ...decksForItem(item, decks).map((d) => `${d.title}${d.tag ? ` (${d.tag})` : ''}`)])];
      setCtx({ sources, flagged });
    })();
    return () => {
      live = false;
    };
  }, [item, tz]);

  const grade = useMemo(() => {
    const g = courseGrade(course.id, data.items);
    return g.pct === null ? null : `I am at ${g.pct}% in the class so far.`;
  }, [course.id, data.items]);

  const prompt = useMemo(() => handoffPrompt(item, course, { sources: ctx?.sources ?? [], flagged: ctx?.flagged ?? [], gradeNote: grade }, tz, today), [item, course, ctx, grade, tz, today]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked: the text is on screen and selectable.
    }
  };

  return (
    <>
      <button type="button" className="panel-scrim" aria-label="Close" onClick={onClose} />
      <aside className="panel" role="dialog" aria-label={`Prompt for ${item.label}`}>
        <header className="panel-head">
          <div>
            <p className="hint mono">{course.code} · paste into Claude</p>
            <h2 className="panel-title">{item.label}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="panel-body">
          <p className="hint">Copy this, paste it into Claude in another tab. It carries the description, what earns points, your material, and where you are, and it asks for the setup and not the graded content.</p>
          <pre className="panel-prompt">{prompt}</pre>
        </div>
        <footer className="panel-foot">
          <button type="button" className="btn primary" onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy the prompt'}
          </button>
          <span className="hint mono">{prompt.length.toLocaleString()} characters</span>
        </footer>
      </aside>
    </>
  );
}
