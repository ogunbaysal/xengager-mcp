import { mkdirSync } from "fs";
import { join } from "path";
import type { GqlTweet } from "./types.js";

const CACHE_DIR = join(process.env.HOME ?? "~", ".xengager");
const CACHE_FILE = join(CACHE_DIR, "last_results.json");
const TTL_MS = 3600 * 1000;

interface CacheEntry {
  index: number;
  id: string;
  author: string;
  text: string;
}

interface CachePayload {
  createdAt: number;
  tweets: CacheEntry[];
}

export async function saveTweetCache(tweets: GqlTweet[]): Promise<void> {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const entries: CacheEntry[] = tweets
      .filter((t) => t.id)
      .map((t, i) => ({
        index: i + 1,
        id: t.id,
        author: t.author.screenName,
        text: t.text.slice(0, 80),
      }));
    const payload: CachePayload = { createdAt: Date.now(), tweets: entries };
    await Bun.write(CACHE_FILE, JSON.stringify(payload, null, 2));
  } catch {
    // Best-effort; never crash the CLI over cache failures
  }
}

export async function resolveCachedTweet(index: number): Promise<{ id: string | null; cacheSize: number }> {
  try {
    const file = Bun.file(CACHE_FILE);
    if (!(await file.exists())) return { id: null, cacheSize: 0 };
    const payload: CachePayload = await file.json();
    if (!payload || Date.now() - payload.createdAt > TTL_MS) return { id: null, cacheSize: 0 };
    const entries = payload.tweets ?? [];
    const entry = entries.find((e) => e.index === index);
    return { id: entry?.id ?? null, cacheSize: entries.length };
  } catch {
    return { id: null, cacheSize: 0 };
  }
}
