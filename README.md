# half full

A finite news app for CalHacks: 3–5 visual, evidence-reviewed stories, optional Cartesia narration, four original reactions, and a compact daily Mini. Apify retrieves reporting and original documents; Claude evaluates the retrieved evidence. Social discussion provides context, never proof.

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

Optional: `ANTHROPIC_MODEL`, `CARTESIA_API_KEY` (existing `CARTESIA` is also supported), `CARTESIA_VOICE_ID`, `CARTESIA_MODEL_ID`, `ARTICLE_IMAGES_ENABLED`, `APIFY_SOCIAL_ENABLED`, and `RECRAFT_API_KEY` (existing `RECRAFT` is also supported) for optional illustrations. See `.env.example`. Keys are never prefixed with `NEXT_PUBLIC_` or sent to the browser. Claude is the default; there is no automatic provider fallback. An explicit `LLM_PROVIDER=openai` adapter remains available.

## First run, home and story atmospheres

A fresh device opens a short intro (`components/OnboardingFlow.tsx`): welcome, "How do you like to catch up?" (read / listen / both, stored as the device preference `mode`, which shapes the home screen and sets listen-through for listeners), a skippable narrator choice (Skylar, Daniel, Rowan) and an optional Google sign-in with "Maybe later". Completion or skipping is recorded in `half-full-onboarding-v1` (`lib/onboarding.ts`); the intro never shows again unless replayed from Profile, never shows on a `?date=` deep link, never requires login, and never triggers generation. Everyone still receives the same edition for a date; the answers change presentation only.

The home screen (`components/TodayHome.tsx`) is the daily starting point: a time-aware greeting (with the Google first name when signed in), one prominent edition feature with the real date, story count, reading estimate and a cover taken from the first stored illustration or publisher preview, Start/Continue (or Read again when finished) and Listen (promoted for listeners), a concise "What's inside" list that opens each story in the deck, and a quiet entry to The Mini. Loading, generating and error states are unchanged.

Each story has a deterministic atmosphere (`lib/story-theme.ts`): six saturated hue pairs (cobalt, ember, forest, violet, ochre, magenta) chosen from the story's category, with the next unused theme substituted whenever two neighbours would match, and the brand green for the ending. Each theme's deep `top` carries white text (≥ 4.5:1, tested) and its bright `glow` sits behind the artwork; the article below is a white sheet with ink (≥ 7:1). The deck background is a Motion template of two colour transforms of the same `x` value that moves the pages, so the gradient blends between the adjacent stories by drag position and settles with the spring. A story page is composed like a now-playing screen: a segmented progress strip at the very top, back/count/date, category and headline in white, the artwork as a card, the transport player (previous story, play, next story, seek, speed, options) on glass over the colour, then the white sheet. The sheet opens with the follow-along text (`components/FollowAlong.tsx`): while narration plays, the narration script is shown sentence by sentence with the current sentence lit by the same character-proportional cue model (approximate, not word-level) and tapping a sentence seeks to it; silent readers see the explanation. Illustrated scenes advance on their own while reading silently, like clips, once each scene's timeline or settle has played, and narration takes over timing when a clip is loaded. The home feature and "Today's lineup" tiles use the same gradients; The Mini and Your jar share the ink/accent system.

## Pick a day

The Calendar tab is the only place to change the edition date. Pick a day or jump with the month/year controls. Selecting a date loads its published edition or automatically prepares one. The header shows only the wordmark and the Profile avatar; the edition's actual date is ordinary cover metadata (historical dates are marked "On this day"). There is no Generate button or archive mode. `/demo` redirects to `/`.

- `/` automatically opens today using the shared `America/Los_Angeles` publishing day. An unpublished day triggers retrieval and review. A successfully published edition stays fixed for that date.
- `/?date=2026-10-23` opens that date directly. The calendar and API accept a rolling ten-year window through today. Leap-day cutoffs clamp to the last valid day of February. Future, invalid and older dates are rejected before provider calls.
- Today uses current reporting. Historical editions search old publisher URL structures and printed publication dates, then require each news candidate's publication timestamp to fall on the selected calendar day in UTC **or** in the shared Pacific publishing zone (`lib/historical-coverage.ts`). Bay Area evening reporting is published after midnight UTC, so a UTC-only check wrongly excluded it; the Pacific reading is the same timestamp, not a borrowed date. Articles without a reliable date never qualify. The editorial reference clock is the end of that day in Pacific time. When fewer than eight same-day articles survive the first pass and enough of the 285-second budget remains, one bounded (at most 70-second) second discovery pass searches additional credible publishers for the exact day range without original-document investigation; it never relaxes the date policy or evidence thresholds. Studio's **Date coverage** panel shows retrieved/unique/same-day/undated/other-day counts and the second-pass outcome. Old news is never relabeled as current news, and later outcomes are not supplied from model memory.
- Availability depends on accessible historical reporting. A date is not published unless at least three stories pass the evidence checks. Missing dates, blocked articles and insufficient evidence produce a visible failure with an audit. Failed attempts remain retryable within the generation budgets and cooldown; no sample edition is substituted.
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

The reader is a portrait-first story deck (`components/EditionReader.tsx`, `lib/deck.ts`): every approved story is a page in a horizontal track driven by Motion for React. Pages follow the finger (pointer drag with direction lock, started only when the pointer goes down outside links, buttons, sliders and other controls), settle with a spring (stiffness 360, damping 36), resist elastically at both edges, and preview their neighbours with a subtle scale/opacity falloff computed from the track position without re-rendering. A release commits when the drag passes 28% of the page width (at most 140 px) or flicks faster than 360 px/s with at least 24 px of travel; otherwise it springs back. Each page scrolls vertically on its own (`touch-action: pan-y`), so vertical and diagonal reading gestures never turn the page. Arrow keys and header arrows (visible on tablet and desktop, screen-reader-only on phones) are the non-gesture alternative; inactive pages are `inert`. The last page is "You're caught up"; arriving there records completion once. Continue reading opens the remembered page; cover headlines open their story directly. Only the active page's narration can play, a page change pauses it, and only explicit listen-through turns the page by itself. Reduced motion disables dragging and springs in favour of instant page changes. The compact cover shows the real date, story count and a text-based reading estimate (220 words/minute). Browser Back returns to the cover. Resume positions are scoped to edition and Firebase UID or guest. The reader keeps exact source passages available through See the receipts without exposing processing logs. Detailed evidence, exact passages, field references, source assessments and Actor provenance live at `/studio?date=YYYY-MM-DD`.

Four original generated reaction characters represent Interesting, Insightful, Hopeful and Stressed, each with its own small microinteraction when picked (curious bounce and sparkle, "aha" ring, warm rising glow, sympathetic wobble); restored reactions render settled without replaying. Reaching the final story animates the progress segments and settles into "You're caught up." with the story count, the optional Mini and a Finish control; completion is recorded once. Select, switch or remove one reaction per story. No comments or public counts. Guests keep reading progress and reactions on the device; signed-in users also sync completed dates and reactions through Firestore. Mini progress and in-edition resume position stay on the device. [Artwork and prompts](public/reactions/README.md).

The Mini uses original validated 5×5 grids, Across/Down clues, crossing letters and hardware/on-screen keyboards. Its layout is deterministic by edition date. Entering the final correct letter completes the puzzle automatically: the last cell settles, the grid glows, and a blurred modal celebration shows the solve time and an original half full character. The elapsed timer starts on the first letter, pauses while the tab is hidden or the puzzle is closed, persists unfinished time, and stops at completion. Solve times are saved on the device (`half-full-mini-records-v1`); "Your quickest one yet!" appears only when an earlier solve of the same kind (assisted or unassisted) exists, and a first solve is celebrated without inventing a record. Optional Check and Reveal mark the solve as assisted. The overlay is a native `<dialog>` with focus management, Escape/Done dismissal, body scroll locking, reduced-motion support and safe-area padding; it never replays for an already solved Mini.

## Editorial studio and constructive coverage

`/studio` is a separate, read-only generation dashboard. It shows the selected date’s actual discovery, investigation, extraction, editorial comparison and publication stages. Actor run/dataset links come from retained provenance and controlled server IDs. Selected articles, primary documents and the published copy can be compared side by side, with field-to-passage references and exclusion reasons available below. Missing primary sources are stated explicitly. Confidence is a model judgment, not independent fact-checking.

`GET /api/studio/YYYY-MM-DD` reads the saved edition or a live/failed checkpoint. Publication writes bounded, validated checkpoints to Apify KV (`PROCESS-YYYY-MM-DD`) so a different server instance can display progress and failed-run reasons. No provider keys, input environment or raw provider errors are persisted in these records. The studio never launches paid generation just by being viewed. It polls unfinished dates and stops after publication.

New editions prioritize evidence-supported Bay Area community developments, while allowing pivotal national or global news to take precedence. Positive stories need no extra closing. When useful, the validated `action` field describes a sourced response under **What’s being done**, or a distinct constructive development under **The bright side**. It must not minimize suffering, manufacture reassurance or invent resources. Evidence thresholds apply equally to closing copy. Published selections remain fixed.

## Audio and images

Cartesia audio is prepared on demand from a retained story, never arbitrary browser text. `POST /api/audio/:editionId/:storyId?narrator=skylar|daniel|rowan` prepares a clip; `GET` with the same query serves it with byte-range support. The bounded in-memory cache is keyed by script, voice ID and model, so clips from different narrators never mix. Controls include pause, replay, seek, speed, narrator and opt-in listen-through. Safari may require an explicit Play gesture after preparing audio or between clips.

### Narrators

Three user-facing narrators map to public Cartesia library voices, verified through `GET https://api.cartesia.ai/voices` on October 24, 2026 (`lib/narrators.ts`):

| Narrator | Library voice | Voice ID |
| --- | --- | --- |
| Skylar (default) | Skylar - Friendly Guide | `db6b0ed5-d5d3-463d-ae85-518a07d3c2b4` |
| Daniel | Daniel - Modern Assistant | `47c38ca4-5f35-497b-b1a3-415245fb35e1` |
| Rowan | Rowan - Steady Guide | `8c254787-4eb4-4577-bd3d-fb3c273baea2` |

The library also contains "Rowan - Team Leader" (`701a96e1-7fdd-4a6c-a81e-a4a450403599`); the steadier narration voice was chosen. A named narrator overrides `CARTESIA_VOICE_ID`; without a narrator the configured/default voice is used. Narrator, speed and autoplay preferences are stored on the device (`half-full-preferences-v1`), work for guests, apply to the next clip, and never regenerate the edition. They are not written to Firestore because the deployed profile rules allow only reads/reactions; syncing them would require a rules change.

Publisher share images are attributed link previews fetched from approved articles. A failed lookup falls back to an illustration. Their rights remain with the publisher. Original-source links remain available.

## Illustrated storyboards (Recraft)

Every approved story can carry an optional 2–3 scene illustrated explainer. Claude (the existing editor model) plans scenes from the approved copy, the retained evidence passages and the narration script; Recraft draws them in the permanent half full style; React renders captions, labels and alt text from validated data. Illustrations are presentation data stored beside the immutable edition (never inside it), so a missing, failed or broken storyboard simply falls back to the publisher preview or neutral visual.

- **Style.** `lib/illustration-style.ts` is the versioned house style (`half-full-style/1`): palette from the reaction stickers, prompt prefix/suffix, forbidden prompt terms and Recraft colour controls. The reusable Recraft style was created once from 768px copies of the four original reaction characters (`public/illustration-references/`, derived with macOS `sips` because Recraft requires 256px minimum) and is persisted in the illustration store; `RECRAFT_STYLE_ID` can pin a specific style.
- **Provider.** `lib/recraft.ts` calls `https://external.api.recraft.ai/v1`, verified against the published OpenAPI document on October 24, 2026: `POST /styles` (multipart `files`, `model=recraftv4_styles`, `match=flexible`; V4 Styles rejects a base `style`) and `POST /images/generations` (`model`, `style_id`, `size: "4:3"`, `n: 1`, `response_format: "url"`, `image_format: "webp"`, `controls.colors` with total weight ≤ 1.0 and `controls.background_color`). The response's `credits` field is the API units charged for that call. Result URLs expire after about 24 hours, so assets are downloaded through the public-host transport checks and stored. Rate limits: 100 images/minute, 5 requests/second. Provider error bodies are never surfaced.
- **Planning and validation.** `lib/storyboard-prompt.ts` + `lib/storyboard-plan.ts` ask Claude for structured scenes (purpose, evidence references, subject, required objects, setting, composition, motion, narration cue, caption, prohibited details, art prompt, alt text, optional existing blob character). `lib/storyboard-validation.ts` deterministically rejects plans whose evidence references are not retained for the story, whose captions introduce wording or numbers absent from the approved copy, whose prompts request text, logos, photos, maps or portraits, whose cues are not verbatim in-order narration phrases, or that pair cute characters with sober (death, disaster, violence) stories. One bounded repair request is allowed; two failures abandon the story.
- **Spending limits.** Generation never happens on page load or when browsing Calendar. It runs through the explicit operator script (`scripts/illustrate-edition.ts`), the same-origin `POST /api/illustrations/:date`, the Studio button, or the authenticated GitHub Actions worker, which runs every five minutes and calls `/api/videos/worker` to backfill missing artwork for every published edition before queuing its animation. Existing scenes are reused; repairs regenerate only missing scenes; concurrent runs for a date are refused by a lock. Caps: `RECRAFT_SCENES_PER_STORY` (2, max 3), `RECRAFT_MAX_SCENES_PER_EDITION` (10), `RECRAFT_DAILY_IMAGE_BUDGET` (24, a Pacific-day ledger shared across instances), two concurrent images, 90-second timeouts, one retry on 429/5xx, and `RECRAFT_GENERATION_ENABLED=false` to disable. Attempts are reserved before paid calls, so failed attempts count. Pass `?date=YYYY-MM-DD` to the worker to backfill a historical published edition. Add the same `CRON_SECRET` used by Vercel to the repository's Actions secrets.
- **Storage.** `lib/illustration-store.ts` keeps manifests (`STORYBOARD-<date>-<storyId>`) and binary assets (`ASSET-<date>-<storyId>-<sceneId>`) in a separate Apify key-value store (`<edition store>-illustrations`, override `APIFY_ILLUSTRATION_STORE_NAME`). The manifest records schema and style versions, prompt hashes, scene IDs, asset references, narration cue fractions, generation status, provider model/style and usage. `GET /api/illustrations/:date` reads manifests; `GET /api/illustrations/:date/:storyId/:sceneId` serves an image with an ETag. Memory mode keeps assets in process memory only.
- **Authored scenes (GSAP).** `lib/authored-scenes.ts` registers hand-built compositions per story and scene; the player prefers one over the flat painting. Each is a React/SVG component with a paused GSAP timeline (DrawSVG for drawn routes and marks, MotionPath for particles along a path, masks for reveals) exposing play/pause/seek/restart, drawn in the sticker palette with a paper-grain filter. The Svalbard story has two: `SvalbardTownTap` (over the stored Recraft painting: a ring on the town, ripples on the lake that supplies it, a dotted supply line, water from the tap, the advisory mark) and `SvalbardPermafrost` (a bespoke valley cross-section: sun warms, the frost mask recedes, shale and pyrite are exposed, acid drops form, a stream draws downhill, metal particles ride it into the lake which dulls, then the town's tap and the "do not drink" mark). Every beat maps to a clause of the approved copy; the legend under the stage lists them. Silent reading plays the timeline once when the stage is on screen (Replay restarts it; offscreen and inactive pages pause); with a Cartesia clip loaded the timeline is seeked each frame from the audio clock inside the scene's cue window, so pause freezes the frame and seeking lands on the matching one. Reduced motion shows the final frame. Stories without an authored scene show their stored painting, which settles once.
- **Layered animation (`scene-motion/1`).** Scenes can carry an optional, schema-validated `animation`: up to seven layers drawn by React over the flat Recraft background, each an allowlisted programmatic icon (`components/SceneIcons.tsx`, forty original pastel glyphs), one of the four original reaction characters, a simple shape, a route (polyline), a growing bar or a short validated value, positioned with normalized coordinates on the 4:3 stage and animated by up to three allowlisted motions (`enter-left/right/bottom`, `fade`, `float`, `scale`, `rotate`, `path`, `draw`, `grow`, `highlight`, `exit`, `count`). `lib/scene-motion.ts` validates kinds, allowlists, ranges, sequencing and concurrency (never more than four motions at once) and computes every layer's frame as a pure function of scene progress, so a silent clock, the narration clock and a seek all produce the same picture. The planner (`lib/motion-plan.ts`, Claude, no Recraft call) describes which objects move and why (`explains`, shown as a legend under the scene); values must appear verbatim in the approved copy and sober stories cannot animate characters. Existing v1 manifests without `animation` remain valid and render as flat scenes that settle once toward rest. Run `scripts/illustrate-edition.ts DATE --motion` to add animation to existing scenes.
- **Player.** `components/IllustratedStoryPlayer.tsx` starts a scene's clock when it scrolls into view (IntersectionObserver), plays it once to its final informative frame, offers Replay, pauses offscreen work, and switches to the narration clock while a clip is loaded, reading `currentTime` through the player controller inside each scene's cue window so pause freezes the frame and seek lands on the right one. Reduced motion shows the complete final frame immediately. It overlays an existing reaction character when the plan allows one and renders the caption, an "Illustration · n of m" label and alt text. While a Cartesia clip is loaded the narration clock chooses the scene using the manifest's character-proportional cue fractions (each scene starts where its verbatim cue begins in the script, scaled to the actual audio duration); this is an approximation, not word-level alignment. Seeking, pausing, replaying, switching narrator and switching story all keep the scene coherent, and tapping a scene dot seeks the audio to that scene. Without audio the reader steps through scenes by hand. Reduced motion disables all animation.

```sh
# Explicit operator generation; spends Recraft credits only for scenes that do not exist yet.
node --conditions=react-server --import tsx scripts/illustrate-edition.ts 2026-10-24 --stories 1 --scenes 2 --max-images 2
node --conditions=react-server --import tsx scripts/illustrate-edition.ts 2026-10-24 --story-id STORY --regenerate-scene scene-1 --max-images 1
```

## PWA and offline

Production registers `/sw.js` on HTTPS or localhost; development does not register a worker. The service worker caches only the static offline shell, manifest, icons and reactions. API responses, POSTs and live audio are not service-worker cached. The reader saves its last opened published edition in local storage; offline navigation shows that actual edition with its original date, or asks to reconnect if the requested date is unavailable. It never substitutes a fixed demo. First installation requires a successful online visit.

Installation remains available through the browser. The app does not show install prompts, installation instructions, provider badges, or a promotional footer. Physical-device installation and Safari playback still need device QA.

## Deploying on Vercel

`vercel.json` declares one Vercel service, `app`, which is this Next.js application at the repository root; the catch-all rewrite sends all public traffic to it. There are no other services and no bindings: the private News Receipts Actor in `actors/news-receipts` is an Apify Actor (it uses the Apify SDK, runs once per job and exits), is deployed to Apify with `node scripts/build-receipts-actor.mjs`, and is invoked by the app through the Apify REST API using `APIFY_API_TOKEN` and `APIFY_RECEIPTS_ACTOR_ID`, never over a URL of its own. It must not be deployed as a Vercel container service.

Set the same server-only environment variables on the Vercel project as in `.env.example` (`ANTHROPIC_API_KEY`, `APIFY_API_TOKEN`, `APIFY_ACTOR_ID`, `APIFY_RECEIPTS_ACTOR_ID`, `LLM_PROVIDER`, `CARTESIA_API_KEY`, `RECRAFT_API_KEY`, the `NEXT_PUBLIC_FIREBASE_*` identifiers). Two routes export `maxDuration = 300` (`/api/run`, `/api/illustrations/:date`), so the project needs a plan whose function duration allows 300 seconds; the published editions, generation lock, budgets and illustration assets live in Apify storage and are shared across instances, while live audio clips and in-process run logs are process-local (as documented above) and are prepared on demand. Add the production domain to Firebase Authentication's authorized domains before enabling Google sign-in there. `vercel dev` runs the service locally.

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

## Profiles and Google sign-in

Set the six `NEXT_PUBLIC_FIREBASE_*` web-app identifiers from `.env.example`, enable Google in Firebase Authentication, authorize the local/production domains, and create the default Firestore database. Restart Next after changing environment variables. No Firebase service-account key is used by the browser or required for this client integration.

The header avatar opens Profile, which holds Google sign-in/sign-out, sync status, narrator and listening preferences. Your jar holds completed editions, reading history and private reaction tallies, with no account controls. Google sign-in is optional; reading works signed out. Firebase persists the session. On sign-in, guest progress moves into an account-specific import queue and merges once, preserving the account’s existing reactions. Reads and reactions sync through `users/{uid}`; transactions merge only this device’s pending edits, retaining changes from other devices. Account caches and offline edit/import queues are scoped to the Firebase UID. Signing out returns to separate guest progress. Cloud permission/network failures retain local edits and expose Retry sync.

Deploy `firestore.rules` to the configured Firebase project before enabling public profile sync. These rules restrict each profile document to its owner, prohibit collection listing, validate allowed fields and sizes, and deny other collection access. If this Firebase project serves other applications, merge this profile rule into its existing rules rather than replacing unrelated rules. The app does not silently deploy rules or use open test-mode access.

```sh
npx firebase login
npx firebase deploy --only firestore:rules --project YOUR_FIREBASE_PROJECT_ID
```

Use `npm run test:firebase` to test rules against the local Firestore emulator (Java 21+). No live Firebase user or production document is created by the emulator tests.

## Evidence reports and operating limits

New editions persist an optional `evidenceReport` (schema 1) with the immutable edition and audit. Studio's **Behind this edition** displays these computed counts; older editions get a clearly labeled, read-only retained-record summary. Historical retrieval/normalization counts absent from older records remain **Not recorded**.

- Candidate records include the bounded retrieved discovery rows before normalization. Unique articles are counted after URL/content normalization, before exact-date filtering and the 20-article review cap. Approved/excluded counts describe actual final records.
- Supporting-document candidates are unique, usable investigative leads, not automatically primary sources. Retained primary documents require an editorial primary classification and a valid retained passage. Primary classification remains a model judgment.
- Publisher domains are hostnames; reporting-origin groups merge known publisher, editorial-group, wire-byline, near-copy and shared-primary-document relationships. Different hosts alone do not establish independence. This conservative grouping also caps editorial confidence.
- Passage counts deduplicate source/passage pairs and check exact retained source ID, URL and excerpt across the story and its displayed explanations. They do not measure truth. Invalid exclusions are separate from unresolved retained references.
- Durations use recorded stage timestamps. Run links use real identifiers; run usage appears only when Apify returns `usageTotalUsd`. Parent/child usage can overlap and is never summed into an invented edition price.

Optional public-question explanations use an actual recent Reddit question verbatim, lexical topic matching plus Claude relevance review, an answer drafted only from approved passages, separate support review, and exact-reference validation. At most one answer appears per story. Missing questions, unsupported references, unsafe content, review failures and historical dates produce no answer. Reddit never corroborates a news claim. The entire optional batch has a 45-second deadline; the answer/review pair has at most 20 seconds.

Paid generation is admitted under the existing distributed publisher lease. A Pacific-day Apify KV ledger allows at most 12 attempts globally, at most 8 historical attempts, and 3 attempts per date, with a 10-minute per-date cooldown. Attempts are reserved before paid calls; failed attempts count. Saved editions bypass generation and remain readable. No login or forwarded-IP identity is required. A missing/corrupt ledger fails closed. The queue lease renews every 90 seconds; losing renewal prevents publication. Checkpoint writes are coalesced rather than queued without a bound.

The receipts Actor rejects private/direct-IP URLs, checks DNS for direct targets, and discards unsafe redirect results. Its third-party retrieval platform still controls its own network; these checks are not a claim that we replaced Apify's egress firewall. The app's separate article-head preview transport validates DNS at socket connection, checks every redirect, bounds bytes and time, and retains normal TLS verification. Completed child-crawl records may survive a timeout, but the packet explicitly records partial retrieval and gives no extra verification credit.

### Integration checks

```sh
# One private Actor call, one public BBC URL, no investigation; writes ignored generated output.
node scripts/smoke-receipts-actor.mjs

# Isolated current-day optional enrichment; requires /tmp/news-current-edition.json from GET /api/today.
# Does not modify the published edition.
node --conditions=react-server --import tsx scripts/smoke-public-questions.ts

# Verify real report publication in an isolated Apify namespace, reusing today's actual evidence.
# Uses the normal global lock/budget and never replaces today's main-store edition.
node --conditions=react-server --import tsx scripts/verify-evidence-publication.ts

# Re-review a FAILED historical checkpoint's actual dataset without another crawl.
# Requires the original successful configured Actor, a free publisher lock and normal budget admission.
# Refuses to replace a published date; performs real Claude calls.
node --conditions=react-server --import tsx scripts/replay-receipts-edition.ts YYYY-MM-DD
```

The normal browser/API path always uses the configured deployed Actor; replay is an explicit operator tool for bounded recovery and audit inspection. The fallback engine remains available when no private Actor ID is configured.

## Illustrated briefing validation record

This record covers the October 24–25, 2026 UX and illustrated-storyboard milestones (commits after `159c559`). No existing environment file, Firestore rule, or published edition was replaced; illustration assets live in a separate store.

### Git milestones

- Starting commit: `159c559`.
- UX milestone (profile, narrators, crossword timer/overlay, reactions, completion): `a486e9d`, pushed to `origin/main` before any Recraft work.
- Storyboard milestone: the commit containing this record, pushed after the real Recraft generation below.

### Recraft results (actual)

- Endpoint/model: `POST https://external.api.recraft.ai/v1/styles` and `POST /v1/images/generations` with `model: "recraftv4_styles"`, `style_id`, `size: "4:3"` (resolved by Recraft to 1216×896), `image_format: "webp"`.
- Reusable style `d88b760a-b7ab-482c-b9d9-ed7de8ea2360` created once from the four 768px reference copies of the original reaction characters (5 API units).
- The feed and layered-animation pass (October 25, 2026) made no Recraft calls: animation was planned by Claude for the already stored scenes and reuses the existing WebP backgrounds.
- Paid image calls on October 24–25, 2026 (all for the 2026-10-24 edition): 1 exploratory curl probe, 2 failed-then-retried attempts that returned HTTP 400 and were not charged (counted conservatively in the per-day ledger), then 7 charged images: Svalbard water story scene-1 (regenerated once after visual inspection, so 2 charged images) and scene-2; PHP story scenes 1–2; Rosalind Franklin story scenes 1–2. Recraft reported 35 units per image, so 8 charged images including the probe = 280 units plus 5 for the style, 285 units total (US$0.285 at the published 1,000 units per dollar). The account balance went from 25,000 to 24,715 units (checked via `GET /v1/users/me` at the start; the final figure is the ledger arithmetic). The AI face-photo story's plan asked for "text" in a prompt twice and was rejected by validation, so it keeps its publisher visual. Claude planner calls: 8.
- Visual inspection: the Svalbard sequence shows the lake that supplies Longyearbyen with the small town and a tap, then a cutaway of thawing permafrost over pyrite-bearing shale leaching into the lake; the PHP sequence shows a server behind blank browser windows with a magnifying glass finding cracks, then a patched server; the Franklin sequence shows one highlighted booklet among many identical ones with a microscope and helix. The first Svalbard scene-1 draft was too abstract (no town or snow), which prompted adding "clearly recognizable objects that must appear" to every composed prompt. Style consistency with the reference stickers is good but not perfect; soft gouache texture and palette carry across, line weight varies.
- Storage: Apify key-value store `us-daily-editions-illustrations`, manifests `STORYBOARD-2026-10-24-<storyId>` and assets `ASSET-…-scene-n` (0.5–0.74 MB WebP each). The edition record `EDITION-2026-10-24` was not modified.

### Animation and audio

Scenes crossfade; the active scene gets a gentle pan or zoom that runs only while narration plays (`animation-play-state`) and can be paused with a control; the optional existing reaction character bobs in a corner. Timing uses the manifest's character-proportional cue fractions scaled to the real clip duration: approximate, not word-level. Browser QA with Rowan's clip (29.3 s): scene 1 at start, scene 2 after seeking to 70%, pause froze motion, tapping scene dot 1 seeked the audio to 0, and switching to Skylar dropped the loaded clip and showed the estimate again. Silent reading steps scenes by hand; blocking the image routes hides the player and shows the publisher preview with the full text (`generated/qa-m2/story-fallback-390.png`).

### Historical retrieval

Failure mechanisms found in the June 29, 2026 run log: 24 retrieved records, 16 normalization rejections dominated by "no reliable publication date" and "published outside the selected day", the latter judged in UTC only, which excludes Bay Area evening reporting. Changes: UTC-or-Pacific day matching with the Pacific end of day as the editorial reference clock, coverage diagnostics in the run log and Studio, and one bounded broader second discovery pass when fewer than eight same-day articles remain. Real test on an unpublished date, April 10, 2026 (previously two qualifying stories): first run under the new date policy found 24 records, 24 unique articles, 6 published that day, 3 undated, 15 other days; the second pass did not trigger at the original threshold of six and only 2 stories verified, so nothing was published. The threshold was raised to eight and the date was retried after the ten-minute cooldown, but the retry was refused by the global generation budget (`GENERATION_BUDGET_REACHED`, 12 attempts per Pacific day), so the second pass has unit coverage (`tests/date-editions.test.ts`) but no live run yet; retry April 10 after the Pacific-day budget resets. June 29 itself is already published (five stories) and was not regenerated.

### Quality verification

Automated: 151 tests (`npm test`), 4 Firestore emulator tests, `tsc --noEmit`, and `next build` all pass. New coverage: narrators and cache separation, preferences, Mini timer and records, storyboard validation, cue timing, Recraft request shape and error handling, asset download safety, store idempotency, budgets, locks, provider failures, manifest tampering, UTC/Pacific date policy, second-pass lanes and pipeline behaviour. Browser QA (Chrome via Playwright, not a physical iPhone): six viewports with no horizontal overflow and no console errors for cover, Profile, Your jar, story, reaction, ending, Mini and the celebration overlay (focus on Done, Escape closes, no replay after reload); illustrated story at 390 and 1440 with and without audio; Studio panels. Screenshots are in ignored `generated/qa-m1/` and `generated/qa-m2/`.

Known limitations: no physical-device Safari test; preferences are device-local; scene timing is approximate; the Recraft style was learned from four small stickers, so some scenes lean abstract and should be inspected before publication; automatic illustration after publication is off by default.

## Whole-app cohesion pass

October 25, 2026 follow-up (starting commit `90dca94`). One bold sans typeface replaces the serif across the app; home, The Mini, Your jar and Profile share a single centred column on desktop; The Mini is one surface (gradient header with the timer and solved state, clue bar, grid, keyboard, clues beside on desktop); Your jar is a gradient hero (editions read, streak, reactions, the jar) with two panels (how the news landed, finished editions); Profile is a gradient identity hero with preference panels; Studio uses the same gradient header, stat band and tile system. Every illustrated story in today's edition now has authored GSAP scenes (`components/scenes/PhpScenes.tsx`, `components/scenes/FranklinScenes.tsx`, sharing `useAuthoredTimeline.ts`): PHP scene 1 sends pulses along the wires to each browser window, glows and sweeps the magnifier, then draws two cracks with warning marks; PHP scene 2 marks the cracks, seals them as the patch glows, rings the lock and draws a check, then pulls the plug back; Franklin scene 1 sweeps a feathered spotlight along the row of booklets while tally marks fill in, then settles on the single highlighted booklet; Franklin scene 2 sparks the pencil and fills the empty frames with portraits one by one while the atom's electrons circle. No Recraft calls were made. Verified in `generated/qa-m7/` at 390 and 1440 (home, Mini, jar, profile, Studio, PHP and Franklin animation frames) with no horizontal overflow and no console errors.

## Vivid now-reading pass

October 25, 2026 follow-up to the Spotify-inspired pass (starting commit `5ecc3aa`): saturated gradient atmospheres replacing the pastels, the progress strip moved to the top of the screen, transport arrows moved beside the play button, follow-along narration text in the sheet, self-advancing scenes, and the home lineup, The Mini and Your jar restyled in the same system. Files: `lib/story-theme.ts`, `components/EditionReader.tsx`, `components/AudioPlayer.tsx`, `components/FollowAlong.tsx`, `components/IllustratedStoryPlayer.tsx`, `components/TodayHome.tsx`, `app/experience.css`, `tests/story-theme.test.ts`. Browser QA (`generated/qa-m6/`, Chrome via Playwright, recording in `video/`): story 1 on cobalt, a held mid-swipe blending toward forest, story 2 settled on forest, story 4 with its authored scene on the gradient, scene auto-advance (1 of 2 → 2 of 2 after the scene's timeline), the follow-along lighting the first sentence while Rowan narrates and jumping to the fourth after a seek to 80%, the transport Next button reaching the ending with audio paused, home, The Mini and Your jar at 390, plus 375, iPad 834 and 1440 with no horizontal overflow and no console errors.

## Spotify-inspired experience validation record

October 25, 2026 pass. Starting commit `40ba168`. The teammate's Figma file returned HTTP 403 and no screenshots were attached, so the brief's description was the reference. Exact files: `components/OnboardingFlow.tsx`, `components/TodayHome.tsx`, `lib/onboarding.ts`, `lib/story-theme.ts`, `lib/preferences.ts` (mode), `components/USApp.tsx`, `components/EditionReader.tsx` (themed deck background), `components/AudioPlayer.tsx` (compact player), `components/ProfilePage.tsx` (mode picker, replay intro), `app/experience.css`, `tests/story-theme.test.ts`, `tests/preferences.test.ts`, this README. Apify, Claude, Recraft, Cartesia, Firebase, Studio, the Mini, reactions, evidence and the authored GSAP scenes are unchanged.

Browser QA (Chrome via Playwright): on a fresh 390×844 device the intro appeared with zero generation requests; choosing "A little of both" and Daniel persisted `{narrator: daniel, mode: both}`; a reload skipped the intro; a `?date=2026-06-29` deep link on a fresh device opened the edition directly. In the deck, story 1 rendered on sky `rgb(220,232,251)`, a held mid-swipe at −190 px showed the blended background `rgb(220,233,234)`, and release settled on sage `rgb(220,235,217)` for story 2; the recording is `generated/qa-m5/video/*.webm` with frames in `swipe-frame-*.png`. Story 4 kept its authored scene and the compact player; a vertical touch scroll moved the page 503 px without turning it; the ending rests on cream; reduced motion turned the page instantly. Home, Mini, Calendar, Profile and Your jar were captured at 390, home and story 1 at 375 and 430, home and reader at iPad 768 and 834, all without horizontal overflow or console errors. A screenshot of home while an edition generates was not captured because today's generation budget is spent; that component is unchanged.

## Deck and authored-animation validation record

October 25, 2026 pass (horizontal story deck, GSAP authored scenes, portrait-first layout). Starting commit `1d3ed8e`. Exact files: `components/EditionReader.tsx`, `lib/deck.ts`, `components/IllustratedStoryPlayer.tsx`, `lib/authored-scenes.ts`, `components/scenes/SvalbardTownTap.tsx`, `components/scenes/SvalbardPermafrost.tsx`, `components/scenes/grain.tsx`, `app/experience.css`, `app/editorial.css`, `tests/deck.test.ts`, `tests/scene-motion.test.ts` (renamed), `package.json` (`motion`, `gsap`); removed `lib/feed.ts` and `components/SceneIcons.tsx` (generic icon overlays are no longer rendered; manifest `animation` data remains valid but unused by the player).

- **Recraft calls:** none; the stored paintings are reused.
- **Browser QA (Chrome via Playwright, touch gestures via CDP):** at 375×667, 390×844 and 430×932 a mid-drag frame shows the track following the finger (−168.75 px of −375 at 375 wide) with the incoming page previewed, release springs to the next page, a short drag springs back, a vertical touch scroll moves the page content (0 → ~420 px) without changing the story, a mostly vertical diagonal gesture likewise, ArrowLeft turns back, there is no document scroll and no horizontal overflow. Authored Svalbard scenes: scene 1 (ring, dotted supply line drawing, falling drops, advisory mark) and scene 2 (frost mask 190 → 40, pyrite scaling in, stream dash-offset 0.001 → 0, a metal particle moving 470,520 → 757,660 → 930,700, advisory ring drawing) were captured frame by frame in `generated/qa-m4/anim-scene*.png` and in the recordings `generated/qa-m4/video/*.webm` (frames extracted to `generated/qa-m4/frame-*.png`). With Rowan's narration, scene 1 showed while playing, seeking to 82% switched to scene 2 at its matching timeline state (frost thawed, stream drawn, particles in the lake, mark not yet drawn), the paused frame stayed identical 1.2 s later, and swiping to the ending paused the audio. iPad portrait 768×1024, 820×1180, 834×1194 and 1024×1366 render the centred magazine composition with arrows; desktop arrows work; reduced motion shows the final frame immediately. No console errors.
- **Known limitations:** no physical-device Safari test; the authored scenes exist for one story (the others show their paintings); narration timing is cue-proportional; CDP-synthesized flicks decelerate before release, so flick commits were verified by the unit tests rather than the synthetic gesture.

## Feed and animation validation record

October 25, 2026 pass (vertical feed, layered scene animation, Mini copy). Exact files: `components/EditionReader.tsx` (feed, reading band, completion, resume, audio policy), `lib/feed.ts`, `components/IllustratedStoryPlayer.tsx` (scene clock, layer rendering), `components/SceneIcons.tsx`, `lib/scene-motion.ts` (layer schema, validation, frame maths), `lib/motion-plan.ts` (Claude motion planner), `lib/illustrate.ts` (`planMotion`), `lib/storyboard.ts` (optional `animation`), `components/AudioPlayer.tsx` (controller clock, late autoplay), `components/Studio.tsx`, `components/USApp.tsx`, `components/Crossword.tsx`, `scripts/illustrate-edition.ts` (`--motion`), `app/experience.css`, `app/editorial.css`, `tests/feed-motion.test.ts`, this README.

- **Recraft calls:** none. Animation was planned by Claude for the six already stored scenes (three stories); the AI face-photo story still has no storyboard. The planner's full allowlist schema was rejected by the structured-output endpoint as "Schema is too complex", so the model receives a loose shape and the strict schema, allowlists, numeric ranges and concurrency rule are enforced on the returned JSON (`tidyLoosePlan` only clamps numbers into range and drops nulls).
- **Browser QA (Chrome via Playwright):** at 375×667, 390×844, 430×932, 768×1024, 1024×1366 and 1440×900 the feed shows the sticky progress following scroll (1 of 4 → 4 of 4 → Complete · 4 stories), no Back/Next dock, no horizontal overflow, stable progress across six wheel steps between stories, and the animated ending. Continue reading returned to story 3 after scrolling there; a cover headline opened story 4 directly; a horizontal drag changed nothing; reaching the ending twice wrote reading progress once with a single completed day. Animation evidence for the PHP story in `generated/qa-m3/`: six frames 0.7 s apart show the server icon entering from the left, a route drawing and the magnifier entering from the right and travelling, while the background image has no transform; `generated/qa-m3/video/*.webm` is the recording; with `prefers-reduced-motion: reduce` every layer is at full opacity immediately. No console errors.
- **Known limitations:** layered objects are drawn over a flat background that may already contain a similar object (the PHP background has its own server and magnifier), so some scenes double up until backgrounds are generated with layers in mind; scene timing with narration remains cue-proportional; the three animated stories are the only ones with motion until `--motion` is run for other dates; no physical-device Safari test.

## Consumer app upgrade validation record

This record covers the October 24, 2026 consumer UX and Apify evidence upgrade. The main app remains on port 3000. No existing environment file, Firestore rule, or published edition was replaced. The production host has not been deployed.

### A Product changes

The cover now presents the actual edition date, story count, a text-based reading estimate and one Start/Continue action. An editorial list replaces the card grid. Listening is secondary; the Mini has a small separate teaser. Completed editions show a read-again state.

The reader uses Georgia headlines, readable 17px body copy, constrained line lengths, visible plain-English explanations, compact audio controls and optional deeper context. A dedicated reading dock replaces general navigation. Story changes reset scroll and focus; browser Back returns to the cover. Resume positions are scoped to edition and account/guest on the device. Exact source passages and uncertainty are accessible through See the receipts. Four quiet reactions, optional sourced responses, the finite ending and the original Mini remain intact.

The Mini now opens at its own heading, restores trigger focus on close, brings the grid back into view when choosing an off-screen clue, and has more compact mobile spacing and larger controls. Solved feedback stays with the board and the finished keyboard is hidden. Small publisher images avoid excessive enlargement. Cream/sage tokens, consistent SVG navigation icons, safe-area spacing, the manifest and the offline shell align with the editorial design. Obsolete cover/reader CSS blocks were removed instead of retaining competing implementations. No UI library was added.

### B Backend changes

The existing private News Receipts Actor was updated and built successfully. It still performs retrieval rather than editorial truth judgments, and the server fallback remains available. Topic input, direct-target DNS checks, unsafe-redirect rejection, actual child-run usage metadata and explicit partial-timeout retention extend its existing packet contract without replacing it.

New reports aggregate actual pipeline/retained-record data and persist with newly published editions. Older editions show a read-only summary with absent retrieval metrics marked Not recorded. Reporting-origin checks conservatively merge wire bylines, near-copy text, shared publisher/editorial groups and retained-primary dependencies; domains alone do not establish independence.

Optional Reddit Q&A requires an exact public question, two relevance gates, approved news passages, a separate answer-support review and exact-reference validation. Historical dates and optional failures omit it. The live retrieval supplied no suitable question; no answer was invented.

The existing publisher lock now renews and checks ownership before publication. Distributed budgets and cooldowns precede paid calls. Checkpoints coalesce. The separate image-head transport validates DNS when opening the TLS socket, checks redirects and limits bytes/time. Claude's output schema now constrains candidate IDs/count to the actual batch; local preference no longer prematurely excludes substantive supported national/global reporting. Evidence thresholds are unchanged.

### C Exact implementation files

Paths are relative to this repository. Tests and operational scripts are included because they make the changes reproducible.

| Files | Implementation |
| --- | --- |
| `app/globals.css`, `app/editorial.css`, `app/layout.tsx` | Consolidated reader/cover styles, design tokens, responsive editorial shell and viewport configuration. |
| `components/USApp.tsx`, `components/EditionReader.tsx`, `lib/reading-position.ts` | Cover, resume, browser Back, reading focus/dock, finite completion and accessible receipts placement. |
| `components/Icon.tsx`, `components/StoryReceipts.tsx`, `components/StoryVisual.tsx` | Consistent navigation icons, exact source inspection and restrained image sizing. |
| `components/Crossword.tsx` | Mini open/close focus and scroll behavior; existing puzzle engine retained. |
| `components/Studio.tsx`, `components/EvidenceQuality.tsx` | Deterministic report UI, provenance/passage IDs and folded duplicate audit totals. |
| `lib/evidence-report.ts`, `lib/types.ts`, `lib/edition-schema.ts`, `lib/pipeline.ts` | Optional report/Q&A contracts, exact-reference checks, aggregation and publication payload. |
| `lib/public-question.ts`, `lib/question-review.ts`, `lib/enrichment.ts`, `lib/social.ts` | Exact public questions, bounded drafting/support review, safe omission and social filtering. |
| `lib/source-independence.ts`, `lib/validation.ts` | Conservative reporting relationships and confidence caps; candidate-bounded Claude generation schema. |
| `lib/anthropic.ts`, `lib/editor-prompt.ts` | Actual batch constraints, bounded structural repair and geographic selection clarification. |
| `lib/generation-admission.ts`, `lib/daily-store.ts`, `lib/publication.ts`, `app/api/run/route.ts` | Persisted budgets, cooldowns, renewing lease, coalesced checkpoints and compatible streaming errors. |
| `lib/network-safety.ts`, `lib/public-preview.ts`, `lib/article-image.ts`, `lib/normalize.ts` | DNS/IP/redirect defenses and bounded publisher preview transport. |
| `lib/apify.ts`, `lib/receipts.ts` | Provider-reported usage diagnostics and backward-compatible retrieval metadata parsing. |
| `actors/news-receipts/core.mjs`, `actors/news-receipts/core.d.mts`, `actors/news-receipts/.actor/input_schema.json`, `actors/news-receipts/README.md` | Private Actor contract, topic input, safe targets, partial retrieval and actual usage metadata. |
| `public/manifest.webmanifest`, `public/offline.css`, `public/offline.html`, `public/offline.js`, `public/sw.js` | Cream app shell, safe areas, visible offline explanation and updated static cache version. |
| `tests/evidence-upgrades.test.ts`, `tests/article-image.test.ts`, `tests/daily-store.test.ts`, `tests/receipts.test.ts`, `tests/social.test.ts` | Evidence/Q&A/budget/origin/resume/DNS/lease/partial-crawl regression coverage and explicit test dependency injection. |
| `scripts/smoke-receipts-actor.mjs`, `scripts/smoke-public-questions.ts`, `scripts/replay-receipts-edition.ts`, `scripts/verify-evidence-publication.ts` | Bounded real integration checks, explicit failed-run recovery and isolated report-persistence verification. |
| `README.md` | Operating controls, metric semantics, reproducible checks and this handoff. |

Existing AudioPlayer, Firebase profile logic, Firestore rules, puzzle engine, original reactions and artwork were reused. Audio placement changed through the shared reader/styles.

### D Real integrations

Private Actor ID: `kOWandGqxxjHl6bYG`. Successful updated build: `T9OWyVNXX5Mfcohkp` (preceded by successful build `q4E74sjs8UDPa9SIE`). It was not published to the Actor Store.

| Real execution | Run ID | Dataset ID | Observed outcome |
| --- | --- | --- | --- |
| Bounded private Actor smoke test | `illHljK7NFQRkZUIs` | `JA3a6JWfXAACEaVMw` | Succeeded; one packet, exact passages, matching SHA-256 and usable provenance. |
| Its actual RAG child | `voXawgjVSLdkH7DKF` | `seCDgfSgKjiHo34l6` | Succeeded; provider returned usage metadata. |
| App invocation for April 10 | `F7xI1u7kITv6EiJcB` | `CAIn9UuXc76lRuqVc` | Actor succeeded with 16 packets; only two stories qualified, so no publication. |
| App invocation for October 22 | `AMxZa9crVZ1EZF5qK` | `cnlLccuYklMRO37jD` | Actor succeeded with eight packets and a failed child lane; editorial structure failed validation, so no publication. |
| App invocation using updated build for April 8 | `vc0qCeohKZAnc26sA` | `FMDYtNdlioamwtvJu` | Actor succeeded with 16 packets; no edition published. A bounded replay also failed coverage validation before the candidate-count schema improvement. |
| Isolated real Reddit batch | `rsV0XPfnTbZeux0ju` | `R8s77JmhatwNbM2xK` | Twelve recent posts; two relevant story links; zero suitable question answers. Published content unchanged. |

Claude was exercised in the actual app runs, the live social relevance review and the successful isolated publication check. The latter reused the existing real Actor retrieval `sAADa2jLLQmGOIkgq`, dataset `mDpqtoqmgvJSkQukI`; it did not claim another crawl. New edition `c0442b3d-c1e0-4c2a-acf1-86fa498ac10a` was saved and read back through a fresh adapter in the separate Apify namespace `half-full-integration-20261024`.

Its stored report contains 24 retrieved records, 16 normalized/eligible articles, four approved stories, 20 excluded records, three usable supporting-document candidates, five retained sources, one retained primary document, one story with a primary passage, three publisher domains, two conservatively identified reporting groups, 19 valid retained passage pairs and zero unresolved references. Claude review took 52.507 seconds. The primary/group labels include editorial judgments. Existing main-store edition `8f61b56f-3a63-45df-9d7c-818e5b0d288d` remained byte-for-byte unchanged (SHA-256 `1fe33024f95df29ccde9c36eebe9b54ff4801655ddadbcc782936842210d873b`). Newly crawled packet cost fields are absent from this older reused dataset and were not fabricated.

Cartesia returned an uncached clip for the second approved story (`cached:false`), and GET with `Range: bytes=0-31` returned HTTP 206, `audio/mpeg`, 32 bytes from a 489,475-byte clip. Actual first-story Chromium playback, pause/replay, seek, speed, transcript and story-change pause/reset were also exercised. Unit tests use synthetic provider responses for errors, reference failures, concurrency, budgets and optional-answer support outcomes; a real answer-drafting/support pair could not run because the actual posts had no suitable question.

### E Validation and screenshots

Baseline: 114 automated tests, TypeScript and production build passed. Final: 128 automated tests passed, TypeScript passed, production build passed, and all four Firestore emulator tests passed. There is no lint script. The initial image-mock DNS failures and missing-configuration stream regression were corrected; transport typing and a jar-palette cleanup reference were corrected before the final build.

Chromium cover/reader layouts were checked at 375×667, 390×844, 430×932, 768×1024, 1024×1366 and approximately 1440px desktop width, with no observed horizontal overflow. Local screenshots in ignored `generated/qa-master/` include cover, story/full story, receipts, audio/options, ending, Mini/solved Mini, jar, calendar, Studio and offline fallback. Browser interactions verified Start/Continue, account-scoped resume helpers, Back/Next, keyboard boundaries, scroll/focus reset, exact primary passages, reaction selection/removal, finite completion, a keyboard Mini solve, saved-date selection and the guest profile state. Chromium console checks were clean.

The production offline check stopped the temporary port-3002 server, navigated to the saved date, and observed the actual cached offline shell and four-story edition. It did not use a fixture or relabeled demo. Swipe direction/boundaries are covered by unit tests; mouse drags correctly preserved text selection, and real touch swiping remains a physical-device check. Firestore rules were tested in the emulator; a new live Google sign-in/session was not completed in this run.

### F Remaining gaps

Public production hosting, HTTPS-domain Firebase authorization and physical iPhone/iPad/Safari installation/audio/touch checks remain. Google/profile code and rules are preserved, but live account syncing needs a regular-browser/device pass. Audio is process-local and on demand; offline narration is not promised. Historical coverage remains dependent on accessible same-day sources and can fail rather than lower standards. Model source classifications and semantic support reviews remain judgments. The Actor's upstream retrieval service controls its own egress behavior.

No suitable actual Reddit question was retrieved for a live answer demonstration. Published editions were not rewritten to add Q&A or reports. The report-persistence integration used a separate test namespace, not a replacement for today's shared edition.

### G Two minute judge walkthrough

1. **0:00–0:25:** Open port 3000. Show the real date, short edition and Start reading. Explain that the product aims for understanding and completion.
2. **0:25–0:50:** Read a plain-English explanation, briefly play narration, then open See the receipts and the NSA primary passage. Distinguish the news source from the explanation and audio.
3. **0:50–1:20:** Open Studio. Show Actor/run/dataset/item provenance, the exact passage, field references and Claude's source-grounded decision. Missing primary evidence and unavailable old metrics are explicitly labeled.
4. **1:20–1:40:** Show the private Actor's real smoke/app run in Apify Console and the stored integration report. The integration namespace contains the new recorded metrics; the main published edition remains fixed. Explain Apify retrieval/storage, Claude review, and Cartesia narration as separate responsibilities.
5. **1:40–2:00:** Return to the reader, finish the finite edition and show the optional Mini. Mention that reactions are private and do not personalize the shared news. If no real public question was retrieved, say so; do not stage an answer.

### H Product quality self review

The consequential issues found and fixed were competing hero/grid hierarchy, essential explanations hidden behind context, two navigation systems in the reader, duplicated Studio totals, a Mini opening below the ending without moving focus, tiny Mini controls, low-resolution image enlargement, inconsistent offline styling, dropped completed crawl records, and provider output that could omit or invent candidate IDs before server validation.

Long headlines in existing immutable editions still wrap over several lines on the smallest phones. The UI accommodates them; those published records were not rewritten for appearance. The Mini still draws from the original small validated collection, and historical generation remains less predictable than opening a saved edition. Physical-device input, safe areas and Safari audio should be the next product QA pass before launch.
