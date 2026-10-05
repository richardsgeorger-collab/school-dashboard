import { pixel } from '../analytics/pixel';
import { BOOKMARK_NAME } from '../halo/bookmarkName';
import { HaloDraw } from '../components/HaloDraw';
import { IconCheck, IconClasses, IconGift, IconHalo, IconInbox, IconNow, IconStudy } from '../components/Icons';
import { HELP_PAGES } from '../help/pages';
import { EXTENSION_URL } from '../config/extension';
import { CANCEL_LINE, PLAN_LINES, PRICES, TAX_LINE, TIER_NAMES, TRIAL } from '../config/tiers';

/**
 * The front door, at the root address, for a GCU student who has never seen Halo+. One line on what it does, the
 * app itself as the picture (real markup, real tokens, so it can never drift from the product), four things it does,
 * the plans from the one config file, four questions, and the line that it is not from GCU. Anyone signed in never
 * sees this: the root goes straight to Now for them.
 */
const PLANS: { tier: 'free' | 'plus' | 'max'; lines: string[] }[] = [
  { tier: 'free', lines: PLAN_LINES.free },
  { tier: 'plus', lines: PLAN_LINES.plus },
  { tier: 'max', lines: PLAN_LINES.max },
];

export function Landing() {
  const signUp = () => pixel('Lead');
  return (
    <div className="landing">
      <header className="landing-head">
        <a className="brand" href="#/" aria-label="Halo+">
          <span className="brand-mark" aria-hidden>
            <IconHalo />
          </span>
          <span className="brand-text">Halo+</span>
        </a>
        <nav className="landing-nav" aria-label="Account">
          <a className="btn" href="#/login">
            Log in
          </a>
          <a className="btn primary" href="#/start" onClick={signUp}>
            Try it free
          </a>
        </nav>
      </header>

      <section className="landing-hero" aria-label="What Halo+ is">
        <div className="landing-copy">
          <p className="eyebrow">The planner built for Halo</p>
          <h1 className="landing-title">Every GCU deadline in one place. Even the ones hidden in announcements.</h1>
          <p className="landing-lede">
            Halo+ reads your Halo classes, grades and every announcement, then tells you the one thing to do next: when it's due, how long it takes, what it's worth. It syncs itself every 3 hours and never asks for your password.
          </p>
          <div className="landing-cta">
            <a className="btn primary" href="#/start" onClick={signUp}>
              Try it free
            </a>
            <a className="btn" href="#/login">
              Log in
            </a>
          </div>
          <p className="hint">Every feature free for {TRIAL.days} days. No card, nothing to cancel.</p>
        </div>

        {/* The picture is the app: the same classes and tokens Now uses, so the landing wears whatever gold the app wears. */}
        <div className="landing-mock" aria-label="What the app looks like" role="img">
          <div className="now">
            <header className="now-head">
              <div>
                <p className="eyebrow">Thursday morning</p>
                <h2 className="now-title">2 things need you.</h2>
              </div>
              <div className="now-ring" aria-hidden>
                <svg data-viz="" className="ring" viewBox="0 0 44 44" width="48" height="48" data-done="false">
                  <circle className="ring-track" cx="22" cy="22" r="18" />
                  <circle className="ring-fill" cx="22" cy="22" r="18" strokeDasharray="113.1" strokeDashoffset="75.4" />
                </svg>
                <span className="now-ring-label">1/3</span>
              </div>
            </header>
            <section className="hero" data-state="work" style={{ '--course': '#d9534f' } as React.CSSProperties}>
              <div className="hero-top">
                <span className="hero-eyebrow">
                  <span className="chip" style={{ '--course': '#d9534f' } as React.CSSProperties}>
                    <span className="dot" />
                    CHM-113
                  </span>
                  <span className="hero-kind">Lab</span>
                </span>
                <span className="pill" data-tone="soon">
                  Due today
                </span>
              </div>
              <h2 className="hero-title">Lab 3 titration write-up</h2>
              <p className="hero-why">It's ~1.5h, due before class, and Dr. Awad moved it up in Tuesday's announcement.</p>
              <p className="hero-meta">
                <span className="pill">50 pts · 12% of grade</span>
                <span className="pill">~1.5h</span>
                <span className="pill">due 4:59 PM</span>
              </p>
              <div className="hero-actions">
                <span className="btn primary">Start</span>
                <span className="btn" aria-hidden>
                  <IconCheck />
                </span>
                <span className="btn quiet">Details</span>
              </div>
            </section>
            <section className="then">
              <h3 className="section-title">Then</h3>
              <ul className="item-list">
                <li>
                  <span className="row" style={{ '--course': '#3a7bd5' } as React.CSSProperties}>
                    <span className="dot" aria-hidden />
                    <span className="row-body">
                      <span className="row-title">Rhetorical analysis draft</span>
                      <span className="row-meta">ENG-105 · tomorrow · ~2h · 100 pts</span>
                    </span>
                  </span>
                </li>
                <li>
                  <span className="row" style={{ '--course': '#2f9e5b' } as React.CSSProperties}>
                    <span className="dot" aria-hidden />
                    <span className="row-body">
                      <span className="row-title">Topic 4 DQ replies</span>
                      <span className="row-meta">UNV-106 · Sunday · ~30m · 10 pts</span>
                    </span>
                  </span>
                </li>
              </ul>
            </section>
            <aside className="now-side">
              <section className="card headsup">
                <h3 className="section-title">Heads up</h3>
                <ul className="headsup-list">
                  <li className="headsup-line" data-tone="soon">
                    <span className="headsup-dot" aria-hidden />
                    <span className="headsup-text">Lab 3 needs your own splash goggles, from an announcement. Open it</span>
                  </li>
                  <li className="headsup-line">
                    <span className="headsup-dot" aria-hidden />
                    <span className="headsup-text">Next week is heavy: 5 items, 400 pts. Start the paper this weekend.</span>
                  </li>
                </ul>
              </section>
            </aside>
          </div>
        </div>
      </section>

      <section className="landing-section" aria-label="What it does">
        <h2 className="landing-h2">What it does</h2>
        <div className="landing-grid">
          <article className="card landing-feature">
            <span className="landing-icon" aria-hidden>
              <IconNow />
            </span>
            <h3>Says what to do now</h3>
            <p>One thing at a time, ranked by due date, real time and points. Nothing to sort, nothing to forget.</p>
          </article>
          <article className="card landing-feature">
            <span className="landing-icon" aria-hidden>
              <IconInbox />
            </span>
            <h3>Reads every announcement</h3>
            <p>The “due Friday” your professor only posted in an announcement lands on the assignment, in their own words.</p>
          </article>
          <article className="card landing-feature">
            <span className="landing-icon" aria-hidden>
              <IconClasses />
            </span>
            <h3>Your real grades</h3>
            <p>Halo's grades for every class on one screen, and what you need on the rest of the term.</p>
          </article>
          <article className="card landing-feature">
            <span className="landing-icon" aria-hidden>
              <IconStudy />
            </span>
            <h3>Studies with you</h3>
            <p>A study plan and practice worksheet for your next quiz, from your own slides. Check your work against the rubric first.</p>
          </article>
        </div>
      </section>

      <section className="landing-section" aria-label="How it works">
        <h2 className="landing-h2">Set up in two minutes</h2>
        <ol className="landing-how">
          <li className="card">
            <span className="landing-step">1</span>
            <h3>Sign up</h3>
            <p>Email or Google. No card.</p>
          </li>
          <li className="card">
            <span className="landing-step">2</span>
            <h3>Connect Halo</h3>
            <p>
              Add the{' '}
              {EXTENSION_URL ? (
                <a href={EXTENSION_URL} target="_blank" rel="noopener">
                  Halo+ Chrome extension
                </a>
              ) : (
                'Halo+ Chrome extension'
              )}
              . On an iPad or phone, the {BOOKMARK_NAME} bookmark does it in one tap.
            </p>
          </li>
          <li className="card">
            <span className="landing-step">3</span>
            <h3>That's it</h3>
            <p>It syncs every 3 hours on its own. Open Halo+ and do the next thing.</p>
          </li>
        </ol>
        <p className="hint">It reads Halo with the session you already have in your browser. It never sees your password, and Halo sync is part of Plus (the free week includes it).</p>
      </section>

      <section className="landing-section" aria-label="Plans">
        <h2 className="landing-h2">Plans</h2>
        <div className="landing-plans">
          {PLANS.map((p) => (
            <article key={p.tier} className="card landing-plan" data-tier={p.tier}>
              <p className="landing-plan-name">{TIER_NAMES[p.tier]}</p>
              <p className="landing-plan-price">
                {p.tier === 'free' ? '$0' : `$${PRICES[p.tier].month.toFixed(2)}`}
                {p.tier !== 'free' && (
                  <>
                    <small> a month</small>
                    <span className="landing-plan-terms">
                      {TAX_LINE} · {CANCEL_LINE}
                    </span>
                  </>
                )}
              </p>
              <ul>
                {p.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <p className="landing-trial">
          <HaloDraw size={28} />
          <span>Every new account gets Max free for {TRIAL.days} days, from the moment you sign up. No card, nothing to cancel, nothing charges. After {TRIAL.days} days you choose what to keep; Free stays free.</span>
        </p>
      </section>

      <section className="landing-section landing-invite card" aria-label="Bring a friend">
        <span className="landing-icon" aria-hidden>
          <IconGift />
        </span>
        <h2 className="landing-h2">Bring a friend, both get a month</h2>
        <p className="landing-lede">Everyone gets a link on their You page. When a friend signs up with yours, they get their free week of Max like everyone, then 30 days of Plus free, and you get 30 days of Plus too: Halo sync, real grades, and every announcement read for you.</p>
        <p className="hint">Your month starts after any free week or paid plan you have, so none is wasted. Theirs starts after their own free week of Max. Invite as many friends as you like; each one adds another 30 days.</p>
      </section>

      <section className="landing-section landing-faq" aria-label="Questions">
        <h2 className="landing-h2">Questions</h2>
        <dl>
          <div>
            <dt>Does it need my GCU password?</dt>
            <dd>No, and it never asks. The extension and the bookmark use the Halo session you already have in your browser. The code is public on GitHub, so anyone can check.</dd>
          </div>
          <div>
            <dt>Is this from GCU?</dt>
            <dd>No. Halo+ is an independent planner made by a student. It is not affiliated with, endorsed by, or connected to Grand Canyon University. Halo is GCU's learning platform.</dd>
          </div>
          <div>
            <dt>What happens to my data?</dt>
            <dd>It is yours. Export everything as one file any time, or delete the account and all of it in one tap. AI features send only the text they need and nothing is kept by the model provider.</dd>
          </div>
          <div>
            <dt>Does it work on my phone?</dt>
            <dd>Yes. Add it to your Home Screen and it works like an app, notifications included. The bookmark works on a phone too.</dd>
          </div>
        </dl>
      </section>

      <footer className="landing-foot">
        {/* Real pages at real addresses, for students searching about Halo (src/help/pages.ts). */}
        <nav className="landing-help" aria-label="Help for GCU Halo">
          <p className="landing-help-title">
            <a href="./help/">Help for GCU Halo</a>
          </p>
          <ul>
            {HELP_PAGES.map((p) => (
              <li key={p.slug}>
                <a href={`./help/${p.slug}/`}>{p.title}</a>
              </li>
            ))}
          </ul>
        </nav>
        <p>Halo+ is an independent planner and is not affiliated with Grand Canyon University. Halo is GCU's learning platform. No GCU marks are used.</p>
        <nav>
          <a href="./privacy.html">Privacy</a> · <a href="./terms.html">Terms</a> · <a href="https://github.com/richardsgeorger-collab/school-dashboard" rel="noopener">Code</a> · <a href="#/login">Log in</a>
        </nav>
      </footer>
    </div>
  );
}
