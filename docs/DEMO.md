# 60–90-second judge walkthrough

1. **0–10s:** Open US in live mode. “US gives you a finite edition, not an endless feed.” Click **Run today's edition**. Explain that Apify retrieves real article text and the configured editor evaluates only that evidence. The default is Anthropic Claude; the UI identifies the configured editor.
2. **10–25s:** Expand **Generation progress**. Point to the Actor/dataset IDs and retrieval/evidence stages. Generation may take longer than this walkthrough: start a live run before judging, then show its completed audit. Never pretend the fixed demo is a current live run.
3. **25–45s:** Read a headline, summary, relevance and one proportional action. Expand **Sources and evidence**. Show the original publication date, passage, and confidence limitation: evidence-supported does not mean independently fact-checked.
4. **45–60s:** Open **Exclusions & audit**. Explain an insufficient-evidence exclusion and an editorial exclusion. Return to the reader; your place is preserved.
5. **60–75s:** Swipe or use Next through the finite edition. Reach **You're caught up**. There are no recommended stories or automatic next feed. Review is optional; closing the app is encouraged.
6. **75–90s:** Show **Open fixed demo** (after a live run has completed or failed), or open `/demo` directly. Point out its fixed-date banner. Explain that this same dated snapshot works offline after the production shell has been downloaded.

A missing key, quota error, retrieval failure, incomplete response, or fewer than three supported stories must remain a visible failure. The presenter explicitly chooses demo mode; the app never silently labels archived stories as fresh.
