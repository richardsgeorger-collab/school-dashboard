import { Composition, Still } from "remotion";
import { CAROUSEL, Profile, SLIDES } from "./Carousel";
import { Reel, REEL_LENGTH } from "./Reel";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="Reel-Midnight" component={Reel} durationInFrames={REEL_LENGTH} fps={30} width={1080} height={1920} defaultProps={{ theme: "midnight" as const }} />
      <Composition id="Reel-Daylight" component={Reel} durationInFrames={REEL_LENGTH} fps={30} width={1080} height={1920} defaultProps={{ theme: "daylight" as const }} />
      {SLIDES.map((S, i) => (
        <Still key={i} id={`Carousel-${i + 1}`} component={S} width={CAROUSEL.width} height={CAROUSEL.height} />
      ))}
      <Still id="Profile" component={Profile} width={1080} height={1080} />
    </>
  );
};
