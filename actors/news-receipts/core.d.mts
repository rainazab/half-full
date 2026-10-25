export function publicUrl(value: unknown): string | null;
export function originalLinks(
  item: Record<string, unknown>,
): { title: string; url: string }[];
export function extractPassages(text: string): { id: string; text: string }[];
export function historicalQueries(day: string): string[];
export function defaultQueries(now?: Date): string[];
export function annotate(
  item: Record<string, unknown>,
  run: Record<string, unknown>,
  index: number,
  relationship?: string,
): Record<string, unknown>;
export type ActorRunner = (
  actorId: string,
  input: Record<string, unknown>,
  budgetMs?: number,
) => Promise<{
  run: Record<string, unknown>;
  items: Record<string, unknown>[];
}>;
export type ReceiptLog = (
  step: string,
  status: "started" | "completed" | "failed",
  message: string,
) => void;
export function actorRunner(
  token: string,
  log?: ReceiptLog,
  fetcher?: typeof fetch,
): ActorRunner;
export function gatherReceipts(
  input: Record<string, unknown>,
  run: ActorRunner,
  log?: ReceiptLog,
): Promise<
  {
    schemaVersion: string;
    kind: string;
    article: Record<string, unknown>;
    evidenceSources: Record<string, unknown>[];
    limitations: string[];
    assessment: string;
  }[]
>;
