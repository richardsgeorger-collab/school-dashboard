import { AbsoluteFill } from "remotion";
import { BODY, DISPLAY, GOLD, INK, Mark, MUTED } from "./brand";
import { CARDS, PAGE, Shot } from "./Shot";

/**
 * The launch carousel (George, 2026-10-30): 8 slides, 1080×1350, one idea each, big bold type and the real Halo+ UI
 * (the same captures as the reel), in the reel's Midnight look so the two read as one launch.
 */
const W = 1080;
const H = 1350;

const Ground: React.FC<{ x?: number; y?: number }> = ({ x = 75, y = 18 }) => <AbsoluteFill style={{ background: `radial-gradient(circle at ${x}% ${y}%, rgba(242,184,75,0.22), transparent 55%), ${INK}` }} />;

/** The type: lines of big bold words, the gold ones gold. */
const Title: React.FC<{ lines: string[]; gold?: string[]; size?: number }> = ({ lines, gold = [], size = 104 }) => (
  <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: "-0.045em", color: "#F2F4F7" }}>
    {lines.map((l, i) => (
      <div key={i}>
        {l.split(" ").map((w, j) => (
          <span key={j} style={{ color: gold.includes(w.replace(/[.,]/g, "")) ? GOLD : undefined }}>
            {j ? " " : ""}
            {w}
          </span>
        ))}
      </div>
    ))}
  </div>
);
const Sub: React.FC<{ children: React.ReactNode }> = ({ children }) => <div style={{ marginTop: 26, fontFamily: BODY, fontWeight: 600, fontSize: 40, lineHeight: 1.3, color: MUTED, maxWidth: 880 }}>{children}</div>;
/** The slide's corner: the Halo+ mark and where it is in the eight. */
const Corner: React.FC<{ n: number }> = ({ n }) => (
  <AbsoluteFill style={{ padding: "64px 80px", flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", height: 160 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 14, fontFamily: DISPLAY, fontWeight: 800, fontSize: 36, color: "#F2F4F7", letterSpacing: "-0.03em" }}>
      <Mark size={46} />
      Halo+
    </div>
    <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 30, color: MUTED }}>{n}/8</div>
  </AbsoluteFill>
);
const Tilt: React.FC<{ rx?: number; ry?: number; rz?: number; children: React.ReactNode }> = ({ rx = 10, ry = -8, rz = 0, children }) => (
  <div style={{ perspective: 1800 }}>
    <div style={{ transform: `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`, transformStyle: "preserve-3d" }}>{children}</div>
  </div>
);
/** A feature slide: the title up top, the real UI below, a plain line under it. */
const Feature: React.FC<{ n: number; lines: string[]; gold: string[]; sub: React.ReactNode; children: React.ReactNode }> = ({ n, lines, gold, sub, children }) => (
  <AbsoluteFill>
    <Ground x={20} y={90} />
    <Corner n={n} />
    <AbsoluteFill style={{ padding: "210px 80px 0" }}>
      <Title lines={lines} gold={gold} />
      <Sub>{sub}</Sub>
    </AbsoluteFill>
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 90 }}>{children}</AbsoluteFill>
  </AbsoluteFill>
);

export const SLIDES: React.FC[] = [
  // 1. The hook: thumb-stopping, the real cards fanned behind the words.
  () => (
    <AbsoluteFill>
      <Ground x={80} y={12} />
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 0, opacity: 0.95 }}>
        <div style={{ translate: "160px 260px" }}>
          <Tilt rx={24} ry={-22} rz={8}>
            <Shot src="cards.png" natural={CARDS} crop={{ x: 24, y: 556, w: 976, h: 720 }} width={980} />
          </Tilt>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${INK} 38%, rgba(11,13,16,0.75) 62%, rgba(11,13,16,0) 100%)` }} />
      <Corner n={1} />
      <AbsoluteFill style={{ padding: "220px 80px 0" }}>
        <Title lines={["The Halo", "upgrade every", "GCU student", "needs."]} gold={["upgrade"]} size={128} />
        <div style={{ marginTop: 34, display: "inline-flex", alignItems: "center", gap: 14, fontFamily: BODY, fontWeight: 700, fontSize: 40, color: GOLD }}>Swipe to see it →</div>
      </AbsoluteFill>
    </AbsoluteFill>
  ),
  () => (
    <Feature n={2} lines={["What’s next,", "on every class."]} gold={["next"]} sub="Your grade and the next things due, right on Halo’s own class cards.">
      <Tilt rx={8} ry={-6}>
        <Shot src="cards.png" natural={CARDS} crop={{ x: 24, y: 556, w: 480, h: 345 }} width={900} />
      </Tilt>
    </Feature>
  ),
  () => (
    <Feature n={3} lines={["Every class,", "one calendar."]} gold={["one", "calendar."]} sub="All your classes on Halo’s calendar, each in its own color.">
      <Tilt rx={8} ry={6}>
        <Shot src="calendar.png" natural={PAGE} crop={{ x: 104, y: 222, w: 812, h: 368 }} width={940} />
      </Tilt>
    </Feature>
  ),
  () => (
    <Feature n={4} lines={["⌘K search.", "Find anything."]} gold={["⌘K"]} sub="Every class, assignment and file, from any Halo page. Ctrl+K on Windows.">
      <Tilt rx={8} ry={-6}>
        <Shot src="search/12.png" natural={PAGE} crop={{ x: 316, y: 92, w: 560, h: 186 }} width={960} />
      </Tilt>
    </Feature>
  ),
  () => (
    <Feature n={5} lines={["Rubrics, right", "under the assignment."]} gold={["Rubrics,"]} sub="No new tab. Every level one tap away.">
      <Tilt rx={8} ry={6}>
        <Shot src="rubric.png" natural={PAGE} crop={{ x: 58, y: 386, w: 560, h: 252 }} width={940} />
      </Tilt>
    </Feature>
  ),
  () => (
    <Feature n={6} lines={["Confetti when", "you submit."]} gold={["Confetti"]} sub="The moment Halo confirms it: checked off, points, a little celebration.">
      <Tilt rx={8} ry={-6}>
        <Shot src="confetti/12.png" natural={PAGE} crop={{ x: 640, y: 0, w: 640, h: 330 }} width={940} />
      </Tilt>
    </Feature>
  ),
  // 7. Max, said honestly.
  () => (
    <Feature n={7} lines={["Never miss a", "hidden due date."]} gold={["hidden"]} sub={<>Professors move dates and add steps in announcements. <b style={{ color: "#F2F4F7" }}>Halo+ Max</b> reads every one and puts it on the assignment. <b style={{ color: GOLD }}>$0.99/mo</b>. Everything else is free.</>}>
      <Tilt rx={6} ry={-4}>
        <Shot src="maxbox2x.png" natural={PAGE} crop={{ x: 34, y: 228, w: 560, h: 130 }} width={940} />
      </Tilt>
    </Feature>
  ),
  // 8. The ask.
  () => (
    <AbsoluteFill>
      <Ground x={50} y={34} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 80px" }}>
        <Mark size={240} />
        <div style={{ marginTop: 44 }}>
          <Title lines={["GCU’s Halo,", "upgraded."]} gold={["upgraded."]} size={116} />
        </div>
        <div style={{ marginTop: 50, fontFamily: DISPLAY, fontWeight: 800, fontSize: 52, background: GOLD, color: "#14171C", padding: "20px 44px", borderRadius: 999 }}>Free on Chrome</div>
        <div style={{ marginTop: 26, fontFamily: BODY, fontWeight: 600, fontSize: 38, color: MUTED }}>+ your own Halo+ app on your phone</div>
        <div style={{ marginTop: 32, fontFamily: BODY, fontWeight: 700, fontSize: 48, color: "#F2F4F7" }}>Link in bio ↗</div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 70 }}>
        <div style={{ fontFamily: BODY, fontSize: 28, color: MUTED }}>@haloplus · Not affiliated with GCU</div>
      </AbsoluteFill>
    </AbsoluteFill>
  ),
];

export const CAROUSEL = { width: W, height: H };

/** The profile picture: the mark alone, big, on the dark ground; it reads at the size of a comment avatar. */
export const Profile: React.FC = () => (
  <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 40%, #1E222A, ${INK} 70%)`, alignItems: "center", justifyContent: "center" }}>
    <div style={{ translate: "-10px 18px" }}>
      <Mark size={760} />
    </div>
  </AbsoluteFill>
);
