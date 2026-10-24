# US

A CalHacks MVP for a finite daily news edition: **3–5 evidence-reviewed stories, an explanation of why each matters, and one realistic action**. The existing app uses Next.js App Router, TypeScript, the official Anthropic and OpenAI SDKs, and the official Apify REST API. There is no authentication or database.

## Install and run

Use Node.js 22 or newer and npm.

```sh
cd /Users/rainazab/Desktop/news
npm ci
# Only when you do not already have a local environment file:
# cp .env.example .env.local
```

Edit `.env` or `.env.local` locally (do not copy a blank template over an existing file). Next.js loads both; `.env.local` takes precedence for duplicate variables. For Claude:

```dotenv
ANTHROPIC_API_KEY=your-anthropic-key
APIFY_API_TOKEN=your-apify-token
APIFY_ACTOR_ID=apify/rag-web-browser
# Optional:
ANTHROPIC_MODEL=claude-sonnet-5-5
LLM_PROVIDER=anthropic
```

Get an Apify token in [Apify Console → Settings → Integrations](https://console.apify.com/settings/integrations) and use an Anthropic API key. No OpenAI key is required. Apify and the selected editor both need available API credits and access to the configured Actor/model.

Provider selection:

- Claude is the default, regardless of whether an unused OpenAI key exists. `ANTHROPIC_MODEL` defaults to `claude-sonnet-5-5`.
- `LLM_PROVIDER=anthropic` explicitly pins Claude. Missing or invalid Anthropic credentials fail visibly; the app never falls back to OpenAI.
- `/api/health` reports Claude, the selected model and required variable names without returning keys. The frontend and run logs identify the editor used.
- The earlier OpenAI adapter remains available only if deliberately configured with `LLM_PROVIDER=openai`; it is not used by the current setup.

```sh
npm run dev
```

Open <http://localhost:3000>. On an iPhone on the same Wi-Fi network, open `http://YOUR_COMPUTER_LAN_IP:3000`. The development server listens on `0.0.0.0`. Restart the server after changing environment variables.

API keys stay in server-only modules. Do not prefix them with `NEXT_PUBLIC_`. `.env.local`, other secret environment files, generated output, and build artifacts are ignored by Git; `.env.example` contains no credentials.

## Trigger a real edition

```sh
curl --max-time 300 -sS -X POST http://localhost:3000/api/run
```

This starts a **real, billable Apify Actor run**, fetches its dataset, and sends the retrieved evidence to **the selected editor (OpenAI or Anthropic Claude)**. Live generation never substitutes mock data. The separate `/demo` route loads the clearly labeled fixed edition without external API calls. Missing the Apify token or the selected editor key prevents generation before paid work begins.

Inspect configuration and the most recent edition:

```sh
curl -sS http://localhost:3000/api/health
curl -sS http://localhost:3000/api/today
curl -sS http://localhost:3000/api/run/RUN_ID
```

The browser requests `Accept: application/x-ndjson` to receive `run`, `log`, and final `result`/`error` events while generation proceeds. Streamed failures are terminal error events after HTTP 200, so clients must inspect the event type. Ordinary requests retain the existing JSON success/error bodies and HTTP statuses. Disconnecting does not launch a replacement job or discard its bounded background run; use the run ID or `/api/today` to check completion.

`POST /api/run` returns `X-Run-Id` and `Location` headers. On success the run ID is also `edition.id`; on failure it is `runId`. `curl -i` includes response headers and HTTP status. `/api/run/RUN_ID` includes stored logs, status, Apify IDs, rejection audit, and the result when successful.

## Finite reader, demo and offline mode

- `/` uses the live API. One story is visible at a time, in backend order. Swipe horizontally, use **Next / Back**, or focus a story heading and use left/right arrows. Vertical gestures scroll normally. The final step is **You're caught up**, with review and exclusions controls. Opening transparency preserves your place.
- `/demo` is the **fixed demo**, requiring no API keys. Open it directly or choose **Open fixed demo** after a live failure. The banner, generation date, source publication dates and recorded audit identify its provenance. It never replaces `/api/today` or runs paid services. Reloading `/demo` stays in demo mode.
- Expand **Sources and evidence** for attribution, editor-confidence limitations, exact retained passages, and field-to-passage links. Model confidence is an estimate, never a guarantee of truth. The exclusions screen separates insufficient evidence from editorial exclusions; publication limits do not imply falsity.
- Buttons and headings support keyboard focus; controls have at least 44px targets. Reduced-motion preferences disable the brief transition. No reading analytics, infinite feed, accounts, or recommendations are added.

The production app registers `/sw.js` on a secure origin (HTTPS, or localhost). It precaches only the manifest, icons, offline HTML/CSS/JS and **fixed demo JSON**. Navigation tries the network for up to four seconds, then displays the explicitly labeled offline/server-unavailable shell. API requests, POSTs, Authorization-bearing requests, external URLs, and live editions are never cached. A fresh offline installation without a previous successful online visit cannot download its shell.

Use `npm run build && npm start` to test installation/offline behavior. Service-worker registration is disabled under `npm run dev`. On iPhone use Safari → Share → Add to Home Screen where available; an ordinary HTTP LAN address is suitable for testing the reader but not production PWA installation. Chrome may show **Install US** when its browser criteria are met. No automatic installation or notification permission is requested. When changing the fixed demo/static shell, bump the cache version in `public/sw.js` so existing installations refresh their saved copy. Old US cache versions are removed on activation. To intentionally refresh the checked-in snapshot after a successful real run, save the JSON response and run `node --import tsx scripts/snapshot-demo.ts generated/debug/successful-edition.json`; this validates complete evidence records and updates the cache version automatically. Never pass a failure response or fabricate passages.

The offline reader is intentionally a small standalone shell rather than a cached live Next.js page. It supports the fixed edition, source/evidence details, exclusions, audit, bounded navigation and ending screen even when the Node server is stopped.

## Configure the Apify Actor

Recommended: [`apify/rag-web-browser`](https://apify.com/apify/rag-web-browser). It searches Google and extracts article content as Markdown, providing stronger evidence than headline snippets. `APIFY_ACTOR_ID` accepts `owner/name`, `owner~name`, or an Actor ID.

With the exact name `apify/rag-web-browser` and no `APIFY_ACTOR_INPUT_JSON`, the server builds this input at run time:

```json
{
  "query": "(site:bbc.com/news/articles/ OR site:npr.org/YYYY/) after:YYYY-MM-DD news (education OR technology OR science OR economy OR climate OR health)",
  "maxResults": 20,
  "outputFormats": ["markdown"],
  "requestTimeoutSecs": 90
}
```

`YYYY-MM-DD` is replaced with the UTC date seven days before the run, and `YYYY` with the current year. The default search targets BBC and NPR article URL paths, which returned usable text in live testing; broad domains also returned service pages and blocked articles. Other publishers can be configured through the custom input below. Search results still need editorial verification; a recent search filter does not guarantee recent or reliable articles. Apify may be unable to retrieve paywalled or blocked articles. Known BBC weather/schedule/media service URLs are excluded during normalization.

For any other Actor (including a numeric ID for the same Actor), set **`APIFY_ACTOR_INPUT_JSON` to its exact input object**. In Apify Console, open the Actor's Input tab, switch to JSON, test an input, and copy that JSON into this server variable. It replaces the built-in input completely. It is not wrapped in an `input` field and is not accepted from the browser. Example for the RAG Actor:

```dotenv
APIFY_ACTOR_INPUT_JSON='{"query":"recent education science climate news after:2026-10-17","maxResults":10,"outputFormats":["markdown"],"requestTimeoutSecs":60}'
```

Update dates in custom queries yourself. Other Actors may require `queries`, `startUrls`, country/language settings, or extraction options; there is no universal input schema. Their output must be in the run's default dataset. Consult the [RAG Actor input schema](https://apify.com/apify/rag-web-browser/input-schema).

Supported result fields:

| Internal field | Recognized Actor fields |
| --- | --- |
| Title | `title`, `headline`, `metadata.title`, flattened `metadata.title`, `searchResult.title` |
| URL | `url`, `URL`, `link`, `metadata.url`, flattened `metadata.url`, `searchResult.url` |
| Description | `description`, `snippet`, `summary`, metadata/search-result description |
| Article text | `text`, `markdown`, string `content`, `articleText`, `body`, `extractedText` |
| Publisher | string/object `source`, string/object `publisher`, metadata site name, matching Article JSON-LD publisher, then URL hostname |
| Publication date | `publishedAt`, `publishedDate`, `publishedTime`, `publicationDate`, `datePublished`, `pubDate`, `date`, supported metadata fields, Open Graph `article:published_time`, matching Article JSON-LD `datePublished` |

Nested `organicResults`, `newsResults`, `nonPromotedSearchResults`, `articles`, `results`, and `items` arrays are flattened. Relative dates such as “2 hours ago” remain unknown; crawl times are never used as publication dates. Invalid URLs, retrieval errors, missing content, duplicate URLs, and excess candidates appear in the rejection audit.

The first 100 dataset rows are retrieved, and at most 20 usable unique candidates are sent to the selected editor. Each article's text is capped at 18,000 characters and its description at 3,000. If your Actor returns only snippets, the pipeline may correctly fail to produce three verified stories. Configure article extraction in that Actor or use the recommended one.

## Full flow and editorial safeguards

1. Browser calls `POST /api/run`; the server validates both provider configurations.
2. Server starts the configured Actor through `POST https://api.apify.com/v2/actors/{actorId}/runs`, using the token in an Authorization header. It logs the run and dataset IDs, waits for success, and retrieves the dataset. See the [official Apify API](https://docs.apify.com/api/v2).
3. Normalization produces candidates with stable IDs, title, URL, publisher, description, extracted article text, and nullable publication date.
4. The selected provider's official SDK sends those candidates and the shared cautious editorial system prompt. The editor receives no browsing tools and must use supplied evidence only. Structured JSON output is followed by the same strict server validation for both providers.
5. Every candidate must have exactly one decision. Malformed schemas or missing/duplicate candidate decisions fail the run with a specific error and an audit entry for every candidate. Unknown source/passage IDs or generated URLs exclude the affected story without discarding valid stories. The editor selects server-generated passage IDs; it cannot invent source quotations. Source metadata is constructed from the original Apify candidates, never from model-generated URLs.
6. Every generated field (headline, summary, relevance, action) requires valid passage references. Source classifications distinguish actually retrieved primary material from journalism describing it. Unresolved contradictions exclude the story. Exact passages and field-to-evidence links are retained in the result. Single-group confidence is capped at 85%; multiple reporting groups at 90%; retrieved primary material plus multiple groups at 95%. These are conservative product ceilings, not empirical calibration. Same-publisher sources and model-identified syndications do not increase the independent-source count. Exact duplicate article text is removed before review.
7. Verified decisions require confidence ≥ 0.8, hype ≤ 0.5, adequate support, no sensationalized framing, substantive article text (at least 300 characters), and a reference to a server-generated passage from the retrieved article. Known dates outside the seven-day window are excluded. Missing reliable publication metadata is conservatively marked uncertain. Invalid calendar dates are rejected, and relative/invalid date fields fall through to valid metadata where present. Timestamps without timezone offsets are not treated as reliable publication times.
8. The server publishes only editions with 3–5 verified stories. Fewer than three returns HTTP 422 with exclusions and a run log; it does not replace the last successful edition. The frontend displays approved stories, exclusions, logs, and “You’re caught up.”

“Verified” means the editor assessed the claim as supported by the supplied evidence and it passed server checks. It is **not independent fact-checking or a guarantee of truth**. Confidence is a model judgment, not a calibrated probability. Passage references are resolved against excerpts of the retrieved article, so the model does not have to reproduce Markdown as an exact quote. This checks provenance, not whether the passage logically proves the claim. The editor is responsible for semantic support, event deduplication, disputed claims, and retaining uncertainty. No positivity quota is applied.

All unselected candidates appear in `rejectedStories`. Its added `verificationStatus` distinguishes `uncertain` (insufficient evidence) from `rejected` (failed checks, duplicates, stale items, or finite-edition limits). Approved stories have `verificationStatus: "verified"`, plus `centralClaim` and `verificationReason`. These are additive to the requested response shape. A candidate omitted solely by the five-story cap is explicitly identified as such.

## API behavior

| Endpoint | Response |
| --- | --- |
| `GET /api/health` | HTTP 200 liveness, readiness, environment-presence booleans, and safe configuration errors. Never returns secrets. Readiness checks configuration, not account credentials or provider availability. |
| `POST /api/run` | HTTP 200 `{edition, rejectedStories, stats, runLog}`; a complete synchronous pipeline. Request bodies are unused. |
| `GET /api/today` | Latest **successful** result, including its actual creation date, or 404 before one exists. It can be from an earlier day. |
| `GET /api/run/:id` | Stored run record with status, logs, Apify IDs, audit, and optional result/error; 404 if unavailable. |

Errors return `{runId, error: {code, message}, rejectedStories, stats, runLog}` for an attempted pipeline run. HTTP 503 means missing/invalid configuration; 502 means provider or response-validation failure; 504 means timeout/connectivity failure; 422 means fewer than three verified stories; 409 means another run is active. Invalid browser origins return 403. The failed stage is included in the run log. No raw SDK error payloads, credentials, or Actor input are returned.

On a completed review, `candidatesFound = approved + rejected`, including normalization exclusions. After normalization, all candidates remain accounted for even if the editor fails: unevaluated candidates are marked uncertain. For a 422 failure, supported-but-unpublished stories are also audited with an explicit edition-too-small explanation, and `approved` is zero because nothing was published. Retrieval failures may have zero candidates because the dataset was never available.

## Timeouts and storage

- Actor execution timeout: 150 seconds; entire Apify retrieval deadline: 165 seconds. Individual Apify requests also have bounded timeouts. Transient GET failures get one retry within the original deadline; Actor-creation POSTs are never automatically retried, to avoid duplicate billable runs. If retrieval fails while a known Actor run is active, the server attempts to abort it within 5 seconds.
- Editor request deadline: 105 seconds. OpenAI transient HTTP 429/502/503/504 errors get at most one retry within that same deadline. Anthropic SDK retries are disabled; its path uses medium effort and a 20,000-token cap to leave room for thinking and structured output. Truncated/refused output fails closed. There is no retry that silently changes models or weakens criteria.
- Route duration allowance: 300 seconds; browser timeout: 295 seconds. Your host/proxy must allow at least 300 seconds for the synchronous request. If a host kills the process, its in-memory log cannot be retained.
- `lib/store.ts` contains the storage boundary. It keeps the latest successful result and 30 recent run records in process memory, with one active run at a time per process. Restarting clears them. A failed run preserves the previous successful result.
- Use a single long-running Node process for this MVP. Serverless instances or multiple replicas do **not** share this memory or concurrency guard. Add a shared persistent store and a durable job runner before scaling. No scheduled generation is implemented; the button/API triggers each run.

## Tests and production build

```sh
npm test
npm run typecheck
npm run build
npm start
```

The test suite covers navigation boundaries/order, swipe thresholds, fixed-demo schema and loading, explicit live-to-demo behavior, streamed result parsing, all four route contracts, concurrency, failure audit completion, provider errors, bounded retries, manifest PNG dimensions, service-worker API exclusions/offline navigation, common Actor shapes, date handling, invalid URLs, deduplication, limits, strict editorial schemas and provider selection, invented sources/passages/URLs, coverage, uncertainty, stale dates, confidence/hype thresholds, and the finite edition cap. Synthetic failure fixtures exist only in tests. Production demo mode loads an explicitly labeled snapshot under `public/demo-edition.json`; the live pipeline never imports that file. No linter is configured; TypeScript checks and production compilation are the code checks. Passing unit tests does not substitute for a live edition run with funded provider accounts.

## Deploy

For an existing Node server/VM, copy the project and lockfile, configure the environment on the server, then run:

```sh
npm ci
npm run build
PORT=3000 npm start
```

Or build and launch the included container on a Docker host:

```sh
docker build -t us-news .
docker run -d --name us-news --restart unless-stopped -p 3000:3000 --env-file .env.local us-news
docker logs -f us-news
```

Use unquoted JSON in `.env.local` when passing it to Docker's `--env-file` (Docker preserves quote characters; Next.js's dotenv parser removes them). The image excludes all real `.env*` files. Configure runtime environment variables through your host's secret settings when deploying remotely. Keep one replica and configure any reverse proxy's request/read timeout to at least 300 seconds. Put HTTPS in front of the server for remote use. Disable reverse-proxy buffering for streamed progress and set its read timeout to at least 300 seconds. The Docker runtime includes `public/` and `next.config.ts`, so icons, the fallback, the offline shell, and service-worker headers are available in production. No localhost URLs are embedded in API clients. Do not use a static-only export or a short-timeout serverless tier for live generation. Public deployment has not been performed by this task.

The MVP intentionally has no accounts. Anyone who can reach `POST /api/run` can initiate paid work; same-origin browser checks and the per-process overlap guard are not access control. For a publicly shared hackathon URL, use your hosting platform's deployment protection or a private demo network.

## Main files

- `app/api/health/route.ts`, `app/api/run/route.ts`, `app/api/today/route.ts`, `app/api/run/[id]/route.ts`: JSON API.
- `lib/apify.ts`, `lib/anthropic.ts`, `lib/openai.ts`, `lib/editor.ts`, `lib/editor-settings.ts`, `lib/editor-prompt.ts`, `lib/pipeline.ts`: real provider integrations and orchestration.
- `lib/normalize.ts`, `lib/evidence.ts`, `lib/validation.ts`, `lib/types.ts`: data shapes and evidence validation.
- `lib/config.ts`, `lib/errors.ts`, `lib/http.ts`, `lib/store.ts`: server configuration, safe errors, responses, storage boundary.
- `components/USApp.tsx`, `EditionReader.tsx`, `Transparency.tsx`, `PWAStatus.tsx`: finite reader, mode switching, evidence/audit display, installation.
- `app/page.tsx`, `app/demo/page.tsx`, `app/layout.tsx`, `app/globals.css`: responsive app routes and manifest metadata.
- `lib/client.ts`, `lib/navigation.ts`, `lib/edition-schema.ts`: streamed API client, bounded navigation, shared result validation.
- `public/manifest.webmanifest`, `public/sw.js`, `public/offline.*`, `public/icons/*`: safe PWA shell and standalone offline reader.
- `public/demo-edition.json`: fixed, dated demo snapshot.
- `scripts/generate-icons.mjs`: reproducible code-drawn app icons.
- `tests/*.test.ts`: isolated normalization and validation tests.
- `.env.example`, `Dockerfile`, `.dockerignore`, `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`: setup and deployment.

The Claude output budget uses the documented [effort control](https://platform.claude.com/docs/en/build-with-claude/effort); its reasoning and final JSON share the output-token limit.
