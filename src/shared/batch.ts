/**
 * Executes an asynchronous task over a list of items with a fixed concurrency limit.
 *
 * Preserves the original item order in the returned results.
 */
export async function runInBatches<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const effectiveConcurrency = Math.max(1, Math.min(concurrency, items.length));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await task(items[currentIndex]);
    }
  }

  const workers = Array.from({ length: effectiveConcurrency }, () => worker());
  await Promise.all(workers);

  return results;
}
