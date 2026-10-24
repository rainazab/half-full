/** One bounded retry for transient reads/provider errors, never for Actor creation. */
export async function boundedRetry<T>(operation: (remainingMs: number) => Promise<T>, options: {
  budgetMs: number; retryable: (error: unknown) => boolean; onRetry?: () => void;
  now?: () => number; sleep?: (ms: number) => Promise<void>;
}) {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + options.budgetMs;
  try { return await operation(Math.max(1, deadline - now())); }
  catch (error) {
    if (!options.retryable(error) || deadline - now() < 1500) throw error;
    options.onRetry?.();
    await sleep(500);
    if (deadline <= now()) throw error;
    return operation(deadline - now());
  }
}
