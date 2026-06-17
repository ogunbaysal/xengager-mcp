import { describe, test, expect, mock, beforeEach } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, "fixtures", name), "utf8"));

// ── Mock page.evaluate ────────────────────────────────────────────────────

let mockEvaluateResponse: any = null;
let lastEvaluateUrl: string | null = null;
let lastEvaluateInit: any = null;

const mockPage = {
  cookies: async () => [{ name: "ct0", value: "test-ct0" }],
  evaluate: async (fn: Function, ...args: any[]) => {
    // Capture the url/init that would be passed to fetch
    if (args.length >= 1) lastEvaluateUrl = args[0];
    if (args.length >= 2) lastEvaluateInit = args[1];
    return mockEvaluateResponse;
  },
};

mock.module("../../src/browser.js", () => ({
  getPage: async () => mockPage,
}));

// Import after mocking
const { TwitterGraphQLClient } = await import("../../src/graphql/client.js");

// ── Helpers ───────────────────────────────────────────────────────────────

function makeClient() {
  return new TwitterGraphQLClient();
}

beforeEach(() => {
  lastEvaluateUrl = null;
  lastEvaluateInit = null;
});

// ── fetchHomeTimeline ─────────────────────────────────────────────────────

describe("fetchHomeTimeline", () => {
  test("returns parsed tweets from home timeline", async () => {
    mockEvaluateResponse = fixture("home_timeline.json");
    const client = makeClient();
    const result = await client.fetchHomeTimeline(20);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].id).toBe("1");
    expect(result.items[1].isRetweet).toBe(true);
  });

  test("builds GET request to HomeTimeline endpoint", async () => {
    mockEvaluateResponse = fixture("home_timeline.json");
    const client = makeClient();
    await client.fetchHomeTimeline(10);
    expect(lastEvaluateUrl).toContain("/graphql/");
    expect(lastEvaluateUrl).toContain("HomeTimeline");
    expect(lastEvaluateInit?.method).toBe("GET");
  });

  test("passes cursor in variables when provided", async () => {
    mockEvaluateResponse = fixture("home_timeline.json");
    const client = makeClient();
    await client.fetchHomeTimeline(10, "my-cursor");
    expect(lastEvaluateUrl).toContain(encodeURIComponent('"cursor"'));
  });
});

// ── fetchSearch ───────────────────────────────────────────────────────────

describe("fetchSearch", () => {
  test("returns tweets from search timeline", async () => {
    mockEvaluateResponse = fixture("search_timeline.json");
    const client = makeClient();
    const result = await client.fetchSearch("Claude Code", 20);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.nextCursor).toBe("search-cursor");
  });

  test("uses POST for SearchTimeline", async () => {
    mockEvaluateResponse = fixture("search_timeline.json");
    const client = makeClient();
    await client.fetchSearch("test", 10);
    expect(lastEvaluateInit?.method).toBe("POST");
  });

  test("includes rawQuery in POST body", async () => {
    mockEvaluateResponse = fixture("search_timeline.json");
    const client = makeClient();
    await client.fetchSearch("Claude Code", 10);
    const body = JSON.parse(lastEvaluateInit?.body ?? "{}");
    expect(body.variables?.rawQuery).toBe("Claude Code");
  });

  test("respects product parameter", async () => {
    mockEvaluateResponse = fixture("search_timeline.json");
    const client = makeClient();
    await client.fetchSearch("test", 10, "Latest");
    const body = JSON.parse(lastEvaluateInit?.body ?? "{}");
    expect(body.variables?.product).toBe("Latest");
  });
});

// ── fetchUser ─────────────────────────────────────────────────────────────

describe("fetchUser", () => {
  const userResponse = {
    data: {
      user: {
        result: {
          rest_id: "u999",
          is_blue_verified: true,
          core: { name: "Test User", screen_name: "testuser", created_at: "Mon Jan 01 00:00:00 +0000 2020" },
          legacy: {
            name: "Test User",
            screen_name: "testuser",
            description: "A bio",
            location: "Earth",
            followers_count: 5000,
            friends_count: 100,
            statuses_count: 200,
            favourites_count: 1000,
            profile_image_url_https: "https://img/test.jpg",
            created_at: "Mon Jan 01 00:00:00 +0000 2020",
          },
        },
      },
    },
  };

  test("returns parsed user profile", async () => {
    mockEvaluateResponse = userResponse;
    const client = makeClient();
    const user = await client.fetchUser("testuser");
    expect(user.screenName).toBe("testuser");
    expect(user.name).toBe("Test User");
    expect(user.followersCount).toBe(5000);
    expect(user.verified).toBe(true);
  });

  test("throws when user not found", async () => {
    mockEvaluateResponse = { data: { user: { result: null } } };
    const client = makeClient();
    await expect(client.fetchUser("nobody")).rejects.toThrow();
  });

  test("strips @ from screenName argument", async () => {
    mockEvaluateResponse = userResponse;
    const client = makeClient();
    await client.fetchUser("@testuser");
    expect(lastEvaluateUrl).toContain("UserByScreenName");
    expect(lastEvaluateUrl).toContain(encodeURIComponent('"testuser"'));
  });
});

// ── fetchFollowers / fetchFollowing ───────────────────────────────────────

describe("fetchFollowers", () => {
  test("returns parsed user list", async () => {
    mockEvaluateResponse = fixture("followers_page.json");
    const client = makeClient();
    const result = await client.fetchFollowers("u1", 20);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].screenName).toBe("follower1");
    expect(result.nextCursor).toBe("followers-cursor");
  });

  test("uses POST for Followers endpoint", async () => {
    mockEvaluateResponse = fixture("followers_page.json");
    const client = makeClient();
    await client.fetchFollowers("u1", 20);
    expect(lastEvaluateInit?.method).toBe("POST");
  });
});

// ── fetchTweetDetail ──────────────────────────────────────────────────────

describe("fetchTweetDetail", () => {
  test("returns tweets from thread", async () => {
    mockEvaluateResponse = fixture("tweet_detail.json");
    const client = makeClient();
    const result = await client.fetchTweetDetail("123", 20);
    expect(result.items.length).toBeGreaterThan(0);
  });
});

// ── Write operations ──────────────────────────────────────────────────────

describe("likeTweet", () => {
  test("returns success result", async () => {
    mockEvaluateResponse = { data: { favorite_tweet: "Done" } };
    const client = makeClient();
    const result = await client.likeTweet("123");
    expect(result.success).toBe(true);
  });

  test("uses POST", async () => {
    mockEvaluateResponse = { data: { favorite_tweet: "Done" } };
    const client = makeClient();
    await client.likeTweet("123");
    expect(lastEvaluateInit?.method).toBe("POST");
  });
});

describe("createTweet", () => {
  test("returns id and url on success", async () => {
    mockEvaluateResponse = {
      data: { create_tweet: { tweet_results: { result: { rest_id: "new-tweet-id" } } } },
    };
    const client = makeClient();
    const result = await client.createTweet("Hello world");
    expect(result.success).toBe(true);
    expect(result.id).toBe("new-tweet-id");
    expect(result.url).toContain("new-tweet-id");
  });

  test("includes reply_to in variables when provided", async () => {
    mockEvaluateResponse = {
      data: { create_tweet: { tweet_results: { result: { rest_id: "reply-id" } } } },
    };
    const client = makeClient();
    await client.createTweet("My reply", "parent-id");
    const body = JSON.parse(lastEvaluateInit?.body ?? "{}");
    expect(body.variables?.reply?.in_reply_to_tweet_id).toBe("parent-id");
  });
});

describe("deleteTweet", () => {
  test("returns success", async () => {
    mockEvaluateResponse = { data: { delete_tweet: { tweet_results: {} } } };
    const client = makeClient();
    const result = await client.deleteTweet("123");
    expect(result.success).toBe(true);
  });
});

describe("bookmarkTweet / unbookmarkTweet", () => {
  test("bookmark returns success", async () => {
    mockEvaluateResponse = { data: { bookmark_tweet_to_collection: null } };
    const client = makeClient();
    const result = await client.bookmarkTweet("123");
    expect(result.success).toBe(true);
  });

  test("unbookmark returns success", async () => {
    mockEvaluateResponse = { data: {} };
    const client = makeClient();
    const result = await client.unbookmarkTweet("123");
    expect(result.success).toBe(true);
  });
});

// ── Error handling ────────────────────────────────────────────────────────

describe("error handling", () => {
  test("throws TwitterAuthError on 401", async () => {
    mockEvaluateResponse = { __httpStatus: 401, __error: "Unauthorized" };
    const client = makeClient();
    // 401 is handled inside evaluate fn — simulate by throwing from evaluate
    mockPage.evaluate = async () => { throw new Error("HTTP 401"); };
    await expect(client.fetchHomeTimeline(10)).rejects.toThrow();
    // Restore
    mockPage.evaluate = async (_fn: Function, ...args: any[]) => {
      if (args.length >= 1) lastEvaluateUrl = args[0];
      if (args.length >= 2) lastEvaluateInit = args[1];
      return mockEvaluateResponse;
    };
  });

  test("throws TwitterAPIError on GraphQL errors array", async () => {
    mockEvaluateResponse = { errors: [{ message: "Rate limit exceeded", code: 88 }] };
    const client = makeClient();
    await expect(client.fetchHomeTimeline(10)).rejects.toThrow();
  });
});

// ── fetchArticle ──────────────────────────────────────────────────────────

describe("fetchArticle", () => {
  const articleResponse = {
    data: {
      tweetResult: {
        result: {
          __typename: "Tweet",
          rest_id: "art-999",
          legacy: {
            full_text: "Article tweet text",
            lang: "en",
            favorite_count: 0,
            retweet_count: 0,
            reply_count: 0,
            quote_count: 0,
            bookmark_count: 0,
            created_at: "",
          },
          core: {
            user_results: {
              result: {
                rest_id: "u1",
                legacy: { name: "Author", screen_name: "author" },
                core: { name: "Author", screen_name: "author" },
              },
            },
          },
          article: {
            article_results: {
              result: {
                title: "My Article Title",
                content_state: {
                  blocks: [{ type: "unstyled", text: "Article body text.", entityRanges: [] }],
                  entityMap: {},
                },
              },
            },
          },
          views: { count: "0" },
        },
      },
    },
  };

  test("returns tweet with articleTitle and articleText", async () => {
    mockEvaluateResponse = articleResponse;
    const client = makeClient();
    const tweet = await client.fetchArticle("art-999");
    expect(tweet.articleTitle).toBe("My Article Title");
    expect(tweet.articleText).toBe("Article body text.");
  });

  test("uses withArticlePlainText=true in URL", async () => {
    mockEvaluateResponse = articleResponse;
    const client = makeClient();
    await client.fetchArticle("art-999");
    expect(lastEvaluateUrl).toContain("withArticlePlainText");
    expect(lastEvaluateUrl).toContain("true");
  });

  test("throws when tweet has no article content", async () => {
    mockEvaluateResponse = {
      data: {
        tweetResult: {
          result: {
            __typename: "Tweet",
            rest_id: "t1",
            legacy: {
              full_text: "No article here",
              lang: "en",
              favorite_count: 0, retweet_count: 0, reply_count: 0,
              quote_count: 0, bookmark_count: 0, created_at: "",
            },
            core: {
              user_results: {
                result: {
                  rest_id: "u1",
                  legacy: { name: "A", screen_name: "a" },
                  core: { name: "A", screen_name: "a" },
                },
              },
            },
            views: { count: "0" },
          },
        },
      },
    };
    const client = makeClient();
    await expect(client.fetchArticle("t1")).rejects.toThrow();
  });
});

// ── uploadMedia ───────────────────────────────────────────────────────────

describe("uploadMedia", () => {
  test("returns media_id from evaluate result", async () => {
    mockEvaluateResponse = "mock-media-123";
    const client = makeClient();
    // Write a tiny temp file
    const tmpPath = "/tmp/xengager-test-upload.jpg";
    await Bun.write(tmpPath, new Uint8Array([0xff, 0xd8, 0xff, 0xe0])); // minimal JPEG header
    const mediaId = await client.uploadMedia(tmpPath);
    expect(mediaId).toBe("mock-media-123");
  });

  test("throws when file does not exist", async () => {
    const client = makeClient();
    await expect(client.uploadMedia("/tmp/does-not-exist-xengager.jpg")).rejects.toThrow(/not found/i);
  });

  test("throws when file type is not supported", async () => {
    const client = makeClient();
    const tmpPath = "/tmp/xengager-test.txt";
    await Bun.write(tmpPath, "hello");
    await expect(client.uploadMedia(tmpPath)).rejects.toThrow(/unsupported/i);
  });
});

// ── createTweet / quoteTweet with mediaIds ────────────────────────────────

describe("createTweet with mediaIds", () => {
  test("includes media_entities when mediaIds provided", async () => {
    mockEvaluateResponse = {
      data: { create_tweet: { tweet_results: { result: { rest_id: "t-media" } } } },
    };
    const client = makeClient();
    await client.createTweet("hello with image", undefined, ["media-id-1", "media-id-2"]);
    const body = JSON.parse(lastEvaluateInit?.body ?? "{}");
    expect(body.variables?.media?.media_entities).toHaveLength(2);
    expect(body.variables?.media?.media_entities[0]?.media_id).toBe("media-id-1");
  });
});

describe("quoteTweet with mediaIds", () => {
  test("includes media_entities when mediaIds provided", async () => {
    mockEvaluateResponse = {
      data: { create_tweet: { tweet_results: { result: { rest_id: "t-quote-media" } } } },
    };
    const client = makeClient();
    await client.quoteTweet("original-id", "my commentary", ["media-id-x"]);
    const body = JSON.parse(lastEvaluateInit?.body ?? "{}");
    expect(body.variables?.media?.media_entities).toHaveLength(1);
    expect(body.variables?.media?.media_entities[0]?.media_id).toBe("media-id-x");
  });
});
