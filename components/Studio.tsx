"use client";
import { useEffect, useState } from "react";
import {
  actorRuns,
  flowStages,
  stageState,
  type StudioState,
} from "@/lib/studio";
import {
  dateLabel,
  editionDay,
  selectableDay,
  type ArchiveEntry,
} from "@/lib/daily";
import type { ApprovedStory, Source } from "@/lib/types";
import EvidenceQuality from "./EvidenceQuality";
import DatePicker from "./DatePicker";
import { RunLog } from "./Transparency";
import { parseCoverageMessage } from "@/lib/historical-coverage";
import type { StoryboardIndex } from "@/lib/storyboard";
import { ILLUSTRATION_STYLE } from "@/lib/illustration-style";
import { parseVideoManifest, type VideoIndex } from "@/lib/video";
import DitheredAtmosphere from "./DitheredAtmosphere";

function SourcePacket({
  story,
  source,
  label,
}: {
  story: ApprovedStory;
  source?: Source;
  label: string;
}) {
  const evidence =
    story.evidence?.filter((item) => item.sourceId === source?.id) ?? [];
  const assessment = story.sourceAssessments?.find(
    (item) => item.sourceId === source?.id,
  );
  return (
    <section className="comparison-card">
      <p className="eyebrow">{label}</p>
      {source ? (
        <>
          <a
            className="comparison-source"
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {source.publisher} ↗
          </a>
          {evidence[0] ? (
            <>
              <p className="studio-muted">
                {evidence[0].sourceId}/{evidence[0].passageId}
              </p>
              <blockquote>{evidence[0].excerpt}</blockquote>
            </>
          ) : (
            <p className="studio-muted">No retained passage for this source.</p>
          )}
          {assessment && (
            <p className="source-assessment">{assessment.explanation}</p>
          )}
          {source.provenance && (
            <details className="source-provenance">
              <summary>Retrieval record</summary>
              <dl>
                <dt>Actor</dt>
                <dd>{source.provenance.actorId}</dd>
                <dt>Run</dt>
                <dd>
                  <a
                    href={`https://console.apify.com/actors/runs/${encodeURIComponent(source.provenance.runId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {source.provenance.runId} ↗
                  </a>
                </dd>
                <dt>Dataset item</dt>
                <dd>
                  <a
                    href={`https://console.apify.com/storage/datasets/${encodeURIComponent(source.provenance.datasetId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {source.provenance.datasetId} · item{" "}
                    {source.provenance.itemIndex} ↗
                  </a>
                </dd>
                <dt>Retrieved</dt>
                <dd>
                  {new Date(source.provenance.retrievedAt).toLocaleString()}
                </dd>
                <dt>SHA-256</dt>
                <dd>
                  <code>{source.provenance.contentHash}</code>
                </dd>
              </dl>
            </details>
          )}
        </>
      ) : (
        <p className="studio-muted">
          {label === "Primary document"
            ? "No primary document was retained for this story. The decision relies on attributed reporting."
            : "No separate reporting source was retained for this story."}
        </p>
      )}
    </section>
  );
}

function ProductionTimeline({
  state,
  storyboards,
  videos,
}: {
  state: StudioState;
  storyboards: StoryboardIndex;
  videos: VideoIndex;
}) {
  const log = state.result?.runLog ?? state.run?.runLog ?? [];
  const retrieval = flowStages.filter((stage) =>
    ["discovery", "investigation", "extraction"].includes(stage.id),
  );
  const retrievalStates = retrieval.map((stage) =>
    stageState(stage, log, state.status),
  );
  const review = flowStages.find((stage) => stage.id === "editorial")!;
  const publication = flowStages.find((stage) => stage.id === "publication")!;
  const images = Object.values(storyboards);
  const scenes = images.flatMap((manifest) => manifest.scenes);
  const readyScenes = scenes.filter(
    (scene) => scene.status === "ready" && scene.asset,
  ).length;
  const movies = Object.values(videos);
  const clips = movies.flatMap((manifest) => manifest.clips);
  const readyClips = clips.filter(
    (clip) => clip.status === "ready" && clip.asset,
  ).length;
  const steps = [
    {
      id: "retrieval",
      title: "Apify · Reporting discovery",
      status: retrievalStates.includes("running")
        ? "running"
        : retrievalStates.includes("failed")
          ? "failed"
          : retrievalStates.includes("limited")
            ? "limited"
            : retrievalStates.includes("completed")
              ? "completed"
              : "not recorded",
      description: state.result
        ? `${state.result.stats.candidatesFound} candidate records were retrieved for this edition.`
        : "Original reporting and supporting documents, with a retained retrieval trail.",
    },
    {
      id: "review",
      title: "Claude · Editorial review",
      status: stageState(review, log, state.status),
      description: state.result
        ? `${state.result.edition.stories.length} stories passed the edition’s evidence and editorial checks.`
        : "Claims are compared against the retrieved source passages.",
    },
    {
      id: "artwork",
      title: "Recraft · Visual artwork",
      status: readyScenes
        ? images.some(
            (image) => image.status === "partial" || image.status === "failed",
          )
          ? "limited"
          : "completed"
        : images.some((image) => image.status === "generating")
          ? "running"
          : images.some((image) => image.status === "failed")
            ? "failed"
            : images.some((image) => image.status === "planned")
              ? "planned"
              : "unavailable",
      description: readyScenes
        ? `${readyScenes} original illustrated scenes stored beside the edition.`
        : "Optional illustrations are separate from the published reporting.",
    },
    {
      id: "video",
      title: "Runway · Illustrated footage",
      status: readyClips
        ? "completed"
        : clips.some((clip) =>
              ["pending", "processing", "preparing"].includes(clip.status),
            )
          ? "processing"
          : clips.length
            ? "failed"
            : "unavailable",
      description: readyClips
        ? `${readyClips} real generated MP4 ${readyClips === 1 ? "clip is" : "clips are"} cached for playback.`
        : "No playable generated video is stored for this edition.",
    },
    {
      id: "narration",
      title: "Cartesia · Narration",
      status: "on demand",
      description:
        "Prepared when a reader presses play. Audio playback is not recorded in this edition.",
    },
    {
      id: "publication",
      title: "half full · Published edition",
      status: stageState(publication, log, state.status),
      description:
        state.status === "completed"
          ? "The shared edition is saved. Presentation assets never replace its reporting."
          : "An edition is published only after its evidence checks pass.",
    },
  ];
  return (
    <section aria-labelledby="production-timeline-title">
      <div className="studio-production-heading">
        <h2 id="production-timeline-title">How this day came together</h2>
        <p>
          Saved records show what ran. Optional media stays separate from the
          news.
        </p>
      </div>
      <ol className="production-timeline">
        {steps.map((step, index) => (
          <li key={step.id} data-status={step.status}>
            <span className="production-step-number" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <details className="production-step">
              <summary>
                <div className="production-step-title">
                  <h3>{step.title}</h3>
                  <span>
                    {step.status === "unrecorded"
                      ? "Not recorded"
                      : step.status}
                  </span>
                </div>
                <p>{step.description}</p>
              </summary>
              {step.id === "retrieval" && (
                <ul className="production-records">
                  {retrieval.map((stage) => {
                    const latest = log
                      .filter((event) => stage.match.test(event.step))
                      .at(-1);
                    return (
                      <li key={stage.id}>
                        <strong>
                          {stage.label} · {stageState(stage, log, state.status)}
                        </strong>
                        {latest
                          ? ` — ${latest.message}`
                          : " — No stage record retained."}
                      </li>
                    );
                  })}
                </ul>
              )}
              {step.id === "review" && (
                <ul className="production-records">
                  {log
                    .filter((event) => review.match.test(event.step))
                    .slice(-5)
                    .map((event, i) => (
                      <li key={`${event.timestamp}-${i}`}>
                        <strong>
                          {event.step} · {event.status}
                        </strong>{" "}
                        — {event.message}
                      </li>
                    ))}
                  {!log.some((event) => review.match.test(event.step)) && (
                    <li>No detailed review event retained.</li>
                  )}
                </ul>
              )}
              {step.id === "artwork" && (
                <ul className="production-records">
                  {images.map((manifest) => (
                    <li key={manifest.storyId}>
                      <strong>
                        {manifest.provider.model} · {manifest.status}
                      </strong>{" "}
                      —{" "}
                      {
                        manifest.scenes.filter(
                          (scene) => scene.status === "ready",
                        ).length
                      }
                      /{manifest.scenes.length} scenes;{" "}
                      {manifest.usage.imageCalls} image calls
                      {typeof manifest.usage.creditsUsed === "number"
                        ? `; ${manifest.usage.creditsUsed} reported API units`
                        : ""}
                      .
                    </li>
                  ))}
                  {!images.length && (
                    <li>No illustration manifest retained.</li>
                  )}
                </ul>
              )}
              {step.id === "video" && (
                <>
                  {movies.map((manifest) => (
                    <article
                      className="video-production-record"
                      key={manifest.storyId}
                    >
                      <h4>
                        {state.result?.edition.stories.find(
                          (story) => story.id === manifest.storyId,
                        )?.headline || manifest.storyId}
                      </h4>
                      <p>{manifest.disclosure}</p>
                      <p>{manifest.narration.description}</p>
                      {manifest.clips.map((clip) => (
                        <div key={clip.id}>
                          <dl>
                            <dt>Provider / model</dt>
                            <dd>
                              {manifest.provider.name} /{" "}
                              {manifest.provider.model}
                            </dd>
                            <dt>Task / status</dt>
                            <dd>
                              {clip.taskId || "Not submitted"} · {clip.status} ·
                              attempt {clip.attempt}
                            </dd>
                            <dt>Source image</dt>
                            <dd>
                              <a
                                href={clip.poster}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Stored Recraft keyframe ↗
                              </a>{" "}
                              · {clip.source.assetKey}
                            </dd>
                            <dt>Evidence</dt>
                            <dd>
                              {clip.source.evidence
                                .map(
                                  (ref) => `${ref.sourceId}/${ref.passageId}`,
                                )
                                .join(", ")}
                            </dd>
                            <dt>Output</dt>
                            <dd>
                              {clip.durationSeconds}s · {clip.ratio}
                              {clip.asset
                                ? ` · ${clip.asset.bytes.toLocaleString()} bytes`
                                : " · No cached MP4"}
                            </dd>
                            {clip.asset && (
                              <>
                                <dt>Durable video</dt>
                                <dd>
                                  <a
                                    href={clip.asset.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Open generated MP4 ↗
                                  </a>
                                </dd>
                                <dt>SHA-256</dt>
                                <dd>{clip.asset.sha256}</dd>
                                <dt>Cached</dt>
                                <dd>{clip.asset.cachedAt}</dd>
                              </>
                            )}
                            <dt>Visual review</dt>
                            <dd>
                              {manifest.review?.status || "Not recorded"}
                              {manifest.review?.notes
                                ? ` · ${manifest.review.notes}`
                                : ""}
                            </dd>
                            {clip.asset?.processing && (
                              <>
                                <dt>Output treatment</dt>
                                <dd>
                                  White margins cropped from the provider
                                  output; original MP4 retained.{" "}
                                  {clip.asset.processing.tool}
                                </dd>
                              </>
                            )}
                            <dt>Cost</dt>
                            <dd>
                              {typeof clip.cost.actualCredits === "number"
                                ? `${clip.cost.actualCredits} provider-reported credits`
                                : `${clip.cost.estimatedCredits} credits / $${clip.cost.estimatedUsd.toFixed(2)} estimated from list pricing; actual charge not reported`}
                            </dd>
                          </dl>
                          {clip.error && (
                            <p>
                              {clip.error.code}: {clip.error.message}
                            </p>
                          )}
                          <details>
                            <summary>Motion prompt & source hash</summary>
                            <p>{clip.prompt}</p>
                            <p>
                              Source prompt SHA-256: {clip.source.promptHash}
                            </p>
                          </details>
                        </div>
                      ))}
                      {manifest.previousAttempts?.map((attempt) => (
                        <details key={attempt.taskId || attempt.attempt}>
                          <summary>
                            Earlier attempt {attempt.attempt} · {attempt.status}
                          </summary>
                          <p>
                            Task {attempt.taskId || "not submitted"}.{" "}
                            {attempt.error?.code}: {attempt.error?.message}
                          </p>
                          <p>
                            {attempt.estimatedCredits} estimated credits; actual
                            charge not reported.
                          </p>
                        </details>
                      ))}
                    </article>
                  ))}
                  {!movies.length && (
                    <p className="studio-muted">
                      No video job record for this day. Opening Studio never
                      starts generation.
                    </p>
                  )}
                </>
              )}
              {step.id === "narration" && (
                <p className="studio-muted">
                  The reader uses the selected verified voice and approved story
                  copy. This production record does not claim that anyone has
                  listened.
                </p>
              )}
              {step.id === "publication" && (
                <p className="studio-muted">
                  {state.result
                    ? `Edition ${state.result.edition.id} · ${state.result.edition.createdAt}`
                    : "No published edition exists in this record."}
                </p>
              )}
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Studio() {
  const [date, setDate] = useState(editionDay);
  const [ready, setReady] = useState(false);
  const [picker, setPicker] = useState(false);
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [state, setState] = useState<StudioState>();
  const [error, setError] = useState("");
  const [storyId, setStoryId] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [storyboards, setStoryboards] = useState<StoryboardIndex>({});
  const [videos, setVideos] = useState<VideoIndex>({});
  const [illustrating, setIllustrating] = useState(false);
  const [illustrationNote, setIllustrationNote] = useState("");
  useEffect(() => {
    if (!ready) return;
    setStoryboards({});
    setIllustrationNote("");
    const controller = new AbortController();
    void fetch(`/api/illustrations/${date}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((value) => {
        if (value?.date === date) setStoryboards(value.storyboards ?? {});
      })
      .catch(() => {});
    return () => controller.abort();
  }, [date, ready, refresh]);
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    setVideos({});
    async function loadVideos() {
      try {
        const response = await fetch(`/api/videos?date=${date}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const value = await response.json();
        if (value?.date !== date || controller.signal.aborted) return;
        const retained: VideoIndex = {};
        for (const [story, raw] of Object.entries(value.videos ?? {})) {
          const manifest = parseVideoManifest(raw);
          if (manifest && manifest.date === date && manifest.storyId === story)
            retained[story] = manifest;
        }
        setVideos(retained);
        if (
          Object.values(retained).some((manifest) =>
            ["preparing", "pending", "processing"].includes(manifest.status),
          )
        )
          timer = setTimeout(loadVideos, 10000);
      } catch {
        /* Video production is optional; the evidence record stays available. */
      }
    }
    void loadVideos();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [date, ready, refresh]);
  async function illustrate() {
    setIllustrating(true);
    setIllustrationNote("");
    try {
      const response = await fetch(`/api/illustrations/${date}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(290000),
      });
      const value = await response.json();
      if (!response.ok)
        throw Error(value.error?.message ?? "Illustration failed.");
      setStoryboards(value.storyboards ?? {});
      setIllustrationNote(
        `${value.imageCalls} image call${value.imageCalls === 1 ? "" : "s"} (${value.creditsUsed ?? 0} API units reported by Recraft), ${value.plannerCalls} planner call${value.plannerCalls === 1 ? "" : "s"}${value.styleCreated ? ", style created" : ""}${value.skipped?.length ? `; skipped: ${value.skipped.map((s: { storyId: string; reason: string }) => s.reason).join(" · ")}` : ""}.`,
      );
    } catch (e) {
      setIllustrationNote(
        e instanceof Error ? e.message : "Illustration failed.",
      );
    } finally {
      setIllustrating(false);
    }
  }
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requested = params.get("date");
    if (requested && selectableDay(requested)) setDate(requested);
    setStoryId(params.get("story") ?? "");
    setReady(true);
    void fetch("/api/editions", { signal: AbortSignal.timeout(10000) })
      .then((r) => (r.ok ? r.json() : []))
      .then(setEntries)
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!ready) return;
    let closed = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    setState(undefined);
    setError("");
    async function load() {
      try {
        const response = await fetch(`/api/studio/${date}`, {
          cache: "no-store",
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(20000),
          ]),
        });
        const value = await response.json();
        if (!response.ok)
          throw Error(
            value.error?.message ?? "The generation record is unavailable.",
          );
        if (closed) return;
        setState(value);
        setError("");
        if (value.status !== "completed")
          timer = setTimeout(load, value.status === "running" ? 3000 : 8000);
      } catch (e) {
        if (!closed)
          setError(
            e instanceof Error ? e.message : "Could not load this record.",
          );
      }
    }
    void load();
    return () => {
      closed = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [date, ready, refresh]);
  const result = state?.result;
  const log = result?.runLog ?? state?.run?.runLog ?? [];
  const stats = result?.stats ?? state?.run?.stats;
  const audit = result?.rejectedStories ?? state?.run?.rejectedStories ?? [];
  const coverage = log
    .map((entry) => parseCoverageMessage(entry.message))
    .filter(Boolean)
    .at(-1);
  const secondPass = log.filter(
    (entry) => entry.step === "discovery.second-pass",
  );
  const dateExclusions = {
    undated: audit.filter((r) => /No reliable publication date/.test(r.reason))
      .length,
    otherDay: audit.filter((r) =>
      /Published outside the selected day/.test(r.reason),
    ).length,
  };
  const stories = result?.edition.stories ?? [];
  const story = stories.find((s) => s.id === storyId) ?? stories[0];
  const primary = story?.sources.find((source) =>
    story.sourceAssessments?.some(
      (a) => a.sourceId === source.id && a.kind === "primary",
    ),
  );
  const reporting =
    story?.sources.find((source) =>
      story.sourceAssessments?.some(
        (a) => a.sourceId === source.id && a.kind === "reporting",
      ),
    ) ?? story?.sources.find((source) => source.id !== primary?.id);
  function choose(day: string) {
    setDate(day);
    setPicker(false);
    setStoryId("");
    history.replaceState(null, "", `/studio?date=${day}`);
  }
  return (
    <main id="main" className="studio-shell library-studio">
      <DitheredAtmosphere tone="forest" intensity={0.12} />
      <header className="studio-header">
        <a className="studio-brand" href="/">
          half full
        </a>
        <span>The production notes</span>
        <a href={date === editionDay() ? "/" : `/?date=${date}`}>
          Open edition ↗
        </a>
      </header>
      <div className="studio-title">
        <div>
          <p className="eyebrow">half full studio</p>
          <h1>Behind the story.</h1>
          <p>Follow the reporting, the decisions and the craft.</p>
        </div>
        <button
          className="studio-date"
          aria-haspopup="dialog"
          aria-expanded={picker}
          onClick={() => setPicker(true)}
        >
          {dateLabel(date, { month: "short", day: "numeric", year: "numeric" })}{" "}
          ⌄
        </button>
      </div>
      <DatePicker
        open={picker}
        date={date}
        today={editionDay()}
        entries={entries}
        onClose={() => setPicker(false)}
        onSelect={choose}
      />
      {error && (
        <div role="alert" className="error">
          <p>{error}</p>
          <button onClick={() => setRefresh((v) => v + 1)}>Retry</button>
        </div>
      )}
      {!state && !error && (
        <p role="status" className="studio-muted">
          Loading record…
        </p>
      )}
      {state && (
        <div className="studio-workspace">
          <div className="studio-status">
            <span className={`process-status ${state.status}`}>
              <i />
              {state.status === "completed"
                ? "Published"
                : state.status === "running"
                  ? "In progress"
                  : state.status === "failed"
                    ? "Not published"
                    : "No edition yet"}
            </span>
            <span>
              {result
                ? `Published ${new Date(result.edition.createdAt).toLocaleString()}`
                : state.run
                  ? `Started ${new Date(state.run.createdAt).toLocaleString()}`
                  : "Open this date in the app to prepare its edition."}
            </span>
            {state.status !== "running" && (
              <button
                onClick={() => setRefresh((v) => v + 1)}
                aria-label="Refresh generation record"
              >
                ↻
              </button>
            )}
          </div>
          <ProductionTimeline
            state={state}
            storyboards={storyboards}
            videos={videos}
          />
          {result && <EvidenceQuality result={result} />}
          <details className="studio-details" open={!result}>
            <summary>Recorded audit totals</summary>
            <div className="studio-stats">
              <div>
                <strong>{stats?.candidatesFound ?? "—"}</strong>
                <span>candidate records</span>
              </div>
              <div>
                <strong>{stats?.approved ?? "—"}</strong>
                <span>
                  {state.status === "completed"
                    ? "published stories"
                    : "approved stories"}
                </span>
              </div>
              <div>
                <strong>{stats?.rejected ?? "—"}</strong>
                <span>excluded records</span>
              </div>
              <div>
                <strong>
                  {result
                    ? new Set(
                        stories.flatMap((s) =>
                          s.sources.map((source) => source.url),
                        ),
                      ).size
                    : "—"}
                </strong>
                <span>retained sources</span>
              </div>
            </div>
          </details>
          {state.run?.error && (
            <div className="studio-failure">
              <strong>{state.run.error.code}</strong>
              <p>{state.run.error.message}</p>
            </div>
          )}
          {(coverage ||
            secondPass.length > 0 ||
            dateExclusions.undated + dateExclusions.otherDay > 0) && (
            <section
              className="studio-section coverage-panel"
              aria-label="Date coverage"
            >
              <h2>Date coverage</h2>
              <p className="studio-muted">
                Historical days require each article's publication timestamp to
                fall on the selected day in UTC or Pacific time. Articles
                without a reliable date never qualify; the second pass only
                widens where we look.
              </p>
              {coverage && (
                <dl className="coverage-counts">
                  <div>
                    <dt>Retrieved records</dt>
                    <dd>{coverage.retrieved}</dd>
                  </div>
                  <div>
                    <dt>Unique articles</dt>
                    <dd>{coverage.unique}</dd>
                  </div>
                  <div>
                    <dt>Published that day</dt>
                    <dd>{coverage.sameDay}</dd>
                  </div>
                  <div>
                    <dt>No reliable date</dt>
                    <dd>{coverage.undated}</dd>
                  </div>
                  <div>
                    <dt>Other days</dt>
                    <dd>{coverage.otherDay}</dd>
                  </div>
                </dl>
              )}
              {!coverage && (
                <dl className="coverage-counts">
                  <div>
                    <dt>No reliable date</dt>
                    <dd>{dateExclusions.undated}</dd>
                  </div>
                  <div>
                    <dt>Other days</dt>
                    <dd>{dateExclusions.otherDay}</dd>
                  </div>
                  <div>
                    <dt>First-pass coverage</dt>
                    <dd>Not recorded</dd>
                  </div>
                </dl>
              )}
              {secondPass.map((entry) => (
                <p
                  key={entry.timestamp}
                  className={`coverage-pass ${entry.status}`}
                >
                  <strong>Second pass · {entry.status}</strong> {entry.message}
                </p>
              ))}
            </section>
          )}
          {state.status === "completed" && (
            <section className="studio-section" aria-label="Illustrations">
              <div className="studio-section-title">
                <h2>Illustrations</h2>
                <button
                  type="button"
                  disabled={illustrating}
                  onClick={() => void illustrate()}
                  title="Uses Recraft API credits for scenes that do not exist yet"
                >
                  {illustrating
                    ? "Illustrating…"
                    : "Illustrate this edition (uses Recraft credits)"}
                </button>
              </div>
              <p className="studio-muted">
                Optional presentation data stored beside the immutable edition.
                Claude plans scenes from the approved copy and retained
                passages; Recraft draws them in the half full style (
                {ILLUSTRATION_STYLE.version}). Nothing here changes the
                published news.
              </p>
              {illustrationNote && (
                <p className="studio-muted">{illustrationNote}</p>
              )}
              {stories.length > 0 && (
                <div className="illustration-list">
                  {stories.map((s) => {
                    const manifest = storyboards[s.id];
                    return (
                      <article key={s.id}>
                        <strong>{s.headline}</strong>
                        {manifest ? (
                          <>
                            <span>
                              {manifest.status} ·{" "}
                              {
                                manifest.scenes.filter(
                                  (scene) => scene.status === "ready",
                                ).length
                              }
                              /{manifest.scenes.length} scenes · tone{" "}
                              {manifest.tone} · {manifest.provider.model}
                              {manifest.provider.styleId
                                ? ` · style ${manifest.provider.styleId.slice(0, 8)}…`
                                : ""}{" "}
                              · {manifest.usage.imageCalls} image calls
                              {typeof manifest.usage.creditsUsed === "number"
                                ? ` · ${manifest.usage.creditsUsed} units`
                                : ""}
                            </span>
                            <ul>
                              {manifest.scenes.map((scene) => (
                                <li key={scene.id}>
                                  <em>{scene.id}</em> {scene.status}
                                  {scene.animation
                                    ? ` · authored SVG motion (${scene.animation.layers.length} layers, ${scene.animation.durationSeconds}s; not generated video)`
                                    : " · flat"}
                                  : {scene.purpose}
                                  {scene.error ? ` — ${scene.error}` : ""}
                                  <details>
                                    <summary>Prompt, cue and evidence</summary>
                                    <p>{scene.prompt}</p>
                                    <p>
                                      Cue: “{scene.cue}” · Caption:{" "}
                                      {scene.caption}
                                    </p>
                                    <p>
                                      Evidence:{" "}
                                      {scene.evidence
                                        .map(
                                          (e) => `${e.sourceId}/${e.passageId}`,
                                        )
                                        .join(", ")}
                                    </p>
                                  </details>
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : (
                          <span>No storyboard yet.</span>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}
          {actorRuns(state).length > 0 && (
            <section className="studio-section">
              <h2>Actor runs</h2>
              <div className="actor-run-list">
                {actorRuns(state).map((run) => (
                  <article key={run.runId}>
                    <span>{run.role}</span>
                    <strong>{run.actorId ?? "Configured Actor"}</strong>
                    <a
                      href={`https://console.apify.com/actors/runs/${encodeURIComponent(run.runId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Run {run.runId} ↗
                    </a>
                    <a
                      href={`https://console.apify.com/storage/datasets/${encodeURIComponent(run.datasetId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Dataset {run.datasetId} ↗
                    </a>
                  </article>
                ))}
              </div>
            </section>
          )}
          {story && (
            <section className="studio-section">
              <div className="studio-section-title">
                <h2>Source comparison</h2>
                <label>
                  <span className="sr-only">Story to inspect</span>
                  <select
                    aria-label="Story to inspect"
                    value={story.id}
                    onChange={(e) => setStoryId(e.target.value)}
                  >
                    {stories.map((s, i) => (
                      <option key={s.id} value={s.id}>
                        {i + 1}. {s.headline}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="comparison-claim">
                <p className="eyebrow">Claim reviewed</p>
                <h3>{story.centralClaim}</h3>
                <p>{story.verificationReason}</p>
              </div>
              <div className="comparison-grid">
                <SourcePacket
                  story={story}
                  source={reporting}
                  label="Retrieved reporting"
                />
                <SourcePacket
                  story={story}
                  source={primary}
                  label="Primary document"
                />
                <section className="comparison-card published-copy">
                  <p className="eyebrow">Published copy</p>
                  <h3>{story.headline}</h3>
                  <p>{story.summary}</p>
                  {story.action.trim() && (
                    <h4>
                      {story.closingType === "bright-side"
                        ? "The bright side"
                        : story.closingType === "response"
                          ? "What’s being done"
                          : "Next steps"}
                    </h4>
                  )}
                  <p>{story.action}</p>
                  <span className="confidence-label">
                    Editor estimate: {Math.round(story.confidence * 100)}%
                    confidence
                  </span>
                </section>
              </div>
              <details className="studio-details">
                <summary>Field-to-evidence references</summary>
                <div className="field-evidence">
                  {(story.contentSupport ?? []).map((field, i) => (
                    <section key={`${field.field}-${i}`}>
                      <h4>
                        {field.field === "action"
                          ? story.closingType === "response"
                            ? "What’s being done"
                            : story.closingType === "bright-side"
                              ? "The bright side"
                              : "Closing context"
                          : field.field.replace(/([A-Z])/g, " $1")}
                      </h4>
                      <p>{field.text}</p>
                      {field.evidence.map((e, j) => (
                        <details key={`${e.sourceId}-${e.passageId}-${j}`}>
                          <summary>
                            {e.publisher} · {e.sourceId}/{e.passageId}
                          </summary>
                          <blockquote>{e.excerpt}</blockquote>
                          <a
                            href={e.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Original source ↗
                          </a>
                        </details>
                      ))}
                    </section>
                  ))}
                </div>
              </details>
              {story.limitations?.length ? (
                <details className="studio-details">
                  <summary>Limitations</summary>
                  <ul>
                    {story.limitations.map((text, i) => (
                      <li key={i}>{text}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {story.socialContext?.posts.length ? (
                <details className="studio-details">
                  <summary>
                    Social context · {story.socialContext.posts.length} retained
                    posts
                  </summary>
                  <p>{story.socialContext.notice}</p>
                  {story.socialContext.posts.map((post) => (
                    <p key={post.id}>
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {post.title} ↗
                      </a>
                    </p>
                  ))}
                </details>
              ) : null}
            </section>
          )}
          <section className="studio-section">
            <h2>Editorial decisions</h2>
            <p className="studio-muted">
              Evidence support and editorial selection are distinct. Exclusion
              does not establish that a story is false.
            </p>
            <div className="decision-list">
              {audit.map((item, i) => (
                <details key={`${item.url}-${i}`}>
                  <summary>
                    <span className={item.verificationStatus}>
                      {item.verificationStatus === "uncertain"
                        ? "Uncertain"
                        : "Excluded"}
                    </span>
                    <strong>{item.title}</strong>
                  </summary>
                  <p>{item.reason}</p>
                  {item.centralClaim && (
                    <p>
                      <strong>Claim:</strong> {item.centralClaim}
                    </p>
                  )}
                  <a href={item.url} target="_blank" rel="noopener noreferrer">
                    Original source ↗
                  </a>
                </details>
              ))}
              {!audit.length && (
                <p className="studio-muted">No exclusions recorded.</p>
              )}
            </div>
          </section>
          <details className="studio-details full-run-log">
            <summary>Complete processing log · {log.length} events</summary>
            <RunLog log={log} />
          </details>
          <p className="studio-disclaimer">
            Passages and provenance show what was retrieved. Editorial
            confidence and source classifications are model judgments, not
            independent fact-checking.
          </p>
        </div>
      )}
    </main>
  );
}
