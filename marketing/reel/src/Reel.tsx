import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { BODY, DISPLAY, Mark, themeOf, type Theme } from "./brand";
import { CARDS, PAGE, Shot } from "./Shot";

/**
 * The launch reel (George, 2026-10-30): 1080×1920, 30 fps, about 22 s, no music (room for a trending sound). A hook in
 * the first 1.5 s, four quick beats of the real Halo+ UI (captured in Chrome on the test Halo pages with the made-up
 * Maya Torres: scripts/marketing-capture.mjs), each one short line of big kinetic type, and an end card. Two styles:
 * "midnight" (dark, gold, UI tilted in 3D) and "daylight" (light, gold, the UI flatter with a cleaner camera).
 */
export type ReelProps = { theme: Theme };

const EASE = Easing.bezier(0.16, 1, 0.3, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Big kinetic type: each word rises out of a blur, one after another; words in `gold` are gold. */
const Kinetic: React.FC<{ lines: string[]; gold?: string[]; size: number; start?: number; stagger?: number; theme: Theme; align?: "left" | "center" }> = ({ lines, gold = [], size, start = 0, stagger = 3, theme, align = "left" }) => {
  const frame = useCurrentFrame();
  const t = themeOf(theme);
  let i = 0;
  return (
    <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: "-0.045em", color: t.text, textAlign: align }}>
      {lines.map((line, li) => (
        <div key={li} style={{ display: "flex", flexWrap: "wrap", gap: `0 ${size * 0.24}px`, justifyContent: align === "center" ? "center" : "flex-start" }}>
          {line.split(" ").map((w) => {
            const at = start + i++ * stagger;
            const p = interpolate(frame, [at, at + 12], [0, 1], { ...clamp, easing: EASE });
            return (
              <span key={w + i} style={{ display: "inline-block", opacity: p, translate: `0 ${(1 - p) * size * 0.55}px`, filter: `blur(${(1 - p) * 14}px)`, color: gold.includes(w.replace(/[.,]/g, "")) ? t.accent : undefined }}>
                {w}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** The background: the theme's ground and a slow gold glow that drifts. */
const Ground: React.FC<{ theme: Theme; x?: number; y?: number }> = ({ theme, x = 70, y = 20 }) => {
  const frame = useCurrentFrame();
  const t = themeOf(theme);
  const dx = Math.sin(frame / 50) * 6;
  return <AbsoluteFill style={{ background: `radial-gradient(circle at ${x + dx}% ${y}%, ${t.glow}, transparent 55%), ${t.bg}` }} />;
};

/** A scene's way in and out: a soft fade and a small push. */
const Scene: React.FC<{ len: number; children: React.ReactNode }> = ({ len, children }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        opacity: interpolate(frame, [0, 7, len - 7, len], [0, 1, 1, 0], clamp),
        scale: interpolate(frame, [0, 10, len - 8, len], [1.04, 1, 1, 0.97], { ...clamp, easing: EASE }),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const Hook: React.FC<{ theme: Theme; len: number }> = ({ theme, len }) => {
  const frame = useCurrentFrame();
  const t = themeOf(theme);
  return (
    <Scene len={len}>
      <Ground theme={theme} x={80} y={14} />
      <AbsoluteFill style={{ padding: "0 90px", justifyContent: "center" }}>
        <div style={{ marginBottom: 56, opacity: interpolate(frame, [0, 8], [0, 1], clamp) }}>
          <Mark size={120} draw={interpolate(frame, [0, 22], [0, 1], { ...clamp, easing: EASE })} plus={t.text} />
        </div>
        <Kinetic lines={["The Halo", "upgrade every", "GCU student", "needs."]} gold={["upgrade"]} size={122} start={2} stagger={3} theme={theme} />
        <div style={{ marginTop: 48, fontFamily: BODY, fontSize: 44, fontWeight: 600, color: t.sub, opacity: interpolate(frame, [34, 46], [0, 1], clamp) }}>Halo+ · right on Halo’s own pages</div>
      </AbsoluteFill>
    </Scene>
  );
};

/** One beat: the line at the top, the real UI below, moving the way the style moves. */
const Beat: React.FC<{ theme: Theme; len: number; lines: string[]; gold: string[]; note: string; children: (f: number, t: (at?: number) => number) => React.ReactNode; tilt?: { from: [number, number]; to: [number, number] } }> = ({ theme, len, lines, gold, note, children, tilt = { from: [26, -16], to: [7, -4] } }) => {
  const frame = useCurrentFrame();
  const mid = theme === "midnight";
  const p = interpolate(frame, [4, 34], [0, 1], { ...clamp, easing: EASE });
  const rx = mid ? interpolate(p, [0, 1], [tilt.from[0], tilt.to[0]]) : interpolate(p, [0, 1], [10, 0]);
  const ry = mid ? interpolate(p, [0, 1], [tilt.from[1], tilt.to[1]]) : 0;
  return (
    <Scene len={len}>
      <Ground theme={theme} x={20} y={86} />
      <AbsoluteFill style={{ padding: "210px 90px 0" }}>
        <Kinetic lines={lines} gold={gold} size={112} start={2} stagger={3} theme={theme} />
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", paddingTop: 440, perspective: 1600 }}>
        <div
          style={{
            transformStyle: "preserve-3d",
            rotate: `x ${rx}deg`,
            transform: `rotateY(${ry}deg)`,
            translate: `0 ${(1 - p) * 420}px`,
            opacity: interpolate(frame, [4, 16], [0, 1], clamp),
            scale: interpolate(frame, [4, 34, len], [0.86, 1, 1.04], { ...clamp, easing: EASE }),
          }}
        >
          {children(frame, (at = 38) => interpolate(frame, [at, at + 40], [0, 1], { ...clamp, easing: Easing.bezier(0.65, 0, 0.35, 1) }))}
        </div>
      </AbsoluteFill>
      {/* What it is, in plain words, for anyone watching with the sound off. */}
      <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 90px 230px" }}>
        <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 46, lineHeight: 1.3, color: themeOf(theme).sub, opacity: interpolate(frame, [22, 34], [0, 1], clamp), translate: `0 ${interpolate(frame, [22, 36], [24, 0], { ...clamp, easing: EASE })}px` }}>{note}</div>
      </AbsoluteFill>
    </Scene>
  );
};

const End: React.FC<{ theme: Theme; len: number }> = ({ theme, len }) => {
  const frame = useCurrentFrame();
  const t = themeOf(theme);
  const pop = interpolate(frame, [0, 26], [0, 1], { ...clamp, easing: Easing.bezier(0.34, 1.56, 0.64, 1) });
  return (
    <Scene len={len + 8}>
      <Ground theme={theme} x={50} y={36} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 90px", textAlign: "center" }}>
        <div style={{ scale: `${0.6 + pop * 0.4}`, opacity: pop }}>
          <Mark size={260} draw={interpolate(frame, [0, 30], [0, 1], { ...clamp, easing: EASE })} plus={t.text} />
        </div>
        <div style={{ marginTop: 50 }}>
          <Kinetic lines={["GCU’s Halo,", "upgraded."]} gold={["upgraded"]} size={124} start={10} stagger={4} theme={theme} align="center" />
        </div>
        <div style={{ marginTop: 56, display: "flex", gap: 22, opacity: interpolate(frame, [30, 42], [0, 1], clamp), translate: `0 ${interpolate(frame, [30, 44], [30, 0], { ...clamp, easing: EASE })}px` }}>
          <span style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 48, background: t.accent === "#F2B84B" ? "#F2B84B" : "#F2B84B", color: "#14171C", padding: "18px 38px", borderRadius: 999 }}>Free on Chrome</span>
        </div>
        <div style={{ marginTop: 40, fontFamily: BODY, fontWeight: 700, fontSize: 52, color: t.text, opacity: interpolate(frame, [40, 52], [0, 1], clamp) }}>Link in bio ↗</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 120 }}>
        <div style={{ fontFamily: BODY, fontSize: 30, color: t.sub, opacity: interpolate(frame, [44, 56], [0, 1], clamp) }}>@haloplus · Not affiliated with GCU</div>
      </AbsoluteFill>
    </Scene>
  );
};

/** The four beats and their timings (frames at 30 fps). */
export const REEL_SCENES = { hook: 66, next: 114, calendar: 108, search: 120, confetti: 120, end: 126 };
export const REEL_LENGTH = Object.values(REEL_SCENES).reduce((a, b) => a + b, 0);

export const Reel: React.FC<ReelProps> = ({ theme }) => {
  const { fps } = useVideoConfig();
  const t = themeOf(theme);
  const S = REEL_SCENES;
  let at = 0;
  const from = (n: number) => {
    const f = at;
    at += n;
    return f;
  };
  void fps;
  const ring = theme === "midnight" ? undefined : "0 30px 70px -24px rgba(20,23,28,0.35), 0 4px 14px rgba(20,23,28,0.12)";
  return (
    <AbsoluteFill style={{ background: t.bg }}>
      <Sequence name="Hook" from={from(S.hook)} durationInFrames={S.hook}>
        <Hook theme={theme} len={S.hook} />
      </Sequence>
      <Sequence name="What's next" from={from(S.next)} durationInFrames={S.next}>
        <Beat theme={theme} len={S.next} lines={["What’s next,", "on every class."]} gold={["next"]} note="Your grade and the next things due, right on Halo’s class cards.">
          {(_, z) => <Shot src="cards.png" natural={CARDS} crop={{ x: 24, y: 556, w: 976, h: 720 }} width={980} shadow={ring} push={{ to: 1.9, t: z(), focus: { x: 262, y: 735 } }} />}
        </Beat>
      </Sequence>
      <Sequence name="One calendar" from={from(S.calendar)} durationInFrames={S.calendar}>
        <Beat theme={theme} len={S.calendar} lines={["Every class.", "One calendar."]} gold={["One", "calendar."]} note="All your classes on Halo’s calendar, each in its own color." tilt={{ from: [18, 24], to: [4, 5] }}>
          {(_, z) => <Shot src="calendar.png" natural={PAGE} crop={{ x: 104, y: 222, w: 812, h: 368 }} width={980} shadow={ring} push={{ to: 1.6, t: z(), focus: { x: 700, y: 480 } }} />}
        </Beat>
      </Sequence>
      <Sequence name="Search" from={from(S.search)} durationInFrames={S.search}>
        <Beat theme={theme} len={S.search} lines={["⌘K.", "Find anything."]} gold={["⌘K."]} note="Every class, every assignment, every file. Ctrl+K on Windows." tilt={{ from: [22, -10], to: [5, -2] }}>
          {(f, z) => <Shot src={`search/${String(Math.max(0, Math.min(12, Math.floor((f - 26) / 4)))).padStart(2, "0")}.png`} natural={PAGE} crop={{ x: 290, y: 66, w: 700, h: 380 }} width={980} shadow={ring} push={{ to: 1.3, t: z(70), focus: { x: 600, y: 170 } }} />}
        </Beat>
      </Sequence>
      <Sequence name="Confetti" from={from(S.confetti)} durationInFrames={S.confetti}>
        <Beat theme={theme} len={S.confetti} lines={["Turn it in.", "It checks off."]} gold={["checks", "off."]} note="The moment Halo confirms it: done, points, a little confetti." tilt={{ from: [20, 14], to: [4, 3] }}>
          {(f, z) => <Shot src={`confetti/${String(Math.max(0, Math.min(29, Math.floor((f - 22) / 3)))).padStart(2, "0")}.png`} natural={PAGE} crop={{ x: 500, y: 0, w: 780, h: 600 }} width={980} shadow={ring} push={{ to: 2.1, t: z(30), focus: { x: 1100, y: 70 } }} />}
        </Beat>
      </Sequence>
      <Sequence name="End card" from={from(S.end)} durationInFrames={S.end}>
        <End theme={theme} len={S.end} />
      </Sequence>
    </AbsoluteFill>
  );
};
