import { useState } from 'react';
import { byKind, costOf, fmtDollars, loadPrices, loadUsage, monthOf, savePrices, totals, type Prices } from '../ai/usage';
import { loadApiKey } from '../chat/key';
import { CourseChip } from '../components/CourseChip';
import { useStore } from '../storage/store';

const k = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
const KIND_WORDS: Record<string, string> = { class_plan: 'class passes', term_plan: 'term passes', lecture: 'lecture reads', tutor: 'tutor', brief: 'assignment briefs', draft: 'draft checks', method: 'method checks', links: 'cross-class links', study: 'study kits', quiz: 'practice sets', coach: 'coach', audit: 'Halo audits', needs: 'needs-you lines', other: 'other' };

/** What the AI features cost this month, measured from what the API reported, and which classes run on the AI plan. */
export function AiPanel() {
  const { data } = useStore();
  const hasKey = loadApiKey() !== '';
  const [rows] = useState(() => loadUsage());
  const [prices, setPrices] = useState<Prices>(() => loadPrices());
  const [showPrices, setShowPrices] = useState(false);
  const month = monthOf(new Date());
  const mine = rows.filter((r) => r.month === month);
  const t = totals(mine);
  const kinds = byKind(rows, month);
  const setPrice = (key: keyof Prices, v: string) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return;
    const next = { ...prices, [key]: n };
    setPrices(next);
    savePrices(next);
  };
  return (
    <section className="card settings-card" aria-label="AI">
      <h2 className="section-title">AI</h2>
      <p className="hint">{hasKey ? 'The key on this device pays for every call; nothing goes through a server of ours.' : 'No key on this device. Connect one on Now to turn the AI features on.'} Every call is measured here from what the API reported.</p>
      <p className="ai-month">
        <b>This month:</b> {t.calls} call{t.calls === 1 ? '' : 's'} · {k(t.input + t.cacheRead + t.cacheWrite)} tokens in · {k(t.output)} out · about <b>{fmtDollars(costOf(t, prices))}</b>
      </p>
      {kinds.length > 0 && (
        <table className="ai-usage mono">
          <thead>
            <tr>
              <th>what</th>
              <th>calls</th>
              <th>in</th>
              <th>out</th>
              <th>cost</th>
            </tr>
          </thead>
          <tbody>
            {kinds.map((r) => (
              <tr key={r.kind}>
                <td>{KIND_WORDS[r.kind] ?? r.kind}</td>
                <td>{r.calls}</td>
                <td>{k(r.input + r.cacheRead + r.cacheWrite)}</td>
                <td>{k(r.output)}</td>
                <td>{fmtDollars(costOf(r, prices))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint">
        <button type="button" className="diff-toggle" onClick={() => setShowPrices((s) => !s)}>
          {showPrices ? 'Hide prices' : 'Prices per million tokens'}
        </button>
      </p>
      {showPrices && (
        <div className="ai-prices">
          {(['input', 'output', 'cacheRead', 'cacheWrite'] as const).map((key) => (
            <label key={key} className="field">
              <span>{{ input: 'Input', output: 'Output', cacheRead: 'Cache read', cacheWrite: 'Cache write' }[key]} ($/M)</span>
              <input type="number" min={0} step={0.05} inputMode="decimal" value={prices[key]} onChange={(e) => setPrice(key, e.target.value)} />
            </label>
          ))}
        </div>
      )}
      <h3 className="section-title">Which version each class runs on</h3>
      <ul className="diff-list">
        {data.courses.map((c) => (
          <li key={c.id}>
            <CourseChip course={c} link /> <span className="mono muted">{c.ingest === 'ai' ? 'AI plan · parser as fallback' : 'parser'}</span>{' '}
            <a className="diff-toggle" href={`#/ingest?c=${c.id}`}>
              {c.ingest === 'ai' ? 'open' : 'compare'}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
