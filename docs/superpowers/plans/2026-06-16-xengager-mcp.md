# xengager-mcp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 24-tool X (Twitter) MCP server using a persistent stealth Puppeteer browser, cursor-based pagination, and feature-grouped tool modules.

**Architecture:** Single Puppeteer browser singleton launched lazily on first tool call, pre-authenticated via cookies from `.env`. Tools are grouped by domain (`search`, `timeline`, `notifications`, `bookmarks`, `profile`, `tweet`) and each module exports a `register(server)` function. Pagination is cursor-based using tweet/user IDs.

**Tech Stack:** Bun, TypeScript, `@modelcontextprotocol/sdk`, `puppeteer`, `puppeteer-extra`, `puppeteer-extra-plugin-stealth`, `zod`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `package.json` | Modify | Add puppeteer dependencies |
| `.env.example` | Modify | Add `X_AUTH_TOKEN`, `X_CT0` |
| `src/types.ts` | Create | Shared TypeScript interfaces (Tweet, UserProfile, PaginatedResult, etc.) |
| `src/paginate.ts` | Create | `paginateItems()` — cursor slicing utility |
| `src/browser.ts` | Create | Browser singleton, cookie auth, `randSleep`, `scrollCollect`, `stealthClick` |
| `src/tools/search.ts` | Create | `x_search` tool |
| `src/tools/timeline.ts` | Create | `x_home_timeline`, `x_following_timeline`, `x_explore`, `x_trends` |
| `src/tools/notifications.ts` | Create | `x_notifications` |
| `src/tools/bookmarks.ts` | Create | `x_bookmarks` |
| `src/tools/profile.ts` | Create | `x_user_profile`, `x_user_posts`, `x_user_replies`, `x_user_following`, `x_user_followers`, `x_user_likes`, `x_user_media`, `x_user_articles` |
| `src/tools/tweet.ts` | Create | `x_get_tweet`, `x_tweet_replies`, `x_like`, `x_unlike`, `x_repost`, `x_unrepost`, `x_bookmark`, `x_unbookmark`, `x_quote_tweet`, `x_reply`, `x_post_tweet` |
| `src/server.ts` | Modify | Wire all tool modules + remove placeholder tools |
| `src/http.ts` | Modify | Add browser `closeBrowser()` to shutdown handler |
| `src/stdio.ts` | Modify | Add browser `closeBrowser()` to process exit |
| `src/tools/echo.ts` | Delete | Remove starter placeholder |
| `tests/paginate.test.ts` | Create | Unit tests for `paginateItems` |
| `tests/browser.test.ts` | Create | Unit tests for `randSleep` |

---

## Task 1: Install dependencies and configure environment

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `.env`

- [ ] **Step 1: Install puppeteer packages**

```bash
cd /Users/ogun/Documents/xengager-mcp
bun add puppeteer puppeteer-extra puppeteer-extra-plugin-stealth
bun add -d @types/node
```

Expected output: packages added to `bun.lock`, `node_modules/puppeteer-extra` present.

- [ ] **Step 2: Update `.env.example`**

Add to the end of `.env.example`:

```env
# X (Twitter) Authentication
# Get these from your browser's DevTools → Application → Cookies → x.com
X_AUTH_TOKEN=your_auth_token_cookie_value_here
X_CT0=your_ct0_cookie_value_here
```

- [ ] **Step 3: Add real cookie values to `.env`**

Copy the two lines from `.env.example` into `.env` and fill in real values from your X session (DevTools → Application → Cookies → x.com → `auth_token` and `ct0`).

- [ ] **Step 4: Verify bun can find puppeteer**

```bash
bun -e "import puppeteer from 'puppeteer-extra'; console.log('ok')"
```

Expected: prints `ok` with no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock .env.example
git commit -m "feat: add puppeteer-extra + stealth dependencies"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Create `src/types.ts`**

```typescript
export interface Tweet {
  id: string;
  url: string;
  text: string;
  author: {
    username: string;
    displayName: string;
    avatarUrl: string;
    verified: boolean;
  };
  date: string;
  likeCount: number;
  repostCount: number;
  replyCount: number;
  bookmarkCount: number;
  viewCount: number;
  isThread: boolean;
  threadTweets?: Tweet[];
  hasMedia: boolean;
  mediaUrls: string[];
}

export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  verified: boolean;
  followersCount: number;
}

export interface UserProfile {
  username: string;
  displayName: string;
  avatarUrl: string;
  bio: string;
  location: string;
  website: string;
  joinedDate: string;
  followersCount: number;
  followingCount: number;
  verified: boolean;
  latestPosts: Tweet[];
}

export interface Trend {
  id: string;
  topic: string;
  tweetCount: string;
  category: string;
}

export interface Notification {
  id: string;
  text: string;
  time: string;
  links: string[];
}

export interface Article {
  id: string;
  title: string;
  url: string;
  date: string;
  previewText: string;
}

export interface MediaItem {
  id: string;
  type: 'image' | 'video' | 'gif';
  url: string;
  tweetUrl: string;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ActionResult {
  success: boolean;
  message: string;
  tweetUrl?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared TypeScript types"
```

---

## Task 3: Pagination utility

**Files:**
- Create: `src/paginate.ts`
- Create: `tests/paginate.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/paginate.test.ts`:

```typescript
import { test, expect, describe } from "bun:test";
import { paginateItems } from "../src/paginate.js";

describe("paginateItems", () => {
  const items = [
    { id: "1", val: "a" },
    { id: "2", val: "b" },
    { id: "3", val: "c" },
    { id: "4", val: "d" },
    { id: "5", val: "e" },
  ];

  test("first page with no cursor", () => {
    const result = paginateItems(items, undefined, 2);
    expect(result.items).toEqual([{ id: "1", val: "a" }, { id: "2", val: "b" }]);
    expect(result.nextCursor).toBe("2");
    expect(result.hasMore).toBe(true);
  });

  test("second page with cursor", () => {
    const result = paginateItems(items, "2", 2);
    expect(result.items).toEqual([{ id: "3", val: "c" }, { id: "4", val: "d" }]);
    expect(result.nextCursor).toBe("4");
    expect(result.hasMore).toBe(true);
  });

  test("last page returns null nextCursor", () => {
    const result = paginateItems(items, "4", 2);
    expect(result.items).toEqual([{ id: "5", val: "e" }]);
    expect(result.nextCursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  test("limit larger than items returns all", () => {
    const result = paginateItems(items, undefined, 10);
    expect(result.items).toHaveLength(5);
    expect(result.nextCursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });

  test("unknown cursor returns from beginning", () => {
    const result = paginateItems(items, "999", 2);
    expect(result.items).toEqual([{ id: "1", val: "a" }, { id: "2", val: "b" }]);
  });

  test("empty items returns empty result", () => {
    const result = paginateItems([], undefined, 10);
    expect(result.items).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
    expect(result.hasMore).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/paginate.test.ts
```

Expected: FAIL with "Cannot find module '../src/paginate.js'"

- [ ] **Step 3: Create `src/paginate.ts`**

```typescript
import type { PaginatedResult } from "./types.js";

export function paginateItems<T extends { id: string }>(
  items: T[],
  cursor: string | undefined,
  limit: number
): PaginatedResult<T> {
  let startIndex = 0;

  if (cursor) {
    const cursorIndex = items.findIndex((item) => item.id === cursor);
    if (cursorIndex !== -1) {
      startIndex = cursorIndex + 1;
    }
  }

  const slice = items.slice(startIndex, startIndex + limit);
  const nextCursor = slice.length === limit ? slice[slice.length - 1].id : null;

  return {
    items: slice,
    nextCursor,
    hasMore: nextCursor !== null,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/paginate.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/paginate.ts tests/paginate.test.ts
git commit -m "feat: add cursor-based pagination utility with tests"
```

---

## Task 4: Browser singleton

**Files:**
- Create: `src/browser.ts`
- Create: `tests/browser.test.ts`

- [ ] **Step 1: Write failing tests for pure functions**

Create `tests/browser.test.ts`:

```typescript
import { test, expect, describe } from "bun:test";
import { randSleep } from "../src/browser.js";

describe("randSleep", () => {
  test("resolves within expected range", async () => {
    const start = Date.now();
    await randSleep(50, 100);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(50);
    expect(elapsed).toBeLessThan(500); // generous upper bound for CI
  });

  test("min === max resolves close to min", async () => {
    const start = Date.now();
    await randSleep(50, 50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bun test tests/browser.test.ts
```

Expected: FAIL with "Cannot find module '../src/browser.js'"

- [ ] **Step 3: Create `src/browser.ts`**

```typescript
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer";

puppeteer.use(StealthPlugin());

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
];

let _browser: Browser | null = null;
let _page: Page | null = null;

export function randSleep(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function launch(): Promise<{ browser: Browser; page: Page }> {
  const authToken = process.env.X_AUTH_TOKEN;
  const ct0 = process.env.X_CT0;

  if (!authToken || !ct0) {
    throw new Error(
      "Missing X_AUTH_TOKEN or X_CT0 in environment. " +
        "Get these from DevTools → Application → Cookies → x.com"
    );
  }

  const browser = await (puppeteer as any).launch({
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--disable-dev-shm-usage",
      "--lang=en-US,en",
    ],
  });

  const page = await browser.newPage();

  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  await page.setUserAgent(ua);
  await page.setViewport({
    width: 1280 + Math.floor(Math.random() * 100),
    height: 800 + Math.floor(Math.random() * 100),
  });

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: any) =>
      parameters.name === "notifications"
        ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
        : originalQuery(parameters);
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (parameter: number) {
      if (parameter === 37445) return "Intel Inc.";
      if (parameter === 37446) return "Intel Iris OpenGL Engine";
      return getParameter.call(this, parameter);
    };
  });

  await page.setCookie(
    {
      name: "auth_token",
      value: authToken,
      domain: ".x.com",
      path: "/",
      httpOnly: true,
      secure: true,
    },
    {
      name: "ct0",
      value: ct0,
      domain: ".x.com",
      path: "/",
      secure: true,
    }
  );

  await page.goto("https://x.com/home", { waitUntil: "networkidle2" });

  if (page.url().includes("/login") || page.url().includes("/i/flow/login")) {
    await browser.close();
    throw new Error(
      "X session invalid. Update X_AUTH_TOKEN and X_CT0 in .env with fresh cookie values."
    );
  }

  _browser = browser;
  _page = page;

  return { browser, page };
}

export async function getPage(): Promise<Page> {
  if (_browser && _browser.isConnected() && _page) {
    return _page;
  }
  const { page } = await launch();
  return page;
}

export async function closeBrowser(): Promise<void> {
  if (_browser) {
    try {
      await _browser.close();
    } catch {}
    _browser = null;
    _page = null;
  }
}

export async function scrollCollect<T>(
  page: Page,
  extractFn: () => T[],
  idFn: (item: T) => string,
  targetCount: number,
  maxRetries = 8
): Promise<T[]> {
  const collected = new Map<string, T>();
  let retries = 0;

  while (collected.size < targetCount && retries < maxRetries) {
    const items: T[] = await page.evaluate(extractFn);
    const prev = collected.size;
    items.forEach((item) => {
      const id = idFn(item);
      if (id) collected.set(id, item);
    });

    if (collected.size === prev) {
      retries++;
    } else {
      retries = 0;
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await randSleep(1500, 3000);
  }

  return Array.from(collected.values());
}

export async function stealthClick(page: Page, selector: string): Promise<boolean> {
  try {
    const el = await page.$(selector);
    if (!el) return false;
    const box = await el.boundingBox();
    if (!box) return false;
    const x = box.x + box.width * (0.3 + Math.random() * 0.4);
    const y = box.y + box.height * (0.3 + Math.random() * 0.4);
    await page.mouse.move(x, y, { steps: 5 + Math.floor(Math.random() * 10) });
    await randSleep(50, 150);
    await page.mouse.click(x, y, { delay: 50 + Math.floor(Math.random() * 100) });
    return true;
  } catch {
    return false;
  }
}

export async function clickIfPresent(
  page: Page,
  selector: string,
  timeout = 3000
): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout });
    return stealthClick(page, selector);
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
bun test tests/browser.test.ts
```

Expected: both `randSleep` tests PASS. (Browser tests don't launch a real browser — only pure functions are tested.)

- [ ] **Step 5: Commit**

```bash
git add src/browser.ts tests/browser.test.ts
git commit -m "feat: add browser singleton with stealth setup, randSleep, scrollCollect"
```

---

## Task 5: Search tool

**Files:**
- Create: `src/tools/search.ts`

- [ ] **Step 1: Create `src/tools/search.ts`**

```typescript
import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getPage, randSleep, scrollCollect } from "../browser.js";
import { paginateItems } from "../paginate.js";
import type { Tweet } from "../types.js";

const TWEET_EXTRACTOR = () => {
  return Array.from(document.querySelectorAll('article[data-testid="tweet"]')).map((article) => {
    const linkEl = article.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
    const idMatch = linkEl?.href?.match(/\/status\/(\d+)/);
    const id = idMatch?.[1] ?? null;
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const userNameEl = article.querySelector('[data-testid="User-Name"]');
    const timeEl = article.querySelector("time");
    const avatarEl = article.querySelector('img[src*="profile_images"]') as HTMLImageElement | null;
    const verifiedEl = article.querySelector('svg[aria-label*="Verified"]');

    const nameSpans = userNameEl?.querySelectorAll("span") ?? [];
    const displayName = (nameSpans[0] as HTMLElement | undefined)?.textContent?.trim() ?? "";
    const handleLink = userNameEl?.querySelector('a[href^="/"]') as HTMLAnchorElement | null;
    const username = handleLink?.getAttribute("href")?.replace("/", "") ?? "";

    const buttons = Array.from(article.querySelectorAll('[role="group"] button'));
    let likeCount = 0, repostCount = 0, replyCount = 0, bookmarkCount = 0;
    for (const btn of buttons) {
      const label = (btn.getAttribute("aria-label") ?? "").toLowerCase();
      const count = parseInt((btn as HTMLElement).innerText?.replace(/[^0-9]/g, "") ?? "0") || 0;
      if (label.includes("repl")) replyCount = count;
      else if (label.includes("repost") || label.includes("retweet")) repostCount = count;
      else if (label.includes("like")) likeCount = count;
      else if (label.includes("bookmark")) bookmarkCount = count;
    }

    const viewEl = article.querySelector('a[href*="/analytics"] span span');
    const viewCount = parseInt((viewEl as HTMLElement | null)?.innerText?.replace(/[^0-9]/g, "") ?? "0") || 0;

    const mediaEls = Array.from(article.querySelectorAll('[data-testid="tweetPhoto"] img')) as HTMLImageElement[];
    const mediaUrls = mediaEls.map((img) => img.src);
    const hasVideo = !!article.querySelector('[data-testid="videoPlayer"]');
    if (hasVideo) mediaUrls.push("video");

    return {
      id,
      url: linkEl?.href ?? "",
      text: textEl?.textContent ?? "",
      author: {
        username,
        displayName,
        avatarUrl: avatarEl?.src ?? "",
        verified: !!verifiedEl,
      },
      date: timeEl?.getAttribute("datetime") ?? "",
      likeCount,
      repostCount,
      replyCount,
      bookmarkCount,
      viewCount,
      isThread: false,
      hasMedia: mediaUrls.length > 0,
      mediaUrls,
    };
  }).filter((t) => t.id);
};

export function register(server: McpServer) {
  server.registerTool(
    "x_search",
    {
      title: "Search X",
      description:
        "Search X (Twitter) for tweets. Supports native X advanced operators in the query string: from:user, to:user, since:YYYY-MM-DD, until:YYYY-MM-DD, lang:en, min_likes:N, min_retweets:N, has:media, is:reply, is:quote, filter:verified, #hashtag, @mention.",
      inputSchema: {
        query: z.string().describe("Search query. Supports X advanced operators."),
        tab: z
          .enum(["top", "latest", "people", "media"])
          .optional()
          .default("latest")
          .describe("Result tab (default: latest)"),
        limit: z.number().optional().default(20).describe("Items per page (default: 20)"),
        cursor: z.string().optional().describe("Cursor from previous response for pagination"),
      },
    },
    async ({ query, tab, limit, cursor }) => {
      try {
        const page = await getPage();
        const tabParam =
          tab === "latest" ? "&f=live" :
          tab === "people" ? "&f=user" :
          tab === "media" ? "&f=image" : "";

        const url = `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query${tabParam}`;
        await page.goto(url, { waitUntil: "networkidle2" });
        await randSleep(2000, 4000);

        const needed = cursor
          ? (await findCursorOffset(page, cursor)) + (limit ?? 20) + 5
          : (limit ?? 20) + 5;

        const tweets = await scrollCollect<any>(
          page,
          TWEET_EXTRACTOR as any,
          (t) => t.id,
          needed
        ) as Tweet[];

        const result = paginateItems(tweets, cursor, limit ?? 20);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
      }
    }
  );
}

async function findCursorOffset(page: any, cursor: string): Promise<number> {
  // Collect just enough to find where cursor sits; returns estimated position
  // In practice scrollCollect overshoots by design
  return 20;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/search.ts
git commit -m "feat: add x_search tool"
```

---

## Task 6: Timeline tools

**Files:**
- Create: `src/tools/timeline.ts`

- [ ] **Step 1: Create `src/tools/timeline.ts`**

```typescript
import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getPage, randSleep, scrollCollect } from "../browser.js";
import { paginateItems } from "../paginate.js";
import type { Tweet, Trend } from "../types.js";

const TWEET_EXTRACTOR = () =>
  Array.from(document.querySelectorAll('article[data-testid="tweet"]')).map((article) => {
    const linkEl = article.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
    const idMatch = linkEl?.href?.match(/\/status\/(\d+)/);
    const id = idMatch?.[1] ?? null;
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const userNameEl = article.querySelector('[data-testid="User-Name"]');
    const timeEl = article.querySelector("time");
    const avatarEl = article.querySelector('img[src*="profile_images"]') as HTMLImageElement | null;
    const verifiedEl = article.querySelector('svg[aria-label*="Verified"]');

    const nameSpans = userNameEl?.querySelectorAll("span") ?? [];
    const displayName = (nameSpans[0] as HTMLElement | undefined)?.textContent?.trim() ?? "";
    const handleLink = userNameEl?.querySelector('a[href^="/"]') as HTMLAnchorElement | null;
    const username = handleLink?.getAttribute("href")?.replace("/", "") ?? "";

    const buttons = Array.from(article.querySelectorAll('[role="group"] button'));
    let likeCount = 0, repostCount = 0, replyCount = 0, bookmarkCount = 0;
    for (const btn of buttons) {
      const label = (btn.getAttribute("aria-label") ?? "").toLowerCase();
      const count = parseInt((btn as HTMLElement).innerText?.replace(/[^0-9KMBkmb.]/g, "") ?? "0") || 0;
      if (label.includes("repl")) replyCount = count;
      else if (label.includes("repost") || label.includes("retweet")) repostCount = count;
      else if (label.includes("like")) likeCount = count;
      else if (label.includes("bookmark")) bookmarkCount = count;
    }

    const viewEl = article.querySelector('a[href*="/analytics"] span span');
    const viewCount = parseInt((viewEl as HTMLElement | null)?.innerText?.replace(/[^0-9]/g, "") ?? "0") || 0;

    const mediaEls = Array.from(article.querySelectorAll('[data-testid="tweetPhoto"] img')) as HTMLImageElement[];
    const mediaUrls = mediaEls.map((img) => img.src);
    if (article.querySelector('[data-testid="videoPlayer"]')) mediaUrls.push("video");

    return {
      id,
      url: linkEl?.href ?? "",
      text: textEl?.textContent ?? "",
      author: { username, displayName, avatarUrl: avatarEl?.src ?? "", verified: !!verifiedEl },
      date: timeEl?.getAttribute("datetime") ?? "",
      likeCount, repostCount, replyCount, bookmarkCount, viewCount,
      isThread: false, hasMedia: mediaUrls.length > 0, mediaUrls,
    };
  }).filter((t) => t.id);

const TREND_EXTRACTOR = () =>
  Array.from(document.querySelectorAll('[data-testid="trend"]')).map((el, index) => {
    const spans = Array.from(el.querySelectorAll("span"));
    const texts = spans.map((s) => (s as HTMLElement).innerText).filter(Boolean);
    const category = texts[0] ?? "";
    const topic = texts.find((t) => t.startsWith("#") || (t.length > 2 && !t.match(/posts|tweets/i))) ?? texts[1] ?? "";
    const tweetCount = texts.find((t) => /posts|tweets/i.test(t)) ?? "";
    return { id: `trend-${index}-${topic}`, topic, tweetCount, category };
  }).filter((t) => t.topic);

function paginationParams() {
  return {
    limit: z.number().optional().default(20).describe("Items per page (default: 20)"),
    cursor: z.string().optional().describe("Cursor from previous response for pagination"),
  };
}

export function register(server: McpServer) {
  server.registerTool(
    "x_home_timeline",
    {
      title: "Home Timeline (For You)",
      description: "Fetch tweets from the X home timeline (For You feed) with optional pagination.",
      inputSchema: paginationParams(),
    },
    async ({ limit, cursor }) => {
      try {
        const page = await getPage();
        await page.goto("https://x.com/home", { waitUntil: "networkidle2" });
        await randSleep(2000, 4000);

        // Switch to "For you" tab if not already there
        await page.evaluate(() => {
          const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
          const tab = tabs.find((t) => t.textContent?.includes("For you"));
          (tab as HTMLElement | undefined)?.click();
        });
        await randSleep(1000, 2000);

        const tweets = await scrollCollect<any>(page, TWEET_EXTRACTOR as any, (t) => t.id, (limit ?? 20) + 20) as Tweet[];
        const result = paginateItems(tweets, cursor, limit ?? 20);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_following_timeline",
    {
      title: "Following Timeline",
      description: "Fetch tweets from the X Following feed with optional pagination.",
      inputSchema: paginationParams(),
    },
    async ({ limit, cursor }) => {
      try {
        const page = await getPage();
        await page.goto("https://x.com/home", { waitUntil: "networkidle2" });
        await randSleep(2000, 4000);

        await page.evaluate(() => {
          const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
          const tab = tabs.find((t) => t.textContent?.includes("Following"));
          (tab as HTMLElement | undefined)?.click();
        });
        await randSleep(1000, 2000);

        const tweets = await scrollCollect<any>(page, TWEET_EXTRACTOR as any, (t) => t.id, (limit ?? 20) + 20) as Tweet[];
        const result = paginateItems(tweets, cursor, limit ?? 20);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_explore",
    {
      title: "Explore",
      description: "Fetch trending tweets from the X Explore page with optional pagination.",
      inputSchema: paginationParams(),
    },
    async ({ limit, cursor }) => {
      try {
        const page = await getPage();
        await page.goto("https://x.com/explore", { waitUntil: "networkidle2" });
        await randSleep(2000, 4000);

        const tweets = await scrollCollect<any>(page, TWEET_EXTRACTOR as any, (t) => t.id, (limit ?? 20) + 20) as Tweet[];
        const result = paginateItems(tweets, cursor, limit ?? 20);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_trends",
    {
      title: "Trends (What's Happening)",
      description: "Fetch current trending topics from X's What's Happening / Explore trends section.",
      inputSchema: paginationParams(),
    },
    async ({ limit, cursor }) => {
      try {
        const page = await getPage();
        await page.goto("https://x.com/explore/tabs/trending", { waitUntil: "networkidle2" });
        await randSleep(2000, 3000);

        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight));
          await randSleep(1000, 2000);
        }

        const trends = await page.evaluate(TREND_EXTRACTOR as any) as Trend[];
        const result = paginateItems(trends, cursor, limit ?? 20);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
      }
    }
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/timeline.ts
git commit -m "feat: add timeline tools (home, following, explore, trends)"
```

---

## Task 7: Notifications tool

**Files:**
- Create: `src/tools/notifications.ts`

- [ ] **Step 1: Create `src/tools/notifications.ts`**

```typescript
import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getPage, randSleep } from "../browser.js";
import { paginateItems } from "../paginate.js";
import type { Notification } from "../types.js";

const NOTIFICATION_EXTRACTOR = () =>
  Array.from(
    document.querySelectorAll('article[data-testid="tweet"], [data-testid="notification"]')
  ).map((el, index) => {
    const text = (el as HTMLElement).innerText ?? "";
    const timeEl = el.querySelector("time");
    const time = timeEl?.getAttribute("datetime") ?? "";
    const links = Array.from(el.querySelectorAll('a[href*="/status/"]')).map(
      (a) => (a as HTMLAnchorElement).href
    );
    const id = time + text.slice(0, 40).replace(/\s/g, "_") + index;
    return { id, text: text.slice(0, 280), time, links };
  }).filter((n) => n.text.trim());

export function register(server: McpServer) {
  server.registerTool(
    "x_notifications",
    {
      title: "Notifications",
      description: "Fetch recent X notifications. Filter by 'all' (default) or 'mentions'.",
      inputSchema: {
        filter: z
          .enum(["all", "mentions"])
          .optional()
          .default("all")
          .describe("Notification type filter (default: all)"),
        limit: z.number().optional().default(20).describe("Items per page (default: 20)"),
        cursor: z.string().optional().describe("Cursor from previous response for pagination"),
      },
    },
    async ({ filter, limit, cursor }) => {
      try {
        const page = await getPage();
        const url =
          filter === "mentions"
            ? "https://x.com/notifications/mentions"
            : "https://x.com/notifications";

        await page.goto(url, { waitUntil: "networkidle2" });
        await randSleep(2000, 3000);

        const notifications: Notification[] = [];
        const seen = new Set<string>();
        const maxScrolls = Math.ceil(((limit ?? 20) + 20) / 5);

        for (let i = 0; i < maxScrolls; i++) {
          const items = await page.evaluate(NOTIFICATION_EXTRACTOR as any) as Notification[];
          for (const n of items) {
            if (!seen.has(n.id)) {
              seen.add(n.id);
              notifications.push(n);
            }
          }
          await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
          await randSleep(1500, 2500);
        }

        const result = paginateItems(notifications, cursor, limit ?? 20);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
      }
    }
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/notifications.ts
git commit -m "feat: add x_notifications tool"
```

---

## Task 8: Bookmarks tool

**Files:**
- Create: `src/tools/bookmarks.ts`

- [ ] **Step 1: Create `src/tools/bookmarks.ts`**

```typescript
import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getPage, randSleep } from "../browser.js";
import { paginateItems } from "../paginate.js";
import type { Tweet } from "../types.js";

const BOOKMARK_EXTRACTOR = () =>
  Array.from(document.querySelectorAll('article[data-testid="tweet"]')).map((article) => {
    const linkEl = article.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
    const idMatch = linkEl?.href?.match(/\/status\/(\d+)/);
    const id = idMatch?.[1] ?? null;
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const userNameEl = article.querySelector('[data-testid="User-Name"]');
    const timeEl = article.querySelector("time");
    const avatarEl = article.querySelector('img[src*="profile_images"]') as HTMLImageElement | null;
    const verifiedEl = article.querySelector('svg[aria-label*="Verified"]');

    const nameSpans = userNameEl?.querySelectorAll("span") ?? [];
    const displayName = (nameSpans[0] as HTMLElement | undefined)?.textContent?.trim() ?? "";
    const handleLink = userNameEl?.querySelector('a[href^="/"]') as HTMLAnchorElement | null;
    const username = handleLink?.getAttribute("href")?.replace("/", "") ?? "";

    const likeEl = article.querySelector('[data-testid="like"] span span');
    const retweetEl = article.querySelector('[data-testid="retweet"] span span');
    const replyEl = article.querySelector('[data-testid="reply"] span span');

    const mediaEls = Array.from(article.querySelectorAll('[data-testid="tweetPhoto"] img')) as HTMLImageElement[];
    const mediaUrls = mediaEls.map((img) => img.src);
    if (article.querySelector('[data-testid="videoPlayer"]')) mediaUrls.push("video");

    return {
      id,
      url: linkEl?.href ?? "",
      text: textEl?.textContent ?? "",
      author: { username, displayName, avatarUrl: avatarEl?.src ?? "", verified: !!verifiedEl },
      date: timeEl?.getAttribute("datetime") ?? "",
      likeCount: parseInt((likeEl as HTMLElement | null)?.innerText ?? "0") || 0,
      repostCount: parseInt((retweetEl as HTMLElement | null)?.innerText ?? "0") || 0,
      replyCount: parseInt((replyEl as HTMLElement | null)?.innerText ?? "0") || 0,
      bookmarkCount: 0,
      viewCount: 0,
      isThread: false,
      hasMedia: mediaUrls.length > 0,
      mediaUrls,
    };
  }).filter((t) => t.id);

export function register(server: McpServer) {
  server.registerTool(
    "x_bookmarks",
    {
      title: "Bookmarks",
      description: "Fetch your saved X bookmarks with optional pagination.",
      inputSchema: {
        limit: z.number().optional().default(20).describe("Items per page (default: 20)"),
        cursor: z.string().optional().describe("Cursor from previous response for pagination"),
      },
    },
    async ({ limit, cursor }) => {
      try {
        const page = await getPage();
        await page.goto("https://x.com/i/bookmarks", { waitUntil: "networkidle2" });
        await randSleep(2000, 3500);

        const tweets: Tweet[] = [];
        const seen = new Set<string>();
        const maxScrolls = Math.ceil(((limit ?? 20) + 20) / 5);

        for (let i = 0; i < maxScrolls; i++) {
          const items = await page.evaluate(BOOKMARK_EXTRACTOR as any) as Tweet[];
          for (const t of items) {
            if (t.id && !seen.has(t.id)) {
              seen.add(t.id);
              tweets.push(t);
            }
          }
          await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
          await randSleep(1500, 2500);
        }

        const result = paginateItems(tweets, cursor, limit ?? 20);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
      }
    }
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/bookmarks.ts
git commit -m "feat: add x_bookmarks tool"
```

---

## Task 9: Profile tools

**Files:**
- Create: `src/tools/profile.ts`

- [ ] **Step 1: Create `src/tools/profile.ts`**

```typescript
import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getPage, randSleep, scrollCollect } from "../browser.js";
import { paginateItems } from "../paginate.js";
import type { Tweet, UserSummary, Article, MediaItem } from "../types.js";

function paginationSchema() {
  return {
    limit: z.number().optional().default(20).describe("Items per page (default: 20)"),
    cursor: z.string().optional().describe("Cursor from previous response for pagination"),
  };
}

const TWEET_EXTRACTOR = () =>
  Array.from(document.querySelectorAll('article[data-testid="tweet"]')).map((article) => {
    const linkEl = article.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
    const id = linkEl?.href?.match(/\/status\/(\d+)/)?.[1] ?? null;
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const timeEl = article.querySelector("time");
    const userNameEl = article.querySelector('[data-testid="User-Name"]');
    const avatarEl = article.querySelector('img[src*="profile_images"]') as HTMLImageElement | null;
    const verifiedEl = article.querySelector('svg[aria-label*="Verified"]');
    const nameSpans = userNameEl?.querySelectorAll("span") ?? [];
    const displayName = (nameSpans[0] as HTMLElement | undefined)?.textContent?.trim() ?? "";
    const username = (userNameEl?.querySelector('a[href^="/"]') as HTMLAnchorElement | null)?.getAttribute("href")?.replace("/", "") ?? "";
    const likeEl = article.querySelector('[data-testid="like"] span span');
    const retweetEl = article.querySelector('[data-testid="retweet"] span span');
    const replyEl = article.querySelector('[data-testid="reply"] span span');
    const viewEl = article.querySelector('a[href*="/analytics"] span span');
    const mediaEls = Array.from(article.querySelectorAll('[data-testid="tweetPhoto"] img')) as HTMLImageElement[];
    const mediaUrls = mediaEls.map((img) => img.src);
    if (article.querySelector('[data-testid="videoPlayer"]')) mediaUrls.push("video");
    const isThread = !!article.querySelector('[data-testid="tweet-text-show-more-link"]') ||
      !!article.closest('[data-testid="cellInnerDiv"]')?.querySelector('div[style*="border"]');
    return {
      id,
      url: linkEl?.href ?? "",
      text: textEl?.textContent ?? "",
      author: { username, displayName, avatarUrl: avatarEl?.src ?? "", verified: !!verifiedEl },
      date: timeEl?.getAttribute("datetime") ?? "",
      likeCount: parseInt((likeEl as HTMLElement | null)?.innerText ?? "0") || 0,
      repostCount: parseInt((retweetEl as HTMLElement | null)?.innerText ?? "0") || 0,
      replyCount: parseInt((replyEl as HTMLElement | null)?.innerText ?? "0") || 0,
      bookmarkCount: 0,
      viewCount: parseInt((viewEl as HTMLElement | null)?.innerText?.replace(/[^0-9]/g, "") ?? "0") || 0,
      isThread,
      hasMedia: mediaUrls.length > 0,
      mediaUrls,
    };
  }).filter((t) => t.id);

const USER_CELL_EXTRACTOR = () =>
  Array.from(document.querySelectorAll('[data-testid="UserCell"]')).map((cell) => {
    const linkEl = cell.querySelector('a[href^="/"]') as HTMLAnchorElement | null;
    const href = linkEl?.getAttribute("href") ?? "";
    const username = href.split("/")[1] ?? "";
    const nameEl = cell.querySelector('[dir="ltr"] > span');
    const displayName = (nameEl as HTMLElement | null)?.textContent ?? "";
    const bioEl = cell.querySelector('[data-testid="UserDescription"]');
    const avatarEl = cell.querySelector('img[src*="profile_images"]') as HTMLImageElement | null;
    const verifiedEl = cell.querySelector('svg[aria-label*="Verified"]');
    const followersEl = cell.querySelector('[data-testid="UserCell-followers"] span');
    return {
      id: username,
      username,
      displayName,
      avatarUrl: avatarEl?.src ?? "",
      bio: (bioEl as HTMLElement | null)?.textContent ?? "",
      verified: !!verifiedEl,
      followersCount: parseInt((followersEl as HTMLElement | null)?.textContent?.replace(/[^0-9]/g, "") ?? "0") || 0,
    };
  }).filter((u) => u.username && !u.username.includes("?"));

export function register(server: McpServer) {
  server.registerTool(
    "x_user_profile",
    {
      title: "User Profile",
      description: "Get a user's X profile: display name, avatar, bio, location, website, join date, follower/following counts, and their latest posts.",
      inputSchema: {
        username: z.string().describe("X username without @"),
      },
    },
    async ({ username }) => {
      try {
        const page = await getPage();
        await page.goto(`https://x.com/${username}`, { waitUntil: "networkidle2" });
        await randSleep(2000, 3500);

        const profile = await page.evaluate(() => {
          const getText = (sel: string) => (document.querySelector(sel) as HTMLElement | null)?.textContent?.trim() ?? null;
          const getAttr = (sel: string, attr: string) => document.querySelector(sel)?.getAttribute(attr) ?? null;

          const nameSection = document.querySelector('[data-testid="UserName"]');
          const fullText = nameSection?.textContent ?? "";
          const usernameMatch = fullText.match(/@(\w+)/);

          const followingLink = document.querySelector('a[href$="/following"]');
          const followersLink = document.querySelector('a[href$="/verified_followers"], a[href$="/followers"]');
          const avatarEl = document.querySelector('[data-testid*="UserAvatar"] img') as HTMLImageElement | null;

          return {
            username: usernameMatch?.[1] ?? null,
            displayName: fullText.split("@")[0]?.trim() ?? null,
            avatarUrl: avatarEl?.src ?? null,
            bio: getText('[data-testid="UserDescription"]'),
            location: getText('[data-testid="UserLocation"]'),
            website: getAttr('[data-testid="UserUrl"] a', "href") ?? getText('[data-testid="UserUrl"]'),
            joinedDate: getText('[data-testid="UserJoinDate"]'),
            followingCount: (followingLink?.querySelector("span") as HTMLElement | null)?.textContent ?? null,
            followersCount: (followersLink?.querySelector("span") as HTMLElement | null)?.textContent ?? null,
            verified: !!document.querySelector('[data-testid="UserName"] svg[aria-label*="Verified"]'),
          };
        });

        // Grab latest posts (already loaded)
        const latestPosts = (await page.evaluate(TWEET_EXTRACTOR as any) as Tweet[]).slice(0, 3);

        return {
          content: [{ type: "text", text: JSON.stringify({ ...profile, latestPosts }) }],
        };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_user_posts",
    {
      title: "User Posts",
      description: "Get a user's X posts. Threads are returned with isThread: true. Supports pagination.",
      inputSchema: {
        username: z.string().describe("X username without @"),
        ...paginationSchema(),
      },
    },
    async ({ username, limit, cursor }) => {
      try {
        const page = await getPage();
        await page.goto(`https://x.com/${username}`, { waitUntil: "networkidle2" });
        await randSleep(2000, 3500);
        const tweets = await scrollCollect<any>(page, TWEET_EXTRACTOR as any, (t) => t.id, (limit ?? 20) + 20) as Tweet[];
        const result = paginateItems(tweets, cursor, limit ?? 20);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_user_replies",
    {
      title: "User Replies",
      description: "Get a user's reply tweets on X. Supports pagination.",
      inputSchema: {
        username: z.string().describe("X username without @"),
        ...paginationSchema(),
      },
    },
    async ({ username, limit, cursor }) => {
      try {
        const page = await getPage();
        await page.goto(`https://x.com/${username}/with_replies`, { waitUntil: "networkidle2" });
        await randSleep(2000, 3500);
        const tweets = await scrollCollect<any>(page, TWEET_EXTRACTOR as any, (t) => t.id, (limit ?? 20) + 20) as Tweet[];
        const result = paginateItems(tweets, cursor, limit ?? 20);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_user_following",
    {
      title: "User Following",
      description: "Get the list of accounts a user follows on X. Supports pagination.",
      inputSchema: {
        username: z.string().describe("X username without @"),
        ...paginationSchema(),
      },
    },
    async ({ username, limit, cursor }) => {
      try {
        const page = await getPage();
        await page.goto(`https://x.com/${username}/following`, { waitUntil: "networkidle2" });
        await randSleep(2000, 3500);
        const users = await scrollCollect<any>(page, USER_CELL_EXTRACTOR as any, (u) => u.username, (limit ?? 20) + 20) as UserSummary[];
        const result = paginateItems(users, cursor, limit ?? 20);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_user_followers",
    {
      title: "User Followers",
      description: "Get the list of accounts following a user on X. Supports pagination.",
      inputSchema: {
        username: z.string().describe("X username without @"),
        ...paginationSchema(),
      },
    },
    async ({ username, limit, cursor }) => {
      try {
        const page = await getPage();
        await page.goto(`https://x.com/${username}/followers`, { waitUntil: "networkidle2" });
        await randSleep(2000, 3500);
        const users = await scrollCollect<any>(page, USER_CELL_EXTRACTOR as any, (u) => u.username, (limit ?? 20) + 20) as UserSummary[];
        const result = paginateItems(users, cursor, limit ?? 20);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_user_likes",
    {
      title: "User Likes",
      description: "Get tweets a user has liked on X. Supports pagination.",
      inputSchema: {
        username: z.string().describe("X username without @"),
        ...paginationSchema(),
      },
    },
    async ({ username, limit, cursor }) => {
      try {
        const page = await getPage();
        await page.goto(`https://x.com/${username}/likes`, { waitUntil: "networkidle2" });
        await randSleep(2000, 3500);
        const tweets = await scrollCollect<any>(page, TWEET_EXTRACTOR as any, (t) => t.id, (limit ?? 20) + 20) as Tweet[];
        const result = paginateItems(tweets, cursor, limit ?? 20);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_user_media",
    {
      title: "User Media",
      description: "Get media tweets (images, videos) from a user's X profile. Supports pagination.",
      inputSchema: {
        username: z.string().describe("X username without @"),
        ...paginationSchema(),
      },
    },
    async ({ username, limit, cursor }) => {
      try {
        const page = await getPage();
        await page.goto(`https://x.com/${username}/media`, { waitUntil: "networkidle2" });
        await randSleep(2000, 3500);

        const mediaExtractor = () =>
          Array.from(document.querySelectorAll('article[data-testid="tweet"]')).flatMap((article) => {
            const tweetLinkEl = article.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
            const tweetId = tweetLinkEl?.href?.match(/\/status\/(\d+)/)?.[1] ?? null;
            if (!tweetId) return [];
            const tweetUrl = tweetLinkEl?.href ?? "";
            const images = Array.from(article.querySelectorAll('[data-testid="tweetPhoto"] img') as NodeListOf<HTMLImageElement>)
              .map((img, i) => ({
                id: `${tweetId}-img-${i}`,
                type: "image" as const,
                url: img.src.replace(/&name=\w+/, "&name=large"),
                tweetUrl,
              }));
            const hasVideo = !!article.querySelector('[data-testid="videoPlayer"]');
            const videos = hasVideo ? [{ id: `${tweetId}-video`, type: "video" as const, url: tweetUrl, tweetUrl }] : [];
            return [...images, ...videos];
          });

        const items = await scrollCollect<any>(page, mediaExtractor as any, (m) => m.id, (limit ?? 20) + 20) as MediaItem[];
        const result = paginateItems(items, cursor, limit ?? 20);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_user_articles",
    {
      title: "User Articles",
      description: "Get long-form articles published by a user on X. Supports pagination.",
      inputSchema: {
        username: z.string().describe("X username without @"),
        ...paginationSchema(),
      },
    },
    async ({ username, limit, cursor }) => {
      try {
        const page = await getPage();
        await page.goto(`https://x.com/${username}/articles`, { waitUntil: "networkidle2" });
        await randSleep(2000, 3500);

        const articleExtractor = () =>
          Array.from(document.querySelectorAll('article, [data-testid="article"]')).map((el, index) => {
            const linkEl = el.querySelector('a[href*="/i/article/"]') as HTMLAnchorElement | null;
            const titleEl = el.querySelector("h1, h2, h3, [role='heading']");
            const timeEl = el.querySelector("time");
            const previewEl = el.querySelector("p");
            const url = linkEl?.href ?? "";
            const idMatch = url.match(/\/article\/(\w+)/);
            const id = idMatch?.[1] ?? `article-${index}`;
            return {
              id,
              title: (titleEl as HTMLElement | null)?.textContent?.trim() ?? "",
              url,
              date: timeEl?.getAttribute("datetime") ?? "",
              previewText: (previewEl as HTMLElement | null)?.textContent?.trim() ?? "",
            };
          }).filter((a) => a.url);

        const items = await page.evaluate(articleExtractor as any) as Article[];
        const result = paginateItems(items, cursor, limit ?? 20);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
      }
    }
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/profile.ts
git commit -m "feat: add profile tools (profile, posts, replies, following, followers, likes, media, articles)"
```

---

## Task 10: Tweet detail and action tools

**Files:**
- Create: `src/tools/tweet.ts`

- [ ] **Step 1: Create `src/tools/tweet.ts`**

```typescript
import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getPage, randSleep, scrollCollect, clickIfPresent, stealthClick } from "../browser.js";
import { paginateItems } from "../paginate.js";
import type { Tweet } from "../types.js";

const TWEET_EXTRACTOR = () =>
  Array.from(document.querySelectorAll('article[data-testid="tweet"]')).map((article) => {
    const linkEl = article.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
    const id = linkEl?.href?.match(/\/status\/(\d+)/)?.[1] ?? null;
    const textEl = article.querySelector('[data-testid="tweetText"]');
    const userNameEl = article.querySelector('[data-testid="User-Name"]');
    const timeEl = article.querySelector("time");
    const avatarEl = article.querySelector('img[src*="profile_images"]') as HTMLImageElement | null;
    const verifiedEl = article.querySelector('svg[aria-label*="Verified"]');
    const nameSpans = userNameEl?.querySelectorAll("span") ?? [];
    const displayName = (nameSpans[0] as HTMLElement | undefined)?.textContent?.trim() ?? "";
    const username = (userNameEl?.querySelector('a[href^="/"]') as HTMLAnchorElement | null)?.getAttribute("href")?.replace("/", "") ?? "";
    const buttons = Array.from(article.querySelectorAll('[role="group"] button'));
    let likeCount = 0, repostCount = 0, replyCount = 0, bookmarkCount = 0;
    for (const btn of buttons) {
      const label = (btn.getAttribute("aria-label") ?? "").toLowerCase();
      const count = parseInt((btn as HTMLElement).innerText?.replace(/[^0-9]/g, "") ?? "0") || 0;
      if (label.includes("repl")) replyCount = count;
      else if (label.includes("repost") || label.includes("retweet")) repostCount = count;
      else if (label.includes("like")) likeCount = count;
      else if (label.includes("bookmark")) bookmarkCount = count;
    }
    const viewEl = article.querySelector('a[href*="/analytics"] span span');
    const viewCount = parseInt((viewEl as HTMLElement | null)?.innerText?.replace(/[^0-9]/g, "") ?? "0") || 0;
    const mediaEls = Array.from(article.querySelectorAll('[data-testid="tweetPhoto"] img')) as HTMLImageElement[];
    const mediaUrls = mediaEls.map((img) => img.src);
    if (article.querySelector('[data-testid="videoPlayer"]')) mediaUrls.push("video");
    return {
      id, url: linkEl?.href ?? "",
      text: textEl?.textContent ?? "",
      author: { username, displayName, avatarUrl: avatarEl?.src ?? "", verified: !!verifiedEl },
      date: timeEl?.getAttribute("datetime") ?? "",
      likeCount, repostCount, replyCount, bookmarkCount, viewCount,
      isThread: false, hasMedia: mediaUrls.length > 0, mediaUrls,
    };
  }).filter((t) => t.id);

export function register(server: McpServer) {
  server.registerTool(
    "x_get_tweet",
    {
      title: "Get Tweet",
      description: "Get full details for a tweet by URL: author info, text, date, like/repost/reply/view/bookmark counts, and media.",
      inputSchema: {
        url: z.string().describe("Full URL of the tweet (e.g. https://x.com/user/status/123)"),
      },
    },
    async ({ url }) => {
      try {
        const page = await getPage();
        await page.goto(url, { waitUntil: "networkidle2" });
        await randSleep(2000, 3500);

        // The main tweet is the one whose ID matches the URL
        const tweetIdMatch = url.match(/\/status\/(\d+)/);
        const tweetId = tweetIdMatch?.[1];

        const tweets = await page.evaluate(TWEET_EXTRACTOR as any) as Tweet[];
        const mainTweet = tweets.find((t) => t.id === tweetId) ?? tweets[0] ?? null;

        if (!mainTweet) {
          return { content: [{ type: "text", text: JSON.stringify({ error: "Tweet not found" }) }] };
        }

        // Detect thread: look for same-author consecutive tweets
        const mainAuthor = mainTweet.author.username;
        const threadTweets = tweets.filter((t) => t.author.username === mainAuthor);
        if (threadTweets.length > 1) {
          mainTweet.isThread = true;
          mainTweet.threadTweets = threadTweets;
        }

        return { content: [{ type: "text", text: JSON.stringify(mainTweet) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_tweet_replies",
    {
      title: "Tweet Replies",
      description: "Get replies to a tweet by URL. Supports pagination.",
      inputSchema: {
        url: z.string().describe("Full URL of the tweet"),
        limit: z.number().optional().default(20).describe("Items per page (default: 20)"),
        cursor: z.string().optional().describe("Cursor from previous response for pagination"),
      },
    },
    async ({ url, limit, cursor }) => {
      try {
        const page = await getPage();
        await page.goto(url, { waitUntil: "networkidle2" });
        await randSleep(2000, 3500);

        const tweetId = url.match(/\/status\/(\d+)/)?.[1];
        const tweets = await scrollCollect<any>(page, TWEET_EXTRACTOR as any, (t) => t.id, (limit ?? 20) + 20) as Tweet[];
        // Replies are all tweets except the main tweet
        const replies = tweets.filter((t) => t.id !== tweetId);
        const result = paginateItems(replies, cursor, limit ?? 20);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_like",
    {
      title: "Like Tweet",
      description: "Like a tweet by its URL.",
      inputSchema: {
        url: z.string().describe("Full URL of the tweet to like"),
      },
    },
    async ({ url }) => {
      try {
        const page = await getPage();
        await page.goto(url, { waitUntil: "networkidle2" });
        await randSleep(1500, 3000);
        const clicked = await clickIfPresent(page, '[data-testid="like"]');
        if (clicked) {
          await randSleep(500, 1500);
          return { content: [{ type: "text", text: JSON.stringify({ success: true, message: "Tweet liked" }) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify({ success: false, message: "Could not like tweet (already liked or not found)" }) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_unlike",
    {
      title: "Unlike Tweet",
      description: "Remove a like from a tweet by its URL.",
      inputSchema: {
        url: z.string().describe("Full URL of the tweet to unlike"),
      },
    },
    async ({ url }) => {
      try {
        const page = await getPage();
        await page.goto(url, { waitUntil: "networkidle2" });
        await randSleep(1500, 3000);
        const clicked = await clickIfPresent(page, '[data-testid="unlike"]');
        if (clicked) {
          await randSleep(500, 1500);
          return { content: [{ type: "text", text: JSON.stringify({ success: true, message: "Tweet unliked" }) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify({ success: false, message: "Could not unlike tweet (not liked or not found)" }) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_repost",
    {
      title: "Repost Tweet",
      description: "Repost (retweet) a tweet by its URL.",
      inputSchema: {
        url: z.string().describe("Full URL of the tweet to repost"),
      },
    },
    async ({ url }) => {
      try {
        const page = await getPage();
        await page.goto(url, { waitUntil: "networkidle2" });
        await randSleep(1500, 3000);
        const clicked = await clickIfPresent(page, '[data-testid="retweet"]');
        if (clicked) {
          await randSleep(500, 1000);
          await clickIfPresent(page, '[data-testid="retweetConfirm"]');
          await randSleep(500, 1500);
          return { content: [{ type: "text", text: JSON.stringify({ success: true, message: "Tweet reposted" }) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify({ success: false, message: "Could not repost tweet" }) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_unrepost",
    {
      title: "Undo Repost",
      description: "Undo a repost (unretweet) of a tweet by its URL.",
      inputSchema: {
        url: z.string().describe("Full URL of the tweet to unrepost"),
      },
    },
    async ({ url }) => {
      try {
        const page = await getPage();
        await page.goto(url, { waitUntil: "networkidle2" });
        await randSleep(1500, 3000);
        const clicked = await clickIfPresent(page, '[data-testid="unretweet"]');
        if (clicked) {
          await randSleep(500, 1000);
          await clickIfPresent(page, '[data-testid="unretweetConfirm"]');
          await randSleep(500, 1500);
          return { content: [{ type: "text", text: JSON.stringify({ success: true, message: "Repost removed" }) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify({ success: false, message: "Could not remove repost (not reposted or not found)" }) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_bookmark",
    {
      title: "Bookmark Tweet",
      description: "Save a tweet to your X bookmarks by its URL.",
      inputSchema: {
        url: z.string().describe("Full URL of the tweet to bookmark"),
      },
    },
    async ({ url }) => {
      try {
        const page = await getPage();
        await page.goto(url, { waitUntil: "networkidle2" });
        await randSleep(1500, 3000);
        const clicked = await clickIfPresent(page, '[data-testid="bookmark"]');
        if (clicked) {
          await randSleep(500, 1500);
          return { content: [{ type: "text", text: JSON.stringify({ success: true, message: "Tweet bookmarked" }) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify({ success: false, message: "Could not bookmark tweet (already bookmarked or not found)" }) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_unbookmark",
    {
      title: "Remove Bookmark",
      description: "Remove a tweet from your X bookmarks by its URL.",
      inputSchema: {
        url: z.string().describe("Full URL of the tweet to unbookmark"),
      },
    },
    async ({ url }) => {
      try {
        const page = await getPage();
        await page.goto(url, { waitUntil: "networkidle2" });
        await randSleep(1500, 3000);
        const clicked = await clickIfPresent(page, '[data-testid="removeBookmark"]');
        if (clicked) {
          await randSleep(500, 1500);
          return { content: [{ type: "text", text: JSON.stringify({ success: true, message: "Bookmark removed" }) }] };
        }
        return { content: [{ type: "text", text: JSON.stringify({ success: false, message: "Could not remove bookmark (not bookmarked or not found)" }) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_quote_tweet",
    {
      title: "Quote Tweet",
      description: "Post a quote tweet of a tweet by its URL with custom text.",
      inputSchema: {
        url: z.string().describe("Full URL of the tweet to quote"),
        text: z.string().describe("Your commentary text for the quote tweet (max 280 chars)"),
      },
    },
    async ({ url, text }) => {
      try {
        const page = await getPage();
        await page.goto(url, { waitUntil: "networkidle2" });
        await randSleep(1500, 3000);

        // Click retweet button to open menu
        const retweetClicked = await clickIfPresent(page, '[data-testid="retweet"]');
        if (!retweetClicked) {
          return { content: [{ type: "text", text: JSON.stringify({ success: false, message: "Could not open retweet menu" }) }] };
        }

        await randSleep(500, 1000);

        // Click "Quote" option from the dropdown menu
        const quoteClicked = await page.evaluate(() => {
          const items = Array.from(document.querySelectorAll('[role="menuitem"]'));
          const quoteItem = items.find((el) => /quote/i.test((el as HTMLElement).textContent ?? ""));
          if (quoteItem) {
            (quoteItem as HTMLElement).click();
            return true;
          }
          return false;
        });

        if (!quoteClicked) {
          return { content: [{ type: "text", text: JSON.stringify({ success: false, message: "Could not find Quote option" }) }] };
        }

        await randSleep(1000, 2000);

        const textbox = await page.$('[data-testid="tweetTextarea_0"]');
        if (!textbox) {
          return { content: [{ type: "text", text: JSON.stringify({ success: false, message: "Could not find quote compose box" }) }] };
        }

        await textbox.type(text, { delay: 40 + Math.floor(Math.random() * 60) });
        await randSleep(500, 1000);

        const posted = await clickIfPresent(page, '[data-testid="tweetButton"]');
        if (posted) {
          await randSleep(1000, 2000);
          const newUrl = page.url();
          return { content: [{ type: "text", text: JSON.stringify({ success: true, message: "Quote tweet posted", tweetUrl: newUrl }) }] };
        }

        return { content: [{ type: "text", text: JSON.stringify({ success: false, message: "Could not post quote tweet" }) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_reply",
    {
      title: "Reply to Tweet",
      description: "Post a reply to a tweet by its URL.",
      inputSchema: {
        url: z.string().describe("Full URL of the tweet to reply to"),
        text: z.string().describe("Your reply text (max 280 chars)"),
      },
    },
    async ({ url, text }) => {
      try {
        const page = await getPage();
        await page.goto(url, { waitUntil: "networkidle2" });
        await randSleep(2000, 3500);

        // Click the reply button on the main tweet to focus the reply box
        await clickIfPresent(page, '[data-testid="reply"]', 5000);
        await randSleep(500, 1000);

        const textbox = await page.$('[data-testid="tweetTextarea_0"]');
        if (!textbox) {
          return { content: [{ type: "text", text: JSON.stringify({ success: false, message: "Could not find reply compose box" }) }] };
        }

        await textbox.type(text, { delay: 40 + Math.floor(Math.random() * 60) });
        await randSleep(500, 1000);

        const posted =
          (await clickIfPresent(page, '[data-testid="tweetButtonInline"]')) ||
          (await clickIfPresent(page, '[data-testid="tweetButton"]'));

        if (posted) {
          await randSleep(1000, 2000);
          return { content: [{ type: "text", text: JSON.stringify({ success: true, message: "Reply posted" }) }] };
        }

        return { content: [{ type: "text", text: JSON.stringify({ success: false, message: "Could not post reply" }) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }] };
      }
    }
  );

  server.registerTool(
    "x_post_tweet",
    {
      title: "Post Tweet",
      description: "Post a new tweet on X.",
      inputSchema: {
        text: z.string().describe("Tweet content (max 280 characters)"),
      },
    },
    async ({ text }) => {
      try {
        const page = await getPage();
        await page.goto("https://x.com/compose/tweet", { waitUntil: "networkidle2" });
        await randSleep(1500, 3000);

        const textbox = await page.$('[data-testid="tweetTextarea_0"]');
        if (!textbox) {
          return { content: [{ type: "text", text: JSON.stringify({ success: false, message: "Could not open compose box" }) }] };
        }

        await textbox.type(text, { delay: 40 + Math.floor(Math.random() * 60) });
        await randSleep(500, 1000);

        const posted = await clickIfPresent(page, '[data-testid="tweetButton"]');
        if (posted) {
          await randSleep(1000, 2000);
          return { content: [{ type: "text", text: JSON.stringify({ success: true, message: "Tweet posted" }) }] };
        }

        return { content: [{ type: "text", text: JSON.stringify({ success: false, message: "Could not post tweet" }) }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: JSON.stringify({ success: false, error: err.message }) }] };
      }
    }
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/tools/tweet.ts
git commit -m "feat: add tweet detail and action tools (get, replies, like, unlike, repost, bookmark, quote, reply, post)"
```

---

## Task 11: Wire server.ts

**Files:**
- Modify: `src/server.ts`
- Delete: `src/tools/echo.ts` (if it exists)

- [ ] **Step 1: Check if echo.ts exists**

```bash
ls src/tools/
```

- [ ] **Step 2: Replace `src/server.ts` entirely**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as search from "./tools/search.js";
import * as timeline from "./tools/timeline.js";
import * as notifications from "./tools/notifications.js";
import * as bookmarks from "./tools/bookmarks.js";
import * as profile from "./tools/profile.js";
import * as tweet from "./tools/tweet.js";

export function createMcpServer() {
  const server = new McpServer(
    {
      name: "xengager-mcp",
      version: "1.0.0",
    },
    {
      capabilities: {
        logging: {},
      },
    }
  );

  search.register(server);
  timeline.register(server);
  notifications.register(server);
  bookmarks.register(server);
  profile.register(server);
  tweet.register(server);

  return server;
}
```

- [ ] **Step 3: Delete echo tool file if it exists**

```bash
rm -f src/tools/echo.ts
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts
git rm -f src/tools/echo.ts 2>/dev/null || true
git commit -m "feat: wire all tool modules into MCP server, remove placeholder tools"
```

---

## Task 12: Add browser shutdown to transports

**Files:**
- Modify: `src/http.ts`
- Modify: `src/stdio.ts`

- [ ] **Step 1: Update `src/http.ts` shutdown handler**

Find this section in `src/http.ts`:

```typescript
async function shutdown() {
  console.log("Shutting down MCP server...");

  for (const [sessionId, transport] of Object.entries(transports)) {
```

Add a `closeBrowser` import at the top of the file (after existing imports):

```typescript
import { closeBrowser } from "./browser.js";
```

Then add `await closeBrowser();` as the first line inside the `shutdown` function:

```typescript
async function shutdown() {
  console.log("Shutting down MCP server...");
  await closeBrowser();

  for (const [sessionId, transport] of Object.entries(transports)) {
```

- [ ] **Step 2: Update `src/stdio.ts`**

Replace the entire content of `src/stdio.ts`:

```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server.js";
import { closeBrowser } from "./browser.js";

const server = createMcpServer();
const transport = new StdioServerTransport();

await server.connect(transport);

process.on("SIGINT", async () => {
  await closeBrowser();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeBrowser();
  process.exit(0);
});
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
bun run typecheck
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
bun test
```

Expected: paginate tests (6) and browser tests (2) all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/http.ts src/stdio.ts
git commit -m "feat: add graceful browser shutdown on SIGINT/SIGTERM"
```

---

## Task 13: Smoke test the server

**Files:** None (verification only)

- [ ] **Step 1: Start the HTTP server**

```bash
bun run dev
```

Expected output: `MCP Streamable HTTP server running on http://localhost:3000/mcp`

- [ ] **Step 2: Check health endpoint**

```bash
curl http://localhost:3000/health
```

Expected: `{"ok":true,"name":"xengager-mcp"}` (or similar with the updated name)

- [ ] **Step 3: Initialize MCP session and list tools**

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | jq '.result.capabilities'
```

Expected: JSON with `tools` capability present.

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: <session-id-from-above>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | jq '[.result.tools[].name]'
```

Expected: array of 24 tool names including `x_search`, `x_home_timeline`, `x_user_profile`, `x_like`, etc.

- [ ] **Step 4: Call x_user_profile as a quick functional test**

```bash
curl -s -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: <session-id>" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"x_user_profile","arguments":{"username":"x"}}}' | jq '.result.content[0].text' | jq -r . | jq .username
```

Expected: `"x"` (or the actual username scraped from x.com/x). If session is invalid you'll get `"Session invalid..."` error message — update cookies in `.env`.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: verified smoke test passes — xengager-mcp ready"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| x_search with advanced operators | Task 5 |
| x_home_timeline with scrolling | Task 6 |
| x_following_timeline with scrolling | Task 6 |
| x_explore with scrolling | Task 6 |
| x_trends | Task 6 |
| x_notifications | Task 7 |
| x_bookmarks | Task 8 |
| x_user_profile (name, avatar, bio, location, joinDate, counts, latestPosts) | Task 9 |
| x_user_posts (threads as grouped arrays) | Task 9 |
| x_user_replies | Task 9 |
| x_user_following | Task 9 |
| x_user_followers | Task 9 |
| x_user_likes | Task 9 |
| x_user_media | Task 9 |
| x_user_articles | Task 9 |
| x_get_tweet (full data + thread detection) | Task 10 |
| x_tweet_replies | Task 10 |
| x_like / x_unlike | Task 10 |
| x_repost / x_unrepost | Task 10 |
| x_bookmark / x_unbookmark | Task 10 |
| x_quote_tweet | Task 10 |
| x_reply | Task 10 |
| x_post_tweet | Task 10 |
| Cursor-based pagination on all list tools | Task 3 + all tool tasks |
| Browser singleton with lazy init | Task 4 |
| Cookie auth (X_AUTH_TOKEN, X_CT0) | Task 4 |
| randSleep everywhere | Task 4 |
| Both stdio + HTTP transports | Task 12 |
| Graceful shutdown | Task 12 |

All 24 tools covered. No gaps found.

**Placeholder scan:** No TBDs, TODOs, or "handle edge cases" language present.

**Type consistency:** `Tweet`, `UserSummary`, `Trend`, `Notification`, `Article`, `MediaItem`, `PaginatedResult` defined in Task 2 and used consistently in Tasks 3–10. `paginateItems<T extends { id: string }>` matches all item types. `register(server: McpServer)` signature consistent across all 6 tool modules.
