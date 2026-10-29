import { bump } from '../analytics/usage';
import { syncPress } from '../ui/presses';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useAccount } from '../auth/AccountContext';
import { supabase } from '../auth/client';
import { prepareCheckout, startCheckout } from '../billing/client';
import { syncAccess, type SyncAccess } from '../config/flags';
import { CANCEL_LINE, PLAN_LINES, PRICES, TAX_LINE, TIER_NAMES, TRIAL } from '../config/tiers';
import { dateOf, fmtDate } from '../domain/dates';
import { receiptsLine } from '../domain/receipts';
import { useStore } from '../storage/store';
import { TrialOffer, useReceipts } from './TrialOffer';

/**
 * Halo sync on every plan (Free since 2026-10-25). A build with no accounts (a demo or the preview) has no plan to check and
 * keeps sync on; everything else asks `syncAccess` in config/flags.ts.
 */
export function useSyncAccess(): SyncAccess {
  const { profile, auth, planKnown } = useAccount();
  if (!auth.configured) return { allowed: true, via: 'plan', pausedSince: null, legacyUntil: null };
  // Until the plan is known nothing is paused: no frozen banner, no peek, no wall for a student who is paying.
  if (!planKnown) return { allowed: true, via: 'plan', pausedSince: null, legacyUntil: null };
  // Still checking the sign-in: nothing is paused yet (the session arrives a moment later).
  if (!auth.session && auth.loading) return { allowed: true, via: 'plan', pausedSince: null, legacyUntil: null };
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

/**
 * One tap to Stripe for Max (2026-10-29: Max is the one plan sold, $0.99 a month). The checkout is made ready as soon
 * as the button is on screen, so the press only opens Stripe's page, where Apple Pay and Google Pay are at the top on a
 * device that has them. Coming back, the webhook has set the plan.
 */
export function UpgradeButton({ tier = 'max', label, primary = true, cancelNote = true, taxNote, source, next }: { tier?: 'max'; label?: string; primary?: boolean; cancelNote?: boolean; /** "plus tax where applicable": on by default whenever the button shows a price. */ taxNote?: boolean; /** Which win-back message this came from, for the funnel. */ source?: string; /** Where to land after paying, e.g. '/practice?i=…'. */ next?: string }) {
  const { planKnown, auth } = useAccount();
  // Ready before the press: Stripe's page is made while the student reads.
  useEffect(() => {
    if (planKnown && auth.session) void prepareCheckout(next ?? '');
  }, [planKnown, auth.session, next]);
  const opening = useCheckoutOpening();
  const mine = opening === tier;
  const [slow, setSlow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Pressed: this button shows the work, every other plan button waits (George, 2026-10-09: 30 s with no sign).
  const go = async () => {
    if (opening) return;
    setCheckoutOpening(tier);
    setErr(null);
    setSlow(false);
    if (source) bump(`winback:upgrade:${source}`);
    bump(`plan:click:${tier}`);
    const slowTimer = window.setTimeout(() => setSlow(true), 10_000);
    const r = await startCheckout(tier, 'month', next);
    window.clearTimeout(slowTimer);
    if (r.ok) {
      bump('checkout:open');
      window.location.href = r.url;
      // Back from Stripe without a reload (Back, or a same-origin address): the buttons wake up again.
      window.setTimeout(() => setCheckoutOpening(null), 8000);
      return;
    }
    setErr(r.error);
    setSlow(false);
    setCheckoutOpening(null);
  };
  const text = label ?? `Keep ${TIER_NAMES[tier]} · $${PRICES[tier].month.toFixed(2)}/mo`;
  const tax = taxNote ?? text.includes('$');
  const note = [cancelNote ? CANCEL_LINE : '', tax ? TAX_LINE : ''].filter(Boolean).join(' · ');
  if (!planKnown) return null;
  return (
    <>
      <button type="button" className={`${primary ? 'btn small primary' : 'btn small'}${mine ? ' is-opening' : ''}`} disabled={!!opening} aria-busy={mine || undefined} onClick={() => void go()}>
        {mine ? (
          <>
            <span className="spinner" aria-hidden />
            {slow ? 'Still working, almost there…' : 'Opening secure checkout…'}
          </>
        ) : (
          text
        )}
      </button>
      {note && !mine && <span className="cancel-note">{note}</span>}
      {err && (
        <span className="hint checkout-error" role="alert">
          {err}{' '}
          <button type="button" className="hero-inline" onClick={() => void go()}>
            Try again
          </button>
        </span>
      )}
    </>
  );
}

// One checkout at a time, across every plan button on the screen.
let openingTier: 'max' | null = null;
if (typeof window !== 'undefined') window.addEventListener('pageshow', () => setCheckoutOpening(null));
const openingListeners = new Set<() => void>();
function setCheckoutOpening(t: 'max' | null): void {
  openingTier = t;
  for (const l of openingListeners) l();
}
function useCheckoutOpening(): 'max' | null {
  return useSyncExternalStore(
    (cb) => {
      openingListeners.add(cb);
      return () => openingListeners.delete(cb);
    },
    () => openingTier,
    () => null,
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
        <b>Halo sync paused{when ? ` since ${when}` : ''}.</b> <span className="frozen-long">Tap Sync to see what's changed in Halo since then.</span>
        <span className="frozen-short">Tap Sync to see what's changed.</span>
      </p>
      <div className="frozen-actions">
        <button type="button" className="btn small primary" onClick={() => syncPress.current?.()}>
          Sync: see what's changed
        </button>
        <UpgradeButton label={`Max, $${PRICES.max.month.toFixed(2)} a month`} primary={false} cancelNote={false} />
        <a className="hero-inline" href="#/you?s=plan">
          See plans
        </a>
      </div>
    </div>
  );
}

/**
 * "as of Oct 3" beside a due date Halo gave, while frozen and only once the last sync is from an earlier day: dates read
 * from Halo today are today's (2026-10-24: "as of Oct 24" on every row, the day of the sync, was noise).
 */
export function AsOf({ item }: { item?: { haloId?: string | null; source?: string } }) {
  const { frozen, asOf } = useFrozen();
  const short = useShortDate();
  const { data } = useStore();
  if (!frozen || !asOf || (item && !item.haloId && item.source !== 'halo')) return null;
  const tz = data.settings.timezone;
  if (dateOf(asOf, tz) === dateOf(new Date().toISOString(), tz)) return null;
  return <span className="as-of"> as of {short(asOf)}</span>;
}

/**
 * The card where sync would have happened: the sync sheet, and a bookmark that arrives while sync is off. Says what
 * Max did during the trial when it was one, then the one-tap upgrade.
 */
export function PlanWall({ context = 'now' }: { context?: 'now' | 'sync' }) {
  const { profile, planKnown } = useAccount();
  const short = useShortDate();
  const receipts = useReceipts(profile?.trialStartedAt ?? undefined);
  const did = receipts ? receiptsLine(receipts, 'during your trial') : null;
  const trialEnded = !!profile?.trialStartedAt && !!profile.trialEndsAt;
  if (!planKnown) return null;
  return (
    <section className="card plan-wall" aria-label="Choose a plan">
      <p className="eyebrow">{trialEnded ? `Your free trial ended ${short(profile!.trialEndsAt ?? null) ?? ''}` : 'Max'}</p>
      <p className="trial-lead">{context === 'sync' ? 'Everything you have stays, and Halo keeps syncing on Free. Max reads every announcement for you and syncs on its own.' : 'Everything you have stays. Max reads every announcement for you and syncs on its own every 3 hours.'}</p>
      {did && <p className="hint">{did}</p>}
      <ul className="plan-lines">
        {PLAN_LINES.max.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <p className="hint">
        ${PRICES.max.month.toFixed(2)} a month, {TAX_LINE}. {CANCEL_LINE}, in one click from You; a cancelled plan runs to the end of the month paid for.
      </p>
      {!trialEnded && <TrialOffer lead={TRIAL.offer} label="Start my free trial" />}
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
        <b>Halo sync is free.</b> It stays on for you on every plan; Max adds auto-sync every 3 hours and every announcement read for you, for ${PRICES.max.month.toFixed(2)} a month, {TAX_LINE} ({CANCEL_LINE.toLowerCase()}).
      </p>
      <button type="button" className="btn small" onClick={() => void seen()}>
        Got it
      </button>
    </div>
  );
}
