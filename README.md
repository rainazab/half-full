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

The finite reader supports Next/Back, horizontal swipes and keyboard navigation, with a clear ending. The compact cover shows the real date, story count and a text-based reading estimate (220 words/minute). Start/Continue opens an editorial reader with a dedicated thumb dock; browser Back returns to the cover. Resume positions are scoped to edition and Firebase UID or guest. The reader keeps exact source passages available through See the receipts without exposing processing logs. Detailed evidence, exact passages, field references, source assessments and Actor provenance live at `/studio?date=YYYY-MM-DD`.

Four original generated reaction characters represent Interesting, Insightful, Hopeful and Stressed. Select, switch or remove one reaction per story. No comments or public counts. Guests keep reading progress and reactions on the device; signed-in users also sync completed dates and reactions through Firestore. Mini progress and in-edition resume position stay on the device. [Artwork and prompts](public/reactions/README.md).

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

## Profiles and Google sign-in

Set the six `NEXT_PUBLIC_FIREBASE_*` web-app identifiers from `.env.example`, enable Google in Firebase Authentication, authorize the local/production domains, and create the default Firestore database. Restart Next after changing environment variables. No Firebase service-account key is used by the browser or required for this client integration.

The header avatar and Your jar open the profile. Google sign-in is optional; reading works signed out. Firebase persists the session. On sign-in, guest progress moves into an account-specific import queue and merges once, preserving the account’s existing reactions. Reads and reactions sync through `users/{uid}`; transactions merge only this device’s pending edits, retaining changes from other devices. Account caches and offline edit/import queues are scoped to the Firebase UID. Signing out returns to separate guest progress. Cloud permission/network failures retain local edits and expose Retry sync.

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
