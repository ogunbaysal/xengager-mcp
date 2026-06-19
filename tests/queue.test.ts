import { describe, test, expect } from "bun:test";
import { PageQueue } from "../src/queue.js";

describe("PageQueue", () => {
  test("runs a single task immediately", async () => {
    const q = new PageQueue();
    const result = await q.run(async () => 42);
    expect(result).toBe(42);
  });

  test("executes tasks in FIFO order", async () => {
    const q = new PageQueue();
    const order: number[] = [];

    // Fire 3 tasks concurrently; each appends its index on completion
    await Promise.all([
      q.run(async () => { await delay(30); order.push(1); }),
      q.run(async () => { await delay(10); order.push(2); }),
      q.run(async () => { await delay(5);  order.push(3); }),
    ]);

    expect(order).toEqual([1, 2, 3]);
  });

  test("never runs two tasks simultaneously", async () => {
    const q = new PageQueue();
    let active = 0;
    let maxActive = 0;

    const task = async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(10);
      active--;
    };

    await Promise.all([q.run(task), q.run(task), q.run(task)]);
    expect(maxActive).toBe(1);
  });

  test("propagates errors without blocking the queue", async () => {
    const q = new PageQueue();
    let errorCaught = false;
    let secondRan = false;

    await Promise.allSettled([
      q.run(async () => { throw new Error("boom"); }).catch(() => { errorCaught = true; }),
      q.run(async () => { secondRan = true; }),
    ]);

    expect(errorCaught).toBe(true);
    expect(secondRan).toBe(true);
  });

  test("two independent queues run concurrently", async () => {
    const read = new PageQueue();
    const write = new PageQueue();
    const log: string[] = [];

    await Promise.all([
      read.run(async () => { await delay(20); log.push("read"); }),
      write.run(async () => { await delay(10); log.push("write"); }),
    ]);

    // write finishes first because it has a shorter delay and runs in parallel
    expect(log).toEqual(["write", "read"]);
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
