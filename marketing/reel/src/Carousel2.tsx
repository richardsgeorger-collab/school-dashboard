import { AbsoluteFill, Img, random, staticFile } from "remotion";
import p3 from "../public/ui3/pieces.json";
import p5 from "../public/ui5/pieces.json";
import { DISPLAY, GOLD, GOLD_DEEP, INK_2, Mark } from "./brand";

/**
 * The carousel, redone (George, 2026-10-30: "the real UI is way too small with lots of empty space"). The daylight
 * look of the v3 reel (paper, a gold glow, Jakarta, gold accents, calm). Every slide: one big headline, one short
 * line, and ONE whole piece of the real UI (captured by its exact box: scripts/marketing-capture-v3.mjs and -v5.mjs,
 * Chrome, the test Halo pages, the made-up Maya Torres) filling most of the slide, with a soft shadow and a slight
 * 3D tilt. The mark and the slide number small in a corner. Three hook slides to choose from: A (collage), B (before
 * and after), C (just type).
 */
export const SLIDE = { width: 1080, height: 1350 };
const SUB = "#4B5261";

type Box = { w: number; h: number };
type Crop = { x: number; y: number; w: number; h: number };

const Ground: React.FC<{ x?: number; y?: number; strong?: boolean }> = ({ x = 80, y = 10, strong }) => (
  <AbsoluteFill style={{ background: `radial-gradient(circle at ${x}% ${y}%, rgba(242,184,75,${strong ? 0.42 : 0.3}), transparent 55%), radial-gradient(circle at ${100 - x}% ${100 - y}%, rgba(242,184,75,0.12), transparent 50%), #F6F7F9` }}>
    <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgba(20,23,28,0.07) 2px, transparent 2.3px)", backgroundSize: "40px 40px" }} />
  </AbsoluteFill>
);

const Corner: React.FC<{ n: number }> = ({ n }) => (
  <>
    <div style={{ position: "absolute", left: 56, top: 48, display: "flex", alignItems: "center", gap: 12, fontFamily: DISPLAY, fontWeight: 800, fontSize: 30, letterSpacing: "-0.03em", color: INK_2 }}>
      <Mark size={40} plus={INK_2} />
      Halo+
    </div>
    <div style={{ position: "absolute", right: 56, top: 54, fontFamily: DISPLAY, fontWeight: 700, fontSize: 26, color: "#8a919d" }}>{n}/8</div>
  </>
);

/** Words, with the ones in `gold` in deep gold. */
const Headline: React.FC<{ text: string; gold?: string[]; size?: number; align?: "left" | "center"; color?: string }> = ({ text, gold = [], size = 92, align = "left", color = INK_2 }) => (
  <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: "-0.045em", color, textAlign: align, textWrap: "balance" }}>
    {text.split(" ").map((w, i) => (
      <span key={i} style={{ color: gold.includes(w.replace(/[.,]/g, "")) ? GOLD_DEEP : undefined }}>
        {i ? " " : ""}
        {w}
      </span>
    ))}
  </div>
);
const Line: React.FC<{ children: React.ReactNode; size?: number; align?: "left" | "center" }> = ({ children, size = 34, align = "left" }) => <div style={{ marginTop: 18, fontFamily: DISPLAY, fontWeight: 600, fontSize: size, lineHeight: 1.3, color: SUB, textAlign: align }}>{children}</div>;

/** A whole piece of real UI (a capture of one element), at `width` px, tilted a little, on a soft shadow. */
const Piece: React.FC<{ src: string; box: Box; width: number; crop?: Crop; rx?: number; ry?: number; rz?: number; radius?: number; style?: React.CSSProperties }> = ({ src, box, width, crop, rx = 7, ry = -6, rz = 0, radius = 10, style }) => {
  const c = crop ?? { x: 0, y: 0, w: box.w, h: box.h };
  const k = width / c.w;
  return (
    <div style={{ perspective: 2200, ...style }}>
      <div style={{ width, height: c.h * k, borderRadius: radius, overflow: "hidden", position: "relative", background: "#fff", transform: `rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`, boxShadow: "0 50px 90px -40px rgba(20,23,28,0.45), 0 14px 30px -10px rgba(20,23,28,0.16), 0 0 0 1.5px rgba(20,23,28,0.06)" }}>
        <Img src={staticFile(src)} style={{ position: "absolute", maxWidth: "none", left: -c.x * k, top: -c.y * k, width: box.w * k, height: box.h * k }} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(120deg, rgba(255,255,255,0.18), rgba(255,255,255,0) 40%)" }} />
      </div>
    </div>
  );
};

const CARD = { src: "ui5/plus-card.png", box: p5.plus.box };
const PLAIN = { src: "ui5/plain-card.png", box: p5.plain.box };
const CAL = { src: "ui3/calendar.png", box: { w: p3.calendar.w, h: p3.calendar.h } };
const SEARCH7 = { src: p3.search[7].src.replace(/^/, "ui3/"), box: p3.search[7] };
const SEARCH12 = { src: p3.search[12].src.replace(/^/, "ui3/"), box: p3.search[12] };
const RUBRIC = { src: "ui5/rubric.png", box: p5.rubric.box };
const MAX = { src: "ui5/maxcard.png", box: p5.maxcard.box };
const TOASTF = p3.toast.frames[p3.toast.frames.length - 1];
const TOAST = { src: `ui3/${TOASTF.src}`, box: p3.toast.area, crop: p3.toast.box as Crop };

/** Confetti, still, in Halo+'s celebration colours. */
const Confetti: React.FC<{ seed: string; n: number; area: Crop; size?: number }> = ({ seed, n, area, size = 22 }) => {
  const colours = ["#522398", "#8a5cd6", GOLD, "#ffd96a", "#07bc0c", "#2fb8ff", "#ff5d8f", "#ff8a3d"];
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const R = (k: string) => random(`${seed}-${i}-${k}`);
        const s = size * (0.6 + R("s") * 0.8);
        const round = R("r") > 0.72;
        return <div key={i} style={{ position: "absolute", left: area.x + R("x") * area.w, top: area.y + R("y") * area.h, width: s, height: round ? s : s * 0.5, borderRadius: round ? "50%" : 3, background: colours[Math.floor(R("c") * colours.length)], transform: `rotate(${R("a") * 360}deg) scaleY(${0.4 + R("f") * 0.6})`, opacity: 0.95 }} />;
      })}
    </>
  );
};

/** A feature slide: headline and line at the top, the piece filling the rest. */
const Feature: React.FC<{ n: number; title: string; gold: string[]; line: React.ReactNode; children: React.ReactNode; top?: number }> = ({ n, title, gold, line, children, top = 470 }) => (
  <AbsoluteFill>
    <Ground />
    <Corner n={n} />
    <div style={{ position: "absolute", left: 64, right: 64, top: 128 }}>
      <Headline text={title} gold={gold} />
      <Line>{line}</Line>
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, top, bottom: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>{children}</div>
  </AbsoluteFill>
);

const HOOK = "The Halo upgrade every GCU student needs.";
const Swipe: React.FC<{ color?: string }> = ({ color = GOLD_DEEP }) => <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 40, color, letterSpacing: "-0.02em" }}>Swipe →</div>;

// A: the hook with the best real pieces floating around it.
const HookA: React.FC = () => (
  <AbsoluteFill>
    <Ground x={50} y={50} strong />
    <Corner n={1} />
    <Piece {...CARD} width={470} rx={6} ry={10} rz={-6} style={{ position: "absolute", left: 30, top: 120 }} />
    <Piece {...CAL} width={490} rx={6} ry={-10} rz={5} style={{ position: "absolute", right: 28, top: 150 }} />
    <Piece {...SEARCH12} width={500} rx={-6} ry={10} rz={4} style={{ position: "absolute", left: 34, bottom: 120 }} />
    <div style={{ position: "absolute", right: 30, bottom: 190 }}>
      <Confetti seed="hookA" n={26} area={{ x: -40, y: -90, w: 470, h: 300 }} size={18} />
      <Piece {...TOAST} width={430} rx={-5} ry={-10} rz={-5} radius={6} />
    </div>
    <div style={{ position: "absolute", left: 60, right: 60, top: 520, padding: "34px 30px 30px", borderRadius: 40, background: "rgba(246,247,249,0.86)", boxShadow: "0 30px 80px -30px rgba(20,23,28,0.35)", backdropFilter: "blur(14px)" }}>
      <Headline text={HOOK} gold={["upgrade"]} size={98} align="center" />
    </div>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 44, display: "flex", justifyContent: "center" }}>
      <Swipe />
    </div>
  </AbsoluteFill>
);

// B: the same Halo class card without and with Halo+, overlapping on a diagonal (Halo+ in front).
const HookB: React.FC = () => {
  const label = (t: string, on: boolean) => <div style={{ position: "absolute", left: 18, top: -30, zIndex: 2, padding: "10px 26px", borderRadius: 999, fontFamily: DISPLAY, fontWeight: 800, fontSize: 32, background: on ? GOLD : "#e3e6eb", color: on ? INK_2 : "#4b5261", boxShadow: "0 10px 24px -12px rgba(20,23,28,0.35)" }}>{t}</div>;
  return (
    <AbsoluteFill>
      <Ground x={78} y={8} />
      <Corner n={1} />
      <div style={{ position: "absolute", left: 60, right: 60, top: 118 }}>
        <Headline text={HOOK} gold={["upgrade"]} size={92} />
      </div>
      <div style={{ position: "absolute", left: 34, top: 486 }}>
        {label("Halo", false)}
        <Piece {...PLAIN} width={560} rx={4} ry={10} rz={-3} />
      </div>
      <div style={{ position: "absolute", right: 30, top: 864 }}>
        {label("Halo + Halo+", true)}
        <Piece {...CARD} width={620} rx={4} ry={-8} rz={2} />
      </div>
      <div style={{ position: "absolute", left: 64, bottom: 56 }}>
        <Swipe />
      </div>
    </AbsoluteFill>
  );
};

// C: just type, and the gold ring.
const HookC: React.FC = () => (
  <AbsoluteFill>
    <Ground x={86} y={6} strong />
    <div style={{ position: "absolute", right: -170, top: 40, opacity: 0.95 }}>
      <Mark size={700} plus={INK_2} />
    </div>
    <Corner n={1} />
    <div style={{ position: "absolute", left: 60, right: 60, bottom: 170 }}>
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 170, lineHeight: 0.94, letterSpacing: "-0.055em", color: INK_2 }}>
        The Halo <span style={{ color: GOLD_DEEP }}>upgrade</span> every GCU student needs.
      </div>
    </div>
    <div style={{ position: "absolute", left: 64, bottom: 64 }}>
      <Swipe />
    </div>
  </AbsoluteFill>
);

const S2: React.FC = () => (
  <Feature n={2} title="What’s next, on every class." gold={["next"]} line="Your grade and the next things due, right on Halo’s class cards.">
    <Piece {...CARD} width={940} />
  </Feature>
);
const S3: React.FC = () => (
  <Feature n={3} title="Every class, one calendar." gold={["one", "calendar."]} line="All your classes on Halo’s calendar, each in its own color.">
    <Piece {...CAL} width={950} ry={6} />
  </Feature>
);
const S4: React.FC = () => (
  <Feature n={4} title="⌘K. Find anything." gold={["⌘K."]} line="Every class, assignment and file, from any Halo page. Ctrl+K on Windows." top={440}>
    <Piece {...SEARCH7} width={860} radius={8} />
  </Feature>
);
const S5: React.FC = () => (
  <Feature n={5} title="Rubrics, right under the assignment." gold={["Rubrics,"]} line="No new tab. Every level, one tap away.">
    <Piece {...RUBRIC} width={950} ry={6} />
  </Feature>
);
const S6: React.FC = () => (
  <Feature n={6} title="Confetti when you submit." gold={["Confetti"]} line="The moment Halo confirms it: checked off, points, a little celebration.">
    <div style={{ position: "relative", width: 960, height: 760, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Confetti seed="s6" n={70} area={{ x: 0, y: 0, w: 960, h: 760 }} size={26} />
      <Piece {...TOAST} width={940} radius={10} rx={6} ry={-4} />
    </div>
  </Feature>
);
const S7: React.FC = () => (
  <Feature
    n={7}
    title="Never miss a hidden due date."
    gold={["hidden"]}
    line={
      <>
        Teachers move dates in announcements. <b style={{ color: INK_2 }}>Halo+ Max</b> puts the change on the assignment. Max is <b style={{ color: GOLD_DEEP }}>$0.99/mo</b>; everything else is free.
      </>
    }
    top={520}
  >
    <Piece {...MAX} width={930} ry={6} />
  </Feature>
);
const S8: React.FC = () => (
  <AbsoluteFill>
    <Ground x={50} y={30} strong />
    <Corner n={8} />
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 60px" }}>
      <Mark size={250} plus={INK_2} />
      <div style={{ marginTop: 40 }}>
        <Headline text="GCU’s Halo, upgraded." gold={["upgraded."]} size={128} align="center" />
      </div>
      <div style={{ marginTop: 50, fontFamily: DISPLAY, fontWeight: 800, fontSize: 60, background: GOLD, color: INK_2, padding: "24px 56px", borderRadius: 999, boxShadow: "0 20px 44px -18px rgba(154,106,0,0.6)" }}>Free on Chrome</div>
      <div style={{ marginTop: 30, fontFamily: DISPLAY, fontWeight: 700, fontSize: 42, color: SUB }}>+ your own Halo+ app on your phone</div>
      <div style={{ marginTop: 40, fontFamily: DISPLAY, fontWeight: 800, fontSize: 56, color: INK_2 }}>Link in bio ↗</div>
    </AbsoluteFill>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 52, textAlign: "center", fontFamily: DISPLAY, fontWeight: 600, fontSize: 28, color: "#8a919d" }}>@haloplus · Not affiliated with GCU</div>
  </AbsoluteFill>
);

export const SLIDES2: { id: string; C: React.FC }[] = [
  { id: "Slide-1A", C: HookA },
  { id: "Slide-1B", C: HookB },
  { id: "Slide-1C", C: HookC },
  { id: "Slide-2", C: S2 },
  { id: "Slide-3", C: S3 },
  { id: "Slide-4", C: S4 },
  { id: "Slide-5", C: S5 },
  { id: "Slide-6", C: S6 },
  { id: "Slide-7", C: S7 },
  { id: "Slide-8", C: S8 },
];
