import { test, expect } from "bun:test";
import { parseCount } from "../../src/tools/search.js";

test("parseCount: plain number", () => expect(parseCount("3 Likes")).toBe(3));
test("parseCount: K suffix", () => expect(parseCount("3.5K Likes")).toBe(3500));
test("parseCount: M suffix", () => expect(parseCount("1.2M Likes")).toBe(1200000));
test("parseCount: null/undefined", () => expect(parseCount(null)).toBe(0));
test("parseCount: empty", () => expect(parseCount("")).toBe(0));
