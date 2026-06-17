import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { actionResponse, client, extractTweetId, safeJson } from "./graphql-adapter.js";

async function requireTweetId(input: string): Promise<string> {
  const id = extractTweetId(input);
  if (!id) throw new Error(`Could not extract tweet ID from: ${input}`);
  return id;
}

export function registerTweetTools(server: McpServer): void {
  server.registerTool(
    "x_get_tweet",
    {
      title: "Get Tweet",
      description: "Fetch a single tweet by URL or tweet ID via GraphQL.",
      inputSchema: {
        url: z.string().describe("Tweet URL or numeric tweet ID"),
      } as any,
    },
    async ({ url }: { url: string }) =>
      safeJson(async () => {
        const tweetId = await requireTweetId(url);
        const gql = client();
        const tweet = await gql.fetchTweetById(tweetId);
        if (!tweet) return { error: "Tweet not found" };

        const detail = await gql.fetchTweetDetail(tweetId, 10);
        const replies = {
          items: detail.items.filter((item) => item.id !== tweetId),
          nextCursor: detail.nextCursor,
        };

        const firstReply = replies.items[0];
        return {
          ...tweet,
          isThread: Boolean(firstReply && firstReply.author.id === tweet.author.id),
          replies,
        };
      })
  );

  server.registerTool(
    "x_tweet_replies",
    {
      title: "Get Tweet Replies",
      description: "Fetch replies/conversation tweets for a tweet via GraphQL TweetDetail.",
      inputSchema: {
        url: z.string().describe("Tweet URL or numeric tweet ID"),
        limit: z.number().int().min(1).max(100).default(20).describe("Maximum number of replies to return"),
        cursor: z.string().optional().describe("GraphQL cursor from the previous page"),
      } as any,
    },
    async ({ url, limit, cursor }: { url: string; limit: number; cursor?: string }) =>
      safeJson(async () => {
        const tweetId = await requireTweetId(url);
        const result = await client().fetchTweetDetail(tweetId, limit, cursor);
        return {
          items: result.items.filter((tweet) => tweet.id !== tweetId),
          nextCursor: result.nextCursor,
        };
      })
  );

  server.registerTool(
    "x_like",
    {
      title: "Like Tweet",
      description: "Like a tweet by URL or ID via GraphQL.",
      inputSchema: { url: z.string().describe("Tweet URL or numeric tweet ID") } as any,
    },
    async ({ url }: { url: string }) =>
      safeJson(async () => actionResponse("Like tweet", await client().likeTweet(await requireTweetId(url))))
  );

  server.registerTool(
    "x_unlike",
    {
      title: "Unlike Tweet",
      description: "Remove a like from a tweet by URL or ID via GraphQL.",
      inputSchema: { url: z.string().describe("Tweet URL or numeric tweet ID") } as any,
    },
    async ({ url }: { url: string }) =>
      safeJson(async () => actionResponse("Unlike tweet", await client().unlikeTweet(await requireTweetId(url))))
  );

  server.registerTool(
    "x_repost",
    {
      title: "Repost Tweet",
      description: "Repost a tweet by URL or ID via GraphQL.",
      inputSchema: { url: z.string().describe("Tweet URL or numeric tweet ID") } as any,
    },
    async ({ url }: { url: string }) =>
      safeJson(async () => actionResponse("Repost tweet", await client().retweetTweet(await requireTweetId(url))))
  );

  server.registerTool(
    "x_unrepost",
    {
      title: "Unrepost Tweet",
      description: "Undo a repost by URL or ID via GraphQL.",
      inputSchema: { url: z.string().describe("Tweet URL or numeric tweet ID") } as any,
    },
    async ({ url }: { url: string }) =>
      safeJson(async () => actionResponse("Unrepost tweet", await client().unretweetTweet(await requireTweetId(url))))
  );

  server.registerTool(
    "x_bookmark",
    {
      title: "Bookmark Tweet",
      description: "Bookmark a tweet by URL or ID via GraphQL.",
      inputSchema: { url: z.string().describe("Tweet URL or numeric tweet ID") } as any,
    },
    async ({ url }: { url: string }) =>
      safeJson(async () => actionResponse("Bookmark tweet", await client().bookmarkTweet(await requireTweetId(url))))
  );

  server.registerTool(
    "x_unbookmark",
    {
      title: "Remove Bookmark",
      description: "Remove a bookmark from a tweet by URL or ID via GraphQL.",
      inputSchema: { url: z.string().describe("Tweet URL or numeric tweet ID") } as any,
    },
    async ({ url }: { url: string }) =>
      safeJson(async () => actionResponse("Unbookmark tweet", await client().unbookmarkTweet(await requireTweetId(url))))
  );

  server.registerTool(
    "x_quote_tweet",
    {
      title: "Quote Tweet",
      description: "Post a quote tweet via GraphQL.",
      inputSchema: {
        url: z.string().describe("Tweet URL or numeric tweet ID to quote"),
        text: z.string().min(1).max(280).describe("Your commentary text"),
        mediaIds: z.array(z.string()).optional().describe("Optional pre-uploaded media IDs"),
      } as any,
    },
    async ({ url, text, mediaIds }: { url: string; text: string; mediaIds?: string[] }) =>
      safeJson(async () => actionResponse("Quote tweet", await client().quoteTweet(await requireTweetId(url), text, mediaIds)))
  );

  server.registerTool(
    "x_reply",
    {
      title: "Reply to Tweet",
      description: "Post a reply to a tweet via GraphQL.",
      inputSchema: {
        url: z.string().describe("Tweet URL or numeric tweet ID to reply to"),
        text: z.string().min(1).max(280).describe("Your reply text"),
        mediaIds: z.array(z.string()).optional().describe("Optional pre-uploaded media IDs"),
      } as any,
    },
    async ({ url, text, mediaIds }: { url: string; text: string; mediaIds?: string[] }) =>
      safeJson(async () => actionResponse("Reply", await client().createTweet(text, await requireTweetId(url), mediaIds)))
  );

  server.registerTool(
    "x_upload_media",
    {
      title: "Upload Media",
      description: "Upload a media file (image/video/GIF) to X and return a mediaId for use in tweet posting.",
      inputSchema: {
        filePath: z.string().describe("Local path to the media file"),
      } as any,
    },
    async ({ filePath }: { filePath: string }) =>
      safeJson(async () => ({ mediaId: await client().uploadMedia(filePath) }))
  );

  server.registerTool(
    "x_post_tweet",
    {
      title: "Post Tweet or Thread",
      description:
        "Post a new tweet or thread via GraphQL. Multiple texts are posted as chained replies.",
      inputSchema: {
        texts: z.array(z.string().min(1).max(280)).min(1).max(25).describe("Tweet texts"),
        mediaIds: z.array(z.string()).optional().describe("Optional media IDs for the first tweet"),
      } as any,
    },
    async ({ texts, mediaIds }: { texts: string[]; mediaIds?: string[] }) =>
      safeJson(async () => {
        let replyToId: string | undefined;
        let firstResult;
        for (let i = 0; i < texts.length; i++) {
          const result = await client().createTweet(texts[i]!, replyToId, i === 0 ? mediaIds : undefined);
          firstResult ??= result;
          replyToId = result.id;
        }
        return {
          success: true,
          message: texts.length > 1 ? `Thread of ${texts.length} tweets posted successfully` : "Tweet posted successfully",
          tweetCount: texts.length,
          tweetId: firstResult?.id,
          tweetUrl: firstResult?.url,
        };
      })
  );
}
