"use client";
import { useState } from "react";
import type { ApprovedStory } from "@/lib/types";
import { displayableMedia } from "@/lib/media";
export default function StoryVisual({ story }: { story: ApprovedStory }) {
  const [broken, setBroken] = useState(false);
  const media = story.media?.find(displayableMedia);
  return <figure className="story-visual">
    {media && !broken ? <><div className="visual-image"><img src={media.url} alt={media.alt} onError={() => setBroken(true)} width="500" height="250" /></div><figcaption>{media.attribution} · <a href={media.licenseUrl} target="_blank" rel="noopener noreferrer">License</a> · <a href={media.sourceUrl} target="_blank" rel="noopener noreferrer">Original</a></figcaption></> : <><div className="neutral-visual" aria-hidden="true"><svg viewBox="0 0 600 220"><circle cx="300" cy="110" r="86" fill="none" stroke="currentColor" strokeWidth="2"/><ellipse cx="300" cy="110" rx="42" ry="86" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M214 110h172M225 70h150M225 150h150" fill="none" stroke="currentColor" strokeWidth="2"/><circle cx="445" cy="54" r="15" fill="currentColor"/><path d="M133 145h44m-22-22v44" stroke="currentColor" strokeWidth="3"/></svg><span>{story.category}</span></div><figcaption>US topic illustration · not a photograph of this event</figcaption></>}
    {story.media?.some((m) => !displayableMedia(m)) && <p className="note visual-link"><a href={story.media.find((m) => !displayableMedia(m))!.sourceUrl} target="_blank" rel="noopener noreferrer">View imagery at the original source ↗</a> · reuse rights unconfirmed</p>}
  </figure>;
}
