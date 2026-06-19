import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  deepGet,
  parseUserResult,
  parseTweetResult,
  parseTimelineResponse,
  parseUserListResponse,
  parseArticle,
} from "../../src/graphql/parser.js";

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(import.meta.dir, "fixtures", name), "utf8"));

// ── deepGet ──────────────────────────────────────────────────────────────

describe("deepGet", () => {
  test("returns nested value", () => {
    expect(deepGet({ a: { b: { c: 42 } } }, "a", "b", "c")).toBe(42);
  });

  test("returns undefined for missing key", () => {
    expect(deepGet({ a: 1 }, "b")).toBeUndefined();
  });

  test("returns undefined when traversing null", () => {
    expect(deepGet({ a: null }, "a", "b")).toBeUndefined();
  });

  test("supports numeric index for arrays", () => {
    expect(deepGet({ items: ["x", "y"] }, "items", 1)).toBe("y");
  });

  test("returns undefined for out-of-bounds index", () => {
    expect(deepGet({ items: ["x"] }, "items", 5)).toBeUndefined();
  });
});

// ── parseUserResult ───────────────────────────────────────────────────────

describe("parseUserResult", () => {
  const userResult = {
    rest_id: "u1",
    is_blue_verified: true,
    core: { name: "Alice Core", screen_name: "alice_core", created_at: "Mon Jan 01 00:00:00 +0000 2020" },
    legacy: {
      name: "Alice Legacy",
      screen_name: "alice_legacy",
      description: "A bio",
      location: "Earth",
      followers_count: 1000,
      friends_count: 200,
      following: true,
      statuses_count: 500,
      favourites_count: 3000,
      profile_image_url_https: "https://img/alice.jpg",
      created_at: "Mon Jan 01 00:00:00 +0000 2020",
      entities: { url: { urls: [{ expanded_url: "https://alice.com" }] } },
    },
    avatar: { image_url: "https://img/alice_avatar.jpg" },
    location: { location: "London" },
  };

  test("parses basic fields from core + legacy", () => {
    const u = parseUserResult(userResult);
    expect(u).not.toBeNull();
    expect(u!.id).toBe("u1");
    expect(u!.name).toBe("Alice Core");
    expect(u!.screenName).toBe("alice_core");
    expect(u!.bio).toBe("A bio");
    expect(u!.verified).toBe(true);
  });

  test("prefers core name over legacy name", () => {
    const u = parseUserResult(userResult);
    expect(u!.name).toBe("Alice Core");
  });

  test("prefers avatar.image_url over legacy profile_image_url_https", () => {
    const u = parseUserResult(userResult);
    expect(u!.profileImageUrl).toBe("https://img/alice_avatar.jpg");
  });

  test("prefers location.location over legacy location", () => {
    const u = parseUserResult(userResult);
    expect(u!.location).toBe("London");
  });

  test("parses counts from legacy", () => {
    const u = parseUserResult(userResult);
    expect(u!.followersCount).toBe(1000);
    expect(u!.followingCount).toBe(200);
    expect(u!.tweetsCount).toBe(500);
    expect(u!.likesCount).toBe(3000);
  });

  test("parses isFollowing from legacy.following", () => {
    const u = parseUserResult(userResult);
    expect(u!.isFollowing).toBe(true);
  });

  test("isFollowing is undefined when legacy.following is absent", () => {
    const result = {
      rest_id: "u3",
      legacy: { name: "NoFollow", screen_name: "nofollow", followers_count: 1, friends_count: 1, statuses_count: 1, favourites_count: 1 },
    };
    const u = parseUserResult(result);
    expect(u!.isFollowing).toBeUndefined();
  });

  test("returns null for UserUnavailable", () => {
    expect(parseUserResult({ __typename: "UserUnavailable" })).toBeNull();
  });

  test("returns null when rest_id missing", () => {
    expect(parseUserResult({ legacy: { name: "X" } })).toBeNull();
  });

  test("falls back to legacy when core absent", () => {
    const result = {
      rest_id: "u2",
      legacy: { name: "Bob", screen_name: "bob", followers_count: 5, friends_count: 2, statuses_count: 10, favourites_count: 20 },
    };
    const u = parseUserResult(result);
    expect(u!.name).toBe("Bob");
    expect(u!.screenName).toBe("bob");
  });
});

// ── parseTweetResult ──────────────────────────────────────────────────────

describe("parseTweetResult", () => {
  const baseTweet = {
    __typename: "Tweet",
    rest_id: "123",
    core: {
      user_results: {
        result: {
          rest_id: "u1",
          core: { name: "Alice", screen_name: "alice" },
          legacy: { name: "Alice", screen_name: "alice", verified: false, profile_image_url_https: "" },
        },
      },
    },
    legacy: {
      full_text: "Hello world",
      created_at: "Sat Mar 08 12:00:00 +0000 2026",
      favorite_count: 10,
      retweet_count: 2,
      reply_count: 1,
      quote_count: 0,
      bookmark_count: 3,
      lang: "en",
      entities: { urls: [{ expanded_url: "https://example.com" }] },
    },
    views: { count: "500" },
  };

  test("parses basic tweet fields", () => {
    const t = parseTweetResult(baseTweet);
    expect(t).not.toBeNull();
    expect(t!.id).toBe("123");
    expect(t!.text).toBe("Hello world");
    expect(t!.lang).toBe("en");
    expect(t!.author.screenName).toBe("alice");
    expect(t!.isRetweet).toBe(false);
  });

  test("parses metrics correctly", () => {
    const t = parseTweetResult(baseTweet);
    expect(t!.metrics.likes).toBe(10);
    expect(t!.metrics.retweets).toBe(2);
    expect(t!.metrics.replies).toBe(1);
    expect(t!.metrics.views).toBe(500);
    expect(t!.metrics.bookmarks).toBe(3);
  });

  test("parses urls from entities", () => {
    const t = parseTweetResult(baseTweet);
    expect(t!.urls).toContain("https://example.com");
  });

  test("prefers note_tweet text over full_text", () => {
    const tweet = {
      ...baseTweet,
      note_tweet: { note_tweet_results: { result: { text: "Extended long text" } } },
    };
    const t = parseTweetResult(tweet);
    expect(t!.text).toBe("Extended long text");
  });

  test("returns null for TweetTombstone", () => {
    expect(parseTweetResult({ __typename: "TweetTombstone" })).toBeNull();
  });

  test("returns null when legacy missing", () => {
    expect(parseTweetResult({ __typename: "Tweet", rest_id: "1", core: {} })).toBeNull();
  });

  test("unwraps TweetWithVisibilityResults", () => {
    const wrapped = { __typename: "TweetWithVisibilityResults", tweet: baseTweet };
    const t = parseTweetResult(wrapped);
    expect(t).not.toBeNull();
    expect(t!.id).toBe("123");
  });

  test("marks subscriber-only when tweetInterstitial present", () => {
    const wrapped = { __typename: "TweetWithVisibilityResults", tweet: baseTweet, tweetInterstitial: { text: "Subscribe" } };
    const t = parseTweetResult(wrapped);
    expect(t!.isSubscriberOnly).toBe(true);
  });

  test("parses photo media", () => {
    const tweet = {
      ...baseTweet,
      legacy: {
        ...baseTweet.legacy,
        extended_entities: {
          media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/1.jpg", original_info: { width: 1200, height: 800 } }],
        },
      },
    };
    const t = parseTweetResult(tweet);
    expect(t!.media).toHaveLength(1);
    expect(t!.media[0].type).toBe("photo");
    expect(t!.media[0].url).toBe("https://pbs.twimg.com/1.jpg");
    expect(t!.media[0].width).toBe(1200);
  });

  test("parses video media, picks highest bitrate variant", () => {
    const tweet = {
      ...baseTweet,
      legacy: {
        ...baseTweet.legacy,
        extended_entities: {
          media: [{
            type: "video",
            media_url_https: "https://pbs.twimg.com/thumb.jpg",
            original_info: { width: 1280, height: 720 },
            video_info: {
              variants: [
                { content_type: "video/mp4", bitrate: 832000, url: "https://low.mp4" },
                { content_type: "video/mp4", bitrate: 2176000, url: "https://high.mp4" },
              ],
            },
          }],
        },
      },
    };
    const t = parseTweetResult(tweet);
    expect(t!.media[0].type).toBe("video");
    expect(t!.media[0].url).toBe("https://high.mp4");
  });

  test("parses retweet: author is original author, retweetedBy is wrapper user", () => {
    const tweet = {
      __typename: "Tweet",
      rest_id: "rt-wrapper",
      core: {
        user_results: {
          result: {
            rest_id: "u-bob",
            core: { name: "Bob", screen_name: "bob" },
            legacy: { name: "Bob", screen_name: "bob", verified: false, profile_image_url_https: "" },
          },
        },
      },
      legacy: {
        full_text: "RT @carol: original",
        created_at: "Sat Mar 08 12:00:00 +0000 2026",
        favorite_count: 0, retweet_count: 0, reply_count: 0, quote_count: 0, bookmark_count: 0,
        lang: "en",
        entities: { urls: [] },
        retweeted_status_result: {
          result: {
            __typename: "Tweet",
            rest_id: "original-20",
            core: {
              user_results: {
                result: {
                  rest_id: "u-carol",
                  core: { name: "Carol", screen_name: "carol" },
                  legacy: { name: "Carol", screen_name: "carol", verified: false, profile_image_url_https: "" },
                },
              },
            },
            legacy: {
              full_text: "original post",
              created_at: "Sat Mar 08 11:59:00 +0000 2026",
              favorite_count: 50, retweet_count: 7, reply_count: 0, quote_count: 0, bookmark_count: 0,
              lang: "en",
              entities: { urls: [] },
            },
            views: { count: "999" },
          },
        },
      },
    };
    const t = parseTweetResult(tweet);
    expect(t!.isRetweet).toBe(true);
    expect(t!.author.screenName).toBe("carol");
    expect(t!.retweetedBy).toBe("bob");
    expect(t!.id).toBe("original-20");
    expect(t!.text).toBe("original post");
    expect(t!.metrics.retweets).toBe(7);
  });

  test("parses quoted tweet recursively", () => {
    const tweet = {
      ...baseTweet,
      quoted_status_result: {
        result: {
          __typename: "Tweet",
          rest_id: "quoted-99",
          core: {
            user_results: {
              result: {
                rest_id: "u99",
                core: { name: "Dan", screen_name: "dan" },
                legacy: { name: "Dan", screen_name: "dan", verified: false, profile_image_url_https: "" },
              },
            },
          },
          legacy: {
            full_text: "quoted content",
            created_at: "Sat Mar 08 11:58:00 +0000 2026",
            favorite_count: 5, retweet_count: 0, reply_count: 0, quote_count: 0, bookmark_count: 0,
            lang: "en",
            entities: { urls: [] },
          },
        },
      },
    };
    const t = parseTweetResult(tweet);
    expect(t!.quotedTweet).not.toBeNull();
    expect(t!.quotedTweet!.id).toBe("quoted-99");
    expect(t!.quotedTweet!.text).toBe("quoted content");
  });

  test("depth guard stops infinite recursion", () => {
    const t = parseTweetResult(baseTweet, 3);
    expect(t).toBeNull();
  });
});

// ── parseTimelineResponse ─────────────────────────────────────────────────

describe("parseTimelineResponse", () => {
  test("parses home timeline fixture", () => {
    const data = fixture("home_timeline.json");
    const getInstructions = (d: any) => d?.data?.home?.home_timeline_urt?.instructions;
    const result = parseTimelineResponse(data, getInstructions);
    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toBe("cursor-bottom-1");
    expect(result.items[0].id).toBe("1");
    expect(result.items[0].text).toContain("full text of a long tweet");
    expect(result.items[1].isRetweet).toBe(true);
    expect(result.items[1].author.screenName).toBe("carol");
  });

  test("parses search timeline fixture (module items)", () => {
    const data = fixture("search_timeline.json");
    const getInstructions = (d: any) =>
      d?.data?.search_by_raw_query?.search_timeline?.timeline?.instructions;
    const result = parseTimelineResponse(data, getInstructions);
    expect(result.items.length).toBeGreaterThan(0);
    expect(result.nextCursor).toBe("search-cursor");
    const videoTweet = result.items.find((t) => t.media.some((m) => m.type === "video"));
    expect(videoTweet).toBeDefined();
    expect(videoTweet!.media[0].url).toBe("https://video-high.mp4");
  });

  test("parses list timeline fixture", () => {
    const data = fixture("list_timeline.json");
    const getInstructions = (d: any) =>
      d?.data?.list?.tweets_timeline?.timeline?.instructions;
    const result = parseTimelineResponse(data, getInstructions);
    expect(result.items.length).toBeGreaterThan(0);
  });

  test("parses tweet detail fixture", () => {
    const data = fixture("tweet_detail.json");
    const getInstructions = (d: any) =>
      d?.data?.threaded_conversation_with_injections_v2?.instructions;
    const result = parseTimelineResponse(data, getInstructions);
    expect(result.items.length).toBeGreaterThan(0);
  });

  test("returns empty for missing instructions", () => {
    const result = parseTimelineResponse({}, () => undefined);
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });
});

// ── parseUserListResponse ─────────────────────────────────────────────────

describe("parseUserListResponse", () => {
  test("parses followers fixture", () => {
    const data = fixture("followers_page.json");
    const getInstructions = (d: any) =>
      d?.data?.user?.result?.timeline?.timeline?.instructions;
    const result = parseUserListResponse(data, getInstructions);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].screenName).toBe("follower1");
    expect(result.items[0].verified).toBe(true);
    expect(result.nextCursor).toBe("followers-cursor");
  });

  test("returns empty for missing instructions", () => {
    const result = parseUserListResponse({}, () => undefined);
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });
});

// ── parseArticle ──────────────────────────────────────────────────────────

function makeArticleTweetData(blocks: any[], entityMap: any = {}) {
  return {
    article: {
      article_results: {
        result: {
          title: "Test Article",
          content_state: { blocks, entityMap },
        },
      },
    },
  };
}

describe("parseArticle", () => {
  test("returns null for data without article", () => {
    expect(parseArticle({})).toBeNull();
    expect(parseArticle({ article: { article_results: { result: null } } })).toBeNull();
  });

  test("returns title and null text when no blocks", () => {
    const data = { article: { article_results: { result: { title: "My Title" } } } };
    const result = parseArticle(data);
    expect(result?.title).toBe("My Title");
    expect(result?.text).toBeNull();
  });

  test("converts header-one to # heading", () => {
    const data = makeArticleTweetData([{ type: "header-one", text: "Big Title", entityRanges: [] }]);
    const result = parseArticle(data);
    expect(result?.text).toBe("# Big Title");
  });

  test("converts header-two to ## heading", () => {
    const data = makeArticleTweetData([{ type: "header-two", text: "Sub Title", entityRanges: [] }]);
    expect(parseArticle(data)?.text).toBe("## Sub Title");
  });

  test("converts header-three to ### heading", () => {
    const data = makeArticleTweetData([{ type: "header-three", text: "Small", entityRanges: [] }]);
    expect(parseArticle(data)?.text).toBe("### Small");
  });

  test("converts blockquote to > text", () => {
    const data = makeArticleTweetData([{ type: "blockquote", text: "A quote", entityRanges: [] }]);
    expect(parseArticle(data)?.text).toBe("> A quote");
  });

  test("converts unordered-list-item to - text", () => {
    const data = makeArticleTweetData([
      { type: "unordered-list-item", text: "Item A", entityRanges: [] },
      { type: "unordered-list-item", text: "Item B", entityRanges: [] },
    ]);
    expect(parseArticle(data)?.text).toBe("- Item A\n\n- Item B");
  });

  test("converts ordered-list-item with auto-incrementing counter", () => {
    const data = makeArticleTweetData([
      { type: "ordered-list-item", text: "First", entityRanges: [] },
      { type: "ordered-list-item", text: "Second", entityRanges: [] },
    ]);
    expect(parseArticle(data)?.text).toBe("1. First\n\n2. Second");
  });

  test("counter resets after non-ordered block", () => {
    const data = makeArticleTweetData([
      { type: "ordered-list-item", text: "First", entityRanges: [] },
      { type: "unstyled", text: "Break", entityRanges: [] },
      { type: "ordered-list-item", text: "Restart", entityRanges: [] },
    ]);
    expect(parseArticle(data)?.text).toBe("1. First\n\nBreak\n\n1. Restart");
  });

  test("converts code-block to fenced code", () => {
    const data = makeArticleTweetData([{ type: "code-block", text: "const x = 1;", entityRanges: [] }]);
    expect(parseArticle(data)?.text).toBe("```\nconst x = 1;\n```");
  });

  test("skips empty blocks", () => {
    const data = makeArticleTweetData([
      { type: "unstyled", text: "Hello", entityRanges: [] },
      { type: "unstyled", text: "", entityRanges: [] },
      { type: "unstyled", text: "World", entityRanges: [] },
    ]);
    expect(parseArticle(data)?.text).toBe("Hello\n\nWorld");
  });

  test("skips atomic blocks", () => {
    const data = makeArticleTweetData([
      { type: "unstyled", text: "Before", entityRanges: [] },
      { type: "atomic", text: "", entityRanges: [] },
      { type: "unstyled", text: "After", entityRanges: [] },
    ]);
    expect(parseArticle(data)?.text).toBe("Before\n\nAfter");
  });

  test("renders inline links from entityRanges", () => {
    const entityMap = {
      "0": { type: "LINK", data: { url: "https://example.com" } },
    };
    const data = makeArticleTweetData(
      [{ type: "unstyled", text: "Click here for info", entityRanges: [{ key: 0, offset: 6, length: 4 }] }],
      entityMap,
    );
    const result = parseArticle(data);
    expect(result?.text).toContain("[here](https://example.com)");
  });
});

// ── parseTweetResult — article text ───────────────────────────────────────

describe("parseTweetResult with article", () => {
  test("populates articleText from content_state blocks", () => {
    const tweetData = {
      __typename: "Tweet",
      rest_id: "art-1",
      legacy: {
        full_text: "Article tweet",
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
            title: "My Long Article",
            content_state: {
              blocks: [
                { type: "unstyled", text: "Hello article world", entityRanges: [] },
              ],
              entityMap: {},
            },
          },
        },
      },
      views: { count: "0" },
    };
    const tweet = parseTweetResult(tweetData);
    expect(tweet).not.toBeNull();
    expect(tweet!.articleTitle).toBe("My Long Article");
    expect(tweet!.articleText).toBe("Hello article world");
  });
});
