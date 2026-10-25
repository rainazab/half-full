import { createHash } from "node:crypto";
const API = "https://api.apify.com/v2";
const terminal = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);
export const NEWS_ACTOR = "apify~rag-web-browser";
const obj = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
export function publicUrl(value) {
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      !u.hostname.includes(".") ||
      /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.|\[)/.test(
        u.hostname,
      ) ||
      /\.(local|internal|localhost)$/.test(u.hostname)
    )
      return null;
    u.hash = "";
    return u.href;
  } catch {
    return null;
  }
}
export function originalLinks(item) {
  const text = String(item.markdown ?? item.text ?? ""),
    links = [];
  for (const match of text.matchAll(
    /\[([^\]]{1,180})\]\((https:\/\/[^\s)]+)\)/g,
  )) {
    const url = publicUrl(match[2]);
    if (!url) continue;
    const host = new URL(url).hostname;
    // Domain allowlist identifies candidates for investigation, NOT an automatic primary-evidence verdict.
    if (
      !/(?:\.gov(?:\.[a-z]{2})?$|\.edu$|(?:^|\.)(?:europa\.eu|who\.int|un\.org|nature\.com|science\.org|nejm\.org|thelancet\.com|arxiv\.org|doi\.org|php\.net|github\.com|clinicaltrials\.gov|ons\.gov\.uk|bankofengland\.co\.uk)$)/i.test(
        host,
      )
    )
      continue;
    if (
      new URL(url).pathname.length < 3 ||
      /(?:login|sign.?up|privacy|terms|contact|cookies)/i.test(url)
    )
      continue;
    if (!links.some((x) => x.url === url)) links.push({ title: match[1], url });
  }
  return links.slice(0, 4);
}
export function extractPassages(text) {
  const chunks = [];
  let current = "";
  for (const part of text
    .split(/\n\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean)) {
    if (current && current.length + part.length + 2 > 1400) {
      chunks.push(current);
      current = "";
    }
    if (part.length > 1400) {
      for (let offset = 0; offset < part.length; offset += 1400)
        chunks.push(part.slice(offset, offset + 1400));
    } else current = current ? `${current}\n\n${part}` : part;
  }
  if (current) chunks.push(current);
  return chunks.map((text, i) => ({ id: `p${i + 1}`, text }));
}
export function annotate(item, run, index, relationship = "discovery") {
  const search = obj(item.searchResult),
    metadata = obj(item.metadata),
    text = String(item.markdown ?? item.text ?? item.content ?? "").slice(
      0,
      18000,
    );
  return {
    ...item,
    title: item.title ?? metadata.title ?? search.title,
    url: item.url ?? metadata.url ?? search.url,
    text,
    provenance: {
      actorId: run.actorId ?? NEWS_ACTOR,
      runId: run.id,
      datasetId: run.defaultDatasetId,
      itemIndex: index,
      retrievedAt: new Date().toISOString(),
      contentHash: createHash("sha256").update(text).digest("hex"),
      relationship,
    },
    passages: extractPassages(text),
  };
}
export function defaultQueries(now = new Date()) {
  const after = new Date(now.getTime() - 5 * 86400000)
      .toISOString()
      .slice(0, 10),
    year = now.getUTCFullYear();
  return [
    `(site:bbc.com/news/articles/ OR site:npr.org/${year}/) after:${after} (science OR accessibility OR education OR community OR discovery)`,
    `(site:bbc.com/news/articles/ OR site:theguardian.com) after:${after} (conservation OR clean energy OR innovation OR health research OR culture)`,
    `(site:bbc.com/news/articles/ OR site:theguardian.com/world OR site:npr.org/${year}/) after:${after} (major news OR policy OR economy OR world)`,
  ];
}
/** Exact-day search lanes support old publisher URL structures, including BBC's pre-2008 site. */
export function historicalQueries(day) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    Number.isNaN(Date.parse(day)) ||
    new Date(day).toISOString().slice(0, 10) !== day
  )
    throw Error("Use a valid edition date.");
  const date = new Date(`${day}T12:00:00Z`);
  const dayNumber = date.getUTCDate();
  const month = date.toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  const shortMonth = month.slice(0, 3).toLowerCase();
  const year = date.getUTCFullYear();
  if (year >= 2010) {
    const previous = new Date(date.getTime() - 86400000)
      .toISOString()
      .slice(0, 10);
    const next = new Date(date.getTime() + 86400000).toISOString().slice(0, 10);
    const range = `after:${previous} before:${next}`;
    return [
      `(site:bbc.com/news/articles/ OR site:bbc.co.uk/news/articles/ OR site:npr.org/${year}/) ${range} (science OR health OR education OR community)`,
      `site:theguardian.com inurl:${year}/${shortMonth}/${day.slice(8)} ${range} (science OR environment OR innovation OR education OR culture) -inurl:all -inurl:live`,
      `(site:bbc.com/news/articles/ OR site:theguardian.com/world OR site:npr.org/${year}/) ${range} (news OR policy OR economy) -inurl:all -inurl:live`,
    ];
  }
  // Old pages are often re-indexed today. Search their printed mastheads/canonical
  // paths, then let the consumer check actual publication dates rather than crawl dates.
  return [
    `(site:news.bbc.co.uk/2/hi/ OR site:bbc.com/news OR site:bbc.co.uk/news) "${dayNumber} ${month}" "${year}" -inurl:static`,
    `site:theguardian.com inurl:${year}/${shortMonth}/${day.slice(8)} news`,
    `(site:cnn.com/${year}/ OR site:npr.org/${year}/) "${month} ${dayNumber}, ${year}"`,
  ];
}
/** Official REST calls are bounded independently and by the entire retrieval budget. */
export function actorRunner(token, log = () => {}, fetcher = fetch) {
  return async (actorId, input, budgetMs = 70000) => {
    const deadline = Date.now() + budgetMs;
    let run;
    async function api(path, init = {}) {
      const ms = deadline - Date.now();
      if (ms <= 0) throw Error("Actor retrieval deadline reached");
      const r = await fetcher(`${API}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(Math.max(1, Math.min(14000, ms))),
        cache: "no-store",
      });
      if (!r.ok) {
        let code = "";
        try {
          const body = await r.json();
          if (/^[a-z0-9-]{1,80}$/.test(body.error?.type ?? ""))
            code = ` (${body.error.type})`;
        } catch {}
        throw Error(`Apify returned HTTP ${r.status}${code}`);
      }
      return r.json();
    }
    try {
      run = (
        await api(
          `/actors/${encodeURIComponent(actorId)}/runs?memory=1024&timeout=${Math.max(10, Math.floor(budgetMs / 1000) - 5)}`,
          { method: "POST", body: JSON.stringify(input) },
        )
      ).data;
      if (!run?.id || !run.defaultDatasetId)
        throw Error("Actor did not return run and dataset IDs");
      log(
        "apify.child",
        "completed",
        `Actor ${actorId}; run ${run.id}; dataset ${run.defaultDatasetId}.`,
      );
      while (!terminal.has(run.status)) {
        run = (await api(`/actor-runs/${run.id}?waitForFinish=10`)).data;
      }
      if (run.status !== "SUCCEEDED") throw Error(`Actor ended ${run.status}`);
      const items = await api(
        `/datasets/${run.defaultDatasetId}/items?format=json&clean=true&limit=40`,
      );
      if (!Array.isArray(items))
        throw Error("Actor returned a malformed dataset");
      return { run: { ...run, actorId }, items };
    } catch (error) {
      if (run?.id && !terminal.has(run.status))
        await fetcher(`${API}/actor-runs/${run.id}/abort`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(2500),
        }).catch(() => undefined);
      // Never forward provider bodies, which can contain credentials or quoted page instructions.
      throw Error(
        error instanceof Error && /^(Actor|Apify)/.test(error.message)
          ? error.message
          : "Actor request failed or timed out",
      );
    }
  };
}
/** Reusable retrieval engine: a packet is evidence for editorial review, never a truth verdict. */
export async function gatherReceipts(input = {}, runActor, log = () => {}) {
  const deadline =
    Date.now() +
    Math.min(135000, Math.max(20000, Number(input.budgetMs) || 135000));
  const queries = (
    Array.isArray(input.queries) && input.queries.length
      ? input.queries
      : input.articleUrl
        ? [publicUrl(input.articleUrl)]
        : input.claim
          ? [String(input.claim).slice(0, 400)]
          : input.date
            ? historicalQueries(input.date)
            : defaultQueries()
  )
    .filter((q) => typeof q === "string" && q.trim())
    .slice(0, 3);
  if (!queries.length)
    throw Error(
      "Provide a public HTTPS article URL, a claim, or search queries.",
    );
  const perQuery = Math.max(
    3,
    Math.min(10, Number(input.maxResultsPerQuery) || 8),
  );
  log(
    "discovery",
    "started",
    `Searching ${queries.length} bounded news lanes through Apify.`,
  );
  const discoveries = await Promise.allSettled(
    queries.map((query) =>
      runActor(
        NEWS_ACTOR,
        {
          query,
          maxResults: perQuery,
          outputFormats: ["markdown"],
          requestTimeoutSecs: 55,
          scrapingTool: "raw-http",
          htmlTransformer: "readableText",
        },
        Math.min(75000, deadline - Date.now() - 20000),
      ),
    ),
  );
  const articles = [],
    failures = [];
  for (const d of discoveries) {
    if (d.status === "fulfilled")
      d.value.items.forEach((item, i) =>
        articles.push(annotate(item, d.value.run, i)),
      );
    else {
      const reason =
        d.reason instanceof Error && /^(Actor|Apify)/.test(d.reason.message)
          ? d.reason.message
          : "retrieval unavailable";
      failures.push(
        `A discovery lane failed: ${reason}. Other lanes were retained.`,
      );
      log("discovery.lane", "failed", reason);
    }
  }
  if (!articles.length)
    throw Error(
      "No discovery lane returned article data. Check Apify credits, Actor access and queries.",
    );
  // Keep all rejected/duplicate items for the consumer's audit, rather than silently dropping them.
  log(
    "discovery",
    "completed",
    `${articles.length} retrieved candidate records; ${failures.length} unavailable search lanes.`,
  );
  const eligible = articles.filter(
    (a) =>
      a.text.length >= 500 && !a.error && !(a.crawl?.httpStatusCode >= 400),
  );
  const targets = [];
  for (const article of eligible) {
    for (const link of originalLinks(article)) {
      if (targets.some((t) => t.url === link.url)) continue;
      targets.push({ ...link, articleUrl: article.url });
      break;
    }
    if (targets.length >= 4) break;
  }
  // Original-document searches are used only when the retrieved reporting contains too few direct links.
  for (const article of eligible) {
    if (targets.length >= 4) break;
    if (targets.some((t) => t.articleUrl === article.url)) continue;
    const title = String(article.title ?? "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .slice(0, 10)
      .join(" ");
    if (title.length > 12)
      targets.push({
        query: `${title} (site:gov OR site:edu OR site:who.int OR site:nature.com OR site:php.net)`,
        articleUrl: article.url,
      });
  }
  const investigations = [];
  if (
    input.investigate !== false &&
    targets.length &&
    deadline - Date.now() > 15000
  ) {
    log(
      "investigation",
      "started",
      `Following ${targets.length} evidence leads from the reporting. Social engagement is not evidence.`,
    );
    const results = await Promise.allSettled(
      targets.map((target) =>
        runActor(
          NEWS_ACTOR,
          {
            query: target.url ?? target.query,
            maxResults: target.url ? 1 : 2,
            outputFormats: ["markdown"],
            requestTimeoutSecs: 32,
            scrapingTool: "raw-http",
            htmlTransformer: "readableText",
          },
          Math.min(45000, deadline - Date.now() - 2500),
        ),
      ),
    );
    results.forEach((result, i) => {
      if (result.status === "fulfilled")
        result.value.items.forEach((item, j) =>
          investigations.push({
            ...annotate(
              item,
              result.value.run,
              j,
              targets[i].url ? "linked-original" : "investigation-search",
            ),
            relatedArticleUrl: targets[i].articleUrl,
          }),
        );
      else {
        const reason =
          result.reason instanceof Error &&
          /^(Actor|Apify)/.test(result.reason.message)
            ? result.reason.message
            : "retrieval unavailable";
        failures.push(
          `An original-evidence lead could not be retrieved: ${reason}. No verification credit was given.`,
        );
        log("investigation.lead", "failed", reason);
      }
    });
    log(
      "investigation",
      "completed",
      `${investigations.length} original-evidence records retrieved. Their relevance and source type still require Claude review.`,
    );
  }
  log(
    "extraction",
    "completed",
    `Preserved exact text, deterministic passages, content hashes and run/dataset/item provenance for ${articles.length + investigations.length} records.`,
  );
  return articles.map((article, index) => ({
    schemaVersion: "us-receipts/1",
    kind: "news-receipt",
    article,
    evidenceSources: investigations.filter(
      (s) => s.relatedArticleUrl === article.url,
    ),
    limitations: index === 0 ? failures : [],
    assessment: "requires-editorial-review",
  }));
}
