import { test, expect } from "bun:test";
import { registerBookmarksTools } from "../../src/tools/bookmarks.js";

test("registerBookmarksTools is a function", () => {
  expect(typeof registerBookmarksTools).toBe("function");
});
