// src/library/concurrency.js — NEW
/**
 * Runs `fn` over `items` with at most `limit` in flight at once. Kept
 * hand-rolled rather than pulling in a dependency — it's ~10 lines and the
 * only thing Motif needs from it. `fn` is expected to handle its own
 * errors; a throw here aborts the whole pool rather than just that item
 * (see scanner.js's per-item try/catch, which is what actually protects
 * against one bad file stopping the rest of the scan).
 */
export async function mapWithConcurrency(items, limit, fn) {
  if (!items.length) return;
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      await fn(items[current], current);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}
