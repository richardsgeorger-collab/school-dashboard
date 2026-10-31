import { useEffect, useRef, useState } from 'react';
import { pixel } from '../analytics/pixel';
import { IconHalo } from '../components/Icons';
import { EXTENSION_URL, extensionBrowser } from '../config/extension';
import { PRICES } from '../config/tiers';
import { LiveNow } from './LiveNow';
import { PhoneHello } from './PhoneHello';
import { Trust } from './Trust';

/**
 * The front door, led by the extension (Loop 302, George 2026-10-30, for visitors who want the extension): the hook and
 * Add to Chrome; then the extension on Halo, one feature at a time with the real thing (captures of the test Halo pages,
 * the made-up Maya Torres): what's next on every class card, one calendar, ⌘K search, rubrics, the confetti, and Max's
 * hidden due dates said honestly with its price (George asked for it here; the plans stay one footer link); the calm
 * reel beside the hook; then the app as a bonus (the live Now: check one off and the gold burst plays); FAQ. The trust line, with the
 * live rounded-down student count, sits by every main button. A signed-out phone gets the sign-up screen first
 * (PhoneHello). Pre-rendered into index.html at build, so nothing here may touch window while rendering; motion respects
 * reduced motion (landing.css).
 */
const CONTACT = 'mailto:richards.georger@gmail.com?subject=Halo%2B';

export function Landing() {
  const add = useAddButton();
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
          <a className="btn primary" href={add.href} onClick={add.onClick}>
            {add.short}
          </a>
        </nav>
      </header>

      <PhoneHello />

      <section className="lp-hero lp-hero-ext" aria-label="What Halo+ is">
        <div className="lp-copy">
          <h1 className="lp-title lp-title-hook">
            The Halo <span className="lp-gold">upgrade</span> every GCU student needs.
          </h1>
          <p className="lp-sub">Halo+ adds what Halo is missing, right on Halo’s own pages: what’s next on every class, one calendar, search, and more.</p>
          <div className="lp-cta">
            <a className="btn primary lp-big" href={add.href} onClick={add.onClick}>
              {add.label}
            </a>
            <a className="btn lp-big" href="#/login">
              Log in
            </a>
          </div>
          <Trust />
        </div>
        <LazyReel hero />
      </section>

      <section className="lp-features" aria-label="On Halo">
        <Feature title="What’s next, on every class." gold="next," text="Your grade and the next things due, right on Halo’s own class cards. Done work drops off by itself." img="class-card" w={464} h={337} alt="A class card: the grade, and NEXT with three assignments and when they’re due" />
        <Feature flip title="Every class, one calendar." gold="one" text="All your classes on Halo’s calendar, each in its own color, so a busy week is obvious at a glance." img="calendar" w={479} h={319} alt="Halo’s calendar showing six days with assignments from every class" />
        <Feature title="⌘K. Find anything." gold="⌘K." text="Every class, assignment and file, from any Halo page. Ctrl+K on Windows." img="search" w={488} h={488} alt="Halo+ search with results for “topic 3”" />
        <Feature flip title="Rubrics, right under the assignment." gold="Rubrics," text="No new tab, no hunting. Every criterion and level, one tap away." img="rubric" w={488} h={320} alt="A rubric shown under its assignment on Halo" />
        <Feature title="Confetti when you submit." gold="Confetti" text="The moment Halo confirms it: checked off, your points, a little celebration." img="toast" w={320} h={78} alt="“Lab 4: Photosynthesis done, +30 pts”" confetti />
        <Feature flip title="Never miss a hidden due date." gold="hidden" text={<>Teachers move dates and add steps in announcements. <b>Halo+ Max</b> reads every one and puts the change on the assignment. Max is <b>${PRICES.max.month.toFixed(2)} a month</b>; everything above is free.</>} img="max-line" w={528} h={394} alt="An assignment on Halo with the Halo+ line “Due date moved to Mon, Nov 2 (was Sat, Oct 31)”" />
      </section>

      <section className="lp-bonus" aria-label="Plus your own Halo+ app">
        <div className="lp-copy">
          <p className="lp-eyebrow">Bonus</p>
          <h2 className="lp-h2">Plus your own Halo+ app.</h2>
          <p className="lp-sub">Now, Calendar and Classes, on your phone too. Your whole week in your pocket, kept current from Halo. Add it to your Home Screen and it works like an app. Try it right here:</p>
        </div>
        <LiveNow />
      </section>

      <section className="lp-close" aria-label="Start">
        <h2 className="lp-h2">Your next deadline is already in Halo.</h2>
        <a className="btn primary lp-big" href={add.href} onClick={add.onClick}>
          {add.label}
        </a>
        <Trust />
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

/**
 * The main button (Loop 302: lead with the extension): straight to the Web Store, in the same tab, so the install's
 * welcome tab makes the account. Edge says Edge; a browser the extension cannot go in (Safari, Firefox) gets the laptop
 * page, which says so kindly. Pre-rendered as Chrome (no window then).
 */
function useAddButton(): { href: string; label: string; short: string; onClick: () => void } {
  const [b, setB] = useState<'Chrome' | 'Edge' | 'Brave' | 'other'>('Chrome');
  useEffect(() => {
    setB(extensionBrowser(navigator.userAgent, { brave: !!(navigator as Navigator & { brave?: unknown }).brave, touchMac: navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent) }) ?? 'other');
  }, []);
  const onClick = () => pixel('Lead');
  if (b === 'other') return { href: './laptop/', label: 'Get Halo+ for Chrome', short: 'Get Halo+', onClick };
  const name = b === 'Edge' ? 'Edge' : 'Chrome';
  if (!EXTENSION_URL) return { href: '#/start', label: 'Try it now', short: 'Try it now', onClick };
  return { href: EXTENSION_URL, label: `Add to ${name}, it’s free`, short: `Add to ${name}`, onClick };
}

/** One extension feature: the words, and the real thing (a capture of it on Halo, whole). */
function Feature({ title, gold, text, img, w, h, alt, flip = false, confetti = false }: { title: string; gold: string; text: React.ReactNode; img: string; w: number; h: number; alt: string; flip?: boolean; confetti?: boolean }) {
  return (
    <article className="lp-feature" data-flip={flip || undefined}>
      <div className="lp-feature-copy">
        <h3 className="lp-feature-title">
          {title.split(' ').map((word, i) => (
            <span key={i} className={word === gold ? 'lp-gold' : undefined}>
              {i ? ' ' : ''}
              {word}
            </span>
          ))}
        </h3>
        <p>{text}</p>
      </div>
      <figure className="lp-shot" data-confetti={confetti || undefined}>
        <img src={`./shots/${img}.jpg`} width={w} height={h} alt={alt} loading="lazy" decoding="async" />
      </figure>
    </article>
  );
}

/** The calm reel, in the hero: its poster at once, the video once the page has loaded (it is the heaviest thing here). */
function LazyReel({ hero = false }: { hero?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return setNear(true);
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && (setNear(true), io.disconnect()), { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div className={`lp-reel-frame${hero ? ' lp-reel-hero' : ''}`} ref={ref}>
      {near ? <video src={hero ? './reel/halo-plus-calm.mp4#t=2.7' : './reel/halo-plus-calm.mp4'} poster="./reel/halo-plus-calm.jpg" muted autoPlay loop playsInline preload="metadata" aria-label="Halo+ on Halo: what’s next on every class, one calendar, search, and checking things off" /> : <img src="./reel/halo-plus-calm.jpg" width={540} height={960} alt="" aria-hidden />}
    </div>
  );
}
