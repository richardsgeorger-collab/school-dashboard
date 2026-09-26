import { useEffect, useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { startTrial } from '../auth/trial';
import { trialDaysLeft, trialState } from '../config/flags';
import { TRIAL } from '../config/tiers';
import { announceDb, readLedger } from '../halo/announce';
import { recordingsDb } from '../record/db';
import { receiptsFrom, receiptsLine, type Receipts } from '../domain/receipts';
import { pixel } from '../analytics/pixel';
import { useStore } from '../storage/store';
import { freshMax } from '../onboarding/maxState';

/**
 * The trial, offered where it means something and nowhere else: the first-sync payoff, a locked Max feature, one
 * quiet line on You and on the plans. Always the same sentence: "Free for 5 days. No card. Nothing charges."
 * `card` is the payoff version; `line` is the quiet one.
 */
export function TrialOffer({ variant = 'line', lead, label }: { variant?: 'card' | 'line' | 'button'; lead?: string; label?: string }) {
  const { auth, profile, reloadProfile } = useAccount();
  const { actions } = useStore();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!auth.configured) return null;
  const state = trialState(profile);
  if (state !== 'available') return null;
  const go = async () => {
    setBusy(true);
    const r = await startTrial();
    setBusy(false);
    if (r.ok) {
      pixel('StartTrial');
      reloadProfile();
      // Welcome to Max: four screens, once, after any first-run screens still open.
      actions.updateSettings({ maxOnboarding: freshMax() });
      setNote(`Max is on for ${TRIAL.days} days. Nothing charges.`);
    } else setNote(r.message);
  };
  const button = (
    <button type="button" className={`btn ${variant === 'card' ? 'primary' : 'small primary'}`} disabled={busy || !auth.session} onClick={() => void go()}>
      {busy ? 'Starting…' : (label ?? 'Start the free trial')}
    </button>
  );
  if (variant === 'button') return button;
  if (variant === 'card') {
    return (
      <section className="card trial-offer" aria-label="Free trial">
        <p className="eyebrow">Max, free for {TRIAL.days} days</p>
        <p className="trial-lead">{lead ?? 'Max reads every announcement for hidden requirements, plans your studying, and answers what to do next.'}</p>
        <p className="hint">{TRIAL.line}</p>
        {!auth.session && <p className="hint">Sign in first; the trial belongs to your account.</p>}
        <div className="settings-actions">{button}</div>
        {note && <p className="hint">{note}</p>}
      </section>
    );
  }
  return (
    <p className="hint trial-line">
      {lead ?? `Try Max free for ${TRIAL.days} days.`} {TRIAL.line} {button}
      {note && <span> {note}</span>}
    </p>
  );
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** What Max did since a moment (the last seven days unless told otherwise), from local records. Null until loaded. */
export function useReceipts(sinceIso?: string | null): Receipts | null {
  const [r, setR] = useState<Receipts | null>(null);
  useEffect(() => {
    let live = true;
    const since = sinceIso ?? new Date(Date.now() - WEEK_MS).toISOString();
    void (async () => {
      const ledger = await readLedger.all().catch(() => new Map());
      const recs = await recordingsDb.list().catch(() => []);
      let chatAt: string[] = [];
      try {
        const raw = JSON.parse(localStorage.getItem('school-dashboard:chat') ?? '[]') as { at?: string; role?: string }[];
        chatAt = raw.filter((t) => t && t.role === 'assistant' && typeof t.at === 'string').map((t) => t.at as string);
      } catch {
        chatAt = [];
      }
      void announceDb;
      if (live) setR(receiptsFrom({ ledger: ledger.values(), recordingsAt: recs.map((x) => (x as { createdAt?: string }).createdAt ?? '').filter(Boolean), chatAt, since }));
    })();
    return () => {
      live = false;
    };
  }, [sinceIso]);
  return r;
}

/**
 * During the trial: what Max has done this week, and on the last day a clear ending. After it: nothing here; the
 * locked features carry their own honest previews.
 */
export function TrialReceipts() {
  const { profile } = useAccount();
  const r = useReceipts();
  const days = trialDaysLeft(profile);
  if (trialState(profile) !== 'active' || days === null) return null;
  const line = r ? receiptsLine(r) : null;
  return (
    <section className="card trial-receipts" aria-label="Your Max trial">
      <p className="eyebrow">{days <= 1 ? 'Your Max trial ends tomorrow' : `Max trial · ${days} day${days === 1 ? '' : 's'} left`}</p>
      <p className="trial-lead">{line ?? 'Max is on. Sync Halo and it starts reading your announcements.'}</p>
      <p className="hint">Nothing charges when it ends. Everything you have stays; Max features pause until you choose a plan.</p>
      <div className="settings-actions">
        <a className="btn small primary" href="#/you?s=plan&to=max">
          Keep Max
        </a>
      </div>
    </section>
  );
}
