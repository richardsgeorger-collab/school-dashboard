import { Composition, Still } from "remotion";
import { CAROUSEL, Profile, SLIDES } from "./Carousel";
import { Reel, REEL_LENGTH } from "./Reel";
import { Reel2, reel2Length } from "./Reel2";
import { Reel3, REEL3_LENGTH } from "./Reel3";
import { Reel4, REEL4_LENGTH } from "./Reel4";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="Reel-Midnight" component={Reel} durationInFrames={REEL_LENGTH} fps={30} width={1080} height={1920} defaultProps={{ theme: "midnight" as const }} />
      <Composition id="Reel-Daylight" component={Reel} durationInFrames={REEL_LENGTH} fps={30} width={1080} height={1920} defaultProps={{ theme: "daylight" as const }} />
      <Composition id="Reel2-Daylight" component={Reel2} durationInFrames={reel2Length("fast")} fps={30} width={1080} height={1920} defaultProps={{ pace: "fast" as const }} />
      <Composition id="Reel2-Daylight-Faster" component={Reel2} durationInFrames={reel2Length("faster")} fps={30} width={1080} height={1920} defaultProps={{ pace: "faster" as const }} />
      <Composition id="Reel3-Daylight-Calm" component={Reel3} durationInFrames={REEL3_LENGTH} fps={30} width={1080} height={1920} />
      <Composition id="Reel3-Daylight-Calm-App" component={Reel3} durationInFrames={REEL3_LENGTH} fps={30} width={1080} height={1920} defaultProps={{ app: true }} />
      <Composition id="Reel4-Daylight" component={Reel4} durationInFrames={REEL4_LENGTH} fps={30} width={1080} height={1920} defaultProps={{ sound: true }} />
      <Composition id="Reel4-Daylight-Silent" component={Reel4} durationInFrames={REEL4_LENGTH} fps={30} width={1080} height={1920} defaultProps={{ sound: false }} />
      {SLIDES.map((S, i) => (
        <Still key={i} id={`Carousel-${i + 1}`} component={S} width={CAROUSEL.width} height={CAROUSEL.height} />
      ))}
      <Still id="Profile" component={Profile} width={1080} height={1080} />
    </>
  );
};
