import { useEffect, useRef, useState } from 'react';
import { AI_DIRECT_ALLOWED, latestMeter, onMeter } from '../ai/gateway';
import { warningLine, type Meter } from '../ai/meter';
import { useAccount } from '../auth/AccountContext';
import { deleteMyAccount, exportEverything } from '../auth/account';
import { SignIn } from '../auth/SignIn';
import { loadApiKey, saveApiKey } from '../chat/key';
import { CourseChip } from '../components/CourseChip';
import { ProgressCard } from '../components/ProgressCard';
import { SegmentedControl } from '../components/SegmentedControl';
import { can, rewardDaysLeft, trialDaysLeft } from '../config/flags';
import { DEFAULT_ACCENT } from '../config/accents';
import { AccentPicker } from './AccentPicker';
import { FEATURE_LINES, FEATURES, PRICES, REFERRAL, TIER_NAMES, TIERS, TRIAL, type Feature, type Tier } from '../config/tiers';
import { openPortal, startCheckout } from '../billing/client';
import { subscriptionLine, type Interval, type Paid } from '../billing/subscription';
import { useSubscription } from '../billing/useSubscription';
import { PALETTE } from '../data/courseDefaults';
import { addDays, dateOf, fmtClock, fmtDate, hhmmToMinutes, weekStart } from '../domain/dates';
import { dayCapacity } from '../domain/schedule';
import { courseGrade, letterFor, NOT_ENOUGH_GRADED } from '../domain/grades';
import { newId } from '../domain/ids';
import { finished as sundayFinished, switchedOn } from '../domain/sunday';
import type { Course, DateStr } from '../domain/types';
import { announceDb } from '../halo/announce';
import { useRoute } from '../router';
import { pixel } from '../analytics/pixel';
import { NotificationsCard } from '../notify/NotificationsCard';
import { FeedbackCard } from './FeedbackCard';
import { TrialOffer, TrialReceipts } from './TrialOffer';
import { fresh as freshOnboarding } from '../onboarding/state';
import { useStore } from '../storage/store';
import { syncPress } from '../ui/presses';
import { AiPanel } from './AiPanel';
import { CourseEditor } from './CourseEditor';
import { DuplicatesPanel } from './DuplicatesPanel';
import { HaloImport } from './HaloImport';
import { HaloDiagnostics, HaloPanel } from './HaloPanel';
import { ImportSyllabus } from './ImportSyllabus';
import { blankItem, ItemDetail } from './ItemDetail';
import { SundayReview } from './SundayReview';
import { SyllabusPanel } from './SyllabusPanel';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ZONES = ['America/Phoenix', 'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'UTC'];
type Section = 'profile' | 'plan' | 'progress' | 'grades' | 'workload' | 'halo' | 'study' | 'display' | 'classes' | 'notifications' | 'invite' | 'feedback' | 'advanced';
/** The section list, in the order a student needs them. `plan` is Profile with the plans open. */
const NAV: [Section, string][] = [
  ['profile', 'Profile and plan'],
  ['progress', 'Progress'],
  ['grades', 'Grades'],
  ['workload', 'Workload'],
  ['halo', 'Halo connection'],
  ['study', 'Study time'],
  ['display', 'Display'],
  ['classes', 'Classes'],
  ['notifications', 'Notifications'],
  ['invite', 'Invite a friend'],
  ['feedback', 'Feedback'],
  ['advanced', 'Advanced'],
];

function meetingSummary(c: Course): string {
  if (c.online) return 'Online';
  if (c.meetings.length === 0) return 'No meeting times';
  return c.meetings
    .map((m) => {
      const s = hhmmToMinutes(m.start);
      return `${DAYS[m.day]} ${fmtClock(Math.floor(s / 60), s % 60)}`;
    })
    .join(' · ');
}

/** One collapsible group of settings. Opens itself when the address names it. */
function AccountCard({ tier }: { tier: Tier }) {
  const { auth, profile, reloadProfile } = useAccount();
  const { data } = useStore();
  const { params } = useRoute();
  const [tick, setTick] = useState(0);
  const sub = useSubscription(auth.userId, tick);
  const checkout = params.get('checkout');
  const [note, setNote] = useState<string | null>(checkout === 'success' ? 'Thank you. Your plan is live; it can take a few seconds to show here.' : checkout === 'cancel' ? 'No charge was made.' : null);
  useEffect(() => {
    if (checkout !== 'success') return;
    pixel('Subscribe');
    const t = setTimeout(() => {
      reloadProfile();
      setTick((k) => k + 1);
    }, 4000);
    return () => clearTimeout(t);
  }, [checkout, reloadProfile]);
  if (!auth.configured) {
    return (
      <section className="card settings-card" aria-label="Account">
        <h2 className="section-title">Account</h2>
        <p className="hint">This build has no accounts. Everything stays on this device.</p>
      </section>
    );
  }
  if (!auth.session) return <SignIn auth={auth} note="Your classes and work follow you to your phone and laptop, and nothing is lost if this browser is cleared." />;
  const tz = data.settings.timezone;
  const days = trialDaysLeft(profile);
  const reward = rewardDaysLeft(profile);
  const line = subscriptionLine(sub, profile?.graceUntil ?? null, (iso) => fmtDate(dateOf(iso, tz), 'short'));
  const manage = async () => {
    const r = await openPortal();
    if (r.ok) window.location.assign(r.url);
    else setNote(r.error);
  };
  return (
    <section className="card settings-card" aria-label="Account">
      <h2 className="section-title">Account</h2>
      <p className="you-email">{auth.email}</p>
      {/* The plan and the trial are one quiet line, not a coloured badge. */}
      <p className="hint">
        {TIER_NAMES[tier]}
        {days !== null ? ` · ${days} day${days === 1 ? '' : 's'} left on your Max trial` : ''}
        {reward !== null ? ` · Plus from a friend for ${reward} more day${reward === 1 ? '' : 's'}` : ''}
      </p>
      {line && <p className="hint">{line}</p>}
      {note && (
        <p className="hint" role="status">
          {note}
        </p>
      )}
      <div className="settings-actions">
        {sub ? (
          <button type="button" className="btn small primary" onClick={() => void manage()}>
            Manage plan
          </button>
        ) : (
          <a className="btn small primary" href="#/you?s=plan">
            See plans
          </a>
        )}
        {profile?.isAdmin && (
          <a className="btn small" href="#/admin">
            Admin
          </a>
        )}
        <button type="button" className="btn small" onClick={() => void auth.signOut()}>
          Sign out
        </button>
      </div>
    </section>
  );
}

/** Send a friend the link; both get a month of Plus when they sign up. */
function ReferralCard() {
  const { auth, profile } = useAccount();
  const [copied, setCopied] = useState(false);
  if (!auth.configured || !auth.session || !profile?.referralCode) return null;
  const link = `${window.location.origin}${import.meta.env.BASE_URL}#/now?ref=${profile.referralCode}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <section className="card settings-card" aria-label="Invite a friend">
      <h2 className="section-title">Invite a friend</h2>
      <p className="hint">
        Send this link. When they sign up, you both get {REFERRAL.days} days of {TIER_NAMES[REFERRAL.rewardTier]}.
      </p>
      <p className="mono you-invite" title={link}>
        {link.replace(/^https?:\/\//, '').replace(/\/(?:[^/]*\/)?#\/now\?ref=/, '/…ref=')}
      </p>
      <div className="settings-actions">
        <button type="button" className="btn small primary" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </section>
  );
}

/** Hours planned each week of the term against capacity, as bars; the full breakdown is one tap away. */
function WorkloadSection() {
  const { data, schedule, term, today } = useStore();
  const weeks: { start: DateStr; planned: number; cap: number; label: string }[] = [];
  const first = weekStart(term.start, data.settings.weekStartsOn);
  for (let ws = first; ws <= term.end; ws = addDays(ws, 7)) {
    const cap = Array.from({ length: 7 }, (_, k) => dayCapacity(data.settings, addDays(ws, k))).reduce((a, b) => a + b, 0);
    weeks.push({ start: ws, planned: schedule.weekLoad[ws]?.total ?? 0, cap, label: fmtDate(ws, 'short') });
  }
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.planned, w.cap)));
  const thisWeek = weekStart(today, data.settings.weekStartsOn);
  const over = weeks.filter((w) => w.planned > w.cap).length;
  return (
    <section className="card settings-card" aria-label="Workload">
      <h2 className="section-title">Workload</h2>
      <p className="hint">
        Study hours planned each week against your capacity. {over > 0 ? `${over} week${over === 1 ? '' : 's'} run over.` : 'No week runs over.'}
      </p>
      {weeks.length === 0 ? (
        <p className="hint">Your workload appears after the first sync.</p>
      ) : (
        <div className="wl" role="img" aria-label="Hours by week">
          {weeks.map((w) => (
            <div key={w.start} className="wl-col" data-current={w.start === thisWeek} data-over={w.planned > w.cap} title={`${w.label}: ${(w.planned / 60).toFixed(1)}h of ${(w.cap / 60).toFixed(0)}h`}>
              <span className="wl-cap" style={{ bottom: `${(w.cap / max) * 100}%` }} />
              <span className="wl-bar" style={{ height: `${(w.planned / max) * 100}%` }} />
              <span className="wl-label">{w.label.replace(/^(\w+) /, '')}</span>
            </div>
          ))}
        </div>
      )}
      <div className="settings-actions">
        <a className="btn small" href="#/load">
          Week by week
        </a>
      </div>
    </section>
  );
}

/** How much of this month's AI the student has used, from the server's last answer. Only when the plan has AI. */
function UsageCard() {
  const [m, setM] = useState<Meter | null>(latestMeter());
  useEffect(() => onMeter(setM), []);
  if (!m || m.ceilingUsd <= 0) return null;
  const warn = warningLine(m);
  return (
    <section className="card settings-card" aria-label="AI this month">
      <h2 className="section-title">AI this month</h2>
      <p className="mono">
        ${m.monthCostUsd.toFixed(2)} of ${m.ceilingUsd.toFixed(2)}
        {m.messagesCap > 0 ? ` · ${m.messagesToday} of ${m.messagesCap} messages today` : ''}
        {m.lecturesCap > 0 ? ` · ${m.lecturesThisWeek} of ${m.lecturesCap} lectures this week` : ''}
      </p>
      <span className="levelbar-track big" aria-hidden>
        <span className="levelbar-fill" style={{ width: `${Math.min(100, m.ceilingUsed * 100)}%` }} />
      </span>
      {warn && <p className="hint">{warn}</p>}
      {m.ceilingUsed >= 1 && <p className="hint">AI is paused until the 1st. Everything else keeps working.</p>}
    </section>
  );
}

function Plans({ current, highlight }: { current: Tier; highlight: Tier | null }) {
  const { auth } = useAccount();
  const [interval, setInterval_] = useState<Interval>('month');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paid = TIERS.filter((t): t is Paid => t !== 'free');
  const ready = auth.configured && !!auth.session;
  const choose = async (t: Paid) => {
    setBusy(t);
    setError(null);
    const r = await startCheckout(t, interval);
    if (r.ok) window.location.assign(r.url);
    else {
      setError(r.error);
      setBusy(null);
    }
  };
  return (
    <section className="card settings-card" id="you-plan" aria-label="Plans">
      <h2 className="section-title">Plans</h2>
      <p className="hint">Each plan adds to the one before it. Change or cancel any time.</p>
      <TrialOffer lead={`Not sure? Try Max free for ${TRIAL.days} days.`} />
      <SegmentedControl
        label="Billing"
        value={interval}
        options={[
          { value: 'month', label: 'Monthly' },
          { value: 'year', label: 'Yearly, two months free' },
        ]}
        onChange={(v) => setInterval_(v)}
      />
      <div className="plans">
        {paid.map((t) => {
          const adds = (Object.keys(FEATURES) as Feature[]).filter((f) => FEATURES[f] === t);
          return (
            <div key={t} className="plan card" data-current={current === t} data-highlight={highlight === t}>
              <div className="grade-head">
                <b>{TIER_NAMES[t]}</b>
                {current === t && (
                  <span className="plan-badge" data-tier={t}>
                    Current
                  </span>
                )}
              </div>
              <p className="plan-price">
                {interval === 'month' ? `$${PRICES[t].month.toFixed(2)}` : `$${PRICES[t].year}`}
                <small> {interval === 'month' ? 'a month' : 'a year'}</small>
              </p>
              <ul>
                {adds.map((f) => (
                  <li key={f}>{FEATURE_LINES[f]}</li>
                ))}
              </ul>
              {ready ? (
                <button type="button" className="btn small primary" disabled={busy !== null || current === t} onClick={() => void choose(t)}>
                  {current === t ? 'Current plan' : busy === t ? 'Opening…' : `Choose ${TIER_NAMES[t]}`}
                </button>
              ) : (
                <a className="btn small primary" href="#/you">
                  Sign in to choose
                </a>
              )}
            </div>
          );
        })}
      </div>
      {error && (
        <p className="hint" role="alert">
          {error}
        </p>
      )}
      <p className="hint">Payments go through Stripe. Change or cancel any time from Manage plan; a cancelled plan runs to the end of what was paid for.</p>
    </section>
  );
}

/** You: your account and plan, your progress, your grades, and every setting in its own group. */
export function You() {
  const { data, today, actions } = useStore();
  const { auth, tier } = useAccount();
  const { params } = useRoute();
  const section = (params.get('s') ?? null) as Section | null;
  const highlight = (params.get('to') ?? null) as Tier | null;
  const [editing, setEditing] = useState<Course | null>(null);
  const [importing, setImporting] = useState(false);
  const [halo, setHalo] = useState(false);
  const [review, setReview] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmFresh, setConfirmFresh] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState(() => loadApiKey());
  const fileRef = useRef<HTMLInputElement>(null);

  const active: Section = section === 'plan' || !section ? 'profile' : section;
  const [showPlans, setShowPlans] = useState(false);

  const exportAll = async () => {
    const announcements = await announceDb.list().catch(() => []);
    const blob = new Blob([exportEverything(data, announcements)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `school-dashboard-${today}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importJson = async (file: File) => {
    try {
      const r = actions.importJson(await file.text());
      setNote(`Restored ${r.courses} classes and ${r.items} items.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e));
    }
  };
  const removeAccount = async () => {
    const r = await deleteMyAccount();
    if (!r.ok) return setNote(r.error);
    actions.clearAll();
    setNote('Your account and everything in it are gone.');
    setConfirmDelete(false);
  };
  const hours = (min: number) => (min / 60).toString();
  const addClass = () =>
    setEditing({
      id: newId(),
      code: '',
      name: '',
      color: PALETTE[data.courses.length % PALETTE.length],
      credits: 3,
      instructors: [],
      meetings: [],
      online: false,
      termStart: data.courses[0]?.termStart ?? today,
      termEnd: data.courses[0]?.termEnd ?? today,
      updatedAt: '',
    });

  return (
    <>
      <h1 className="page-title">You</h1>
      <div className="you-layout">
        <nav className="you-nav" aria-label="Settings">
          {NAV.map(([id, label]) => (
            <a key={id} href={`#/you?s=${id}`} aria-current={active === id ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <div className="you-content" key={active}>
          {active === 'profile' && (
            <>
              <AccountCard tier={tier} />
              <TrialReceipts />
              <TrialOffer />
              {(section === 'plan' || showPlans) && <Plans current={tier} highlight={highlight} />}
              {section !== 'plan' && !showPlans && (
                <p className="hint">
                  <button type="button" className="hero-inline" onClick={() => setShowPlans(true)}>
                    See plans
                  </button>
                </p>
              )}
            </>
          )}
          {active === 'progress' && <ProgressCard />}
          {active === 'grades' && (
            <section className="card settings-card" aria-label="Grades">
          <div className="grade-head">
            <h2 className="section-title">Grades</h2>
            {data.courses.length > 0 && (
              <a className="btn small" href="#/grades">
                All grades
              </a>
            )}
          </div>
          {data.courses.length === 0 ? (
            <p className="hint">Grades arrive with your first Halo sync.</p>
          ) : (
            <ul className="you-grades">
              {data.courses.map((c) => {
                const g = courseGrade(c.id, data.items);
                const letter = letterFor(g.pct, c.gradeScale);
                return (
                  <li key={c.id}>
                    <CourseChip course={c} link />
                    {g.pct === null ? <span className="muted">{g.graded > 0 ? NOT_ENOUGH_GRADED : 'Not graded yet'}</span> : <span className="mono">{`${g.pct}%${letter ? ` ${letter}` : ''}`}</span>}
                  </li>
                );
              })}
            </ul>
          )}
            </section>
          )}
          {active === 'workload' && <WorkloadSection />}
          {active === 'halo' && <HaloPanel onPaste={() => setHalo(true)} />}
          {active === 'study' && (
            <section className="card settings-card" aria-label="Study time">
              <h2 className="section-title">Study time</h2>
          <div className="field-row">
            <label className="field">
              <span>Weekday study hours</span>
              <input type="number" min={0} max={16} step={0.5} inputMode="decimal" value={hours(data.settings.weekdayMinutes)} onChange={(e) => actions.updateSettings({ weekdayMinutes: Math.round(Number(e.target.value) * 60) })} />
            </label>
            <label className="field">
              <span>Weekend study hours</span>
              <input type="number" min={0} max={16} step={0.5} inputMode="decimal" value={hours(data.settings.weekendMinutes)} onChange={(e) => actions.updateSettings({ weekendMinutes: Math.round(Number(e.target.value) * 60) })} />
            </label>
          </div>
          <p className="hint">Hours a day of focused schoolwork outside class. Start-by dates and the workload view come from these.</p>
          <label className="field" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={!!data.settings.eveningQuiet} onChange={(e) => actions.updateSettings({ eveningQuiet: e.target.checked })} />
            <span>Evening quiet: after 9 PM, Now stops nudging about pace unless something is overdue.</span>
          </label>
          <label className="field" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={!!data.settings.dailyQuestion} onChange={(e) => actions.updateSettings({ dailyQuestion: e.target.checked })} />
            <span>One flashcard from your own study kit on a quiet day, on Now.</span>
          </label>
          <div className="settings-actions sunday-settings">
            <span className="hint mono">
              Sunday review: {data.settings.sundayReview?.off ? 'off' : 'offered on Sundays'}
              {data.settings.sundayReview?.lastDone ? ` · last done ${data.settings.sundayReview.lastDone}` : ''}
            </span>
            <button type="button" className="btn small" onClick={() => actions.updateSettings({ sundayReview: data.settings.sundayReview?.off ? switchedOn(data.settings.sundayReview) : { ...(data.settings.sundayReview ?? { skips: 0, lastOffered: null, lastDone: null }), off: true } })}>
              {data.settings.sundayReview?.off ? 'Turn on' : 'Turn off'}
            </button>
            <button type="button" className="btn small" onClick={() => setReview(true)}>
              Review the week now
            </button>
          </div>
          <div className="field">
            <span>Week starts on</span>
            <SegmentedControl
              label="Week starts on"
              value={String(data.settings.weekStartsOn) as '0' | '1'}
              options={[
                { value: '0', label: 'Sunday' },
                { value: '1', label: 'Monday' },
              ]}
              onChange={(v) => actions.updateSettings({ weekStartsOn: Number(v) as 0 | 1 })}
            />
          </div>
            </section>
          )}
          {active === 'display' && (
            <section className="card settings-card" aria-label="Display">
              <h2 className="section-title">Display</h2>
          <div className="theme-field">
            <div className="field">
              <span>Theme</span>
              <SegmentedControl
                label="Theme"
                value={data.settings.theme}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                  { value: 'system', label: 'Auto' },
                ]}
                onChange={(v) => actions.updateSettings({ theme: v })}
              />
            </div>
          </div>
          <div className="field">
            <span>Accent</span>
            <AccentPicker value={data.settings.accent ?? DEFAULT_ACCENT} allowed={can('themes', tier)} onChange={(a) => actions.updateSettings({ accent: a })} />
            {can('themes', tier) && data.settings.accent && data.settings.accent !== DEFAULT_ACCENT && <p className="hint">Gold comes back if Max ends; your choice is kept.</p>}
          </div>
          <label className="field">
            <span>Time zone</span>
            <input list="zones" value={data.settings.timezone} onChange={(e) => actions.updateSettings({ timezone: e.target.value })} />
            <datalist id="zones">
              {ZONES.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </label>
            </section>
          )}
          {active === 'classes' && (
            <section className="card settings-card" aria-label="Classes">
              <h2 className="section-title">Classes</h2>
          {data.courses.length === 0 ? (
            <p className="hint">No classes yet. Sync Halo, or add one by hand.</p>
          ) : (
            <ul className="course-list">
              {data.courses.map((c) => (
                <li key={c.id}>
                  <button type="button" className="course-row" onClick={() => setEditing(c)}>
                    <CourseChip course={c} link />
                    <span className="course-row-name">{c.name}</span>
                    <span className="hint">{meetingSummary(c)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="settings-actions">
            <button type="button" className="btn small" onClick={addClass}>
              Add class
            </button>
            <button type="button" className="btn small" onClick={() => syncPress.current?.()}>
              Sync Halo
            </button>
          </div>
          <p className="hint">Tap a class to edit its code, name, instructor, meeting times, or online status, or to delete it.</p>
            </section>
          )}
          {active === 'notifications' && (
            <section className="card settings-card" aria-label="Notifications">
              <h2 className="section-title">Notifications</h2>
          <NotificationsCard />
            </section>
          )}
          {active === 'invite' && (
            <>
              <ReferralCard />
              <UsageCard />
            </>
          )}
          {active === 'feedback' && <FeedbackCard />}
          {active === 'advanced' && (
            <section className="card settings-card" aria-label="Advanced">
              <h2 className="section-title">Advanced</h2>
              <p className="hint">Diagnostics, imports, backups, and the things you should rarely need.</p>
          <HaloDiagnostics />
          <div className="settings-actions">
            <button type="button" className="btn" onClick={() => setImporting(true)}>
              Import a syllabus PDF
            </button>
            <button type="button" className="btn" onClick={() => setAdding(true)}>
              Add an item by hand
            </button>
            <button type="button" className="btn" onClick={() => syncPress.current?.()}>
              Import a calendar file (.ics)
            </button>
            <button type="button" className="btn" onClick={() => void exportAll()}>
              Export everything (JSON)
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Restore a backup
            </button>
            <button type="button" className="btn" onClick={() => actions.updateSettings({ onboarding: freshOnboarding() })}>
              Show the welcome again
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="visually-hidden" onChange={(e) => e.target.files?.[0] && void importJson(e.target.files[0])} />
            {confirmFresh ? (
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  actions.clearAll();
                  setConfirmFresh(false);
                  setNote('Everything is cleared. Sync Halo to start again.');
                }}
              >
                Confirm: remove every class and item
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => setConfirmFresh(true)}>
                Start fresh
              </button>
            )}
          </div>
          {note && <p className="hint">{note}</p>}
          <p className="hint">
            {data.courses.length} classes, {data.items.length} items on this device.
          </p>
          <SyllabusPanel />
          <DuplicatesPanel />
          {AI_DIRECT_ALLOWED && (
            <>
              <AiPanel />
              <section className="card settings-card" aria-label="Developer">
                <h2 className="section-title">Developer</h2>
                <label className="field">
                  <span>Anthropic API key (this device only, development builds only)</span>
                  <input type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} autoComplete="off" placeholder="sk-ant-…" />
                </label>
                <div className="settings-actions">
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      saveApiKey(keyDraft);
                      setNote(keyDraft.trim() ? 'Key saved on this device.' : 'Key removed.');
                    }}
                  >
                    Save key
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      actions.resetToSeed();
                      setNote('Loaded the sample Fall 2026 term.');
                    }}
                  >
                    Load the sample term
                  </button>
                </div>
              </section>
            </>
          )}
          {auth.configured && auth.session && (
            <div className="settings-actions">
              {confirmDelete ? (
                <button type="button" className="btn danger" onClick={() => void removeAccount()}>
                  Confirm: delete my account and all of its data
                </button>
              ) : (
                <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>
                  Delete my account
                </button>
              )}
            </div>
          )}
            </section>
          )}
        </div>
      </div>

      <p className="hint you-foot">
        Halo+ is an independent planner and is not affiliated with Grand Canyon University. Halo is GCU&apos;s learning platform.{' '}
        <a href="./privacy.html">Privacy</a> · <a href="./terms.html">Terms</a>
      </p>

      {editing && <CourseEditor key={editing.id} course={editing} onClose={() => setEditing(null)} />}
      {importing && <ImportSyllabus onClose={() => setImporting(false)} />}
      {halo && <HaloImport onClose={() => setHalo(false)} />}
      {adding && <ItemDetail item={blankItem(data.courses[0]?.id ?? '', data.settings.timezone, today)} isNew onClose={() => setAdding(false)} />}
      {review && (
        <SundayReview
          onClose={() => setReview(false)}
          onDone={() => {
            actions.updateSettings({ sundayReview: sundayFinished(data.settings.sundayReview, today) });
            setReview(false);
          }}
        />
      )}
    </>
  );
}
