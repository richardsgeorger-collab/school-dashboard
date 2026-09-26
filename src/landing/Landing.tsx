import { pixel } from '../analytics/pixel';
import { HaloDraw } from '../components/HaloDraw';
import { IconCheck, IconHalo } from '../components/Icons';
import { PRICES, TIER_NAMES, TRIAL } from '../config/tiers';

/**
 * The front door, at the root address, for a GCU student who has never seen Halo+. One line on what it does, the
 * app itself as the picture (real markup, real tokens, so it can never drift from the product), four things it does,
 * the plans from the one config file, four questions, and the line that it is not from GCU. Anyone signed in never
 * sees this: the root goes straight to Now for them.
 */
const PLANS: { tier: keyof typeof PRICES | 'free'; lines: string[] }[] = [
  { tier: 'free', lines: ['Halo sync with the bookmark', 'Now, agenda and month', 'Add anything Halo does not have'] },
  { tier: 'plus', lines: ['Sync on its own when you open Halo', 'Reminders and heavy-day warnings', 'Points, streaks, calendar feed'] },
  { tier: 'pro', lines: ['Reads every announcement and syllabus', 'Grade projection and what-if', 'The coach and the tutor'] },
  { tier: 'max', lines: ['Lecture notes from a recording', 'Flashcards and practice from your material', 'The Sunday recap, your colour'] },
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
            Sign up
          </a>
        </nav>
      </header>

      <section className="landing-hero" aria-label="What Halo+ is">
        <div className="landing-copy">
          <p className="eyebrow">The planner built for Halo</p>
          <h1 className="landing-title">All of Halo, read for you. Even the announcements. Then the one thing to do next.</h1>
          <p className="landing-lede">
            One bookmark pulls your GCU classes, assignments, grades and every announcement. The “due Friday” your professor only posted in an announcement lands on the assignment. One screen says what to do right now: due
            date, how long it takes, what it is worth. Never your password.
          </p>
          <div className="landing-cta">
            <a className="btn primary" href="#/start" onClick={signUp}>
              Sign up
            </a>
            <a className="btn" href="#/login">
              Log in
            </a>
          </div>
          <p className="hint">Try Max free for {TRIAL.days} days. No card. Nothing charges.</p>
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
                    <span className="headsup-text">Oct 4–9 is heavy: 5 items, 400 pts. Start the paper by Sep 29.</span>
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
            <h3>Says what to do now</h3>
            <p>One thing at a time, ranked by due date, the time it really takes, and points. What is due today underneath. Nothing you have to sort.</p>
          </article>
          <article className="card landing-feature">
            <h3>Reads the announcements</h3>
            <p>At GCU the real instructions live in announcements. Halo+ reads every one and puts what it asks for on the assignment, in the professor's own words.</p>
          </article>
          <article className="card landing-feature">
            <h3>Knows where you stand</h3>
            <p>Every item says when it last matched Halo. A moved deadline moves here too. A heavy week gets a warning while there is still time.</p>
          </article>
          <article className="card landing-feature">
            <h3>Studies with you</h3>
            <p>Ask what to work on first. Turn a lecture into notes and practice questions. A plan for the exam, spread over the days before it.</p>
          </article>
        </div>
      </section>

      <section className="landing-section" aria-label="How the sync works">
        <h2 className="landing-h2">How the sync works</h2>
        <ol className="landing-steps">
          <li>Drag the Sync Halo bookmark to your bookmarks bar. On a phone, the app walks you through it.</li>
          <li>Open halo.gcu.edu and log in as you always do.</li>
          <li>Click the bookmark. Your classes, assignments, grades and announcements arrive here, and you approve them before anything changes.</li>
        </ol>
        <p className="hint">The bookmark runs on Halo's own page while you are logged in there. It never sees your password. On Plus, a small Chrome extension syncs on its own whenever you open Halo.</p>
      </section>

      <section className="landing-section" aria-label="Plans">
        <h2 className="landing-h2">Plans</h2>
        <div className="landing-plans">
          {PLANS.map((p) => (
            <article key={p.tier} className="card landing-plan" data-tier={p.tier}>
              <p className="landing-plan-name">{TIER_NAMES[p.tier]}</p>
              <p className="landing-plan-price">
                {p.tier === 'free' ? '$0' : `$${PRICES[p.tier].month.toFixed(2)}`}
                {p.tier !== 'free' && <small> a month, or ${PRICES[p.tier].year} a year</small>}
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
          <span>Try Max free for {TRIAL.days} days. No card. Nothing charges. Invite a friend and you both get a month of Plus.</span>
        </p>
      </section>

      <section className="landing-section landing-faq" aria-label="Questions">
        <h2 className="landing-h2">Questions</h2>
        <dl>
          <dt>Does it need my GCU password?</dt>
          <dd>No, and it never asks. The bookmark works because you are already logged in to Halo in that browser.</dd>
          <dt>Is this from GCU?</dt>
          <dd>No. Halo+ is an independent planner made by a student. It is not affiliated with, endorsed by, or connected to Grand Canyon University. Halo is GCU's learning platform.</dd>
          <dt>What happens to my data?</dt>
          <dd>It is yours. Export everything as one file any time, or delete the account and all of it in one tap. AI features send only the text they need and nothing is kept by the model provider.</dd>
          <dt>Does it work on my phone?</dt>
          <dd>Yes. Add it to your Home Screen and it works like an app, notifications included. The bookmark works on a phone too.</dd>
        </dl>
      </section>

      <footer className="landing-foot">
        <p>Halo+ is an independent planner and is not affiliated with Grand Canyon University. Halo is GCU's learning platform. No GCU marks are used.</p>
        <nav>
          <a href="./privacy.html">Privacy</a> · <a href="./terms.html">Terms</a> · <a href="#/login">Log in</a>
        </nav>
      </footer>
    </div>
  );
}
