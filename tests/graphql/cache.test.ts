import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

// Override HOME so cache writes to a tmp dir, not the real ~/.xengager
const TMP_HOME = join(import.meta.dir, "__cache_home__");
process.env.HOME = TMP_HOME;

// Import after setting HOME
const { saveTweetCache, resolveCachedTweet } = await import("../../src/graphql/cache.js");

const CACHE_FILE = join(TMP_HOME, ".xengager", "last_results.json");

function makeTweet(id: string, screen_name = "user") {
  return {
    id,
    text: `Tweet ${id}`,
    author: { id: "u1", name: "User", screenName: screen_name, profileImageUrl: "", verified: false },
    lang: "en",
    metrics: { likes: 0, retweets: 0, replies: 0, quotes: 0, views: 0, bookmarks: 0 },
    media: [],
    urls: [],
    createdAt: "",
    isRetweet: false,
    isSubscriberOnly: false,
    isPromoted: false,
  };
}

beforeEach(() => {
  mkdirSync(TMP_HOME, { recursive: true });
  // Remove any stale cache
  try { rmSync(CACHE_FILE); } catch {}
});

afterEach(() => {
  try { rmSync(TMP_HOME, { recursive: true, force: true }); } catch {}
});

describe("saveTweetCache", () => {
  test("writes cache file with 1-based indices", async () => {
    const tweets = [makeTweet("aaa"), makeTweet("bbb"), makeTweet("ccc")];
    await saveTweetCache(tweets as any);
    expect(existsSync(CACHE_FILE)).toBe(true);
    const payload = JSON.parse(await Bun.file(CACHE_FILE).text());
    expect(payload.tweets).toHaveLength(3);
    expect(payload.tweets[0].index).toBe(1);
    expect(payload.tweets[0].id).toBe("aaa");
    expect(payload.tweets[2].index).toBe(3);
    expect(payload.tweets[2].id).toBe("ccc");
  });

  test("writes author screen_name and text snippet", async () => {
    const tweets = [makeTweet("x1", "alice")];
    await saveTweetCache(tweets as any);
    const payload = JSON.parse(await Bun.file(CACHE_FILE).text());
    expect(payload.tweets[0].author).toBe("alice");
    expect(payload.tweets[0].text).toContain("x1");
  });

  test("skips tweets without id", async () => {
    const tweets = [makeTweet(""), makeTweet("good-id")];
    await saveTweetCache(tweets as any);
    const payload = JSON.parse(await Bun.file(CACHE_FILE).text());
    expect(payload.tweets).toHaveLength(1);
    expect(payload.tweets[0].id).toBe("good-id");
  });
});

describe("resolveCachedTweet", () => {
  test("returns (null, 0) when no cache exists", async () => {
    const result = await resolveCachedTweet(1);
    expect(result.id).toBeNull();
    expect(result.cacheSize).toBe(0);
  });

  test("resolves valid 1-based index", async () => {
    await saveTweetCache([makeTweet("first"), makeTweet("second")] as any);
    const r1 = await resolveCachedTweet(1);
    expect(r1.id).toBe("first");
    expect(r1.cacheSize).toBe(2);
    const r2 = await resolveCachedTweet(2);
    expect(r2.id).toBe("second");
  });

  test("returns (null, size) when index is out of range", async () => {
    await saveTweetCache([makeTweet("only")] as any);
    const result = await resolveCachedTweet(5);
    expect(result.id).toBeNull();
    expect(result.cacheSize).toBe(1);
  });
});
