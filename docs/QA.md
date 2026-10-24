# US MVP verification — 2026-10-24

## Baseline and changes

The existing Next.js/TypeScript app already had the four JSON endpoints, official Apify REST integration, official OpenAI/Anthropic SDK adapters, normalization, strict decision validation, bounded deadlines, an in-memory latest-edition/run store, a basic all-stories page, Docker setup, and 23 passing tests. Its baseline production build passed. The repository was clean before this task's changes; local secret files were not modified.

Completed in this task:

- One-story reader with Back/Next, directional gestures, keyboard arrows, progress, ending screen and review. Transparency preserves reader position.
- Original sources/dates, confidence limitations, exact retrieved passages and field-level references. Clearly separated insufficient-evidence and other exclusions.
- Explicit no-key `/demo` mode. Its checked-in snapshot is a real successful run, with original dates, five stories, fifteen exclusions, evidence and audit. It is never used by the live pipeline.
- Manifest, PNG/maskable/Apple icons, production service worker, installation prompt where supported, standalone offline fixed-demo reader. API/POST/authenticated/external requests bypass caching.
- Live NDJSON progress as an opt-in representation; existing JSON endpoint behavior preserved.
- Better publication date parsing, canonical query sorting, duplicate URL/content rejection, unknown-date exclusion, bounded transient retries, complete failure audits and partial-edition exclusion.
- Source classifications, syndication groups, contradiction flags, per-field passage validation and conservative confidence caps. Semantic support and source independence still require model judgment; these checks are not independent fact-checking.
- OpenAI preferred when both keys exist; optional Claude preserved. Claude output budget/effort adjusted after an observed incomplete real response.
- Snapshot validation/update script, tests, deployment and judge walkthrough documentation.

## Automated checks

Final commands:

- `npm test`: **48 tests passed, 0 failed**.
- `npm run typecheck`: passed.
- `npm run build`: passed; `/`, `/demo`, and all four API routes built successfully.
- `git diff --check`: passed.
- No linter is configured in this repository.
- Exact configured key/token values were checked against `.next/static` and `public`: no matches. `.env` and generated diagnostics remain Git-ignored.

Tests include provider HTTP failures and incomplete/refused/invalid JSON, bounded retries, Apify empty/failed/malformed/timeout results, source and passage IDs, contradictions, confidence caps, complete and partial pipeline results, concurrent runs, route error/stream contracts, demo loading, ordering/navigation/ending boundaries, swipe thresholds, publication dates, content deduplication, manifest icon dimensions, and service-worker cache exclusions/offline fallback.

## Actual live calls

The current `.env` contains an Anthropic key and Apify token, but **no OpenAI key**. This differs from the earlier OpenAI handoff. No secret file was overwritten. Consequently this session's live runs used the existing optional Claude adapter; OpenAI's SDK response/error handling and schema were tested with isolated synthetic HTTP fixtures, not a new funded live request.

First hardened run `334231b1-a7fa-42ca-baf1-c9808c6b428c`: Apify retrieved 20 candidates; Claude returned incomplete output. Nothing was published, all 20 candidates were audited, and the failure remained visible.

After adjusting the optional Claude output budget, browser-triggered streamed run `3eb186ff-3454-443b-8b16-9fb4f1173be5` completed at **2026-10-24T21:14:24.904Z**:

- Apify run: `kGHyoNPSAPaPRaIV9`
- Dataset: `V3A7siaFw0pjh2Rbj`
- Candidates: **20**
- Published: **5**
- Excluded: **15**
- All five stories retained exact evidence and five content-support records.
- `/api/today` and `/api/run/:id` returned the successful result/record. The checked-in demo snapshot preserves this actual run and explicitly labels it archived.

Run history is memory-only and disappears on a restart. Saved diagnostics under `generated/` are ignored and are not runtime storage.

## Browser and PWA checks performed

Chrome on macOS was used, not a physical iPhone:

- Desktop layout and a narrow layout (measured 433 CSS pixels; Chrome's window minimum prevented the requested narrower override).
- No horizontal document overflow at the measured narrow viewport.
- Buttons, heading focus, keyboard progression, first/end boundaries, review-to-first-story, exclusions and return-to-current-story.
- Live loading stages, successful streamed result, original source/date display, source classification and confidence explanation.
- A separate production server on port 3001 with provider keys/token/Actor intentionally empty showed a visible configuration failure; choosing the fixed demo then worked without keys. Actual `.env` was untouched.
- Stopping the isolated production server and reloading showed the labeled offline shell; saved story navigation continued to work. This tests backend unavailability, not a physical-device radio-off test.
- Chrome offered the Install US control. Installation itself was not performed.
- `/sw.js` served HTTP 200, `Cache-Control: no-cache, no-store, must-revalidate`, `Service-Worker-Allowed: /`, and the JavaScript content type.
- Swipe direction/boundaries were unit-tested; physical touchscreen gestures and iOS VoiceOver/Safari installation remain device checks.

## Deployment status and remaining verification

No public deployment or infrastructure modification was performed. No Vercel metadata was present. The existing single-process Node/Docker approach is documented; the runtime now includes the public PWA files and Next configuration. Docker is not installed locally, so a container build was not executed. Production Node build/start were executed successfully.

To verify OpenAI end-to-end, supply `OPENAI_API_KEY` and set `LLM_PROVIDER=openai`, restart, then run one edition. To verify deployed PWA behavior, deploy the documented single Node process behind HTTPS with a 300-second proxy deadline and buffering disabled, then test installation/offline behavior on the intended phone. Funding, source availability and editorial evidence determine whether a live run can publish 3–5 stories; failures never lower the threshold or silently substitute the demo.
