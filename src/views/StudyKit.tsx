import { useEffect, useMemo, useState } from 'react';
import { describeAiError } from '../ai/client';
import { loadApiKey } from '../chat/key';
import { CourseChip } from '../components/CourseChip';
import { SegmentedControl } from '../components/SegmentedControl';
import { weakConcepts } from '../domain/concepts';
import { aiDb, studyKey } from '../ingest/db';
import { EMPTY_POOL, loadPool } from '../quiz/pool';
import { gatherSources, type SourcePool } from '../quiz/sources';
import { useRoute } from '../router';
import { useStore } from '../storage/store';
import { buildKit, KIT_WORDS, kitHash, type KitKind, type StudyKit as Kit } from '../study/kits';

const KINDS: KitKind[] = ['formulas', 'cards', 'onepager'];

/**
 * Exam materials from the student's own material: formula sheet, flashcards, one-pager, built from the decks and
 * transcripts on file and weighted toward what they have been missing. Cached until the material changes. Printable.
 */
export function StudyKit() {
  const { data } = useStore();
  const { params } = useRoute();
  const tz = data.settings.timezone;
  const course = data.courses.find((c) => c.id === params.get('c')) ?? null;
  const hasKey = loadApiKey() !== '';
  const [kind, setKind] = useState<KitKind>((KINDS as string[]).includes(params.get('k') ?? '') ? (params.get('k') as KitKind) : 'onepager');
  const [topic, setTopic] = useState(params.get('t') ?? '');
  const [pool, setPool] = useState<SourcePool | null>(null);
  const [kit, setKit] = useState<Kit | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [flipped, setFlipped] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!course) return;
    let live = true;
    loadPool(course.id)
      .then((p) => live && setPool(p))
      .catch(() => live && setPool(EMPTY_POOL));
    return () => {
      live = false;
    };
  }, [course?.id]);

  const sources = useMemo(() => (course && pool ? gatherSources(course, topic, pool, tz) : []), [course, pool, topic, tz]);
  const weak = useMemo(() => (course ? weakConcepts(course.id, data.items, data.settings.quizStats).map((w) => w.topic) : []), [course, data.items, data.settings.quizStats]);
  const flagged = useMemo(() => (pool ? pool.recordings.flatMap((r) => r.notes?.knowledge?.examFlags.map((f) => f.point) ?? []).slice(0, 10) : []), [pool]);
  const hash = useMemo(() => kitHash(kind, topic, sources, weak), [kind, topic, sources, weak]);

  // The cached kit for this kind and topic, when its sources have not changed.
  useEffect(() => {
    if (!course || !pool) return;
    let live = true;
    setKit(null);
    setFlipped({});
    aiDb
      .get<Kit>(studyKey(course.id, kind, topic))
      .then((k) => live && k && k.sourcesHash === hash && setKit(k))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [course?.id, kind, topic, pool, hash]);

  const build = async () => {
    if (!course || !hasKey || sources.length === 0) return;
    setBusy(true);
    setNote(null);
    try {
      const k = await buildKit({ apiKey: loadApiKey(), course, kind, topic, sources, weak, flagged });
      setKit(k);
      setFlipped({});
      await aiDb.put(studyKey(course.id, kind, topic), k).catch(() => undefined);
    } catch (e) {
      setNote(await describeAiError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!course) {
    return (
      <>
        <h1 className="page-title">Study kit</h1>
        <p className="hint">Open a class page and press Study kit.</p>
      </>
    );
  }
  const label = (id: string) => sources.find((s) => s.id === id);
  const Cite = ({ id }: { id: string }) => {
    const s = label(id);
    return s ? (
      <a className="kit-cite mono" href={s.href} title={s.label}>
        {id}
      </a>
    ) : null;
  };

  return (
    <>
      <div className="lib-head">
        <div>
          <a className="diff-toggle" href={`#/class?c=${course.id}`}>
            ← {course.code}
          </a>
          <h1 className="page-title lib-class-title">
            <CourseChip course={course} /> <span>Study kit</span>
          </h1>
          <p className="hint mono">{!pool ? 'Reading your material…' : sources.length ? `From ${sources.length} piece${sources.length === 1 ? '' : 's'} of your own material${weak.length ? ` · weak first: ${weak.slice(0, 3).join(', ')}` : ''}${flagged.length ? ` · ${flagged.length} flagged as exam material` : ''}` : 'Nothing on file for this yet. Drop decks or recordings into the class library first.'}</p>
        </div>
      </div>
      <section className="card kit-setup">
        <SegmentedControl label="Kind" value={kind} options={KINDS.map((k) => ({ value: k, label: KIT_WORDS[k] }))} onChange={(v) => setKind(v as KitKind)} />
        <label className="field">
          <span>Topic (blank for everything on file)</span>
          <input type="text" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="stoichiometry" />
        </label>
        <div className="settings-actions">
          <button type="button" className="btn primary" disabled={!hasKey || busy || !pool || sources.length === 0} onClick={() => void build()}>
            {busy ? 'Building…' : kit ? `Rebuild the ${KIT_WORDS[kind].toLowerCase()}` : `Build the ${KIT_WORDS[kind].toLowerCase()}`}
          </button>
          {kit && (
            <button type="button" className="btn" onClick={() => window.print()}>
              Print
            </button>
          )}
          {!hasKey && <span className="hint">Connect the Anthropic key on Now first.</span>}
        </div>
        {note && (
          <p className="hint" style={{ color: 'var(--overdue)' }}>
            {note}
          </p>
        )}
      </section>

      {kit && kit.kind === 'formulas' && (
        <section className="card kit kit-formulas">
          <h2 className="section-title">
            {course.code} formula sheet{topic ? ` · ${topic}` : ''} <span className="count">{kit.formulas.length}</span>
          </h2>
          {kit.formulas.length === 0 && <p className="hint">The material on file carries no formulas for this.</p>}
          <table className="kit-table">
            <tbody>
              {kit.formulas.map((f, i) => (
                <tr key={i}>
                  <td className="kit-name">{f.name}</td>
                  <td className="kit-formula mono">{f.formula}</td>
                  <td className="kit-when hint">
                    {f.when} <Cite id={f.sourceId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {kit && kit.kind === 'cards' && (
        <section className="card kit kit-cards">
          <h2 className="section-title">
            Flashcards{topic ? ` · ${topic}` : ''} <span className="count">{kit.cards.length}</span>
          </h2>
          <p className="hint">Tap a card to turn it over.</p>
          <ul className="kit-card-list">
            {kit.cards.map((c, i) => (
              <li key={i}>
                <button type="button" className="kit-card" data-flipped={!!flipped[i]} onClick={() => setFlipped((f) => ({ ...f, [i]: !f[i] }))} aria-label={flipped[i] ? 'Back of card' : 'Front of card'}>
                  <span className="kit-card-face">{flipped[i] ? c.back : c.front}</span>
                  <span className="kit-card-foot mono">{flipped[i] ? 'back' : 'front'}</span>
                </button>
                <Cite id={c.sourceId} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {kit && kit.kind === 'onepager' && (
        <section className="card kit kit-onepager">
          <h2 className="section-title">
            {course.code}{topic ? ` · ${topic}` : ''} in one page
          </h2>
          {kit.sections.map((s, i) => (
            <div key={i} className="kit-section">
              <h3>
                {s.heading} <Cite id={s.sourceId} />
              </h3>
              <ul>
                {s.lines.map((l, j) => (
                  <li key={j}>{l}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {kit && (
        <p className="hint kit-sources">
          Sources: {kit.sources.map((s) => `[${s.id}] ${s.label}`).join(' · ')}
        </p>
      )}
    </>
  );
}
