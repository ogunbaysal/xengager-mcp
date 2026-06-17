import { test, expect } from "bun:test";
import { registerTimelineTools } from "../../src/tools/timeline.js";

test("registerTimelineTools is a function", () => {
  expect(typeof registerTimelineTools).toBe("function");
});
