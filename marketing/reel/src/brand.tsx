import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Halo+'s own look (the app and the extension): near-black ink, Halo+ gold, the ring mark, Plus Jakarta Sans and Inter.
export const GOLD = "#F2B84B";
export const GOLD_DEEP = "#9A6A00";
export const INK = "#0B0D10";
export const INK_2 = "#14171C";
export const PAPER = "#F6F7F9";
export const MUTED = "#9AA3B0";

void loadFont({ family: "Jakarta", url: staticFile("fonts/PlusJakartaSans.woff2"), weight: "200 800" });
void loadFont({ family: "Inter", url: staticFile("fonts/Inter.woff2"), weight: "100 900" });

export const DISPLAY = "Jakarta, Inter, sans-serif";
export const BODY = "Inter, sans-serif";

/** The Halo+ mark: the gold ring that opens at the top right, and the plus. */
export const Mark: React.FC<{ size: number; ring?: string; plus?: string; draw?: number }> = ({ size, ring = GOLD, plus = "#F2F4F7", draw = 1 }) => {
  const len = 2 * Math.PI * 21.3 * 0.82;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <path d="M52.6 26.5A21.3 21.3 0 1 1 37.5 11.4" fill="none" stroke={ring} strokeWidth={6} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - draw)} />
      <path d="M47.1 9.3v15.2M39.5 16.9h15.2" stroke={plus} strokeWidth={6.5} strokeLinecap="round" opacity={Math.min(1, Math.max(0, (draw - 0.6) / 0.4))} />
    </svg>
  );
};

export type Theme = "midnight" | "daylight";
export const themeOf = (t: Theme) =>
  t === "midnight"
    ? { bg: INK, bg2: "#161A21", text: "#F2F4F7", sub: MUTED, accent: GOLD, glow: "rgba(242,184,75,0.22)", card: "#1C2028" }
    : { bg: PAPER, bg2: "#FFFFFF", text: INK_2, sub: "#5B6270", accent: GOLD_DEEP, glow: "rgba(242,184,75,0.35)", card: "#FFFFFF" };
