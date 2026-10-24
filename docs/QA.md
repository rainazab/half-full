# US upgrade verification — October 24, 2026

## Baseline preserved

The repository was clean at audit. Existing Next.js App Router, Apify → Claude evidence pipeline, four routes, NDJSON logs, validation, audit, memory store, concurrency guard, finite reader and PWA were retained. All 48 baseline tests passed. A stale duplicate generated `.next/types` file initially confused TypeScript; the normal production build regenerated that ignored output, after which type checking passed. No secrets or user source changes were overwritten.

## Automated checks

- `npm test`: **75 passed, 0 failed**, including all original 48.
- `npm run typecheck`: passed.
- `npm run build`: passed; existing four API endpoints and the new audio route are dynamic Node routes.
- `git diff --check`: passed.
- No standalone lint script is configured.

New tests cover media attribution/rights restrictions, glossary/narration source references, rejection of invented IDs/quotes, legacy narration, Cartesia configuration and SDK requests, invalid MP3/provider failures, bounded audio caching/coalescing/cooldown, HTTP ranges, Reddit normalization/relevance/deduplication, optional retrieval failure, deadline skipping, exact social quote validation, crossword layout/connectivity/numbering/completion, local day streak logic, and offline audio/puzzle assets.

All automated provider tests use mocks. Paid calls were limited to explicit integration checks and preparation of the archive.

## Real provider checks

- Real Claude call produced five archived quick/default/deeper explanations, contextual definitions and 30–50-second scripts. Source IDs/passages were validated against the archive's retained material.
- Real Cartesia calls produced five bundled MP3s (approximately 31–42 seconds actual playback). A first exploratory clip was removed when replaced by the final script. `/demo` Play makes no paid request.
- Real Apify Reddit batch: run `OGAqv39vfPVNqIDoM`, dataset `w0aZ03ZXO02g1SQ8P`. Thirteen recent posts were normalized. A stricter title relevance pass left two specific PHP discussions in the archive; removals are recorded in its enrichment log.
- Complete upgraded live pipeline: run `0623e0cc-142f-4ae1-84ec-531cef74f344`, October 24 at 21:45–21:48 UTC. **20 candidates, 4 approved, 16 excluded**. All four retained stories had validated experience/narration fields. News Actor `JNZaV2lyBLwIu8LMs`, dataset `IXgxqxfzlS4LeLYva`; social Actor `57g1SSWwzqMUKsr1q`, dataset `5VOIS7jlsVWnp1qXY`.
- That run exposed two unrelated mental-health social matches. The added bounded Claude relevance check was tested against those already retrieved posts: it removed both and retained the PHP/Barclays topic matches. Unknown IDs or invented supporting quotes fail closed. This extra check never changes verification or confidence.
- Real live audio POST generated a 539,630-byte MP3. A second POST returned `cached: true`; GET with `Range: bytes=0-99` returned **206** and exactly 100 bytes. `Cache-Control: no-store` was present.
- Health after the final build reported Claude selected, Apify configuration present, OpenAI key absent, and Cartesia configured. Health is a configuration check, not a new provider authentication call.

Local raw verification artifacts are ignored under `generated/`; they contain public results and controlled logs, not credentials. The actual live store is deliberately memory-only and clears on restart.

## Browser QA

Chrome on the development machine, not a physical iPhone/iPad:

- Actual measured CSS widths **320, 390, 768 and 1024 px**, plus larger desktop: no horizontal page overflow. Browser zoom required compensating viewport requests; measurements used `innerWidth`, not the requested size alone.
- Archived licensed visual, long headlines, readable explanations, glossary disclosures and receipts rendered.
- Real bundled MP3 playback advanced time; pause, replay, seek and manual Next worked. Changing stories resets the clip. Explicit listen-through advanced from story one to story two and played the second clip. Initial loading did not autoplay.
- Keyboard navigation preserved story order; Back/Next ended at “You’re caught up.” Review returned to story one.
- Filled the real crossword through browser inputs; Check answers displayed “Practice complete.” No game was required to reach the ending.
- Stopped the Node server, reloaded the page, and verified the clearly labeled offline shell. Cached Cartesia audio played (duration 41.874 seconds for the first clip), navigation worked, and the saved crossword loaded. Restarted the app afterward.
- Inspected source dates, original NSA/NCSC advisory links and exact passages. Linked documents explicitly say their full contents were not independently retrieved.
- Screenshots: `generated/qa-reader-upgrade.jpg`, `generated/qa-crossword-upgrade.jpg`, `generated/qa-offline-audio.jpg`.

## Honest limits

Physical Safari autoplay/installation, mobile touch gestures and public HTTPS deployment have not been tested on hardware. Swipe classification has automated coverage; browser QA used buttons/keyboard. There is no word-level alignment, multi-image slideshow, TikTok/Instagram adapter, or PDF extraction/page preview. Unknown-rights images are links, not copied photos. Social model relevance is conservative but remains a model judgment. Every story can still be read without images, social context or audio.

Deploy one long-running Node process with HTTPS and a 300-second request allowance. Memory-only edition/audio state is not reliable across independent serverless instances. No public deployment or infrastructure changes were made.

## Final integrated relevance check

Run `8218a99a-b291-4306-a84c-d8b5a833364b` completed at 21:55:58 UTC using the integrated optional Claude social check: **20 candidates, 3 approved, 17 excluded**. All three stories had validated enhanced explanations. The Reddit Actor (`BKtPGveP0qoMSRWZQ`, dataset `ub4O21GYOf2T7Ld3d`) returned nine recent posts; four specific topic matches survived both filters. This confirms optional relevance works inside the full pipeline budget. A subsequent client-only fix makes direct `/demo` → live switching fetch the existing `/api/today` result instead of relying solely on that tab's previously loaded edition.

The current live glossary may not produce a connected crossword with three usable words; in that case no puzzle is forced. The archived five-word crossword is always available for the judge walkthrough. No invented clues or unrelated live puzzle are substituted.

## Demo-ready process left running

Final build run `2083c7de-df1a-47a2-a808-cd3a1ab0da13` completed at **21:59:47 UTC** in approximately 119 seconds: **20 candidates, 4 approved, 16 excluded**, all four with validated explanations/narration. News Actor `KZGJGBqJE5bnrLbn6`, dataset `tPc7Dcgs05Liu0WbV`; social Actor `pMpDFHuTIiBsCcspy`, dataset `ifoYdmHYO0o8J3Ecw`. Twelve recent public posts yielded three specific, quote-validated social links. This edition also forms a validated four-word crossword. Browser verification confirmed direct `/demo` → live switching loads that existing edition. The production process was left running on port 3000; the current live edition is retained until it restarts.

The final live story's Cartesia clip was also generated through the browser Play button and observed playing for over 30 seconds (41.639-second duration). It was paused and reset near the beginning for the demo. Live/demo switching was rechecked on the final production build. A scan of source files and client JavaScript bundles found no configured API secret values.
