import { Img, staticFile } from "remotion";

/**
 * A piece of the real Halo+ UI (a 2× capture), cropped to one region and drawn at `width` px wide. `src` is a file in
 * public/ui; `crop` is in the capture's CSS pixels; `natural` is the capture's CSS size.
 */
export const Shot: React.FC<{ src: string; natural: { w: number; h: number }; crop: { x: number; y: number; w: number; h: number }; width: number; radius?: number; shadow?: string; style?: React.CSSProperties; push?: { to: number; t: number; focus: { x: number; y: number } } }> = ({ src, natural, crop, width, radius = 22, shadow = "0 40px 90px -20px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.25)", style, push }) => {
  const k = width / crop.w;
  const h = crop.h * k;
  // The camera push: zoom toward `focus` and bring it to the middle of the frame as it goes (t from 0 to 1).
  const z = push ? 1 + (push.to - 1) * push.t : 1;
  const fx = push ? (push.focus.x - crop.x) * k : 0;
  const fy = push ? (push.focus.y - crop.y) * k : 0;
  const tx = push ? fx + (width / 2 - fx) * push.t - fx * z : 0;
  const ty = push ? fy + (h / 2 - fy) * push.t - fy * z : 0;
  return (
    <div style={{ width, height: h, overflow: "hidden", borderRadius: radius, boxShadow: shadow, position: "relative", background: "#fff", ...style }}>
      <div style={{ position: "absolute", inset: 0, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
        <Img src={staticFile(`ui/${src}`)} style={{ position: "absolute", width: natural.w * k, height: natural.h * k, left: -crop.x * k, top: -crop.y * k, maxWidth: "none" }} />
      </div>
    </div>
  );
};

export const PAGE = { w: 1280, h: 800 };
export const CARDS = { w: 1024, h: 1700 };
