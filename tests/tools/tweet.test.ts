import { test, expect } from "bun:test";
import { registerTweetTools } from "../../src/tools/tweet.js";

test("registerTweetTools is a function", () => {
  expect(typeof registerTweetTools).toBe("function");
});
