import { assetPath, displayableScenes, type StoryboardManifest } from "@/lib/storyboard";

/** A still editorial keyframe while a real Runway MP4 is unavailable. */
export default function StoryArtworkStage({
  manifest,
  date,
}: {
  manifest: StoryboardManifest;
  date: string;
}) {
  const scene = displayableScenes(manifest)[0];
  if (!scene) return null;
  return (
    <figure className="story-artwork-stage" aria-label="Editorial illustration">
      <div className="artwork-stage-frame">
        <img
          src={assetPath(date, manifest.storyId, scene.id)}
          alt={scene.alt}
          width={1365}
          height={1024}
          loading="eager"
          decoding="async"
        />
      </div>
      <figcaption>Illustration</figcaption>
    </figure>
  );
}
