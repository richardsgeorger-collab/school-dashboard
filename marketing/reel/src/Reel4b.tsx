import { loadFont } from "@remotion/fonts";
import { AbsoluteFill, Audio, Easing, Img, interpolate, random, Sequence, staticFile, useCurrentFrame } from "remotion";
import pieces from "../public/ui4/pieces.json";
import { DISPLAY, GOLD, INK_2, Mark } from "./brand";

/**
 * The launch reel, round 4 (George, 2026-10-30): "truly professional, the level of the reference reel" (a laptop
 * floating in a daylight sky, the camera gliding in to the screen). The same hook, beats and end card (with the app
 * line) as v3, calm and satisfying, 22.5 s:
 * - a 3D laptop (CSS 3D: the lid is the reference plane, so the camera can put any point of the screen dead centre at
 *   any angle) floating among clouds in parallax layers, the far ones soft (depth of field);
 * - its screen is the real UI, whole pages captured at 3× (scripts/marketing-capture-v4.mjs: Chrome, the test Halo
 *   pages, the made-up Maya Torres), with the NEXT lines filling in, the chips settling, the search being typed, the
 *   toast counting to +30 and a This week box ticked by a smooth cursor;
 * - captions on frosted glass, the reference's sans with a serif italic accent (Instrument Serif, OFL);
 * - sound made from scratch (scripts/marketing-sfx.py: clicks, key taps, a tick, whooshes, a chime), mixed low so a
 *   song can go on top; `sound: false` renders it silent.
 * v4b (George, same day): a dark, cozy room instead of the sky, lit by the screen's glow (a dim wall with soft bokeh, a
 * dark desk); every wide shot face-on with the screen readable and the keyboard only a dark hint; pages change at once
 * (no muddy crossfades); the end card arrives whole and holds to the last frame; captions on dark glass.
 */
void loadFont({ family: "InstrumentSerif", url: staticFile("fonts/InstrumentSerif-Italic.woff2"), style: "italic", weight: "400" });
const SERIF = "InstrumentSerif, Georgia, serif";

export type Reel4bProps = { sound: boolean };
export const REEL4B_LENGTH = 705;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const GLIDE = Easing.bezier(0.65, 0, 0.35, 1);
const SETTLE = Easing.bezier(0.22, 1, 0.36, 1);
const ease = (f: number, a: number, b: number, from = 0, to = 1, e = GLIDE) => interpolate(f, [a, b], [from, to], { ...clamp, easing: e });

// ——— The camera: keyframes in global frames. fx, fy: the screen point at the centre (screen px); s: frame px per
// screen px there; rx, ry: the laptop's turn; oy: where on the frame that point sits (below centre, for the captions).
type Cam = { f: number; fx: number; fy: number; s: number; rx: number; ry: number; oy: number };
const WIDE = { fx: 640, fy: 400, rx: 3, ry: 0 };
const CAMS: Cam[] = [
  { f: 0, ...WIDE, s: 0.8, oy: 180 },
  { f: 78, ...WIDE, s: 0.84, rx: 3, ry: -2, oy: 170 },
  { f: 116, fx: 229, fy: 440, s: 2.3, rx: 4, ry: -4, oy: 70 },
  { f: 192, fx: 232, fy: 446, s: 2.42, rx: 3, ry: -2, oy: 70 },
  { f: 228, fx: 994, fy: 420, s: 1.95, rx: 5, ry: 6, oy: 70 },
  { f: 296, fx: 992, fy: 424, s: 2.04, rx: 4, ry: 4, oy: 70 },
  { f: 326, fx: 640, fy: 300, s: 1.6, rx: 3, ry: -3, oy: 50 },
  { f: 404, fx: 640, fy: 286, s: 1.64, rx: 2, ry: -2, oy: 50 },
  { f: 432, fx: 290, fy: 210, s: 1.72, rx: 4, ry: 7, oy: 60 },
  { f: 450, fx: 294, fy: 208, s: 1.75, rx: 4, ry: 6, oy: 60 },
  { f: 474, fx: 1100, fy: 70, s: 2.55, rx: 3, ry: -6, oy: 60 },
  { f: 500, fx: 1098, fy: 72, s: 2.62, rx: 3, ry: -5, oy: 60 },
  { f: 530, fx: 330, fy: 232, s: 1.75, rx: 8, ry: -22, oy: 70 },
  { f: 578, fx: 336, fy: 232, s: 1.82, rx: 7, ry: -20, oy: 70 },
  { f: 626, ...WIDE, s: 0.6, rx: 4, ry: -3, oy: 600 },
  { f: 705, ...WIDE, s: 0.58, rx: 4, ry: -4, oy: 610 },
];
const camAt = (f: number): Omit<Cam, "f"> => {
  if (f <= CAMS[0].f) return CAMS[0];
  for (let i = 1; i < CAMS.length; i++) {
    const a = CAMS[i - 1];
    const b = CAMS[i];
    if (f <= b.f) {
      // Long holds drift linearly; moves glide (slow in, slow out). Zoom goes in log space, so it feels even.
      const hold = Math.abs(Math.log(b.s / a.s)) < 0.08 && Math.abs(b.fx - a.fx) < 40;
      const k = (hold ? Easing.linear : GLIDE)((f - a.f) / (b.f - a.f));
      const m = (p: number, q: number) => p + (q - p) * k;
      return { fx: m(a.fx, b.fx), fy: m(a.fy, b.fy), s: Math.exp(m(Math.log(a.s), Math.log(b.s))), rx: m(a.rx, b.rx), ry: m(a.ry, b.ry), oy: m(a.oy, b.oy) };
    }
  }
  return CAMS[CAMS.length - 1];
};
const P = 2400; // perspective (px)
const BEZEL = { side: 28, top: 28, chin: 44 };
const LID = { w: 1280 + BEZEL.side * 2, h: 800 + BEZEL.top + BEZEL.chin };

// ——— The room: a dim wall lit by the screen, soft bokeh far behind, a dark desk under the laptop.
const Room: React.FC = () => {
  const f = useCurrentFrame();
  const c = camAt(f);
  // Where the screen's centre and the lid's bottom edge are on the frame (the turns are small, so this is close).
  const sx = 540 + (640 - c.fx) * c.s;
  const sy = 960 + c.oy + (400 - c.fy) * c.s;
  const lidBottom = 960 + c.oy + (LID.h - BEZEL.top - c.fy) * c.s;
  const glow = 900 * Math.sqrt(c.s);
  const zoom = Math.pow(c.s / 0.8, 0.18);
  return (
    <AbsoluteFill style={{ background: "#0a0b0f" }}>
      <AbsoluteFill style={{ background: `radial-gradient(${glow}px ${glow * 0.8}px at ${sx}px ${sy}px, rgba(126,156,230,0.30), rgba(70,90,150,0.12) 45%, transparent 75%)` }} />
      <AbsoluteFill style={{ filter: "blur(22px)", transform: `translate(${-(c.fx - 640) * c.s * 0.04}px, ${-(c.fy - 400) * c.s * 0.03}px) scale(${zoom})` }}>
        {Array.from({ length: 11 }, (_, i) => {
          const R = (k: string) => random(`bokeh-${i}-${k}`);
          const d = 60 + R("d") * 140;
          const warm = R("w") > 0.45;
          return <div key={i} style={{ position: "absolute", left: R("x") * 1080 - d / 2, top: 120 + R("y") * 900, width: d, height: d, borderRadius: "50%", background: warm ? "rgba(255,186,110,1)" : "rgba(130,165,255,1)", opacity: (0.16 + R("o") * 0.2) * (0.85 + 0.15 * Math.sin(f / (40 + R("t") * 40) + i)) }} />;
        })}
      </AbsoluteFill>
      {lidBottom < 1920 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: lidBottom - 8, bottom: 0, background: `radial-gradient(${560 * c.s + 240}px ${180 * c.s + 80}px at ${sx}px 0px, rgba(150,178,255,0.26), transparent 80%), linear-gradient(180deg, #1c1915 0%, #13110e 45%, #0b0a08 100%)`, boxShadow: "0 -1px 0 rgba(255,255,255,0.06)" }} />
      )}
    </AbsoluteFill>
  );
};

/** The room's edges fall off into the dark. */
const Vignette: React.FC = () => <AbsoluteFill style={{ pointerEvents: "none", background: "radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />;

// ——— The laptop.
const Keyboard: React.FC = () => {
  const rows = [14, 14, 13, 12, 10];
  return (
    <div style={{ position: "absolute", left: 120, top: 70, width: 1200, height: 420, borderRadius: 14, background: "#17191d", padding: 10, boxShadow: "inset 0 2px 6px rgba(0,0,0,0.5)" }}>
      {rows.map((n, r) => (
        <div key={r} style={{ display: "flex", gap: 9, marginBottom: 9, height: 70 }}>
          {Array.from({ length: n }, (_, i) => (
            <div key={i} style={{ flex: r === 4 && i === 4 ? 6 : 1, borderRadius: 9, background: "linear-gradient(180deg, #24262b, #16181b)", boxShadow: "0 2px 0 #0c0d0f, inset 0 1px 0 rgba(255,255,255,0.05)" }} />
          ))}
        </div>
      ))}
    </div>
  );
};

const Laptop: React.FC<{ children: React.ReactNode; glare: number }> = ({ children, glare }) => (
  <div style={{ position: "absolute", left: 0, top: 0, width: LID.w, height: LID.h, transformStyle: "preserve-3d" }}>
    {/* The base, folded toward us from the hinge. */}
    <div style={{ position: "absolute", left: (LID.w - 1440) / 2, top: LID.h - 6, width: 1440, height: 940, transformOrigin: "50% 0", transform: "rotateX(80deg)", transformStyle: "preserve-3d" }}>
      <div style={{ position: "absolute", left: 120, top: 120, width: 1200, height: 760, borderRadius: "50%", background: "rgba(0,0,0,0.7)", filter: "blur(60px)", transform: "translateZ(-140px)" }} />
      <div style={{ position: "absolute", inset: 0, borderRadius: "22px 22px 40px 40px", background: "linear-gradient(180deg, #16171b 0%, #1b1d21 30%, #121316 75%, #0c0d0f 100%)", boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.06)" }}>
        <Keyboard />
        <div style={{ position: "absolute", left: 470, top: 540, width: 500, height: 330, borderRadius: 18, background: "linear-gradient(180deg, #17181c, #1b1c20)", boxShadow: "inset 0 0 0 2px rgba(0,0,0,0.35)" }} />
      </div>
      {/* The front edge. */}
      <div style={{ position: "absolute", left: 30, top: 940, width: 1380, height: 26, transformOrigin: "50% 0", transform: "rotateX(-90deg)", background: "linear-gradient(180deg, #3a3e45, #1f2125)", borderRadius: "0 0 14px 14px" }} />
    </div>
    {/* The lid: the bezel, the screen, the glass. */}
    <div style={{ position: "absolute", inset: 0, borderRadius: 34, background: "linear-gradient(160deg, #2a2d33, #121418 60%)", boxShadow: "0 0 0 3px #3b3f47, 0 0 240px 70px rgba(140,170,255,0.16), 0 50px 140px rgba(0,0,0,0.7)" }} />
    <div style={{ position: "absolute", left: LID.w / 2 - 5, top: 11, width: 10, height: 10, borderRadius: 5, background: "#30343b" }} />
    <div style={{ position: "absolute", left: BEZEL.side, top: BEZEL.top, width: 1280, height: 800, overflow: "hidden", borderRadius: 6, background: "#f5f5f5" }}>
      {children}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `linear-gradient(${118 + glare * 6}deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.05) ${22 + glare}%, rgba(255,255,255,0) ${40 + glare}%)` }} />
    </div>
  </div>
);

// ——— The screen: the real pages, what happens in them, the cursor.
const UI = (src: string) => staticFile(`ui4/${src}`);
const Page: React.FC<{ src: string; opacity?: number; y?: number }> = ({ src, opacity = 1, y = 0 }) => <Img src={UI(src)} style={{ position: "absolute", left: 0, top: y, width: 1280, height: 800, opacity }} />;
const Slice: React.FC<{ src: string; crop: { x: number; y: number; w: number; h: number }; style?: React.CSSProperties }> = ({ src, crop, style }) => (
  <div style={{ position: "absolute", left: crop.x, top: crop.y, width: crop.w, height: crop.h, overflow: "hidden", ...style }}>
    <Img src={UI(src)} style={{ position: "absolute", left: -crop.x, top: -crop.y, width: 1280, height: 800, maxWidth: "none" }} />
  </div>
);

type Pt = { f: number; x: number; y: number; click?: boolean };
/** The cursor's path, in screen px: it glides between points (slow in, slow out, a slight arc) and clicks at some. */
const CURSOR: Pt[] = [
  { f: 120, x: 760, y: 760 },
  { f: 150, x: 330, y: 470 },
  { f: 176, x: 300, y: 492 },
  { f: 194, x: 232, y: 566, click: true },
  { f: 250, x: 300, y: 700 },
  { f: 280, x: 1050, y: 452 },
  { f: 300, x: 1080, y: 470 },
  { f: 420, x: 520, y: 520 },
  { f: 446, x: 121, y: 257, click: true },
  { f: 470, x: 330, y: 330 },
  { f: 520, x: 300, y: 330 },
  { f: 548, x: 68, y: 231, click: true },
  { f: 578, x: 160, y: 300 },
];
const cursorAt = (f: number) => {
  if (f <= CURSOR[0].f) return { ...CURSOR[0], press: 0 };
  for (let i = 1; i < CURSOR.length; i++) {
    const a = CURSOR[i - 1];
    const b = CURSOR[i];
    if (f <= b.f) {
      const k = GLIDE((f - a.f) / (b.f - a.f));
      const arc = Math.sin(Math.PI * k) * Math.min(60, Math.hypot(b.x - a.x, b.y - a.y) * 0.12);
      return { x: a.x + (b.x - a.x) * k - arc * 0.4, y: a.y + (b.y - a.y) * k - arc, press: 0 };
    }
  }
  return { ...CURSOR[CURSOR.length - 1], press: 0 };
};
const CLICKS = CURSOR.filter((p) => p.click).map((p) => p.f);
const Cursor: React.FC<{ show: number }> = ({ show }) => {
  const f = useCurrentFrame();
  const c = cursorAt(f);
  const near = CLICKS.find((k) => f >= k - 2 && f <= k + 18);
  const press = near !== undefined ? interpolate(f, [near - 2, near, near + 5], [1, 0.82, 1], clamp) : 1;
  const ring = near !== undefined ? ease(f, near, near + 16, 0, 1, SETTLE) : 0;
  return (
    <div style={{ position: "absolute", left: c.x, top: c.y, opacity: show, pointerEvents: "none" }}>
      {ring > 0 && ring < 1 && <div style={{ position: "absolute", left: -26 * ring, top: -26 * ring, width: 52 * ring, height: 52 * ring, borderRadius: "50%", border: `3px solid rgba(242,184,75,${0.8 * (1 - ring)})` }} />}
      <svg width={26} height={34} viewBox="0 0 26 34" style={{ transform: `scale(${press})`, transformOrigin: "3px 3px", filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.3))" }}>
        <path d="M3 2 L3 26 L9.5 20 L13.6 30 L17.6 28.2 L13.5 18.6 L22 18.6 Z" fill="#111" stroke="#fff" strokeWidth={2} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

/** What the screen shows at frame f. */
const Screen: React.FC = () => {
  const f = useCurrentFrame();
  const hc = pieces.homeCards;
  const cal = pieces.calendar;
  const st = pieces.search;
  const sub = pieces.submit;
  const wk = pieces.week;
  const cross = (a: number, d = 8) => ease(f, a, a + d, 0, 1, Easing.linear);
  let body: React.ReactNode;
  if (f < 96) {
    // Student Home at the top; at 94, mid-glide, it is scrolled down to the cards (one page, no crossfade).
    body = <Page src={f < 94 ? "home-top.png" : "home-cards.png"} />;
  } else if (f < 204) {
    // The class card: its NEXT lines fill in one by one.
    const rows = hc.rows;
    const cover = { x: rows[0].x - 2, y: rows[0].y - 2, w: rows[0].w + 4, h: rows[rows.length - 1].y + rows[rows.length - 1].h - rows[0].y + 4 };
    body = (
      <>
        <Page src="home-cards.png" />
        <div style={{ position: "absolute", left: cover.x, top: cover.y, width: cover.w, height: cover.h, background: hc.tint }} />
        {rows.map((r, i) => {
          const k = ease(f, 128 + i * 13, 146 + i * 13, 0, 1, SETTLE);
          return <Slice key={i} src={hc.src} crop={r} style={{ opacity: k, transform: `translateY(${(1 - k) * 8}px)` }} />;
        })}
        {f >= 200 && <Page src="calendar.png" />}
      </>
    );
  } else if (f < 306) {
    // The calendar: the chips settle into their days.
    let n = 0;
    body = (
      <>
        <Page src={cal.src} />
        {cal.days.flatMap((d) => d.chips.map((ch, i) => <div key={`c${d.box.x}-${d.box.y}-${i}`} style={{ position: "absolute", left: ch.x - 1.5, top: ch.y - 1.5, width: ch.w + 3, height: ch.h + 3, background: d.ground }} />))}
        {cal.days.flatMap((d) =>
          d.chips.map((ch, i) => {
            const at = 232 + n++ * 5;
            const k = ease(f, at, at + 20, 0, 1, SETTLE);
            return <Slice key={`s${d.box.x}-${d.box.y}-${i}`} src={cal.src} crop={ch} style={{ opacity: ease(f, at, at + 8), transform: `translateY(${(1 - k) * -16}px)` }} />;
          }),
        )}
        {f >= 300 && <Page src="home-top.png" />}
      </>
    );
  } else if (f < 414) {
    // Search: ⌘K at 328 (once the camera has landed), then a letter every 4 frames from 340.
    const i = f < 328 ? -1 : Math.max(0, Math.min(st.length - 1, Math.floor((f - 340) / 4) + 1));
    const prev = i > 0 ? st[i - 1].src : "home-top.png";
    const at = i <= 0 ? 328 : 340 + (i - 1) * 4;
    body = (
      <>
        <Page src={prev} />
        {i >= 0 && <Page src={st[i].src} opacity={cross(at, i === 0 ? 5 : 2)} />}
        {f >= 410 && <Page src={sub.before} />}
      </>
    );
  } else if (f < 512) {
    // Turn it in: Review & Submit pressed at 446, then the toast, its own frames at 0.7×.
    const ms = (f - 448) * (1000 / 30) * 0.7;
    const fr = f < 448 ? null : ([...sub.frames].reverse().find((x) => x.ms <= ms) ?? sub.frames[0]);
    body = (
      <>
        <Page src={sub.before} />
        {fr && <Page src={fr.src} />}
        {f >= 508 && <Page src={wk.before} />}
      </>
    );
  } else {
    // It checks off: the box ticked at 548.
    const k = cross(548, 4);
    const pop = interpolate(f, [548, 553, 562], [0.7, 1.18, 1], clamp);
    const c = wk.check;
    body = (
      <>
        <Page src={wk.before} />
        <Page src={wk.after} opacity={k} />
        {f >= 548 && f < 570 && <Slice src={wk.after} crop={{ x: c.x - 2, y: c.y - 2, w: c.w + 4, h: c.h + 4 }} style={{ transform: `scale(${pop})`, background: "#fff" }} />}
      </>
    );
  }
  const show = Math.min(ease(f, 118, 130), 1 - ease(f, 578, 590)) * (f > 302 && f < 412 ? 1 - Math.min(ease(f, 302, 310), 1 - ease(f, 412, 420)) : 1);
  return (
    <AbsoluteFill>
      {body}
      <Cursor show={show} />
    </AbsoluteFill>
  );
};

// ——— Words.
type Part = { t: string; serif?: boolean };
const Words: React.FC<{ parts: Part[]; at: number; size: number; color: string; accent: string; stagger?: number }> = ({ parts, at, size, color, accent, stagger = 3 }) => {
  const f = useCurrentFrame();
  let n = 0;
  return (
    <span style={{ fontSize: size }}>
      {parts.map((p, pi) =>
        p.t.split(/(\s+)/).map((w, wi) => {
          if (/^\s+$/.test(w) || !w) return w;
          const k = ease(f, at + n * stagger, at + n++ * stagger + 18, 0, 1, SETTLE);
          return (
            <span key={`${pi}-${wi}`} style={{ display: "inline-block", opacity: k, transform: `translateY(${(1 - k) * 0.35 * size}px)`, filter: `blur(${(1 - k) * 10}px)`, fontFamily: p.serif ? SERIF : DISPLAY, fontStyle: p.serif ? "italic" : "normal", fontWeight: p.serif ? 400 : 800, fontSize: p.serif ? size * 1.12 : size, letterSpacing: p.serif ? "-0.01em" : "-0.04em", color: p.serif ? accent : color }}>
              {w}
            </span>
          );
        }),
      )}
    </span>
  );
};

/** A beat's caption: one line on frosted glass, in the same place every time (inside the safe zone). */
const Caption: React.FC<{ parts: Part[]; from: number; to: number }> = ({ parts, from, to }) => {
  const f = useCurrentFrame();
  if (f < from - 2 || f > to + 2) return null;
  const k = Math.min(ease(f, from, from + 16, 0, 1, SETTLE), 1 - ease(f, to - 12, to));
  return (
    <div style={{ position: "absolute", top: 300, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: k, transform: `translateY(${(1 - k) * 14}px)` }}>
      <div style={{ padding: "22px 40px 26px", borderRadius: 999, background: "rgba(18,20,26,0.6)", backdropFilter: "blur(22px) saturate(1.2)", WebkitBackdropFilter: "blur(22px) saturate(1.2)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 18px 50px -18px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.08)", lineHeight: 1.05, whiteSpace: "nowrap" }}>
        <Words parts={parts} at={from + 2} size={60} color="#F4F5F7" accent={GOLD} stagger={2} />
      </div>
    </div>
  );
};

/** A floating glass keycap (⌘ and K), pressed as the search opens. */
const Keycaps: React.FC = () => {
  const f = useCurrentFrame();
  if (f < 312 || f > 350) return null;
  const k = Math.min(ease(f, 312, 322, 0, 1, SETTLE), 1 - ease(f, 336, 348));
  const press = (at: number) => interpolate(f, [at, at + 3, at + 9], [1, 0.9, 1], clamp);
  const cap = (label: string, at: number, w = 132) => (
    <div style={{ width: w, height: 132, borderRadius: 30, display: "grid", placeItems: "center", background: "rgba(28,30,36,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 22px 40px -16px rgba(0,0,0,0.8), inset 0 -6px 0 rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.12)", fontFamily: DISPLAY, fontWeight: 800, fontSize: 64, color: "#F4F5F7", transform: `scale(${press(at)})` }}>{label}</div>
  );
  return (
    <div style={{ position: "absolute", top: 1350, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 22, opacity: k, transform: `translateY(${(1 - k) * 30}px)` }}>
      {cap("⌘", 324)}
      {cap("K", 327)}
    </div>
  );
};

/** Soft confetti drifting down through the sky when +30 lands, in front of and behind the laptop. */
const Drift: React.FC<{ from: number; near: boolean }> = ({ from, near }) => {
  const f = useCurrentFrame();
  const t0 = f - from;
  if (t0 < 0) return null;
  const colours = ["#522398", "#8a5cd6", GOLD, "#ffd96a", "#07bc0c", "#2fb8ff", "#ff5d8f", "#ff8a3d"];
  return (
    <AbsoluteFill style={{ filter: near ? "blur(3px)" : "blur(0.6px)", opacity: Math.min(1, t0 / 10) * (1 - ease(f, 610, 640)) }}>
      {Array.from({ length: near ? 26 : 60 }, (_, i) => {
        const R = (k: string) => random(`v4drift-${near}-${i}-${k}`);
        const t = t0 - R("s") * 24;
        if (t < 0) return null;
        const x = (near ? (R("side") < 0.5 ? R("x") * 190 : 890 + R("x") * 190) : R("x") * 1080) + Math.sin(t / (20 + R("p") * 14) + R("ph") * 6) * 30;
        const y = -80 + R("y0") * 700 + t * (2.6 + R("v") * 2.2) * (near ? 1.4 : 1);
        const size = (near ? 24 : 12) + R("w") * (near ? 16 : 10);
        const round = R("r") > 0.7;
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: size, height: round ? size : size * 0.55, borderRadius: round ? "50%" : 3, background: colours[Math.floor(R("c") * colours.length)], transform: `rotate(${R("a") * 360 + t * (R("va") - 0.5) * 5}deg) scaleY(${0.35 + 0.65 * Math.abs(Math.cos(t * (0.05 + 0.05 * R("f"))))})` }} />;
      })}
    </AbsoluteFill>
  );
};

// ——— The scene.
const World: React.FC = () => {
  const f = useCurrentFrame();
  const c = camAt(f);
  const z = P - P / c.s;
  const fx = c.fx + BEZEL.side;
  const fy = c.fy + BEZEL.top;
  // The end card: the laptop slips out of focus behind the words.
  const endBlur = ease(f, 600, 640, 0, 4);
  return (
    <AbsoluteFill style={{ perspective: P, perspectiveOrigin: `540px ${960 + c.oy}px`, filter: endBlur ? `blur(${endBlur}px)` : undefined }}>
      <div style={{ position: "absolute", left: 540, top: 960 + c.oy, width: 0, height: 0, transformStyle: "preserve-3d", transform: `translateZ(${z}px) rotateX(${c.rx}deg) rotateY(${c.ry}deg) translate(${-fx}px, ${-fy}px)` }}>
        <Laptop glare={c.ry}>
          <Screen />
        </Laptop>
      </div>
    </AbsoluteFill>
  );
};

const Hook: React.FC = () => {
  const f = useCurrentFrame();
  if (f > 100) return null;
  const out = ease(f, 70, 96);
  return (
    <div style={{ position: "absolute", top: 300, left: 60, right: 60, textAlign: "center", opacity: 1 - out, transform: `translateY(${-out * 30}px)`, textShadow: "0 6px 30px rgba(0,0,0,0.6)", lineHeight: 1.04 }}>
      <div><Words parts={[{ t: "The Halo " }, { t: "upgrade", serif: true }]} at={-30} size={104} color="#ffffff" accent={GOLD} /></div>
      <div><Words parts={[{ t: "every GCU student" }]} at={-30} size={104} color="#ffffff" accent={GOLD} /></div>
      <div><Words parts={[{ t: "needs.", serif: true }]} at={-30} size={104} color="#ffffff" accent={GOLD} /></div>
    </div>
  );
};

const End: React.FC = () => {
  const f = useCurrentFrame();
  if (f < 622) return null;
  const k = (a: number) => ease(f, a, a + 18, 0, 1, SETTLE);
  const card = ease(f, 622, 638, 0, 1, SETTLE);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 290 }}>
      {/* Everything arrives with the panel (no empty panel), and stays to the last frame. */}
      <div style={{ width: 900, padding: "56px 40px 52px", borderRadius: 56, textAlign: "center", background: "rgba(16,18,24,0.62)", backdropFilter: "blur(26px) saturate(1.2)", WebkitBackdropFilter: "blur(26px) saturate(1.2)", border: "1px solid rgba(255,255,255,0.14)", boxShadow: "0 40px 90px -30px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.08)", opacity: card, transform: `translateY(${(1 - card) * 30}px) scale(${0.97 + 0.03 * card})` }}>
        <Mark size={150} plus="#F4F5F7" />
        <div style={{ marginTop: 26, lineHeight: 1.04 }}>
          <div><Words parts={[{ t: "GCU’s Halo," }]} at={622} size={96} color="#F4F5F7" accent={GOLD} stagger={2} /></div>
          <div><Words parts={[{ t: "upgraded.", serif: true }]} at={624} size={96} color="#F4F5F7" accent={GOLD} /></div>
        </div>
        <div style={{ display: "inline-block", marginTop: 36, opacity: k(626), transform: `translateY(${(1 - k(626)) * 14}px)`, fontFamily: DISPLAY, fontWeight: 800, fontSize: 48, background: GOLD, color: INK_2, padding: "18px 44px", borderRadius: 999, boxShadow: "0 18px 40px -16px rgba(242,184,75,0.5)" }}>Free on Chrome</div>
        <div style={{ marginTop: 24, opacity: k(628), fontFamily: DISPLAY, fontWeight: 600, fontSize: 36, color: "#c9ced8" }}>Plus your own Halo+ app on your phone.</div>
        <div style={{ marginTop: 22, opacity: k(630), fontFamily: DISPLAY, fontWeight: 800, fontSize: 46, color: "#F4F5F7" }}>Link in bio ↗</div>
        <div style={{ marginTop: 22, opacity: k(632), fontFamily: DISPLAY, fontWeight: 600, fontSize: 26, color: "#8f96a3" }}>@haloplus · Not affiliated with GCU</div>
      </div>
    </AbsoluteFill>
  );
};

// ——— Sound: what plays when, and how loud (low: a song goes on top).
type Cue = [number, string, number];
const KEYS: Cue[] = Array.from({ length: 12 }, (_, i) => [340 + i * 4, `key${i % 6}`, 0.32] as Cue);
const CUES: Cue[] = [
  [0, "whoosh-long", 0.16],
  [80, "whoosh", 0.22],
  [130, "pop", 0.1],
  [143, "pop", 0.1],
  [156, "pop", 0.1],
  [194, "click", 0.42],
  [200, "whoosh", 0.2],
  [236, "pop", 0.07],
  [256, "pop", 0.07],
  [276, "pop", 0.07],
  [298, "whoosh", 0.2],
  [324, "key2", 0.36],
  [327, "key4", 0.36],
  ...KEYS,
  [408, "whoosh", 0.2],
  [446, "click", 0.42],
  [452, "whoosh", 0.18],
  [456, "pop", 0.16],
  [478, "chime", 0.3],
  [506, "whoosh", 0.2],
  [548, "tick", 0.45],
  [580, "whoosh-long", 0.22],
  [624, "chime", 0.12],
];

export const Reel4b: React.FC<Reel4bProps> = ({ sound }) => (
  <AbsoluteFill style={{ background: "#0a0b0f" }}>
    <Room />
    <Drift from={480} near={false} />
    <World />
    <Vignette />
    <Drift from={482} near />
    <Hook />
    <Caption parts={[{ t: "What’s " }, { t: "next,", serif: true }, { t: " on every class." }]} from={112} to={200} />
    <Caption parts={[{ t: "Every class. " }, { t: "One", serif: true }, { t: " calendar." }]} from={222} to={300} />
    <Caption parts={[{ t: "⌘K. Find " }, { t: "anything.", serif: true }]} from={322} to={408} />
    <Caption parts={[{ t: "Turn it " }, { t: "in.", serif: true }]} from={428} to={504} />
    <Caption parts={[{ t: "It " }, { t: "checks", serif: true }, { t: " off." }]} from={524} to={584} />
    <Keycaps />
    <End />
    {sound &&
      CUES.map(([f, s, v], i) => (
        <Sequence key={i} from={f} durationInFrames={Math.min(90, REEL4B_LENGTH - f)} layout="none">
          <Audio src={staticFile(`sfx/${s}.wav`)} volume={v} />
        </Sequence>
      ))}
  </AbsoluteFill>
);
