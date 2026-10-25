"use client";
import { useState } from "react";
import type { ApprovedStory } from "@/lib/types";
import { displayableMedia } from "@/lib/media";
export default function StoryVisual({ story }: { story: ApprovedStory }) {
  const [broken, setBroken] = useState<string[]>([]);
  const usable =
    story.media?.filter(
      (m) => displayableMedia(m) && !broken.includes(m.url),
    ) ?? [];
  // A real publisher photo of the story beats a contextual logo.
  const media =
    usable.find((m) => m.rights === "publisher-preview") ?? usable[0];
  const onError = () => media && setBroken((list) => [...list, media.url]);
  return (
    <figure className="story-visual">
      {media?.rights === "publisher-preview" ? (
        <>
          <div className="visual-photo">
            <img
              src={media.url}
              alt={media.alt}
              onError={onError}
              referrerPolicy="no-referrer"
              loading="lazy"
              decoding="async"
              width="1024"
              height="576"
            />
          </div>
          <figcaption>
            {media.attribution} ·{" "}
            <a href={media.sourceUrl} target="_blank" rel="noopener noreferrer">
              Source ↗
            </a>
          </figcaption>
        </>
      ) : media ? (
        <>
          <div className="visual-image">
            <img
              src={media.url}
              alt={media.alt}
              onError={onError}
              width="500"
              height="250"
            />
          </div>
          <figcaption>
            {media.attribution} ·{" "}
            <a
              href={media.licenseUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              License
            </a>{" "}
            ·{" "}
            <a href={media.sourceUrl} target="_blank" rel="noopener noreferrer">
              Original
            </a>
          </figcaption>
        </>
      ) : (
        <>
          <div className="neutral-visual" aria-hidden="true">
            <svg viewBox="0 0 600 220">
              <circle
                cx="300"
                cy="110"
                r="86"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <ellipse
                cx="300"
                cy="110"
                rx="42"
                ry="86"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M214 110h172M225 70h150M225 150h150"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
              <circle cx="445" cy="54" r="15" fill="currentColor" />
              <path
                d="M133 145h44m-22-22v44"
                stroke="currentColor"
                strokeWidth="3"
              />
            </svg>
            <span>{story.category}</span>
          </div>
          <figcaption>Illustration</figcaption>
        </>
      )}
      {!media && story.media?.some((m) => !displayableMedia(m)) && (
        <p className="note visual-link">
          <a
            href={story.media.find((m) => !displayableMedia(m))!.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Images at source ↗
          </a>
        </p>
      )}
    </figure>
  );
}
