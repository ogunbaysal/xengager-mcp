import { test, expect, describe } from "bun:test";
import { paginateItems } from "../src/paginate.js";

describe("paginateItems", () => {
  const items = [
    { id: "1", val: "a" },
    { id: "2", val: "b" },
    { id: "3", val: "c" },
    { id: "4", val: "d" },
    { id: "5", val: "e" },
  ];

  test("first page with no cursor", () => {
    const result = paginateItems(items, undefined, 2);
    expect(result.items).toEqual([{ id: "1", val: "a" }, { id: "2", val: "b" }]);
    expect(result.nextCursor).toBe("2");
    expect(result.hasMore).toBe(true);
  });

  test("second page with cursor", () => {
    const result = paginateItems(items, "2", 2);
    expect(result.items).toEqual([{ id: "3", val: "c" }, { id: "4", val: "d" }]);
    expect(result.nextCursor).toBe("4");
    expect(result.hasMore).toBe(true);
  });

  test("last page returns null nextCursor", () => {
    const result = paginateItems(items, "4", 2);
    expect(result.items).toEqual([{ id: "5", val: "e" }]);
    expect(result.nextCursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  test("limit larger than items returns all", () => {
    const result = paginateItems(items, undefined, 10);
    expect(result.items).toHaveLength(5);
    expect(result.nextCursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  test("unknown cursor returns from beginning", () => {
    const result = paginateItems(items, "999", 2);
    expect(result.items).toEqual([{ id: "1", val: "a" }, { id: "2", val: "b" }]);
  });

  test("empty items returns empty result", () => {
    const result = paginateItems([], undefined, 10);
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });
});
