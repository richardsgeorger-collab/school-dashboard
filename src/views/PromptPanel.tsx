import { useEffect, useMemo, useState } from 'react';
import type { Course, Item } from '../domain/types';
import { useStore } from '../storage/store';
import { loadRaw, promptFor, type Raw } from '../work/prompt/gather';

/**
 * One prompt for one assignment, ready to paste into Claude in another tab. No call is made from here. The class's
 * announcements, lectures, slides and syllabus are read from this device and the relevant stretches pasted in, so
 * the prompt carries the material itself rather than a list of names.
 */
export function PromptPanel({ item, course, onClose }: { item: Item; course: Course; onClose: () => void }) {
  const { data, schedule, today } = useStore();
  const [raw, setRaw] = useState<Raw | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    void loadRaw(item.courseId).then((r) => {
      if (live) setRaw(r);
    });
    return () => {
      live = false;
    };
  }, [item.courseId]);

  const prompt = useMemo(
    () => promptFor({ item, course, data, schedule, today, raw: raw ?? { posts: [], lectures: [], pages: [], syllabus: null } }),
    [item, course, data, schedule, today, raw],
  );

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
          <p className="hint">{raw ? 'Copy this and paste it into Claude in another tab. Your announcements, lectures, slides and syllabus are already in it.' : 'Reading your class material…'}</p>
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
