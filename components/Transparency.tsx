import type { RejectedStory, RunLogEntry } from "@/lib/types";
export function RunLog({ log }: { log: RunLogEntry[] }) {
  return log.length ? <ol className="run-log">{log.map((entry, index) => <li key={index}><time dateTime={entry.timestamp}>{new Date(entry.timestamp).toLocaleTimeString()}</time> · <strong>{entry.step.replaceAll(".", " · ").replaceAll("_", " ")}</strong> ({entry.status})<br />{entry.message}</li>)}</ol> : <p>No processing stages recorded yet.</p>;
}
export default function Transparency({ audit, log }: { audit: RejectedStory[]; log: RunLogEntry[] }) {
  return <section aria-label="Editorial transparency"><h2 id="transparency-heading" tabIndex={-1}>Excluded stories ({audit.length})</h2><p>Insufficient evidence means we could not support a claim from the retrieved material. Exclusion does not necessarily mean a claim is false. Some supported stories are left out to keep the edition finite.</p>
    {audit.map((story, index) => <article key={`${story.url}-${index}`}><h3>{story.title}</h3><p className="note">{story.verificationStatus === "uncertain" ? "Insufficient evidence" : "Excluded"} · editor confidence {Math.round(story.confidence * 100)}%</p><p>{story.reason}</p>{story.centralClaim && <details><summary>Claim reviewed</summary><p>{story.centralClaim}</p></details>}{story.url && <a href={story.url} target="_blank" rel="noopener noreferrer">Original source</a>}</article>)}
    {!audit.length && <p>No exclusions to display.</p>}<h2>Generation audit log</h2><RunLog log={log} />
  </section>;
}
