# half full

A finite news app for CalHacks: 3–5 visual, evidence-reviewed stories, optional Cartesia narration, four original reactions, and a compact 5×5 Mini. Apify retrieves reporting and original documents; Claude evaluates the retrieved evidence. Social discussion provides context, never proof.

## Run locally

Node.js 22+ and npm:

```sh
npm ci
# Only if you do not already have an environment file:
# cp .env.example .env.local
npm run dev -- --port 3000
```

Open [localhost:3000](http://localhost:3000). The server binds to `0.0.0.0` for phone testing on the same network. Restart after changing environment variables. Never overwrite an existing environment file with the empty template.

Required server-only values:

```dotenv
APIFY_API_TOKEN=your-token
APIFY_ACTOR_ID=apify/rag-web-browser
ANTHROPIC_API_KEY=your-key
LLM_PROVIDER=anthropic
```

Optional: `ANTHROPIC_MODEL`, `CARTESIA_API_KEY` (existing `CARTESIA` is also supported), `CARTESIA_VOICE_ID`, `CARTESIA_MODEL_ID`, `ARTICLE_IMAGES_ENABLED`, and `APIFY_SOCIAL_ENABLED`. See `.env.example`. Keys are never prefixed with `NEXT_PUBLIC_` or sent to the browser. Claude is the default; there is no automatic provider fallback. An explicit `LLM_PROVIDER=openai` adapter remains available.

## Pick a day

The date in the header opens the calendar. Pick a day or jump with the month/year controls. Selecting a date loads its published edition or automatically prepares one. There is no Generate button or archive mode. `/demo` redirects to `/`.

- `/` automatically opens today using the shared `America/Los_Angeles` publishing day. An unpublished day triggers retrieval and review. A successfully published edition stays fixed for that date.
- `/?date=2026-10-23` opens that date directly. The calendar and API accept a rolling ten-year window through today. Leap-day cutoffs clamp to the last valid day of February. Future, invalid and older dates are rejected before provider calls.
- Today uses current reporting. Historical editions search old publisher URL structures and printed publication dates, then require each news candidate to have a publication date matching the selected UTC day. Evidence sources and editorial time are kept separate from the actual retrieval clock. Old news is never relabeled as current news, and later outcomes are not supplied from model memory.
- Availability depends on accessible historical reporting. A date is not published unless at least three stories pass the evidence checks. Missing dates, blocked articles and insufficient evidence produce a visible failure with an audit. Failed attempts remain retryable; no sample edition is substituted.
- Current Reddit enrichment is disabled for historical dates to avoid presenting today's discussion as conversation from that day.
- The app checks for day rollover while open. When viewing today, it opens the new day's edition; selecting a historical date preserves that selection.

Published editions are saved in Apify key-value storage. The existing `us-daily-editions` storage name is intentionally preserved across the rename. A distributed Apify queue lock serializes publishers; other tabs wait for the saved result. `APIFY_EDITION_STORE_NAME` changes the storage namespace. `EDITION_STORAGE=memory` is an explicit local-only alternative that loses editions on restart.

## News Receipts Actor

[Source and deployment instructions](actors/news-receipts/README.md).

The reusable Actor performs bounded topic searches through `apify/rag-web-browser`, investigates links to original documents, and returns exact passages with Actor/run/dataset/item provenance and SHA-256 hashes. The app supplies historical queries explicitly, so the already built Actor can serve historical editions without a new deployment.

Set `APIFY_RECEIPTS_ACTOR_ID` to the built Actor's ID. Without it, the app can run the same retrieval engine server-side. `APIFY_RECEIPTS_ENABLED=false` restores the single-Actor retrieval path for current news. Custom Actors require their exact `APIFY_ACTOR_INPUT_JSON`; there is no universal third-party schema.

```sh
node scripts/build-receipts-actor.mjs
node scripts/check-receipts-build.mjs
```

These commands upload an explicit source allowlist and build a **private** Actor; they never upload environment files. Public Actor Store publication is a separate owner action.

## API

```sh
curl http://localhost:3000/api/health
curl http://localhost:3000/api/today
curl http://localhost:3000/api/editions
curl http://localhost:3000/api/editions/2026-10-23
curl http://localhost:3000/api/run/RUN_ID

# Reuses a saved date; otherwise performs real provider calls:
curl --max-time 300 -N -X POST \
  -H 'Accept: application/x-ndjson' \
  'http://localhost:3000/api/run?date=2026-10-23'
```

`POST /api/run` defaults to today. Published dates return `X-Edition-Reused: true`. Ordinary requests return JSON; streaming requests emit `run`, `log`, then `result` or `error`. An error event after HTTP 200 is still a failed generation. Stream disconnection does not replace or cancel the bounded server run. The app checks the saved date before retrying. Run logs are process-local; published editions survive restarts.

## Reader, Mini, and reactions

The finite reader supports Next/Back, horizontal swipes and keyboard navigation, with a clear ending. The reader keeps sources available without exposing processing logs. Detailed evidence, exact passages, field references, source assessments and Actor provenance live at `/studio?date=YYYY-MM-DD`.

Four original generated reaction characters represent Interesting, Insightful, Hopeful and Stressed. Select, switch or remove one reaction per story. No comments or public counts. Reading progress, reactions and Mini progress stay on the current device. [Artwork and prompts](public/reactions/README.md).

The Mini uses original validated 5×5 grids, Across/Down clues, crossing letters, hardware/on-screen keyboards, letter checking and reveal controls. Its layout is deterministic by edition date. Matching glossary terms can supply story-specific clues; the puzzle notice distinguishes general wordplay from news recall.

## Editorial studio and constructive coverage

`/studio` is a separate, read-only generation dashboard. It shows the selected date’s actual discovery, investigation, extraction, editorial comparison and publication stages. Actor run/dataset links come from retained provenance and controlled server IDs. Selected articles, primary documents and the published copy can be compared side by side, with field-to-passage references and exclusion reasons available below. Missing primary sources are stated explicitly. Confidence is a model judgment, not independent fact-checking.

`GET /api/studio/YYYY-MM-DD` reads the saved edition or a live/failed checkpoint. Publication writes bounded, validated checkpoints to Apify KV (`PROCESS-YYYY-MM-DD`) so a different server instance can display progress and failed-run reasons. No provider keys, input environment or raw provider errors are persisted in these records. The studio never launches paid generation just by being viewed. It polls unfinished dates and stops after publication.

New editions prioritize evidence-supported Bay Area community developments, while allowing pivotal national or global news to take precedence. Positive stories need no extra closing. When useful, the validated `action` field describes a sourced response under **What’s being done**, or a distinct constructive development under **The bright side**. It must not minimize suffering, manufacture reassurance or invent resources. Evidence thresholds apply equally to closing copy. Published selections remain fixed.

## Audio and images

Cartesia audio is prepared on demand from a retained story, never arbitrary browser text. `POST /api/audio/:editionId/:storyId` prepares a clip; `GET` serves it with byte-range support. The bounded in-memory cache deduplicates work and expires on restart. Controls include pause, replay, seek, speed and opt-in listen-through. Safari may require an explicit Play gesture after preparing audio or between clips.

Publisher share images are attributed link previews fetched from approved articles. A failed lookup falls back to an illustration. Their rights remain with the publisher. Original-source links remain available.

## PWA and offline

Production registers `/sw.js` on HTTPS or localhost; development does not register a worker. The service worker caches only the static offline shell, manifest, icons and reactions. API responses, POSTs and live audio are not service-worker cached. The reader saves its last opened published edition in local storage; offline navigation shows that actual edition with its original date, or asks to reconnect if the requested date is unavailable. It never substitutes a fixed demo. First installation requires a successful online visit.

Installation remains available through the browser. The app does not show install prompts, installation instructions, provider badges, or a promotional footer. Physical-device installation and Safari playback still need device QA.

## Validate and deploy

```sh
npm test
npm run typecheck
npm run build
npm start -- --port 3000
```

Deploy with the existing Dockerfile or these build/start commands to a Node host with HTTPS and at least a 300-second request allowance. Store environment values in the host's secret manager. Published editions and the publisher lock are shared through Apify; live audio is process-local; generation checkpoints and published audit records are shared through Apify. No public deployment has been performed.

Generation progress uses live stream events and stored checkpoints, with stage-weighted estimates based on observed retrieval/review times. In-flight estimates are capped below 100%; only a saved edition is complete. The reader shows the current stage and a typical 2–3 minute wait.

Discovery prioritizes Bay Area community reporting in two lanes, retaining a third national/global lane. Editorial importance can override local preference. Positive or neutral stories can omit the optional closing (`closingType: "none"`, empty `action` and action references). Pivotal hard news includes sourced responses under “What’s being done”; “The bright side” is reserved for distinct supported constructive developments. Previously published dates remain fixed.
