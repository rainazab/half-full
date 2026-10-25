# Real illustrated video

Video is an optional presentation asset beside a published edition. It does not
change approved news, evidence, narration, Recraft assets, Firestore progress or
the daily news-generation budget.

The server reads `RUNWAY_API_KEY`. No client bundle receives it. No public HTTP
endpoint submits or polls Runway tasks: generation is an explicit operator action
using the local script and server credentials.

## Provider contract

Verified against Runway's official documentation on October 24, 2026:

- `POST https://api.dev.runwayml.com/v1/image_to_video`, model `gen4_turbo`.
- Bearer authorization and `X-Runway-Version: 2024-11-06`.
- A stored Recraft image is sent as a data URI, below the 5 MB encoded limit.
- Each request creates one five-second clip, at 25 credits ($0.25 at the
  published $0.01/credit list price, excluding tax). This is an estimate, not an
  assertion about the account's final bill.
- `GET /v1/tasks/{id}` checks progress, at least five seconds apart.
- Successful signed output URLs expire. Only the downloaded durable MP4 is
  served to readers; signed result URLs are never put in public manifests.

Sources: [API reference](https://docs.dev.runwayml.com/api/),
[pricing](https://docs.dev.runwayml.com/guides/pricing/),
[input formats](https://docs.dev.runwayml.com/assets/inputs/),
[output retention](https://docs.dev.runwayml.com/assets/outputs/),
[task failures](https://docs.dev.runwayml.com/errors/task-failures/).

## Operator workflow

Run from the repository root with Node 22 or newer:

```sh
node --conditions=react-server --import tsx scripts/video-story.ts prepare 2026-10-24 STORY_ID --scene scene-2 --ratio 1104:832 --prompt-file /absolute/reviewed-prompt.txt
node --conditions=react-server --import tsx scripts/video-story.ts submit 2026-10-24 STORY_ID --scene scene-2 --ratio 1104:832 --prompt-file /absolute/reviewed-prompt.txt --max-credits 25
node --conditions=react-server --import tsx scripts/video-story.ts poll 2026-10-24 STORY_ID
node --conditions=react-server --import tsx scripts/video-story.ts export 2026-10-24 STORY_ID --out generated/video-proof
```

`prepare`, `inspect`, `poll` and `export` never create a generation. `submit`
requires the explicit credit allowance, a published verified story, retained
evidence references, an existing ready Recraft keyframe and its matching
narration script hash. Reuse a source's actual composition; do not crop landscape
keyframes into a portrait frame without reviewing the result.

The operator reviews the motion prompt against the approved visual scene. This
is human/operator authorization, not an automated factual validation of arbitrary
motion prose. Motion should preserve the illustration and avoid new factual
claims, people, labels, numeric values or events.

The script loads `.env` and `.env.local` without editing either. A separate Apify
KV store, default `us-daily-editions-videos`, holds manifests, attempt audit
records and MP4 bytes. `APIFY_VIDEO_STORE_NAME` can choose another namespace.

## Cost and duplicate protection

A separate locked Apify queue serializes video writers across instances. Before
the non-idempotent Runway POST, the server saves a Pacific-day 25-credit
reservation and a `preparing` manifest. The default daily reservation ceiling is
50 credits; `RUNWAY_DAILY_CREDIT_BUDGET` may lower it, or explicitly raise it to a
maximum of 100. The operator allowance for each submission is still required.

There are no automatic task-creation retries. If the POST times out or returns no
usable task ID, the persisted `preparing` record blocks resubmission until an
operator reconciles the provider dashboard. An explicit `--retry` is accepted
only after a confirmed failure and only once per story. Both attempt records
and their provider IDs, prompts, errors and estimates remain stored.

An unknown or corrupt budget record stops generation. Missing durable storage
also stops paid generation. A failed or missing clip retains the readable story
and still illustration.

Result downloads allow only public HTTPS hosts, reject redirects, enforce a 35 MB
limit and check the MP4 container signature. DNS checks are defense in depth;
they are not a claim of network-level egress isolation.

## Reader and Studio contract

`GET /api/videos?date=YYYY-MM-DD` returns `{date,videos}` where `videos` maps
published story IDs to `VideoManifest` from `lib/video.ts`. It is read-only and
does not contact Runway. The status is `preparing`, `pending`, `processing`,
`ready` or `failed`. Only a ready clip with a stored asset is playable.

`GET /api/videos/{date}/{storyId}/{clipId}` serves durable MP4 bytes with ETags
and single byte ranges for Safari seeking. The clip's `poster` points to the
existing Recraft image, and `asset.url` points to this local MP4 endpoint.

Manifests retain provider/model/version, task ID, attempt count, reviewed motion
prompt/hash, Recraft source image ID and prompt hash, exact scene evidence
references, narration script hash, requested five-second duration, ratio,
durable asset size/hash and timestamp. Provider-reported estimates are labeled
as estimates. Actual charges stay absent unless actually supplied.

Playback plays the short scene once and holds its last frame. Cartesia is the playback clock:
`videoTimeForNarration(audio.currentTime)` clamps it to the five-second clip; it never loops to fill the narration. Legacy manifests remain readable.
Audio pause, seek and story exit must pause/seek video. This provides consistent
transport controls; it does not pretend to be word-level or verified semantic
alignment. Silent watching can use the real video's own transport. Every clip
is disclosed as an AI-generated illustration, not documentary footage.
