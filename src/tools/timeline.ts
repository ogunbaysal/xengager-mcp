import { z } from "zod";
import type { ZodRawShape } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { client, safeJson } from "./graphql-adapter.js";

const homeTimelineSchema: ZodRawShape = {
  limit: z.number().int().min(1).max(100).default(20).describe("Maximum number of tweets to return"),
  cursor: z.string().optional().describe("GraphQL cursor from the previous page"),
};

const followingTimelineSchema: ZodRawShape = {
  limit: z.number().int().min(1).max(100).default(20).describe("Maximum number of tweets to return"),
  cursor: z.string().optional().describe("GraphQL cursor from the previous page"),
};

export function registerTimelineTools(server: McpServer): void {
  server.registerTool(
    "x_home_timeline",
    {
      title: "X Home Timeline",
      description: "Read the For You home timeline feed on X (Twitter) via GraphQL",
      inputSchema: homeTimelineSchema as any,
    },
    async ({ limit, cursor }: { limit: number; cursor?: string }) =>
      safeJson(() => client().fetchHomeTimeline(limit, cursor))
  );

  server.registerTool(
    "x_following_timeline",
    {
      title: "X Following Timeline",
      description: "Read the Following home timeline feed on X (Twitter) via GraphQL",
      inputSchema: followingTimelineSchema as any,
    },
    async ({ limit, cursor }: { limit: number; cursor?: string }) =>
      safeJson(() => client().fetchFollowingFeed(limit, cursor))
  );
}
