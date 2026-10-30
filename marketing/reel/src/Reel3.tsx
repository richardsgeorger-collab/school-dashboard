import { AbsoluteFill, Easing, Img, interpolate, random, Sequence, staticFile, useCurrentFrame } from "remotion";
import pieces from "../public/ui3/pieces.json";
import { DISPLAY, GOLD, GOLD_DEEP, INK_2, Mark, themeOf } from "./brand";

/**
 * The launch reel, round 3 (George, 2026-10-30: "calm but super satisfying, like the smooth UI videos people watch on
 * loop"). The same hook, beats and end card, about 20.6 s, each beat about 4 s. Smooth and calm: slow-in slow-out easing,
 * soft drifts and push-ins, a little parallax, no slams, whips, flashes or heavy blur. Each beat shows one whole piece of
 * the real Halo+ UI (scripts/marketing-capture-v3.mjs: Chrome, the test Halo pages, the made-up Maya Torres), all at
 * the same scale, centred in the same place, and something happens in it at an easy pace: the NEXT lines fill in one by
 * one, the calendar chips settle into their days, "topic 3 quiz" is typed with the results gliding in, the done toast
 * slides in counting up to +30 while its This week box ticks, and soft confetti drifts down behind it all. One short
 * caption a beat, always in the same place. Everything stays inside Instagram's safe zone (nothing in the top 250 px or
 * the bottom 400 px).
 */
const T = themeOf("daylight");
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const CALM = Easing.bezier(0.45, 0, 0.55, 1);
const SETTLE = Easing.bezier(0.22, 1, 0.36, 1);
const ease = (f: number, a: number, b: number, from = 0, to = 1, e = CALM) => interpolate(f, [a, b], [from, to], { ...clamp, easing: e });

/** One scale for every piece of UI (frame px per CSS px), so the beats all look the same size. */
const S = 1.85;
/** The stage: the UI sits centred here; the caption always sits at CAPTION_Y. Safe zone: y 250 to 1520. */
const STAGE_Y = 1000;
const CAPTION_Y = 372;
const SHADOW = "0 34px 70px -26px rgba(20,23,28,0.28), 0 8px 22px rgba(20,23,28,0.08), 0 0 0 1px rgba(20,23,28,0.05)";

/** Scenes in frames at 30 fps; each overlaps the next by FADE (a slow crossfade). */
export const REEL3 = { hook: 90, next: 126, calendar: 126, search: 126, submit: 132, end: 108 };
const FADE = 18;
type Key = keyof typeof REEL3;
const KEYS = Object.keys(REEL3) as Key[];
const startOf = (k: Key) => KEYS.slice(0, KEYS.indexOf(k)).reduce((n, x) => n + REEL3[x] - FADE, 0);
export const REEL3_LENGTH = KEYS.reduce((n, k) => n + REEL3[k], 0) - FADE * (KEYS.length - 1);

/** The moments, in frames inside each scene, for lining up a sound (README). */
export const REEL3_MOMENTS: [Key, number, string][] = [
  ["hook", 2, "hook fades in"],
  ["next", 30, "NEXT line 1 fills in"],
  ["next", 44, "NEXT line 2"],
  ["next", 58, "NEXT line 3"],
  ["calendar", 28, "first chip settles"],
  ["calendar", 82, "last chip settles"],
  ["search", 26, "typing starts"],
  ["search", 86, "“topic 3 quiz”, two results"],
  ["submit", 20, "the toast slides in"],
  ["submit", 61, "+30 pts"],
  ["submit", 66, "the box ticks, confetti starts"],
  ["end", 30, "“GCU’s Halo, upgraded.”"],
];
export const reel3Cuts = () => [
  ...KEYS.slice(1).map((k) => ({ at: +((startOf(k) + FADE / 2) / 30).toFixed(2), what: `CUT (crossfade) → ${k}` })),
  ...REEL3_MOMENTS.map(([k, f, what]) => ({ at: +((startOf(k) + f) / 30).toFixed(2), what })),
].sort((a, b) => a.at - b.at);

// ——— Pieces ———

/** Part of a capture (a crop in its CSS px), drawn at scale S. */
const Slice: React.FC<{ src: string; w: number; h: number; crop?: { x: number; y: number; w: number; h: number }; style?: React.CSSProperties }> = ({ src, w, h, crop = { x: 0, y: 0, w, h }, style }) => (
  <div style={{ position: "absolute", left: crop.x * S, top: crop.y * S, width: crop.w * S, height: crop.h * S, overflow: "hidden", ...style }}>
    <Img src={staticFile(`ui3/${src}`)} style={{ position: "absolute", maxWidth: "none", width: w * S, height: h * S, left: -crop.x * S, top: -crop.y * S }} />
  </div>
);

/** The paper: a soft gold glow and a dot grid that drift slowly (the far layer of the parallax). */
const Ground: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at ${66 + Math.sin(f / 70) * 10}% ${22 + Math.cos(f / 90) * 6}%, ${T.glow}, transparent 60%), ${T.bg}` }}>
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(20,23,28,0.07) 2px, transparent 2.3px)", backgroundSize: "44px 44px", backgroundPosition: `${f * 0.12}px ${f * -0.35}px` }} />
    </AbsoluteFill>
  );
};

type Part = { t: string; gold?: boolean };
/** The caption: one short line, always in the same place, fading and rising in gently. */
const Caption: React.FC<{ parts: Part[]; len: number }> = ({ parts, len }) => {
  const f = useCurrentFrame();
  const inn = ease(f, 12, 34);
  const out = ease(f, len - FADE, len - 6);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: CAPTION_Y - 40, textAlign: "center", fontFamily: DISPLAY, fontWeight: 800, fontSize: 66, letterSpacing: "-0.035em", lineHeight: 1.2, color: INK_2, whiteSpace: "nowrap", opacity: inn * (1 - out), translate: `0 ${(1 - inn) * 18 - f * 0.05}px` }}>
      {parts.map((p, i) => (
        <span key={i} style={{ color: p.gold ? GOLD_DEEP : undefined }}>
          {p.t}
        </span>
      ))}
    </div>
  );
};

/** A beat: the caption, and the UI (w × h frame px) centred on the stage, easing in, pushing in slowly, easing out. */
const Beat: React.FC<{ len: number; caption: Part[]; w: number; h: number; top?: number; behind?: React.ReactNode; children: React.ReactNode }> = ({ len, caption, w, h, top, behind, children }) => {
  const f = useCurrentFrame();
  const inn = ease(f, 10, 34);
  const out = ease(f, len - FADE, len - 6);
  const push = interpolate(f, [0, len], [0.985, 1.02]);
  const y = (top ?? STAGE_Y - h / 2) + (1 - inn) * 36 - out * 24 - f * 0.12;
  return (
    <AbsoluteFill style={{ opacity: 1 - out }}>
      {behind}
      <div style={{ position: "absolute", left: 540 - w / 2, top: y, width: w, height: h, opacity: inn, scale: `${push}`, transformOrigin: "50% 40%" }}>{children}</div>
      <Caption parts={caption} len={len} />
    </AbsoluteFill>
  );
};

// ——— Beats ———

const Hook: React.FC = () => {
  const f = useCurrentFrame();
  const len = REEL3.hook;
  const out = ease(f, len - FADE, len - 6);
  const lines = ["The Halo upgrade", "every GCU student", "needs."];
  return (
    <AbsoluteFill style={{ opacity: 1 - out, alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <div style={{ opacity: ease(f, 0, 14), marginBottom: 54, translate: `0 ${-f * 0.1}px` }}>
        <Mark size={150} draw={ease(f, 0, 34, 0.1, 1, SETTLE)} plus={INK_2} />
      </div>
      {lines.map((l, i) => {
        const k = ease(f, 2 + i * 8, 24 + i * 8);
        return (
          <div key={l} style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 104, lineHeight: 1.08, letterSpacing: "-0.045em", color: INK_2, opacity: k, translate: `0 ${(1 - k) * 26 - f * 0.18}px` }}>
            {l.split(" ").map((w, j) => (
              <span key={j} style={{ color: w === "upgrade" ? GOLD_DEEP : undefined }}>
                {j ? " " : ""}
                {w}
              </span>
            ))}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** The class card; its NEXT lines fill in one by one. */
const Next: React.FC = () => {
  const f = useCurrentFrame();
  const c = pieces.card;
  const rows = c.rows;
  const cover = { x: rows[0].x - 2, y: rows[0].y - 2, w: rows[0].w + 4, h: rows[rows.length - 1].y + rows[rows.length - 1].h - rows[0].y + 4 };
  return (
    <Beat len={REEL3.next} caption={[{ t: "What’s " }, { t: "next", gold: true }, { t: ", on every class." }]} w={c.w * S} h={c.h * S}>
      <div style={{ position: "absolute", inset: 0, borderRadius: c.radius * S, overflow: "hidden", boxShadow: SHADOW, background: c.ground }}>
        <Slice src={c.src} w={c.w} h={c.h} />
        <div style={{ position: "absolute", left: cover.x * S, top: cover.y * S, width: cover.w * S, height: cover.h * S, background: c.tint }} />
        {rows.map((r, i) => {
          const k = ease(f, 30 + i * 14, 48 + i * 14, 0, 1, SETTLE);
          return <Slice key={i} src={c.src} w={c.w} h={c.h} crop={r} style={{ opacity: k, translate: `${(1 - k) * 0}px ${(1 - k) * 12}px` }} />;
        })}
      </div>
    </Beat>
  );
};

/** Three whole days on the calendar; their chips settle in, day by day. */
const Calendar: React.FC = () => {
  const f = useCurrentFrame();
  const c = pieces.calendar;
  let n = 0;
  return (
    <Beat len={REEL3.calendar} caption={[{ t: "Every class. " }, { t: "One calendar.", gold: true }]} w={c.w * S} h={c.h * S}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 10, overflow: "hidden", boxShadow: SHADOW, background: c.ground }}>
        <Slice src={c.src} w={c.w} h={c.h} />
        {c.days.flatMap((d) => d.chips.map((ch, i) => <div key={`${d.box.x}-${d.box.y}-${i}`} style={{ position: "absolute", left: (ch.x - 1.5) * S, top: (ch.y - 1.5) * S, width: (ch.w + 3) * S, height: (ch.h + 3) * S, background: d.ground }} />))}
        {c.days.flatMap((d) =>
          d.chips.map((ch, i) => {
            const at = 28 + n++ * 6;
            const k = ease(f, at, at + 22, 0, 1, SETTLE);
            return <Slice key={`c${d.box.x}-${d.box.y}-${i}`} src={c.src} w={c.w} h={c.h} crop={ch} style={{ opacity: ease(f, at, at + 10), translate: `0 ${(1 - k) * -22}px` }} />;
          }),
        )}
      </div>
    </Beat>
  );
};

/** Halo+'s search box: "topic 3 quiz" typed at an easy speed, the box gliding to each new height, the results fading in. */
const Search: React.FC = () => {
  const f = useCurrentFrame();
  const st = pieces.search;
  const PER = 5; // frames a letter: about six letters a second
  const at = (i: number) => 26 + (i - 1) * PER;
  const i = Math.max(0, Math.min(st.length - 1, Math.floor((f - 26) / PER) + 1));
  // The height glides from the last state's to this one's.
  const prev = st[Math.max(0, i - 1)];
  const cur = st[i];
  const g = i === 0 ? 1 : ease(f, at(i), at(i) + 10);
  const h = (prev.h + (cur.h - prev.h) * g) * S;
  const w = cur.w * S;
  // Centred on the stage at whatever height it has: it grows and shrinks from its middle.
  const tallest = Math.max(...st.map((x) => x.h)) * S;
  return (
    <Beat len={REEL3.search} caption={[{ t: "⌘K.", gold: true }, { t: " Find anything." }]} w={w} h={tallest}>
      {/* The list grows and shrinks above the footer, which stays on the box's bottom edge (never two footers). */}
      <div style={{ position: "absolute", left: 0, top: (tallest - h) / 2, width: w, height: h, borderRadius: pieces.searchRadius * S, overflow: "hidden", boxShadow: SHADOW, background: pieces.searchGround }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h - cur.foot * S, overflow: "hidden" }}>
          {i > 0 && <Slice src={prev.src} w={prev.w} h={prev.h} crop={{ x: 0, y: 0, w: prev.w, h: prev.h - prev.foot }} style={{ opacity: 1 - ease(f, at(i), at(i) + 2) }} />}
          <Slice src={cur.src} w={cur.w} h={cur.h} crop={{ x: 0, y: 0, w: cur.w, h: cur.h - cur.foot }} style={{ opacity: i === 0 ? 1 : ease(f, at(i), at(i) + 2) }} />
        </div>
        <div style={{ position: "absolute", left: 0, top: h - cur.foot * S, width: w, height: cur.foot * S, overflow: "hidden" }}>
          <Slice src={cur.src} w={cur.w} h={cur.h} crop={{ x: 0, y: cur.h - cur.foot, w: cur.w, h: cur.foot }} style={{ left: 0, top: 0 }} />
        </div>
      </div>
    </Beat>
  );
};

/** Soft confetti drifting down, slowly swaying (behind the UI and the words). */
const Drift: React.FC<{ from: number }> = ({ from }) => {
  const f = useCurrentFrame();
  const colours = ["#522398", "#8a5cd6", GOLD, "#ffd96a", "#07bc0c", "#2fb8ff", "#ff5d8f", "#ff8a3d"];
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: 90 }, (_, i) => {
        const R = (k: string) => random(`drift-${i}-${k}`);
        const t = f - from - R("s") * 30;
        if (t < 0) return null;
        const x = R("x") * 1080 + Math.sin(t / (22 + R("p") * 16) + R("ph") * 6) * 34;
        const y = -60 + R("y0") * 1500 + t * (2.4 + R("v") * 2.2);
        const size = 12 + R("w") * 12;
        const round = R("r") > 0.7;
        return <div key={i} style={{ position: "absolute", left: x, top: y, width: size, height: round ? size : size * 0.55, borderRadius: round ? "50%" : 3, background: colours[Math.floor(R("c") * colours.length)], rotate: `${R("a") * 360 + t * (R("va") - 0.5) * 5}deg`, scale: `1 ${0.35 + 0.65 * Math.abs(Math.cos(t * (0.05 + 0.05 * R("f"))))}`, opacity: Math.min(1, t / 12) * 0.85 }} />;
      })}
    </AbsoluteFill>
  );
};

/** Turn it in: the done toast slides in counting up to +30, and its This week box ticks. */
const Submit: React.FC = () => {
  const f = useCurrentFrame();
  const to = pieces.toast;
  const wk = pieces.week;
  const PAD = 30;
  const tw = to.box.w * S;
  const th = to.box.h * S;
  const ww = wk.w * S + PAD * 2;
  const wh = wk.h * S + PAD * 2;
  const GAP = 60;
  const H = th + GAP + wh;
  // The toast's own frames from when it is in place (230 ms in), played at 0.6× so the count is easy to watch.
  const T0 = 20;
  const first = to.frames.find((x) => x.ms >= 230) ?? to.frames[0];
  const ms = first.ms + Math.max(0, f - T0) * (1000 / 30) * 0.6;
  const fr = [...to.frames].reverse().find((x) => x.ms <= ms) ?? first;
  const slide = ease(f, T0, T0 + 24, 0, 1, SETTLE);
  const TICK = 66;
  const tick = ease(f, TICK, TICK + 8);
  const pop = interpolate(f, [TICK, TICK + 5, TICK + 14], [0.7, 1.12, 1], { ...clamp, easing: CALM });
  return (
    <Beat len={REEL3.submit} caption={[{ t: "Turn it in. It " }, { t: "checks off.", gold: true }]} w={ww} h={H} behind={<Drift from={TICK} />}>
      <div style={{ position: "absolute", left: (ww - tw) / 2, top: 0, width: tw, height: th, opacity: slide, translate: `${(1 - slide) * 70}px 0`, boxShadow: SHADOW, borderRadius: 4 * S, overflow: "hidden" }}>
        <Slice src={fr.src} w={to.area.w} h={to.area.h} crop={to.box} style={{ left: 0, top: 0 }} />
      </div>
      <div style={{ position: "absolute", left: 0, top: th + GAP, width: ww, height: wh, borderRadius: 18, background: wk.ground, boxShadow: SHADOW, overflow: "hidden" }}>
        <div style={{ position: "absolute", left: PAD, top: PAD, width: wk.w * S, height: wk.h * S }}>
          <Slice src={wk.src0} w={wk.w} h={wk.h} />
          <Slice src={wk.src1} w={wk.w} h={wk.h} style={{ opacity: tick }} />
          {f >= TICK && <Slice src={wk.src1} w={wk.w} h={wk.h} crop={{ x: wk.check.x - 1, y: wk.check.y - 1, w: wk.check.w + 2, h: wk.check.h + 2 }} style={{ scale: `${pop}`, background: wk.ground }} />}
        </div>
      </div>
    </Beat>
  );
};

const End: React.FC = () => {
  const f = useCurrentFrame();
  const k = (a: number) => ease(f, a + 8, a + 30, 0, 1, SETTLE);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", translate: `0 ${-f * 0.12}px` }}>
      <div style={{ opacity: k(4), scale: `${0.9 + 0.1 * k(4)}` }}>
        <Mark size={220} draw={ease(f, 12, 48, 0.1, 1, SETTLE)} plus={INK_2} />
      </div>
      <div style={{ marginTop: 46, fontFamily: DISPLAY, fontWeight: 800, fontSize: 112, lineHeight: 1.06, letterSpacing: "-0.045em", color: INK_2 }}>
        <div style={{ opacity: k(18), translate: `0 ${(1 - k(18)) * 22}px` }}>GCU’s Halo,</div>
        <div style={{ opacity: k(28), translate: `0 ${(1 - k(28)) * 22}px`, color: GOLD_DEEP }}>upgraded.</div>
      </div>
      <div style={{ marginTop: 54, opacity: k(42), translate: `0 ${(1 - k(42)) * 18}px`, fontFamily: DISPLAY, fontWeight: 800, fontSize: 52, background: GOLD, color: INK_2, padding: "20px 46px", borderRadius: 999, boxShadow: "0 16px 36px -16px rgba(154,106,0,0.55)" }}>Free on Chrome</div>
      <div style={{ marginTop: 34, opacity: k(52), fontFamily: DISPLAY, fontWeight: 700, fontSize: 50, color: INK_2 }}>Link in bio ↗</div>
      <div style={{ marginTop: 70, opacity: k(60), fontFamily: DISPLAY, fontWeight: 600, fontSize: 30, color: T.sub }}>@haloplus · Not affiliated with GCU</div>
    </AbsoluteFill>
  );
};

export const Reel3: React.FC = () => (
  <AbsoluteFill style={{ background: T.bg }}>
    <Ground />
    <Sequence name="Hook" from={startOf("hook")} durationInFrames={REEL3.hook}>
      <Hook />
    </Sequence>
    <Sequence name="What's next" from={startOf("next")} durationInFrames={REEL3.next}>
      <Next />
    </Sequence>
    <Sequence name="One calendar" from={startOf("calendar")} durationInFrames={REEL3.calendar}>
      <Calendar />
    </Sequence>
    <Sequence name="Search" from={startOf("search")} durationInFrames={REEL3.search}>
      <Search />
    </Sequence>
    <Sequence name="Turn it in" from={startOf("submit")} durationInFrames={REEL3.submit}>
      <Submit />
    </Sequence>
    <Sequence name="End card" from={startOf("end")} durationInFrames={REEL3.end}>
      <End />
    </Sequence>
  </AbsoluteFill>
);
