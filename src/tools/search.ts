import { z } from "zod";
import type { ZodRawShape } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { client, safeJson } from "./graphql-adapter.js";

export function parseCount(label: string | null | undefined): number {
  if (!label) return 0;
  const match = label.match(/^([\d.]+)([KkMm]?)/);
  if (!match) return 0;
  const num = parseFloat(match[1]!);
  const suffix = match[2]!.toUpperCase();
  if (suffix === "K") return Math.round(num * 1_000);
  if (suffix === "M") return Math.round(num * 1_000_000);
  return Math.round(num);
}

function searchProduct(tab: "top" | "latest" | "media"): "Top" | "Latest" | "Photos" {
  if (tab === "latest") return "Latest";
  if (tab === "media") return "Photos";
  return "Top";
}

const searchSchema: ZodRawShape = {
  query: z.string().describe("Search query with optional X advanced operators"),
  tab: z.enum(["top", "latest", "media"] as const).default("top").describe("Search tab"),
  limit: z.number().int().min(1).max(100).default(20).describe("Max results"),
  cursor: z.string().optional().describe("Unused; GraphQL search pagination is not currently cursor-backed"),
};

export function registerSearchTools(server: McpServer): void {
  server.registerTool(
    "x_search",
    {
      title: "X Search",
      description:
        "Search X (Twitter) for tweets matching a query via GraphQL. Supports advanced operators: from:, to:, since:, until:, lang:, min_likes:, min_retweets:, has:media, filter:links",
      inputSchema: searchSchema as any,
    },
    async ({ query, tab, limit }: { query: string; tab: "top" | "latest" | "media"; limit: number; cursor?: string }) =>
      safeJson(() => client().fetchSearch(query, limit, searchProduct(tab)))
  );
}
