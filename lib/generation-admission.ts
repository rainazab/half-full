import { z } from "zod";
import { PipelineError } from "./errors";
export const ledgerSchema = z.object({
  day: z.string(),
  attempts: z.array(z.object({ date: z.string(), at: z.number() })).max(100),
});
export type GenerationLedger = z.infer<typeof ledgerSchema>;
export function admitGeneration(
  previous: unknown,
  date: string,
  today: string,
  now = Date.now(),
  limits = { daily: 12, historical: 8, perDate: 3, cooldownMs: 10 * 60000 },
): GenerationLedger {
  const parsed =
    previous == null
      ? { day: today, attempts: [] }
      : ledgerSchema.parse(previous);
  const ledger = parsed.day === today ? parsed : { day: today, attempts: [] };
  const same = ledger.attempts.filter((a) => a.date === date),
    last = same.at(-1);
  if (last && now - last.at < limits.cooldownMs)
    throw new PipelineError(
      "GENERATION_COOLDOWN",
      "This date was tried recently. Please wait ten minutes before trying it again.",
      429,
    );
  if (same.length >= limits.perDate)
    throw new PipelineError(
      "DATE_BUDGET_REACHED",
      "This date has reached its generation limit for today. Try a saved edition or return tomorrow.",
      429,
    );
  if (
    ledger.attempts.length >= limits.daily ||
    (date !== today &&
      ledger.attempts.filter((a) => a.date !== today).length >=
        limits.historical)
  )
    throw new PipelineError(
      "GENERATION_BUDGET_REACHED",
      "New editions have reached today’s generation limit. Saved editions are still available.",
      429,
    );
  return { day: today, attempts: [...ledger.attempts, { date, at: now }] };
}
