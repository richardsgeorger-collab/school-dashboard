import { useEffect, useState } from 'react';
import { useAccount } from '../../auth/AccountContext';
import { supabase, supabaseConfig } from '../../auth/client';
import { Modal } from '../../components/Modal';
import { planOf } from '../../config/tiers';
import { useCan } from '../../config/useCan';

/** The feed's addresses: the file itself, the same as webcal:// (Apple, Outlook), and Google's "add by URL" page. */
export function feedUrls(supabaseUrl: string, token: string) {
  const https = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/calendar/${token}.ics`;
  const webcal = https.replace(/^https?:\/\//, 'webcal://');
  return { https, webcal, google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` };
}

function ago(iso: string, now = Date.now()): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
}

/**
 * Your deadlines in Google Calendar, Apple Calendar or Outlook (2026-10-01, Plus): subscribe once to a private link
 * and the calendar app re-reads it on its own. Opened from the Calendar screen's "Add to my calendar app".
 */
export function CalendarFeed({ onClose }: { onClose: () => void }) {
  const { auth } = useAccount();
  const allowed = useCan('icsFeed');
  const cfg = supabaseConfig();
  const [feed, setFeed] = useState<{ token: string; last_fetched_at: string | null } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = async (rotate = false) => {
    const c = supabase();
    if (!c) return;
    const { data, error } = await c.rpc('my_calendar_feed', { rotate });
    if (error || !data) return setErr('Could not get your calendar link. Check your connection and try again.');
    setErr(null);
    setFeed(data as { token: string; last_fetched_at: string | null });
  };
  useEffect(() => {
    if (auth.session && allowed) void load();
  }, [auth.session, allowed]);

  const body = () => {
    if (!cfg || !auth.session)
      return (
        <>
          <p>Your due dates can show up in Google Calendar, Apple Calendar or Outlook, and stay up to date there.</p>
          <p className="hint">This needs an account, so your calendar app has somewhere to read them from.</p>
          <div className="settings-actions">
            <a className="btn primary" href="#/login">
              Log in
            </a>
          </div>
        </>
      );
    if (!allowed)
      return (
        <>
          <p>Every due date in Google Calendar, Apple Calendar or Outlook, kept up to date as Halo changes.</p>
          <p className="hint">The calendar link is part of {planOf('icsFeed')}.</p>
          <div className="settings-actions">
            <a className="btn primary" href="#/you?s=plan&to=plus" onClick={onClose}>
              See {planOf('icsFeed')}
            </a>
          </div>
        </>
      );
    if (err) return <p className="hint" role="alert">{err}</p>;
    if (!feed) return <p className="hint">Getting your link…</p>;
    const urls = feedUrls(cfg.url, feed.token);
    const copy = () =>
      void navigator.clipboard
        ?.writeText(urls.https)
        .then(() => setCopied(true))
        .catch(() => setCopied(false));
    return (
      <>
        <p>Add it once. Every due date shows up in your calendar, and when a date changes here it changes there.</p>
        <div className="feed-actions">
          <a className="btn primary" href={urls.google} target="_blank" rel="noopener">
            Add to Google Calendar
          </a>
          <a className="btn" href={urls.webcal}>
            Add to Apple Calendar
          </a>
          <button type="button" className="btn" onClick={copy}>
            {copied ? 'Link copied' : 'Copy link (Outlook and others)'}
          </button>
        </div>
        <input className="field-input feed-link" readOnly value={urls.https} aria-label="Your calendar link" onFocus={(e) => e.currentTarget.select()} />
        <p className="hint">Apple Calendar and Outlook check about every hour. Google Calendar checks on its own schedule, usually a few times a day, so a change can take a while to show there.</p>
        <p className="hint">{feed.last_fetched_at ? `A calendar app last read it ${ago(feed.last_fetched_at)}.` : 'No calendar app has read it yet.'}</p>
        <p className="hint">Keep the link to yourself: anyone who has it can see your due dates.</p>
        {confirmNew ? (
          <div className="settings-actions">
            <button
              type="button"
              className="btn danger small"
              onClick={() =>
                void load(true).then(() => {
                  setConfirmNew(false);
                  setCopied(false);
                  setNote('New link made. The old one stopped working: add the new one to your calendar app.');
                })
              }
            >
              Make a new link
            </button>
            <button type="button" className="btn small" onClick={() => setConfirmNew(false)}>
              Keep this one
            </button>
          </div>
        ) : (
          <button type="button" className="hero-inline" onClick={() => setConfirmNew(true)}>
            Shared it by mistake? Make a new link
          </button>
        )}
        {note && (
          <p className="hint" role="status">
            {note}
          </p>
        )}
      </>
    );
  };

  return (
    <Modal title="Add to my calendar app" onClose={onClose}>
      <div className="feed">{body()}</div>
    </Modal>
  );
}
