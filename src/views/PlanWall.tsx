import { useState } from 'react';
import { useAccount } from '../auth/AccountContext';
import { supabase } from '../auth/client';
import { startCheckout } from '../billing/client';
import { syncAccess, type SyncAccess } from '../config/flags';
import { CANCEL_LINE, PLAN_LINES, PRICES, TIER_NAMES, TRIAL } from '../config/tiers';
import { dateOf, fmtDate } from '../domain/dates';
import { receiptsLine } from '../domain/receipts';
import { useStore } from '../storage/store';
import { useReceipts } from './TrialOffer';

/**
 * Halo sync is part of Plus (2026-09-28). A build with no accounts (a demo or the preview) has no plan to check and
 * keeps sync on; everything else asks `syncAccess` in config/flags.ts.
 */
export function useSyncAccess(): SyncAccess {
  const { profile, auth } = useAccount();
  if (!auth.configured) return { allowed: true, via: 'plan', pausedSince: null, legacyUntil: null };
  if (!auth.session) return { allowed: false, via: 'none', pausedSince: null, legacyUntil: null };
  return syncAccess(profile);
}

/**
 * Frozen: sync is off but the planner holds data Halo put there. Then every screen says so, because a student must
 * never miss a moved due date because the app looked up to date. `since` is when sync stopped; `asOf` is the day the
 * data was last true (the last sync).
 */
export function useFrozen(): { frozen: boolean; asOf: string | null } {
  const access = useSyncAccess();
  const { data } = useStore();
  const fromHalo = data.courses.some((c) => c.haloClassId) || !!data.settings.lastPull;
  if (access.allowed || !fromHalo) return { frozen: false, asOf: null };
  // One date everywhere: the last sync that succeeded, which is the day the dates on screen were last true. The day
  // the plan ended is only a fallback for a device that never synced itself.
  return { frozen: true, asOf: data.settings.lastPull?.at ?? access.pausedSince };
}

/** "Oct 3", in the student's own zone. */
export function useShortDate(): (iso: string | null) => string | null {
  const { data } = useStore();
  return (iso) => (iso ? fmtDate(dateOf(iso, data.settings.timezone), 'short') : null);
}

/** One tap to Stripe for a plan, monthly. Coming back, the webhook has set the plan and sync, grades and colour return. */
export function UpgradeButton({ tier = 'plus', label, primary = true, cancelNote = true }: { tier?: 'plus' | 'max'; label?: string; primary?: boolean; cancelNote?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    const r = await startCheckout(tier, 'month');
    if (r.ok) window.location.href = r.url;
    else {
      setErr(r.error);
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className={primary ? 'btn small primary' : 'btn small'} disabled={busy} onClick={() => void go()}>
        {busy ? 'Opening checkout…' : (label ?? `Get ${TIER_NAMES[tier]}, $${PRICES[tier].month.toFixed(2)} a month`)}
      </button>
      {cancelNote && <span className="cancel-note">{CANCEL_LINE}</span>}
      {err && <span className="hint">{err}</span>}
    </>
  );
}

/** The banner on every screen while sync is paused. Not dismissible: it is the only thing standing between a frozen date and a missed one. */
export function FrozenBanner() {
  const { frozen, asOf } = useFrozen();
  const short = useShortDate();
  if (!frozen) return null;
  const when = short(asOf);
  return (
    <div className="frozen-banner" role="alert">
      <p>
        <b>Halo sync paused{when ? ` since ${when}` : ''}.</b> <span className="frozen-long">Your dates may be out of date: anything your professors moved or added since then is not here.</span>
        <span className="frozen-short">Dates may be out of date.</span>
      </p>
      <div className="frozen-actions">
        <UpgradeButton label={`Turn sync back on: Plus, $${PRICES.plus.month.toFixed(2)} a month`} />
        <a className="hero-inline" href="#/you?s=plan">
          See plans
        </a>
      </div>
    </div>
  );
}

/** "as of Oct 3" beside a due date Halo gave, while frozen; nothing otherwise. */
export function AsOf({ item }: { item?: { haloId?: string | null; source?: string } }) {
  const { frozen, asOf } = useFrozen();
  const short = useShortDate();
  if (!frozen || !asOf || (item && !item.haloId && item.source !== 'halo')) return null;
  return <span className="as-of"> as of {short(asOf)}</span>;
}

/**
 * The card where sync would have happened: the sync sheet, and a bookmark that arrives while sync is off. Says what
 * Max did during the trial when it was one, then the one-tap upgrade.
 */
export function PlanWall({ context = 'now' }: { context?: 'now' | 'sync' }) {
  const { profile } = useAccount();
  const access = useSyncAccess();
  const short = useShortDate();
  const receipts = useReceipts(profile?.trialStartedAt ?? undefined);
  const did = receipts ? receiptsLine(receipts, 'during your trial') : null;
  const trialEnded = !!profile?.trialStartedAt && !!profile.trialEndsAt;
  return (
    <section className="card plan-wall" aria-label="Choose a plan">
      <p className="eyebrow">{trialEnded ? `Your Max trial ended ${short(profile!.trialEndsAt ?? null) ?? ''}` : 'Halo sync is part of Plus'}</p>
      <p className="trial-lead">{context === 'sync' ? 'Syncing Halo is part of Plus. Everything you have stays.' : 'Everything you have stays. Plus turns Halo sync back on, with your grades and announcements.'}</p>
      {did && <p className="hint">{did}</p>}
      <ul className="plan-lines">
        {PLAN_LINES.plus.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="hint">
        ${PRICES.plus.month.toFixed(2)} a month. {CANCEL_LINE}, in one click from You; a cancelled plan runs to the end of the month paid for.
        {access.pausedSince ? '' : ` New accounts get ${TRIAL.line.toLowerCase()}`}
      </p>
      <div className="settings-actions">
        <UpgradeButton />
        <a className="btn small" href="#/you?s=plan">
          See plans
        </a>
      </div>
    </section>
  );
}

/** Told once, to accounts that were syncing on the free plan before the change: sync stays on until their term ends. */
export function LegacyNotice() {
  const { profile, reloadProfile } = useAccount();
  const access = useSyncAccess();
  const short = useShortDate();
  const [gone, setGone] = useState(false);
  if (gone || access.via !== 'legacy' || !access.legacyUntil || profile?.legacyNoticeSeenAt) return null;
  const seen = async () => {
    setGone(true);
    const c = supabase();
    if (c) await c.rpc('mark_legacy_notice_seen');
    reloadProfile();
  };
  return (
    <div className="legacy-notice" role="status">
      <p>
        <b>Halo sync is now part of Plus.</b> You were already syncing, so it stays on for you until {short(access.legacyUntil)}, the end of this term. After that, Plus keeps it going for ${PRICES.plus.month.toFixed(2)} a month ({CANCEL_LINE.toLowerCase()}); your syllabus classes and anything you add stay free.
      </p>
      <button type="button" className="btn small" onClick={() => void seen()}>
        Got it
      </button>
    </div>
  );
}
