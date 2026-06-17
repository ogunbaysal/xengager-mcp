import type { PaginatedResult } from "./types.js";

export function paginateItems<T extends { id: string }>(
  items: T[],
  cursor: string | undefined,
  limit: number
): PaginatedResult<T> {
  let startIndex = 0;

  if (cursor) {
    const cursorIndex = items.findIndex((item) => item.id === cursor);
    if (cursorIndex !== -1) {
      startIndex = cursorIndex + 1;
    }
  }

  const slice = items.slice(startIndex, startIndex + limit);
  const lastItem = slice[slice.length - 1];
  const nextCursor = slice.length === limit && lastItem ? lastItem.id : null;

  return {
    items: slice,
    nextCursor,
    hasMore: nextCursor !== null,
  };
}
