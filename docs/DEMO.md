# US — two-minute CalHacks walkthrough

**Before presenting:** run `npm run build && npm start`, then generate once using the live button or `curl --max-time 295 -X POST http://localhost:3000/api/run`. Allow up to five minutes before the presentation; do not promise a full retrieval within the two-minute talk. Keep the Node process running: restarting clears editions and live audio. Prepare live narration with Play once. Open `/demo` online once to download the fixed archive and its audio. Wait for offline setup before disconnecting.

**0:00–0:20 — The idea.** “The world is a lot. The news doesn’t have to be. US gives you a finite daily edition, not an endless feed.” Open the ready live edition and point out its actual generation date and story count (three to five, depending on evidence).

**0:20–0:40 — Real providers.** Open the audit briefly: Apify retrieved articles, Claude evaluated retrieved passages, server validation retained supported stories and explained exclusions. Show actual Actor/dataset IDs. Social retrieval is a separate optional batch; social popularity never establishes truth.

**0:40–1:00 — Listen and understand.** Press Play for 10–15 seconds. “Cartesia voices a short script grounded in the same source passages.” Pause, show the quick/default explanation, and open a glossary definition. The full edition can be listened through only after choosing that option.

**1:00–1:20 — Context and receipts.** Show a relevant Reddit discussion if available, clearly labeled as public conversation rather than corroboration. Open “Show me the receipts”: original date, article link, exact passages, confidence limitations, and original advisory links where present. Image reuse rights are respected; the PHP logo is a licensed contextual illustration, not a photo of the event.

**1:20–1:45 — Finish.** Swipe or use Next through the finite edition. Reach “You’re caught up.” The app explicitly invites the reader to close it. Open the optional crossword and type a few letters; its words and clues come from that edition’s glossary.

**1:45–2:00 — Reliable fallback.** If useful, switch to `/demo`: “This is a clearly labeled archive of a real completed run, with five saved Cartesia clips.” It plays without API keys and, after caching, with the server unavailable. Never present its October 2026 stories or archived social posts as newly retrieved.

The current saved crossword includes PHP, PATCHING, PHISHING, PHYSICAL AI and TRADE SURPLUS (spaces omitted in the grid). Practice does not affect a live completion streak. Reading is complete whether or not anyone plays.

**If a provider fails:** keep the written edition; optional social/audio failures do not invalidate news. If live generation itself fails, explicitly choose “Open fixed demo.” Never conceal the archive label. On iOS, a new clip may require a direct Play tap because of browser playback policies.
