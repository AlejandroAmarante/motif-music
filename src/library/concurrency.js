/**
 * Runs fn over items with at most `limit` calls in flight at once.
 *
 * This is intentionally kept small. The metadata worker pool has its own
 * internal concurrency, so this helper is only responsible for preventing the
 * scanner from creating an unbounded number of pending parse requests.
 *
 * `fn` is expected to handle item-level errors itself. A thrown error from fn
 * will reject the overall map operation.
 */
export async function mapWithConcurrency(items, limit, fn) {
  if (!items.length) {
    return;
  }

  if (!Number.isFinite(limit) || limit < 1) {
    throw new Error(
      `mapWithConcurrency: limit must be >= 1, received ${limit}`,
    );
  }

  let nextIndex = 0;

  async function worker() {
    while (true) {
      const current = nextIndex;

      if (current >= items.length) {
        return;
      }

      nextIndex += 1;

      await fn(items[current], current);
    }
  }

  const workerCount = Math.min(Math.floor(limit), items.length);

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}
