import { beforeEach, describe, expect, mock, test } from "bun:test";

const calls: Array<{ method: string; args: unknown[] }> = [];

const tweet = {
  id: "123",
  text: "hello graphql",
  lang: "en",
  author: { id: "u1", name: "Alice", screenName: "alice", profileImageUrl: "", verified: false },
  metrics: { likes: 1, retweets: 2, replies: 3, quotes: 4, views: 5, bookmarks: 6 },
  media: [],
  urls: [],
  createdAt: "2026-06-17T00:00:00.000Z",
  isRetweet: false,
  isSubscriberOnly: false,
  isPromoted: false,
};

const user = {
  id: "u1",
  name: "Alice",
  screenName: "alice",
  bio: "bio",
  location: "Earth",
  url: "https://example.com",
  followersCount: 10,
  followingCount: 5,
  tweetsCount: 3,
  likesCount: 2,
  verified: true,
  profileImageUrl: "https://img/alice.jpg",
  createdAt: "Mon Jan 01 00:00:00 +0000 2020",
  isFollowing: true,
};

class MockTwitterGraphQLClient {
  fetchHomeTimeline = mock(async (...args: unknown[]) => {
    calls.push({ method: "fetchHomeTimeline", args });
    return { items: [tweet], nextCursor: "home-cursor" };
  });
  fetchFollowingFeed = mock(async (...args: unknown[]) => {
    calls.push({ method: "fetchFollowingFeed", args });
    return { items: [tweet], nextCursor: "following-cursor" };
  });
  fetchSearch = mock(async (...args: unknown[]) => {
    calls.push({ method: "fetchSearch", args });
    return { items: [tweet], nextCursor: "search-cursor" };
  });
  fetchNotifications = mock(async (...args: unknown[]) => {
    calls.push({ method: "fetchNotifications", args });
    return { items: [{ id: "n1", type: "person_icon", text: "Alice followed you", url: "https://x.com/alice", timestamp: "now", actors: [user] }], nextCursor: "notif-cursor" };
  });
  fetchBookmarks = mock(async (...args: unknown[]) => {
    calls.push({ method: "fetchBookmarks", args });
    return { items: [tweet], nextCursor: "bookmark-cursor" };
  });
  fetchTweetById = mock(async (...args: unknown[]) => {
    calls.push({ method: "fetchTweetById", args });
    return { ...tweet, id: String(args[0] ?? tweet.id) };
  });
  fetchTweetDetail = mock(async (...args: unknown[]) => {
    calls.push({ method: "fetchTweetDetail", args });
    const root = { ...tweet, id: String(args[0] ?? tweet.id) };
    const reply = args[0] === "321"
      ? { ...tweet, id: "322", text: "reply from someone else", author: { ...tweet.author, id: "u2", screenName: "bob", name: "Bob" } }
      : { ...tweet, id: "124", text: "reply" };
    return { items: [root, reply], nextCursor: "reply-cursor" };
  });
  createTweet = mock(async (...args: unknown[]) => {
    calls.push({ method: "createTweet", args });
    return { success: true, id: "999", url: "https://x.com/i/status/999" };
  });
  quoteTweet = mock(async (...args: unknown[]) => {
    calls.push({ method: "quoteTweet", args });
    return { success: true, id: "998", url: "https://x.com/i/status/998" };
  });
  likeTweet = mock(async (...args: unknown[]) => { calls.push({ method: "likeTweet", args }); return { success: true }; });
  unlikeTweet = mock(async (...args: unknown[]) => { calls.push({ method: "unlikeTweet", args }); return { success: true }; });
  retweetTweet = mock(async (...args: unknown[]) => { calls.push({ method: "retweetTweet", args }); return { success: true }; });
  unretweetTweet = mock(async (...args: unknown[]) => { calls.push({ method: "unretweetTweet", args }); return { success: true }; });
  bookmarkTweet = mock(async (...args: unknown[]) => { calls.push({ method: "bookmarkTweet", args }); return { success: true }; });
  unbookmarkTweet = mock(async (...args: unknown[]) => { calls.push({ method: "unbookmarkTweet", args }); return { success: true }; });
  uploadMedia = mock(async (...args: unknown[]) => { calls.push({ method: "uploadMedia", args }); return "media-id-789"; });
  fetchUser = mock(async (...args: unknown[]) => { calls.push({ method: "fetchUser", args }); return user; });
  fetchUserTweets = mock(async (...args: unknown[]) => { calls.push({ method: "fetchUserTweets", args }); return { items: [tweet], nextCursor: "posts-cursor" }; });
  fetchUserLikes = mock(async (...args: unknown[]) => { calls.push({ method: "fetchUserLikes", args }); return { items: [tweet], nextCursor: "likes-cursor" }; });
  fetchFollowers = mock(async (...args: unknown[]) => { calls.push({ method: "fetchFollowers", args }); return { items: [user], nextCursor: "followers-cursor" }; });
  fetchFollowing = mock(async (...args: unknown[]) => { calls.push({ method: "fetchFollowing", args }); return { items: [user], nextCursor: "following-users-cursor" }; });
}

const { setGraphQLClientFactory, resetGraphQLClientFactory } = await import("../../src/tools/graphql-adapter.js");

const { registerTimelineTools } = await import("../../src/tools/timeline.js");
const { registerSearchTools } = await import("../../src/tools/search.js");
const { registerNotificationsTools } = await import("../../src/tools/notifications.js");
const { registerBookmarksTools } = await import("../../src/tools/bookmarks.js");
const { registerTweetTools } = await import("../../src/tools/tweet.js");
const { registerProfileTools } = await import("../../src/tools/profile.js");

function createFakeServer() {
  const handlers = new Map<string, Function>();
  return {
    handlers,
    server: {
      registerTool(name: string, _config: unknown, handler: Function) {
        handlers.set(name, handler);
      },
    },
  };
}

async function callTool(handlers: Map<string, Function>, name: string, input: Record<string, unknown>) {
  const handler = handlers.get(name);
  expect(handler).toBeDefined();
  const result = await handler!(input);
  return JSON.parse(result.content[0].text);
}

beforeEach(() => {
  calls.length = 0;
  resetGraphQLClientFactory();
  setGraphQLClientFactory(() => new MockTwitterGraphQLClient() as any);
});

describe("GraphQL-backed MCP tools", () => {
  test("registers only timeline tools with GraphQL equivalents", () => {
    const { server, handlers } = createFakeServer();
    registerTimelineTools(server as any);
    expect([...handlers.keys()].sort()).toEqual(["x_following_timeline", "x_home_timeline"]);
  });

  test("removed DOM-only tools are not registered", () => {
    const { server, handlers } = createFakeServer();
    registerTimelineTools(server as any);
    registerTweetTools(server as any);
    registerProfileTools(server as any);
    for (const name of ["x_explore", "x_trends", "x_user_replies", "x_user_media", "x_user_articles"]) {
      expect(handlers.has(name)).toBe(false);
    }
  });

  test("home timeline returns GraphQL-native pagination", async () => {
    const { server, handlers } = createFakeServer();
    registerTimelineTools(server as any);
    const result = await callTool(handlers, "x_home_timeline", { limit: 7, cursor: "abc" });
    expect(result).toEqual({ items: [tweet], nextCursor: "home-cursor" });
    expect(calls[0]).toEqual({ method: "fetchHomeTimeline", args: [7, "abc"] });
  });

  test("search maps tabs to GraphQL products", async () => {
    const { server, handlers } = createFakeServer();
    registerSearchTools(server as any);
    const result = await callTool(handlers, "x_search", { query: "Claude Code", tab: "media", limit: 5 });
    expect(result.nextCursor).toBe("search-cursor");
    expect(calls[0]).toEqual({ method: "fetchSearch", args: ["Claude Code", 5, "Photos"] });
  });

  test("notifications maps mentions filter to GraphQL timeline type", async () => {
    const { server, handlers } = createFakeServer();
    registerNotificationsTools(server as any);
    const result = await callTool(handlers, "x_notifications", { filter: "mentions", limit: 3, cursor: "n" });
    expect(result.nextCursor).toBe("notif-cursor");
    expect(calls[0]).toEqual({ method: "fetchNotifications", args: [3, "n", "Mentions"] });
  });

  test("bookmarks uses GraphQL bookmarks", async () => {
    const { server, handlers } = createFakeServer();
    registerBookmarksTools(server as any);
    const result = await callTool(handlers, "x_bookmarks", { limit: 2 });
    expect(result.nextCursor).toBe("bookmark-cursor");
    expect(calls[0]).toEqual({ method: "fetchBookmarks", args: [2, undefined] });
  });

  test("tweet actions extract tweet IDs from URLs", async () => {
    const { server, handlers } = createFakeServer();
    registerTweetTools(server as any);
    await callTool(handlers, "x_like", { url: "https://x.com/alice/status/123" });
    expect(calls[0]).toEqual({ method: "likeTweet", args: ["123"] });
  });

  test("tweet replies use TweetDetail and exclude focal tweet", async () => {
    const { server, handlers } = createFakeServer();
    registerTweetTools(server as any);
    const result = await callTool(handlers, "x_tweet_replies", { url: "https://x.com/alice/status/123", limit: 10, cursor: "reply-cursor-in" });
    expect(result).toEqual({ items: [{ ...tweet, id: "124", text: "reply" }], nextCursor: "reply-cursor" });
    expect(calls[0]).toEqual({ method: "fetchTweetDetail", args: ["123", 10, "reply-cursor-in"] });
  });

  test("get tweet includes first 10 replies and thread signal", async () => {
    const { server, handlers } = createFakeServer();
    registerTweetTools(server as any);
    const result = await callTool(handlers, "x_get_tweet", { url: "https://x.com/alice/status/123" });
    expect(result).toEqual({
      ...tweet,
      isThread: true,
      replies: { items: [{ ...tweet, id: "124", text: "reply" }], nextCursor: "reply-cursor" },
    });
    expect(calls[0]).toEqual({ method: "fetchTweetById", args: ["123"] });
    expect(calls[1]).toEqual({ method: "fetchTweetDetail", args: ["123", 10, undefined] });
  });

  test("get tweet isThread is false when first reply is from another author", async () => {
    const { server, handlers } = createFakeServer();
    registerTweetTools(server as any);
    const result = await callTool(handlers, "x_get_tweet", { url: "https://x.com/alice/status/321" });
    expect(result.isThread).toBe(false);
    expect(result.replies.items[0].author.screenName).toBe("bob");
  });

  test("post thread chains createTweet replies", async () => {
    const { server, handlers } = createFakeServer();
    registerTweetTools(server as any);
    const result = await callTool(handlers, "x_post_tweet", { texts: ["first", "second"] });
    expect(result.success).toBe(true);
    expect(calls.map((c) => c.method)).toEqual(["createTweet", "createTweet"]);
    expect(calls[1].args).toEqual(["second", "999", undefined]);
  });

  test("upload media returns mediaId from GraphQL client", async () => {
    const { server, handlers } = createFakeServer();
    registerTweetTools(server as any);
    const result = await callTool(handlers, "x_upload_media", { filePath: "/path/to/image.png" });
    expect(result).toEqual({ mediaId: "media-id-789" });
    expect(calls[0]).toEqual({ method: "uploadMedia", args: ["/path/to/image.png"] });
  });

  test("user posts resolves username before fetching timeline", async () => {
    const { server, handlers } = createFakeServer();
    registerProfileTools(server as any);
    const result = await callTool(handlers, "x_user_posts", { username: "alice", limit: 4 });
    expect(result.nextCursor).toBe("posts-cursor");
    expect(calls[0]).toEqual({ method: "fetchUser", args: ["alice"] });
    expect(calls[1]).toEqual({ method: "fetchUserTweets", args: ["u1", 4, undefined] });
  });
});
