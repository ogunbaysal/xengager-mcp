import { test, expect, describe } from "bun:test";
import { randSleep } from "../src/browser.js";

describe("randSleep", () => {
  test("resolves within expected range", async () => {
    const start = Date.now();
    await randSleep(50, 100);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(50);
    expect(elapsed).toBeLessThan(500); // generous upper bound for CI
  });

  test("min === max resolves close to min", async () => {
    const start = Date.now();
    await randSleep(50, 50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });
});
