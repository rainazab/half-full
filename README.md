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

The date in the header opens the calendar. Pick a day or use the month/year controls for a birthday. Selecting a date loads its published edition or automatically prepares one. There is no Generate button or archive mode. `/demo` redirects to `/`.

- `/` automatically opens today using the shared `America/Los_Angeles` publishing day. An unpublished day triggers retrieval and review. A successfully published edition stays fixed for that date.
- `/?date=2000-01-01` opens that date directly. The calendar supports real dates from 1900 through today; future and invalid dates are rejected before provider calls.
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
curl http://localhost:3000/api/editions/2000-01-01
curl http://localhost:3000/api/run/RUN_ID

# Reuses a saved date; otherwise performs real provider calls:
curl --max-time 300 -N -X POST \
  -H 'Accept: application/x-ndjson' \
  'http://localhost:3000/api/run?date=2000-01-01'
```

`POST /api/run` defaults to today. Published dates return `X-Edition-Reused: true`. Ordinary requests return JSON; streaming requests emit `run`, `log`, then `result` or `error`. An error event after HTTP 200 is still a failed generation. Stream disconnection does not replace or cancel the bounded server run. The app checks the saved date before retrying. Run logs are process-local; published editions survive restarts.

## Reader, Mini, and reactions

The finite reader supports Next/Back, horizontal swipes and keyboard navigation, with a clear ending. Each story exposes source dates, exact passages, field references, source assessments and an Apify provenance trail. Model confidence is an editorial estimate, not independent fact-checking.

Four original generated reaction characters represent Interesting, Insightful, Hopeful and Stressed. Select, switch or remove one reaction per story. No comments or public counts. Reading progress, reactions and Mini progress stay on the current device. [Artwork and prompts](public/reactions/README.md).

The Mini uses original validated 5×5 grids, Across/Down clues, crossing letters, hardware/on-screen keyboards, letter checking and reveal controls. Its layout is deterministic by edition date. Matching glossary terms can supply story-specific clues; the puzzle notice distinguishes general wordplay from news recall.

## Audio and images

Cartesia audio is prepared on demand from a retained story, never arbitrary browser text. `POST /api/audio/:editionId/:storyId` prepares a clip; `GET` serves it with byte-range support. The bounded in-memory cache deduplicates work and expires on restart. Controls include pause, replay, seek, speed and opt-in listen-through. Safari may require an explicit Play gesture after preparing audio or between clips.

Publisher share images are attributed link previews fetched from approved articles. A failed lookup falls back to an illustration. Their rights remain with the publisher. Original-source links remain available.

## PWA and offline

Production registers `/sw.js` on HTTPS or localhost; development does not register a worker. The service worker caches only the static offline shell, manifest, icons and reactions. API responses, POSTs and live audio are not service-worker cached. The reader saves its last opened published edition in local storage; offline navigation shows that actual edition with its original date, or asks to reconnect if the requested date is unavailable. It never substitutes a fixed demo. First installation requires a successful online visit.

Use Safari Share → Add to Home Screen on iPhone or the browser install action where supported. Physical-device installation and Safari playback still need device QA.

## Validate and deploy

```sh
npm test
npm run typecheck
npm run build
npm start -- --port 3000
```

Deploy with the existing Dockerfile or these build/start commands to a Node host with HTTPS and at least a 300-second request allowance. Store environment values in the host's secret manager. Published editions and the publisher lock are shared through Apify; live audio and detailed run logs are process-local. No public deployment has been performed.
