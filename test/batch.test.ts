import { runInBatches } from "../src/shared/batch";

describe("runInBatches", () => {
  it("returns an empty array when given an empty list", async () => {
    const results = await runInBatches([], 3, async (x) => x);
    expect(results).toEqual([]);
  });

  it("processes all items and preserves input order", async () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const results = await runInBatches(items, 3, async (x) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return x * 2;
    });

    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  });

  it("never exceeds the maximum concurrency limit", async () => {
    const items = [1, 2, 3, 4, 5, 6];
    let activeWorkers = 0;
    let maxObservedActive = 0;

    await runInBatches(items, 2, async (x) => {
      activeWorkers++;
      maxObservedActive = Math.max(maxObservedActive, activeWorkers);
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeWorkers--;
      return x;
    });

    expect(maxObservedActive).toBeLessThanOrEqual(2);
  });

  it("propagates errors immediately if a task fails", async () => {
    const items = [1, 2, 3];
    await expect(
      runInBatches(items, 2, async (x) => {
        if (x === 2) {
          throw new Error("Task failed");
        }
        return x;
      }),
    ).rejects.toThrow("Task failed");
  });
});
