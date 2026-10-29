import { useEffect, useRef, useState } from 'react';
import { pixel } from '../analytics/pixel';
import { IconCheck, IconHalo, IconMoon, IconPlus, IconSun, IconYou } from '../components/Icons';
import { ACCENTS, applyAccent, type AccentId } from '../config/accents';
import { EXTENSION_URL } from '../config/extension';
import { LiveNow } from './LiveNow';

/**
 * The front door (George, 2026-10-23: "too many words and not enough showing"). A six-word promise and the app itself,
 * live: check one off and the gold burst plays. Then tiles that show each thing working, three steps, one line to
 * start. No prices or trial talk before someone has loved it: the Plans page is one link in the footer. The demo
 * student is Maya Torres (made up). Pre-rendered into index.html at build, so nothing here may touch window while
 * rendering; motion respects reduced motion (landing.css).
 */
const CONTACT = 'mailto:richards.georger@gmail.com?subject=Halo%2B';

export function Landing() {
  const signUp = () => pixel('Lead');
  return (
    <div className="landing lp">
      <header className="lp-head">
        <a className="brand" href="#/" aria-label="Halo+">
          <span className="brand-mark" aria-hidden>
            <IconHalo />
          </span>
          <span className="brand-text">Halo+</span>
        </a>
        <nav className="lp-nav" aria-label="Site">
          <a className="lp-link" href="./updates/">
            Updates
          </a>
          <a className="btn" href="#/login">
            Log in
          </a>
          <a className="btn primary" href="#/start" onClick={signUp}>
            Try it now
          </a>
        </nav>
      </header>

      <section className="lp-hero" aria-label="What Halo+ is">
        <div className="lp-copy">
          <h1 className="lp-title">Never miss a GCU deadline.</h1>
          <p className="lp-sub">Halo+ reads your Halo classes and every announcement, then shows you the one thing to do next.</p>
          <div className="lp-cta">
            <a className="btn primary lp-big" href="#/start" onClick={signUp}>
              Try it now
            </a>
            <a className="btn lp-big" href="#/login">
              Log in
            </a>
          </div>
        </div>
        <LiveNow />
      </section>

      <section className="lp-bento" aria-label="What it does">
        <Tile wide title="Catches what’s hidden in announcements" text="Announcement-only rules land on the assignment.">
          <Caught />
        </Tile>
        <Tile title="Knows what’s next" text="Ranked by due date, real time and points.">
          <NextCard />
        </Tile>
        <Tile title="Your real grades" text="Every class, and how cooked your week is.">
          <Grades />
        </Tile>
        <Tile wide title="Right inside Halo" text="This week, on Halo’s own home page.">
          <InHalo />
        </Tile>
        <Tile title="On your phone" text="Add it to your Home Screen.">
          <Phone />
        </Tile>
        <Tile title="Keeps itself current" text="Whenever you’re on Halo, or every 3 hours on its own. Never your password.">
          <SyncSpin />
        </Tile>
        <Tile wide title="Search every class from Halo" text="Ctrl+K or ⌘K on any Halo page.">
          <SearchDemo />
        </Tile>
        <Tile wide title="Make it yours" text="Light or dark, your color.">
          <MakeYours />
        </Tile>
      </section>

      <section className="lp-steps" aria-label="Set up">
        <h2 className="lp-h2">Set up in 2 minutes</h2>
        <ol>
          <li>
            <span className="lp-step-icon" aria-hidden>
              <IconYou />
            </span>
            Sign up
          </li>
          <li>
            <span className="lp-step-icon" aria-hidden>
              <IconPlus />
            </span>
            Add to Chrome
          </li>
          <li>
            <span className="lp-step-icon" aria-hidden>
              <IconCheck />
            </span>
            Done
          </li>
        </ol>
      </section>

      <section className="lp-close" aria-label="Start">
        <h2 className="lp-h2">Your next deadline is already in Halo.</h2>
        <a className="btn primary lp-big" href="#/start" onClick={signUp}>
          Try it now
        </a>
      </section>

      <section className="landing-section landing-faq" aria-label="Questions">
        <h2 className="lp-h2">Questions</h2>
        <dl>
          <div>
            <dt>Does it need my GCU password?</dt>
            <dd>No, and it never asks. The Chrome extension reads only your own classes, grades and announcements, and only while you’re already logged in to Halo in that browser. It sends them to your own Halo+ account, and its code is public so anyone can check.</dd>
          </div>
          <div>
            <dt>Is this from GCU?</dt>
            <dd>No. Halo+ is an independent planner made by a student, not affiliated with Grand Canyon University.</dd>
          </div>
          <div>
            <dt>What happens to my data?</dt>
            <dd>It is yours. It is never sold or shared with advertisers, and you can export or delete all of it any time.</dd>
          </div>
          <div>
            <dt>Does it work on my phone?</dt>
            <dd>Yes. Add it to your Home Screen and it works like an app.</dd>
          </div>
        </dl>
      </section>

      <footer className="landing-foot">
        <p>Halo+ is independent and not affiliated with GCU. No GCU marks are used.</p>
        <nav>
          <a className="landing-help" href="./help/">Help</a> · <a href="./updates/">Updates</a> · <a href="./plans/">Plans</a> ·{' '}
          {EXTENSION_URL && (
            <>
              <a href={EXTENSION_URL} target="_blank" rel="noopener">
                Chrome extension
              </a>{' '}
              ·{' '}
            </>
          )}
          <a href={CONTACT}>Contact</a> · <a href="./privacy.html">Privacy</a> · <a href="./terms.html">Terms</a> · <a href="https://github.com/richardsgeorger-collab/school-dashboard" rel="noopener">Code</a> · <a href="#/login">Log in</a>
        </nav>
      </footer>
    </div>
  );
}

function Tile({ title, text, wide = false, children }: { title: string; text: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <article className="lp-tile" data-wide={wide || undefined}>
      <div className="lp-visual">{children}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

/** An announcement's line flies onto its assignment as a requirement. */
function Caught() {
  return (
    <div className="lp-caught" aria-hidden>
      <div className="lp-ann">
        <span className="lp-ann-from">BIO-181L · Dr. Morales</span>
        <p>
          Lab 4 is Thursday. <mark>Bring goggles</mark> or no entry.
        </p>
      </div>
      <span className="lp-fly">Bring goggles</span>
      <div className="lp-assign">
        <span className="lp-assign-title">Lab 4: Photosynthesis</span>
        <span className="lp-assign-meta">BIO-181L · Thu · 30 pts</span>
        <span className="lp-req">
          <IconCheck /> Goggles, or no entry
        </span>
      </div>
    </div>
  );
}

function NextCard() {
  return (
    <div className="lp-next" aria-hidden>
      <span className="lp-next-eyebrow">Do now</span>
      <span className="lp-next-title">Quiz 2: Derivatives</span>
      <span className="lp-next-meta">MAT-250 · Thu · 40 pts · ~2h</span>
      <span className="btn primary lp-next-btn">Start</span>
    </div>
  );
}

/** A Halo-like page (no GCU marks) with the Halo+ pill peeking out, as the extension does. */
/** Halo's Student Home (no GCU marks) with "This week" open above the class cards, in Halo's own card look. */
function InHalo() {
  const rows: [string, string, string, string, boolean][] = [
    ['Topic 3 Homework', 'BIO-181', '#2e8b57', '11:59 PM', false],
    ['Lab 4: Photosynthesis', 'BIO-181L', '#3b7dd8', '11:59 PM', true],
    ['Quiz 2: Derivatives', 'MAT-250', '#7a5ad0', 'Thu', false],
  ];
  return (
    <div className="lp-halo" aria-hidden>
      <div className="lp-halo-bar" />
      <div className="lp-week">
        <p className="lp-week-head">
          <b>This week</b> · 6 due · 3 tomorrow
        </p>
        <p className="lp-week-clear">
          <b>Today:</b> All done <span>✓</span>
        </p>
        {rows.map(([title, code, color, when, extra]) => (
          <p key={title} className="lp-week-row">
            <i className="lp-week-box" />
            <i className="lp-week-dot" style={{ background: color }} />
            <b>{title}</b>
            <span className="lp-week-code">{code}</span>
            {extra && <i className="lp-week-x" />}
            <span className="lp-week-when">{when}</span>
          </p>
        ))}
      </div>
      <div className="lp-halo-cards">
        {[
          ['MAT-250-TR1030A', '2 this week'],
          ['BIO-181L-R100P', '1 extra step'],
        ].map(([code, line], k) => (
          <div key={code} className="lp-halo-card">
            <b>{code}</b>
            <em>
              Halo+ · {k === 1 ? '1 this week · ' : ''}
              <span data-tone={k === 1 ? 'gold' : undefined}>{line}</span>
            </em>
          </div>
        ))}
      </div>
    </div>
  );
}

function Grades() {
  const rows: [string, number, string][] = [
    ['BIO-181', 93, 'A'],
    ['MAT-250', 84, 'B'],
    ['PSY-102', 90, 'A-'],
  ];
  return (
    <div className="lp-grades" aria-hidden>
      {rows.map(([code, pct, letter]) => (
        <div key={code} className="lp-grade">
          <svg viewBox="0 0 36 36" width="34" height="34">
            <circle cx="18" cy="18" r="15" className="lp-grade-track" />
            <circle cx="18" cy="18" r="15" className="lp-grade-fill" strokeDasharray={`${(pct / 100) * 94.2} 94.2`} />
          </svg>
          <span className="lp-grade-code">{code}</span>
          <span className="lp-grade-letter">
            {letter}
          </span>
        </div>
      ))}
      <div className="lp-cook">
        <span className="lp-cook-label">Cooked meter · MAT-250</span>
        <span className="lp-cook-track">
          <span className="lp-cook-fill" />
        </span>
      </div>
    </div>
  );
}

const QUESTION = 'topic 3';
const ANSWER = 'Topic 3 DQ 1: Memory · PSY-102 · due today\nTopic 3 Reflection · UNV-103 · due Fri\nTopic 3 Homework · BIO-181 · due Sat';

/** A search typed out on Halo and its results, when the tile comes into view (2026-10-29: this was Ask, now gone). */
function SearchDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState<{ q: number; a: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let timer = 0;
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io.disconnect();
        let q = 0;
        let a = 0;
        setTyped({ q: 0, a: 0 });
        timer = window.setInterval(() => {
          if (q < QUESTION.length) q += 1;
          else if (a < ANSWER.length) a += 3;
          else return window.clearInterval(timer);
          setTyped({ q, a: Math.min(a, ANSWER.length) });
        }, 28);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, []);
  const q = typed ? QUESTION.slice(0, typed.q) : QUESTION;
  const a = typed ? ANSWER.slice(0, typed.a) : ANSWER;
  return (
    <div className="lp-ask" ref={ref} aria-hidden>
      <p className="lp-q">⌘K {q || ' '}</p>
      {(!typed || typed.q >= QUESTION.length) && <p className="lp-a" style={{ whiteSpace: 'pre-line' }}>{a || '…'}</p>}
    </div>
  );
}

function Phone() {
  return (
    <div className="lp-phone" aria-hidden>
      <div className="lp-phone-screen">
        <b>2 things need you.</b>
        {[
          ['#3B7DD8', 'Lab 4 Prelab Quiz', 'tonight'],
          ['#7A5AD0', 'Quiz 2: Derivatives', 'Thu'],
          ['#D9534F', 'Topic 3 DQ 1', 'Wed'],
        ].map(([c, t, m]) => (
          <span key={t} className="lp-phone-row" style={{ '--course': c } as React.CSSProperties}>
            <i />
            <span>
              {t}
              <small>{m}</small>
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function SyncSpin() {
  return (
    <div className="lp-sync" aria-hidden>
      <span className="lp-sync-ring">
        <IconHalo />
      </span>
      <span className="lp-sync-line">
        <b>Synced 9:12 AM</b>
        <small>next around 12:12 PM</small>
      </span>
    </div>
  );
}

/** Light or dark and the accent, live on this page (the app's own presets). */
function MakeYours() {
  const [dark, setDark] = useState<boolean | null>(null);
  const [accent, setAccent] = useState<AccentId>('gold');
  const flip = () => {
    const root = document.documentElement;
    const next = !(dark ?? root.dataset.theme === 'dark');
    root.dataset.theme = next ? 'dark' : 'light';
    setDark(next);
  };
  const pick = (id: AccentId) => {
    applyAccent(document.documentElement, id);
    setAccent(id);
  };
  return (
    <div className="lp-yours">
      <button type="button" className="lp-mode" onClick={flip} aria-label="Switch light and dark">
        <span aria-hidden>{dark ? <IconSun /> : <IconMoon />}</span>
        {dark ? 'Light' : 'Dark'}
      </button>
      <div className="lp-swatches" role="radiogroup" aria-label="Color">
        {ACCENTS.map((a) => (
          <button key={a.id} type="button" role="radio" aria-checked={accent === a.id} aria-label={a.name} className="lp-swatch" style={{ '--sw': a.light } as React.CSSProperties} onClick={() => pick(a.id)} />
        ))}
      </div>
    </div>
  );
}
