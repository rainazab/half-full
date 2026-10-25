# half full · News Receipts

A reusable Apify Actor that turns a news URL, headline, claim, or automatic discovery query into **an evidence packet for editorial review**.

## What it does

1. Runs up to three topic searches through the official `apify/rag-web-browser` Actor.
2. Follows up to four original-document links found in retrieved reporting. If a direct link is missing, searches for original material on government, university, research and relevant official sites.
3. Retrieves those sources through Apify, preserving exact text, deterministic passage IDs, SHA-256 content hashes, source URLs, and child Actor run/dataset/item provenance.
4. Outputs one `us-receipts/1` packet per discovered article. Failed leads are reported as limitations. Duplicate articles remain auditable by the consumer.

This Actor does not decide truth. A government domain is not proof; a primary-source candidate can be irrelevant or conflicting. half full passes these packets to Claude for claim-specific evidence review. Social listening runs separately after editorial selection and never increases verification confidence.

## Input

No input: current news through three bounded topic lanes. `{"date":"2000-01-01"}` searches historical mastheads and publisher date paths; the app also supports passing the generated historical queries explicitly to an existing Actor build. The consuming editor must validate actual publication dates; retrieval alone does not establish a story’s date. Or `{"articleUrl":"https://..."}`, `{"claim":"the headline to investigate"}`, or `{"queries":["your search"],"maxResultsPerQuery":5,"investigate":true}`. Only public HTTPS direct URLs are accepted. Do not put API keys in the input. On Apify, the SDK provides `APIFY_TOKEN` server-side.

## Output

Each dataset record contains `article`, `evidenceSources`, `limitations`, and `assessment: requires-editorial-review`. Every retrieved source has `provenance: {actorId,runId,datasetId,itemIndex,retrievedAt,contentHash,relationship}` and exact `passages: [{id,text}]`. `itemIndex` is zero-based. The hash covers the bounded retrieved text, before editorial rewriting.

## Budgets / limits

Up to 24 discovery results and eight evidence search results; three discovery calls and four investigation calls at most. Discovery and investigation have separate bounded stages; total retrieval budget 135 seconds. Failed child runs are aborted. HTTP/page failures and missing publication dates remain visible to the consumer. PDF text works only if the upstream Actor actually extracts it; no page references are invented. Images retain source metadata; extraction does not establish reuse rights.

## Run / deploy

Node 22+. `cd actors/news-receipts && npm install && npm start` runs the Actor locally using Apify SDK input/storage conventions (`APIFY_TOKEN` required for child Actors). `apify run` also works with the Apify CLI. `apify push` uploads the package to your own account; set the app’s `APIFY_RECEIPTS_ACTOR_ID=your-name/us-news-receipts` after building. Publishing to the public Actor Store is a separate owner action.

half full also imports the exact same retrieval engine server-side when no custom Actor ID is configured. `APIFY_RECEIPTS_ENABLED=false` restores the original single-Actor discovery path. No Claude or Cartesia credentials are needed by this reusable Actor.
