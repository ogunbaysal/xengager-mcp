import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { client, safeJson, textResponse } from "./graphql-adapter.js";

async function fetchUserId(username: string): Promise<string> {
  const user = await client().fetchUser(username);
  if (!user?.id) throw new Error(`User not found: ${username}`);
  return user.id;
}

export function registerProfileTools(server: McpServer): void {
  server.registerTool(
    "x_user_profile",
    {
      title: "X User Profile",
      description: "Fetch a full profile for an X (Twitter) user via GraphQL.",
      inputSchema: {
        username: z.string().describe("X username (without @)"),
      } as any,
    },
    async ({ username }: { username: string }) => safeJson(() => client().fetchUser(username))
  );

  server.registerTool(
    "x_user_posts",
    {
      title: "X User Posts",
      description: "Fetch tweets posted by a specific X (Twitter) user via GraphQL.",
      inputSchema: {
        username: z.string().describe("X username (without @)"),
        limit: z.number().int().min(1).max(100).default(20).describe("Max tweets to return"),
        cursor: z.string().optional().describe("Unused; user timeline GraphQL pagination is not currently cursor-backed"),
      } as any,
    },
    async ({ username, limit, cursor }: { username: string; limit: number; cursor?: string }) =>
      safeJson(async () => client().fetchUserTweets(await fetchUserId(username), limit, cursor))
  );

  server.registerTool(
    "x_user_following",
    {
      title: "X User Following",
      description: "Fetch users that a specific X (Twitter) user follows via GraphQL.",
      inputSchema: {
        username: z.string().describe("X username (without @)"),
        limit: z.number().int().min(1).max(200).default(20).describe("Number of users to return per page"),
        cursor: z.string().optional().describe("GraphQL cursor from the previous page"),
      } as any,
    },
    async ({ username, limit, cursor }: { username: string; limit: number; cursor?: string }) =>
      safeJson(async () => client().fetchFollowing(await fetchUserId(username), limit, cursor))
  );

  server.registerTool(
    "x_user_followers",
    {
      title: "X User Followers",
      description: "Fetch users that follow a specific X (Twitter) user via GraphQL.",
      inputSchema: {
        username: z.string().describe("X username (without @)"),
        limit: z.number().int().min(1).max(200).default(20).describe("Number of users to return per page"),
        cursor: z.string().optional().describe("GraphQL cursor from the previous page"),
      } as any,
    },
    async ({ username, limit, cursor }: { username: string; limit: number; cursor?: string }) =>
      safeJson(async () => client().fetchFollowers(await fetchUserId(username), limit, cursor))
  );

  server.registerTool(
    "x_user_likes",
    {
      title: "X User Likes",
      description: "Fetch tweets liked by a specific X (Twitter) user via GraphQL.",
      inputSchema: {
        username: z.string().describe("X username (without @)"),
        limit: z.number().int().min(1).max(100).default(20).describe("Max tweets to return"),
        cursor: z.string().optional().describe("Unused; user likes GraphQL pagination is not currently cursor-backed"),
      } as any,
    },
    async ({ username, limit, cursor }: { username: string; limit: number; cursor?: string }) =>
      safeJson(async () => client().fetchUserLikes(await fetchUserId(username), limit, cursor))
  );

  server.registerTool(
    "x_follow",
    {
      title: "Follow User on X",
      description: "Follow an X (Twitter) user by username via REST API.",
      inputSchema: {
        username: z.string().describe("X username (without @)"),
      } as any,
    },
    async ({ username }: { username: string }) =>
      safeJson(async () => { const r = await client().followUser(username); return textResponse({ ...r, message: r.success ? `Followed @${username}` : `Failed to follow @${username}` }); })
  );

  server.registerTool(
    "x_unfollow",
    {
      title: "Unfollow User on X",
      description: "Unfollow an X (Twitter) user by username via REST API.",
      inputSchema: {
        username: z.string().describe("X username (without @)"),
      } as any,
    },
    async ({ username }: { username: string }) =>
      safeJson(async () => { const r = await client().unfollowUser(username); return textResponse({ ...r, message: r.success ? `Unfollowed @${username}` : `Failed to unfollow @${username}` }); })
  );
}
