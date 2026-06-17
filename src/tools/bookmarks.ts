import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { client, safeJson } from "./graphql-adapter.js";

export function registerBookmarksTools(server: McpServer): void {
  server.registerTool(
    "x_bookmarks",
    {
      title: "X Bookmarks",
      description: "Get your X (Twitter) bookmarks via GraphQL",
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Maximum number of tweets to return"),
        cursor: z.string().optional().describe("GraphQL cursor from the previous page"),
      } as any,
    },
    async ({ limit, cursor }: { limit: number; cursor?: string }) =>
      safeJson(() => client().fetchBookmarks(limit, cursor))
  );
}
