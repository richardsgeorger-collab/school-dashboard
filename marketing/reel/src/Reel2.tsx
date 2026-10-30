import {
  linearTiming,
  TransitionSeries,
  type TransitionPresentation,
  type TransitionPresentationComponentProps,
} from "@remotion/transitions";
import { useId } from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  random,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { BODY, DISPLAY, GOLD, INK_2, Mark, themeOf } from "./brand";

/**
 * The launch reel, round 2 (George, 2026-10-30: the Daylight style, "faster, more impactful and more engaging"). The
 * same hook, beats and end card as Reel.tsx, re-cut: 12 to 16 s, the hook on screen in the first frames, each beat about
 * 2 s, tight close-ups of the real UI (3× captures from scripts/marketing-capture.mjs, the made-up Maya Torres on the
 * test Halo pages) instead of whole desktop pages, words that slam in on the beat, whip/pop/wipe/flash cuts with motion
 * blur, the confetti as the climax and a quick end card. `pace` "fast" (about 13 s) or "faster" (about 10.5 s).
 * REEL2_CUTS lists every cut and hit so a trending sound can be lined up (marketing/instagram/README.md).
 */
export type Pace = "fast" | "faster";
export type Reel2Props = { pace: Pace };

const T = themeOf("daylight");
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const OUT = Easing.bezier(0.16, 1, 0.3, 1);
const SNAP = Easing.bezier(0.7, 0, 0.2, 1);
const POP = Easing.bezier(0.34, 1.7, 0.5, 1);

/** Scenes and cuts, in frames at 30 fps. A cut is the middle of the transition into that scene. */
const PLANS = {
  fast: {
    scenes: {
      hook: 48,
      next: 72,
      calendar: 68,
      search: 76,
      confetti: 100,
      end: 66,
    },
    tr: 8,
  },
  faster: {
    scenes: {
      hook: 40,
      next: 58,
      calendar: 54,
      search: 62,
      confetti: 84,
      end: 54,
    },
    tr: 6,
  },
} as const;
/** The beats were timed for "fast"; "faster" squeezes every in-scene time by its scene's ratio. */
const BASE = PLANS.fast.scenes;
type SceneKey = keyof typeof BASE;

export const reel2Length = (pace: Pace) => {
  const p = PLANS[pace];
  const s = Object.values(p.scenes);
  return s.reduce((a, b) => a + b, 0) - (s.length - 1) * p.tr;
};

/** Where each scene starts, where each cut lands and the hits inside the beats (seconds), for lining up a sound. */
export const reel2Cuts = (pace: Pace) => {
  const p = PLANS[pace];
  const keys = Object.keys(p.scenes) as SceneKey[];
  const out: { at: number; what: string }[] = [];
  let start = 0;
  keys.forEach((k, i) => {
    const r = p.scenes[k] / BASE[k];
    const at = (f: number) => +((start + f * r) / 30).toFixed(2);
    if (i)
      out.push({
        at: +((start + p.tr / 2) / 30).toFixed(2),
        what: `CUT → ${k}`,
      });
    for (const [f, what] of HITS[k]) out.push({ at: at(f), what });
    start += p.scenes[k] - p.tr;
  });
  out.push({ at: +(reel2Length(pace) / 30).toFixed(2), what: "end" });
  return out.sort((a, b) => a.at - b.at);
};
const HITS: Record<SceneKey, [number, string][]> = {
  hook: [
    [1, "hook: first word slams in"],
    [19, "hook: last word (needs.)"],
  ],
  next: [
    [14, "punch in to one class card"],
    [34, "punch in to its NEXT box, “on every class.” slams"],
  ],
  calendar: [
    [14, "punch in to one day"],
    [16, "“One calendar.” slams"],
  ],
  search: [
    [2, "“⌘K.” slams"],
    [8, "punch in to the search bar"],
    [10, "typing starts"],
    [38, "results in, “Find anything.” slams"],
  ],
  confetti: [
    [10, "punch in to the toast"],
    [28, "CLIMAX: +30, confetti burst, “It checks off.”"],
  ],
  end: [
    [1, "end card: the mark pops"],
    [10, "“upgraded.”"],
    [18, "Free on Chrome"],
  ],
};

// ——— Pieces ———

/** A blur along one direction (motion blur): an SVG filter keyed to how fast the thing moves this frame. */
const useBlur = (bx: number, by: number) => {
  const id = `b${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const on = bx > 0.3 || by > 0.3;
  const svg = (
    <svg width={0} height={0} style={{ position: "absolute" }}>
      <filter id={id} x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur
          stdDeviation={`${Math.min(bx, 60)} ${Math.min(by, 60)}`}
        />
      </filter>
    </svg>
  );
  return { svg, filter: on ? `url(#${id})` : undefined };
};

/** Words that slam in: big, from 2.4× down to size with a snap, a little turn, the gold word on a gold block. */
const Slam: React.FC<{
  lines: string[];
  gold?: string[];
  size: number;
  at: number;
  stagger?: number;
  align?: "left" | "center";
  r?: number;
}> = ({ lines, gold = [], size, at, stagger = 3, align = "left", r = 1 }) => {
  const frame = useCurrentFrame();
  let i = 0;
  return (
    <div
      style={{
        fontFamily: DISPLAY,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.04,
        letterSpacing: "-0.05em",
        color: T.text,
        textAlign: align,
      }}
    >
      {lines.map((line, li) => (
        <div
          key={li}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: `0 ${size * 0.22}px`,
            justifyContent: align === "center" ? "center" : "flex-start",
          }}
        >
          {line.split(" ").map((w) => {
            const n = i++;
            const t0 = at + n * stagger * r;
            const k = interpolate(frame, [t0, t0 + 7 * r], [0, 1], {
              ...clamp,
              easing: POP,
            });
            const seen = interpolate(frame, [t0, t0 + 1.5], [0, 1], clamp);
            const isGold = gold.includes(w.replace(/[.,]/g, ""));
            const bar = interpolate(frame, [t0 + 3 * r, t0 + 8 * r], [0, 1], {
              ...clamp,
              easing: OUT,
            });
            const turn = (random(`turn${w}${n}`) - 0.5) * 14;
            return (
              <span
                key={w + n}
                style={{
                  position: "relative",
                  display: "inline-block",
                  opacity: seen,
                  scale: `${2.4 - 1.4 * k}`,
                  rotate: `${turn * (1 - k)}deg`,
                  filter: `blur(${Math.max(0, (1 - k) * 12)}px)`,
                  transformOrigin: "50% 60%",
                }}
              >
                {isGold && (
                  <span
                    style={{
                      position: "absolute",
                      left: -size * 0.1,
                      right: -size * 0.1,
                      top: "14%",
                      bottom: "6%",
                      background: GOLD,
                      borderRadius: size * 0.12,
                      transformOrigin: "0 50%",
                      scale: `${bar} 1`,
                      zIndex: 0,
                    }}
                  />
                )}
                <span style={{ position: "relative", zIndex: 1 }}>{w}</span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** The paper with a slow gold glow and a drifting dot grid, so the ground is never still. */
const Ground: React.FC<{ x?: number; y?: number }> = ({ x = 70, y = 20 }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at ${x + Math.sin(frame / 18) * 8}% ${y + Math.cos(frame / 22) * 5}%, ${T.glow}, transparent 58%), ${T.bg}`,
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(rgba(20,23,28,0.09) 2.2px, transparent 2.4px)",
          backgroundSize: "44px 44px",
          backgroundPosition: `${frame * 0.9}px ${frame * -1.6}px`,
        }}
      />
    </AbsoluteFill>
  );
};

type Key = {
  f: number;
  cx: number;
  cy: number;
  s: number;
  ease?: (t: number) => number;
};
const camAt = (keys: Key[], f: number) => {
  if (f <= keys[0].f) return keys[0];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    if (f <= b.f) {
      const t = (b.ease ?? SNAP)((f - a.f) / (b.f - a.f));
      return {
        f,
        cx: a.cx + (b.cx - a.cx) * t,
        cy: a.cy + (b.cy - a.cy) * t,
        s: Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * t),
      };
    }
  }
  return keys[keys.length - 1];
};

/**
 * A camera on a capture: a window on the frame (`box`) showing the capture `src` (`natural` CSS size) centred on (cx, cy)
 * at `s` frame px per CSS px, moving through `keys`, blurred along its motion.
 */
const Cam: React.FC<{
  src: string;
  natural: { w: number; h: number };
  box: { x: number; y: number; w: number; h: number };
  keys: Key[];
}> = ({ src, natural, box, keys }) => {
  const frame = useCurrentFrame();
  const c = camAt(keys, frame);
  const p = camAt(keys, frame - 1);
  const zoom = Math.min(16, Math.abs(Math.log(c.s / p.s)) * 110);
  const { svg, filter } = useBlur(
    Math.abs((c.cx - p.cx) * c.s) * 0.45 + zoom,
    Math.abs((c.cy - p.cy) * c.s) * 0.45 + zoom,
  );
  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        overflow: "hidden",
        borderRadius: 40,
        background: "#FFFFFF",
        boxShadow:
          "0 50px 100px -30px rgba(20,23,28,0.38), 0 8px 24px rgba(20,23,28,0.12), 0 0 0 2px rgba(20,23,28,0.06)",
      }}
    >
      {svg}
      <Img
        src={staticFile(`ui/${src}`)}
        style={{
          position: "absolute",
          maxWidth: "none",
          width: natural.w * c.s,
          height: natural.h * c.s,
          left: box.w / 2 - c.cx * c.s,
          top: box.h / 2 - c.cy * c.s,
          filter,
        }}
      />
    </div>
  );
};

/** A camera on a frame sequence (search being typed, the submit moment): the same camera, a new picture each step. */
const seq = (dir: string, n: number, idx: number) =>
  `${dir}/${String(Math.max(0, Math.min(n - 1, Math.floor(idx)))).padStart(2, "0")}.png`;

const PAGE = { w: 1280, h: 800 };
const CARDS = { w: 1024, h: 1700 };

// ——— Scenes ———

const Hook: React.FC<{ r: number }> = ({ r }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Ground x={78} y={12} />
      {/* The real cards drifting up behind the words, faint: something is always moving. */}
      <AbsoluteFill style={{ opacity: 0.16, filter: "blur(5px)" }}>
        <Img
          src={staticFile("ui/cards.png")}
          style={{
            position: "absolute",
            width: 1300,
            left: -110,
            top: 260 - frame * 6,
            rotate: "-8deg",
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ padding: "0 84px", justifyContent: "center" }}>
        <div
          style={{
            marginBottom: 46,
            scale: `${interpolate(frame, [0, 8 * r], [0.4, 1], { ...clamp, easing: POP })}`,
            transformOrigin: "0 50%",
          }}
        >
          <Mark
            size={128}
            draw={interpolate(frame, [0, 14 * r], [0, 1], {
              ...clamp,
              easing: OUT,
            })}
            plus={INK_2}
          />
        </div>
        <Slam
          lines={["The Halo", "upgrade every", "GCU student", "needs."]}
          gold={["upgrade"]}
          size={124}
          at={1}
          stagger={3}
          r={r}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** A beat: a setup line up top at the start, the UI close-up, the payoff line slamming in at the punch-in. */
const Beat: React.FC<{
  top: string[];
  bottom: string[];
  gold: string[];
  hit: number;
  r: number;
  topSize?: number;
  box: { y: number; h: number };
  children: React.ReactNode;
  flip?: boolean;
}> = ({ top, bottom, gold, hit, r, topSize = 150, box, children, flip }) => (
  <AbsoluteFill>
    <Ground x={flip ? 18 : 82} y={flip ? 82 : 16} />
    <AbsoluteFill style={{ padding: "150px 84px 0" }}>
      <Slam lines={top} gold={gold} size={topSize} at={1} r={r} />
    </AbsoluteFill>
    {children}
    <AbsoluteFill style={{ top: box.y + box.h + 50, padding: "0 84px" }}>
      <Slam lines={bottom} gold={gold} size={132} at={hit} stagger={2} r={r} />
    </AbsoluteFill>
  </AbsoluteFill>
);

const BOX = { x: 60, w: 960 };

const Next: React.FC<{ r: number }> = ({ r }) => {
  const box = { ...BOX, y: 420, h: 860 };
  // The whole Student Home for a moment, the punch in to one class card, then closer, to its NEXT lines.
  return (
    <Beat
      top={["What’s next,"]}
      bottom={["on every", "class."]}
      gold={["next"]}
      hit={34 * r}
      r={r}
      box={box}
    >
      <Cam
        src="cards.png"
        natural={CARDS}
        box={box}
        keys={[
          { f: 0, cx: 512, cy: 900, s: 0.5 },
          { f: 4 * r, cx: 512, cy: 880, s: 0.52 },
          { f: 14 * r, cx: 264, cy: 735, s: 2.0 },
          { f: 30 * r, cx: 264, cy: 745, s: 2.1, ease: (t) => t },
          { f: 38 * r, cx: 196, cy: 752, s: 3.3 },
          { f: 72 * r, cx: 200, cy: 754, s: 3.45, ease: (t) => t },
        ]}
      />
    </Beat>
  );
};

const Calendar: React.FC<{ r: number }> = ({ r }) => {
  const box = { ...BOX, y: 400, h: 1000 };
  return (
    <Beat
      top={["Every class."]}
      bottom={["One calendar."]}
      gold={["calendar"]}
      hit={16 * r}
      r={r}
      box={box}
      flip
    >
      <Cam
        src="calendar.png"
        natural={PAGE}
        box={box}
        keys={[
          { f: 0, cx: 674, cy: 420, s: 0.76 },
          { f: 4 * r, cx: 690, cy: 430, s: 0.8 },
          { f: 14 * r, cx: 994, cy: 494, s: 3.6 },
          { f: 68 * r, cx: 980, cy: 500, s: 3.85, ease: (t) => t },
        ]}
      />
    </Beat>
  );
};

const Search: React.FC<{ r: number }> = ({ r }) => {
  const frame = useCurrentFrame();
  const box = { ...BOX, y: 600, h: 600 };
  // Typed one letter every 2.2 frames from frame 10: the results land by about frame 38.
  const idx = (frame - 10 * r) / (2.2 * r);
  return (
    <Beat
      top={["⌘K."]}
      bottom={["Find", "anything."]}
      gold={["⌘K"]}
      hit={38 * r}
      r={r}
      topSize={240}
      box={box}
    >
      <Cam
        src={seq("search", 13, idx)}
        natural={PAGE}
        box={box}
        keys={[
          { f: 0, cx: 640, cy: 220, s: 1.1 },
          { f: 8 * r, cx: 500, cy: 150, s: 2.9 },
          { f: 30 * r, cx: 500, cy: 160, s: 2.9, ease: (t) => t },
          { f: 40 * r, cx: 500, cy: 196, s: 2.9 },
          { f: 76 * r, cx: 506, cy: 198, s: 3.02, ease: (t) => t },
        ]}
      />
    </Beat>
  );
};

/** Confetti from the toast and both bottom corners, in Halo's confetti colours and Halo+ gold. */
const Burst: React.FC<{
  at: number;
  ox: number;
  oy: number;
  only: "centre" | "corners";
}> = ({ at, ox, oy, only }) => {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 1) return null;
  const colours = [
    GOLD,
    "#6C3FC5",
    "#36B37E",
    "#4FC3F7",
    "#FF6B9A",
    "#FF9F43",
    "#8E7CF0",
  ];
  const cannons = [
    { x: ox, y: oy, a0: 0, a1: 360, v: [26, 60], n: 150, ring: 330 },
    { x: -20, y: 1960, a0: -80, a1: -45, v: [52, 80], n: 80, ring: 0 },
    { x: 1100, y: 1960, a0: -135, a1: -100, v: [52, 80], n: 80, ring: 0 },
  ].filter((_, i) => (only === "centre" ? i === 0 : i > 0));
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {cannons.flatMap((c, ci) =>
        Array.from({ length: c.n }, (_, i) => {
          const R = (k: string) => random(`c${only}${ci}-${i}-${k}`);
          const a = ((c.a0 + (c.a1 - c.a0) * R("a")) * Math.PI) / 180;
          const v = c.v[0] + (c.v[1] - c.v[0]) * R("v");
          const d = c.ring * (0.55 + 0.45 * R("d"));
          let x = c.x + Math.cos(a) * d * 1.5;
          let y = c.y + Math.sin(a) * d * 0.55;
          let vx = Math.cos(a) * v;
          let vy = Math.sin(a) * v;
          for (let k = 0; k < t; k++) {
            x += vx;
            y += vy;
            vx *= 0.94;
            vy = vy * 0.94 + 1.5;
          }
          const w = 16 + 18 * R("w");
          const h = 9 + 9 * R("h");
          const fade = interpolate(
            t,
            [40 + 20 * R("f"), 70 + 20 * R("f")],
            [1, 0],
            clamp,
          );
          return (
            <div
              key={`${ci}-${i}`}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: w,
                height: R("round") > 0.75 ? w : h,
                borderRadius: R("round") > 0.75 ? "50%" : 3,
                background: colours[Math.floor(R("c") * colours.length)],
                rotate: `${R("r") * 360 + t * (R("vr") - 0.5) * 40}deg`,
                scale: `1 ${Math.cos(t * (0.2 + 0.3 * R("flip")))}`,
                opacity: fade,
              }}
            />
          );
        }),
      )}
    </AbsoluteFill>
  );
};

const Confetti: React.FC<{ r: number }> = ({ r }) => {
  const frame = useCurrentFrame();
  const box = { ...BOX, y: 560, h: 640 };
  const hit = 28 * r;
  // The capture runs at its real speed (30 pictures over 3.2 s) and starts 4 frames in: the toast slides in, then counts
  // up to +30 pts, which lands on `hit`.
  const idx = (frame - 4 * r) / (3.2 * r);
  const shake = interpolate(frame, [hit, hit + 10 * r], [1, 0], clamp);
  const sx = (random(`sx${frame}`) - 0.5) * 34 * shake;
  const sy = (random(`sy${frame}`) - 0.5) * 34 * shake;
  const ring = interpolate(frame, [hit, hit + 14 * r], [0, 1], {
    ...clamp,
    easing: OUT,
  });
  const bump = interpolate(
    frame,
    [hit - 1, hit + 2, hit + 9 * r],
    [1, 1.09, 1],
    { ...clamp, easing: OUT },
  );
  return (
    <AbsoluteFill>
      <Ground x={50} y={46} />
      <AbsoluteFill style={{ translate: `${sx}px ${sy}px` }}>
        <AbsoluteFill style={{ padding: "150px 84px 0" }}>
          <Slam lines={["Turn it in."]} gold={[]} size={150} at={1} r={r} />
        </AbsoluteFill>
        {/* The page for a moment (Submitted, the confetti starting), then the punch in to Halo+'s toast. */}
        <AbsoluteFill
          style={{ scale: `${bump}`, transformOrigin: "540px 880px" }}
        >
          <Cam
            src={seq("confetti", 30, idx)}
            natural={PAGE}
            box={box}
            keys={[
              { f: 0, cx: 640, cy: 260, s: 0.86 },
              { f: 3 * r, cx: 660, cy: 240, s: 0.9 },
              { f: 11 * r, cx: 1100, cy: 60, s: 2.9 },
              { f: 100 * r, cx: 1100, cy: 60, s: 3.1, ease: (t) => t },
            ]}
          />
        </AbsoluteFill>
        {/* The gold ring that goes out from the toast on the +30. */}
        <div
          style={{
            position: "absolute",
            left: 540 - 700 * ring,
            top: 880 - 700 * ring,
            width: 1400 * ring,
            height: 1400 * ring,
            borderRadius: "50%",
            border: `${40 * (1 - ring)}px solid ${GOLD}`,
            opacity: 1 - ring * ring,
          }}
        />
        <AbsoluteFill style={{ top: box.y + box.h + 50, padding: "0 84px" }}>
          <Slam
            lines={["It checks", "off."]}
            gold={["off"]}
            size={150}
            at={hit}
            stagger={2}
            r={r}
          />
        </AbsoluteFill>
      </AbsoluteFill>
      <Burst at={hit} ox={540} oy={880} only="centre" />
      <Burst at={hit} ox={540} oy={880} only="corners" />
    </AbsoluteFill>
  );
};

const End: React.FC<{ r: number }> = ({ r }) => {
  const frame = useCurrentFrame();
  const pop = (a: number) =>
    interpolate(frame, [a * r, (a + 8) * r], [0, 1], { ...clamp, easing: POP });
  return (
    <AbsoluteFill>
      <Ground x={50} y={34} />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "0 70px",
          scale: `${interpolate(frame, [0, 66 * r], [1, 1.04])}`,
        }}
      >
        <div
          style={{
            scale: `${0.3 + 0.7 * pop(0)}`,
            opacity: interpolate(frame, [0, 2], [0, 1], clamp),
          }}
        >
          <Mark
            size={250}
            draw={interpolate(frame, [0, 14 * r], [0.15, 1], {
              ...clamp,
              easing: OUT,
            })}
            plus={INK_2}
          />
        </div>
        <div style={{ marginTop: 46 }}>
          <Slam
            lines={["GCU’s Halo,", "upgraded."]}
            gold={["upgraded"]}
            size={136}
            at={5 * r}
            stagger={2.5}
            align="center"
            r={r}
          />
        </div>
        <div
          style={{
            marginTop: 58,
            scale: `${pop(18)}`,
            fontFamily: DISPLAY,
            fontWeight: 800,
            fontSize: 56,
            background: GOLD,
            color: INK_2,
            padding: "22px 48px",
            borderRadius: 999,
            boxShadow: "0 18px 40px -16px rgba(154,106,0,0.6)",
          }}
        >
          Free on Chrome
        </div>
        <div
          style={{
            marginTop: 38,
            fontFamily: BODY,
            fontWeight: 700,
            fontSize: 54,
            color: T.text,
            opacity: interpolate(frame, [22 * r, 27 * r], [0, 1], clamp),
            translate: `0 ${interpolate(frame, [22 * r, 30 * r], [26, 0], { ...clamp, easing: OUT })}px`,
          }}
        >
          Link in bio ↗
        </div>
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          alignItems: "center",
          paddingBottom: 120,
        }}
      >
        <div
          style={{
            fontFamily: BODY,
            fontSize: 32,
            color: T.sub,
            opacity: interpolate(frame, [26 * r, 32 * r], [0, 1], clamp),
          }}
        >
          @haloplus · Not affiliated with GCU
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ——— Cuts ———

type Kind = { kind: "pop" | "whipX" | "whipY" | "wipe" | "flash" };
const Cut: React.FC<TransitionPresentationComponentProps<Kind>> = ({
  children,
  presentationDirection,
  presentationProgress: p,
  passedProps,
}) => {
  const k = passedProps.kind;
  const out = presentationDirection === "exiting";
  const speed = Math.sin(Math.PI * p); // fastest in the middle, so the blur is strongest there
  let style: React.CSSProperties = {};
  let bx = 0;
  let by = 0;
  if (k === "whipX") {
    style = { translate: `${out ? -p * 100 : (1 - p) * 100}% 0` };
    bx = speed * 70;
  } else if (k === "whipY") {
    style = { translate: `0 ${out ? -p * 100 : (1 - p) * 100}%` };
    by = speed * 70;
  } else if (k === "pop") {
    style = out
      ? { scale: `${1 + p * 1.6}`, opacity: 1 - p }
      : { scale: `${0.55 + 0.45 * p}`, opacity: Math.min(1, p * 2.5) };
    bx = by = speed * 26;
  } else if (k === "flash") {
    style = out
      ? { scale: `${1 + p * 0.25}` }
      : { scale: `${1.25 - 0.25 * p}`, opacity: p < 0.45 ? 0 : 1 };
    bx = by = speed * 18;
  } else if (k === "wipe" && !out) {
    // A diagonal edge sweeps across, the new scene behind it.
    const e = -30 + p * 160;
    style = { clipPath: `polygon(0 0, ${e}% 0, ${e - 30}% 100%, 0 100%)` };
  }
  const { svg, filter } = useBlur(bx, by);
  const flash =
    k === "flash" && !out ? interpolate(p, [0, 0.45, 1], [0, 1, 0]) : 0;
  const bar = k === "wipe" && !out ? -30 + p * 160 : null;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {svg}
      <AbsoluteFill style={{ ...style, filter }}>{children}</AbsoluteFill>
      {bar !== null && (
        <div
          style={{
            position: "absolute",
            top: -200,
            bottom: -200,
            left: `${bar - 15}%`,
            width: "11%",
            background: GOLD,
            transform: "skewX(-16deg)",
            boxShadow: "0 0 60px rgba(242,184,75,0.8)",
          }}
        />
      )}
      {flash > 0 && (
        <AbsoluteFill style={{ background: "#FFFFFF", opacity: flash }} />
      )}
    </AbsoluteFill>
  );
};
const cut = (kind: Kind["kind"]): TransitionPresentation<Kind> => ({
  component: Cut,
  props: { kind },
});

export const Reel2: React.FC<Reel2Props> = ({ pace }) => {
  const P = PLANS[pace];
  const S = P.scenes;
  const r = (k: SceneKey) => S[k] / BASE[k];
  const timing = linearTiming({
    durationInFrames: P.tr,
    easing: Easing.bezier(0.75, 0, 0.25, 1),
  });
  return (
    <AbsoluteFill style={{ background: T.bg }}>
      <TransitionSeries>
        <TransitionSeries.Sequence name="Hook" durationInFrames={S.hook}>
          <Hook r={r("hook")} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={cut("pop")}
          timing={timing}
        />
        <TransitionSeries.Sequence name="What's next" durationInFrames={S.next}>
          <Next r={r("next")} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={cut("whipX")}
          timing={timing}
        />
        <TransitionSeries.Sequence
          name="One calendar"
          durationInFrames={S.calendar}
        >
          <Calendar r={r("calendar")} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={cut("wipe")}
          timing={timing}
        />
        <TransitionSeries.Sequence name="Search" durationInFrames={S.search}>
          <Search r={r("search")} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={cut("whipY")}
          timing={timing}
        />
        <TransitionSeries.Sequence
          name="Confetti"
          durationInFrames={S.confetti}
        >
          <Confetti r={r("confetti")} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={cut("flash")}
          timing={timing}
        />
        <TransitionSeries.Sequence name="End card" durationInFrames={S.end}>
          <End r={r("end")} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
