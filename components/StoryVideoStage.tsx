"use client";
import { useEffect, useRef, useState } from "react";
import type { VideoManifest } from "@/lib/video";
import { videoTimeForNarration } from "@/lib/video";
import type { PlaybackController, PlaybackState } from "./AudioPlayer";

/** A real cached MP4. The narration clock drives the scene and loops the
 * completed shot rather than freezing on an unexplained final frame. */
export default function StoryVideoStage({
  manifest,
  active,
  playback,
  getController,
  silent,
  onSilentChange,
  onUnavailable,
  thumbnail,
}: {
  manifest: VideoManifest;
  active: boolean;
  playback?: PlaybackState;
  getController: () => PlaybackController | null;
  silent: boolean;
  onSilentChange: (silent: boolean) => void;
  onUnavailable: () => void;
  thumbnail?: { src: string; alt: string };
}) {
  const video = useRef<HTMLVideoElement>(null);
  const clockRef = useRef(getController);
  clockRef.current = getController;
  const [blocked, setBlocked] = useState(false);
  const [started, setStarted] = useState(false);
  const clip = manifest.clips.find(
    (item) => item.status === "ready" && item.asset,
  );
  useEffect(() => {
    const media = video.current;
    if (!media) return;
    if (!active) {
      media.pause();
      return;
    }
    if (silent) return;
    let frame = 0;
    const sync = () => {
      const clock = clockRef.current();
      const time = clock?.currentTime() ?? playback?.time ?? 0;
      const playing = clock?.isPlaying() ?? playback?.playing ?? false;
      const duration = clip?.durationSeconds ?? 5;
      const target = videoTimeForNarration(time, duration, true);
      const scenePlaying = playing;
      media.playbackRate = clock?.playbackRate?.() ?? 1;
      if (media.readyState >= 1 && Math.abs(media.currentTime - target) > 0.2)
        media.currentTime = target;
      if (scenePlaying && media.paused)
        void media.play().catch(() => setBlocked(true));
      if (!scenePlaying && !media.paused) media.pause();
      if (scenePlaying) frame = requestAnimationFrame(sync);
    };
    sync();
    return () => {
      cancelAnimationFrame(frame);
      media.pause();
    };
  }, [active, silent, playback?.playing, clip?.durationSeconds]);
  useEffect(() => {
    if (
      !silent &&
      active &&
      !playback?.playing &&
      video.current &&
      video.current.readyState >= 1
    )
      video.current.currentTime = videoTimeForNarration(
        playback?.time ?? 0,
        clip?.durationSeconds ?? 5,
        true,
      );
  }, [
    silent,
    active,
    playback?.playing,
    playback?.time,
    clip?.durationSeconds,
  ]);
  useEffect(() => {
    const media = video.current;
    return () => media?.pause();
  }, []);
  if (!clip?.asset) return null;
  return (
    <figure className="story-video" aria-label="AI-generated illustrated video">
      <div className="media-mode" role="group" aria-label="Video playback mode">
        <button
          aria-pressed={!silent}
          onClick={() => {
            video.current?.pause();
            onSilentChange(false);
          }}
        >
          With narration
        </button>
        <button
          aria-pressed={silent}
          onClick={() => {
            getController()?.pause();
            onSilentChange(true);
          }}
        >
          Watch silently
        </button>
      </div>
      <div className="video-stage">
        {!silent && !started && (
          <img
            className="video-thumbnail"
            src={thumbnail?.src ?? clip.poster}
            alt={thumbnail?.alt ?? clip.alt}
            loading="lazy"
            decoding="async"
          />
        )}
        <video
          ref={video}
          src={clip.asset.url}
          poster={clip.poster}
          preload={active ? "metadata" : "none"}
          muted
          playsInline
          controls={silent}
          onPlay={() => setStarted(true)}
          onError={onUnavailable}
          aria-label={clip.alt}
        />
      </div>
      {blocked && !silent && <p className="video-play-note">Tap Watch silently to play the scene.</p>}
    </figure>
  );
}
