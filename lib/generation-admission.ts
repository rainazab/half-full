import { z } from "zod";
import { PipelineError } from "./errors";
import { editionDay } from "./daily";
export const GENERATION_DEFAULTS = {
  daily: 60,
  historical: 40,
  perDate: 6,
  cooldownMs: 120000,
};
export function generationLimits(
  env: Record<string, string | undefined> = process.env,
) {
  const integer = (key: string, fallback: number, maximum: number) => {
    if (env[key] === undefined) return fallback;
    const raw = env[key]!,
      value = Number(raw);
    if (
      !/^\d+$/.test(raw) ||
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > maximum
    )
      throw new PipelineError(
        "GENERATION_CONFIG_INVALID",
        `${key} must be an integer from 1 to ${maximum}.`,
        503,
      );
    return value;
  };
  return {
    daily: integer("GENERATION_DAILY_LIMIT", 60, 1000),
    historical: integer("GENERATION_HISTORICAL_LIMIT", 40, 1000),
    perDate: integer("GENERATION_PER_DATE_LIMIT", 6, 1000),
    cooldownMs: integer("GENERATION_COOLDOWN_SECONDS", 120, 86400) * 1000,
  };
}
// Retain all old reservations, including ledgers written with higher limits.
// Invalid records fail closed; they never become an empty budget.
export const ledgerSchema = z.object({
  day: z.string(),
  attempts: z.array(
    z.object({ date: z.string(), at: z.number().finite().nonnegative() }),
  ),
});
export type GenerationLedger = z.infer<typeof ledgerSchema>;
export function nextPacificReset(now: number) {
  const day = editionDay(new Date(now));
  let low = Math.floor(now / 1000),
    high = low + 36 * 3600;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (editionDay(new Date(mid * 1000)) === day) low = mid;
    else high = mid;
  }
  return high * 1000;
}
export function admitGeneration(
  previous: unknown,
  date: string,
  today: string,
  now = Date.now(),
  limits = generationLimits(),
): GenerationLedger {
  const parsed =
    previous == null
      ? { day: today, attempts: [] }
      : ledgerSchema.parse(previous);
  const ledger = parsed.day === today ? parsed : { day: today, attempts: [] };
  const same = ledger.attempts.filter((a) => a.date === date);
  const last = same.reduce((max, a) => Math.max(max, a.at), -Infinity);
  const fail = (code: string, message: string, retry: number): never => {
    throw new PipelineError(code, message, 429, new Date(retry).toISOString());
  };
  if (same.length >= limits.perDate)
    fail(
      "DATE_BUDGET_REACHED",
      "This date has reached today’s generation limit. Saved editions are still available.",
      nextPacificReset(now),
    );
  if (
    ledger.attempts.length >= limits.daily ||
    (date !== today &&
      ledger.attempts.filter((a) => a.date !== today).length >=
        limits.historical)
  )
    fail(
      "GENERATION_BUDGET_REACHED",
      "New editions have reached today’s generation limit. Saved editions are still available.",
      nextPacificReset(now),
    );
  if (now - last < limits.cooldownMs)
    fail(
      "GENERATION_COOLDOWN",
      `This date was tried recently. Retry in ${Math.ceil((last + limits.cooldownMs - now) / 1000)} seconds.`,
      last + limits.cooldownMs,
    );
  return { day: today, attempts: [...ledger.attempts, { date, at: now }] };
}
