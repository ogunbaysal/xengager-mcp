import { test, expect } from "bun:test";
import { registerProfileTools } from "../../src/tools/profile.js";

test("registerProfileTools is a function", () => {
  expect(typeof registerProfileTools).toBe("function");
});
