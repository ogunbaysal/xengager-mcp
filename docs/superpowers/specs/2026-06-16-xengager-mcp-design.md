# xengager-mcp Design Spec
_Date: 2026-06-16_

## Overview

An MCP server for X (Twitter) that lets an AI agent operate a single X account like a human — reading timelines, searching, viewing profiles, and taking actions (like, repost, bookmark, quote, reply). Powered by a persistent headless Puppeteer browser with stealth plugin. Built on the existing Bun + TypeScript MCP starter.

---

## Architecture

**Runtime:** Bun + TypeScript  
**Browser:** `puppeteer-extra` + `puppeteer-extra-plugin-stealth` — persistent singleton  
**Auth:** `X_AUTH_TOKEN` + `X_CT0` cookie values from `.env`, injected at startup  
**Transport:** Both stdio (Claude Desktop/CLI) and Streamable HTTP (Docker/remote)

### File Structure

```
src/
  browser.ts          ← singleton browser/page, cookie auth, randSleep, helpers
  server.ts           ← wires all tool modules into McpServer
  http.ts             ← Streamable HTTP transport (existing)
  stdio.ts            ← stdio transport (existing)
  tools/
    search.ts         ← x_search
    timeline.ts       ← x_home_timeline, x_following_timeline, x_explore, x_trends
    notifications.ts  ← x_notifications
    bookmarks.ts      ← x_bookmarks
    profile.ts        ← x_user_profile, x_user_posts, x_user_replies,
                         x_user_following, x_user_followers, x_user_likes,
                         x_user_media, x_user_articles
    tweet.ts          ← x_get_tweet, x_tweet_replies, x_like, x_unlike,
                         x_repost, x_unrepost, x_bookmark, x_unbookmark,
                         x_quote_tweet, x_reply, x_post_tweet
```

---

## Tool Inventory (24 tools)

### Search
| Tool | Inputs | Returns |
|------|--------|---------|
| `x_search` | `query`, `tab` (top/latest/people/media), `limit`, `cursor` | paginated tweet list |

The `query` field supports native X advanced operators: `from:`, `to:`, `since:`, `until:`, `lang:`, `min_likes:`, `min_retweets:`, `has:media`, etc.

### Timeline & Discovery
| Tool | Inputs | Returns |
|------|--------|---------|
| `x_home_timeline` | `limit`, `cursor` | paginated tweet list (For You feed) |
| `x_following_timeline` | `limit`, `cursor` | paginated tweet list (Following feed) |
| `x_explore` | `limit`, `cursor` | paginated tweet list (Explore tab) |
| `x_trends` | `limit`, `cursor` | paginated trend list (topic, tweet count, category) |

### Notifications
| Tool | Inputs | Returns |
|------|--------|---------|
| `x_notifications` | `filter` (all/mentions), `limit`, `cursor` | paginated notification list |

### Bookmarks
| Tool | Inputs | Returns |
|------|--------|---------|
| `x_bookmarks` | `limit`, `cursor` | paginated tweet list |

### Profile
| Tool | Inputs | Returns |
|------|--------|---------|
| `x_user_profile` | `username` | profile object (see below) |
| `x_user_posts` | `username`, `limit`, `cursor` | paginated posts; threads grouped as arrays |
| `x_user_replies` | `username`, `limit`, `cursor` | paginated reply tweets |
| `x_user_following` | `username`, `limit`, `cursor` | paginated user list |
| `x_user_followers` | `username`, `limit`, `cursor` | paginated user list |
| `x_user_likes` | `username`, `limit`, `cursor` | paginated liked tweets |
| `x_user_media` | `username`, `limit`, `cursor` | paginated media tweets |
| `x_user_articles` | `username`, `limit`, `cursor` | paginated article list |

**Profile object shape:**
```ts
{
  username: string
  displayName: string
  avatarUrl: string
  bio: string
  location: string
  website: string
  joinedDate: string       // "March 2020"
  followersCount: number
  followingCount: number
  verified: boolean
  latestPosts: Tweet[]     // first 3 posts
}
```

### Tweet Detail & Actions
| Tool | Inputs | Returns |
|------|--------|---------|
| `x_get_tweet` | `url` | full tweet object (see below) |
| `x_tweet_replies` | `url`, `limit`, `cursor` | paginated reply tweets |
| `x_like` | `url` | `{ success, message }` |
| `x_unlike` | `url` | `{ success, message }` |
| `x_repost` | `url` | `{ success, message }` |
| `x_unrepost` | `url` | `{ success, message }` |
| `x_bookmark` | `url` | `{ success, message }` |
| `x_unbookmark` | `url` | `{ success, message }` |
| `x_quote_tweet` | `url`, `text` | `{ success, message, tweetUrl }` |
| `x_reply` | `url`, `text` | `{ success, message, tweetUrl }` |
| `x_post_tweet` | `text` | `{ success, message, tweetUrl }` |

**Tweet object shape:**
```ts
{
  id: string
  url: string
  text: string
  author: {
    username: string
    displayName: string
    avatarUrl: string
    verified: boolean
  }
  date: string             // ISO 8601
  likeCount: number
  repostCount: number
  replyCount: number
  bookmarkCount: number
  viewCount: number
  isThread: boolean
  threadTweets?: Tweet[]   // populated when isThread = true
  hasMedia: boolean
  mediaUrls: string[]
}
```

---

## Pagination

All list-returning tools share a consistent cursor-based pagination contract.

**Request params:**
```ts
limit?: number    // items per page, default 20
cursor?: string   // opaque string from previous response's nextCursor; omit for first page
```

**Response shape:**
```ts
{
  items: T[]
  nextCursor: string | null   // null when no more pages
  hasMore: boolean
}
```

**Cursor value:** The tweet ID (or user ID for follower/following lists) of the last item in the returned batch. On a paginated call, the browser navigates fresh, scrolls collecting items, discards everything up to and including the cursor item, then returns the next `limit` items. Stateless — safe with the singleton browser.

---

## Browser Singleton (`src/browser.ts`)

### Startup sequence
1. Import `puppeteer-extra` + `puppeteer-extra-plugin-stealth`
2. Launch browser with stealth args (matching xactions pattern):
   ```
   --no-sandbox, --disable-setuid-sandbox,
   --disable-blink-features=AutomationControlled,
   --disable-infobars, --disable-dev-shm-usage
   ```
3. Create page, set random user-agent from pool (from xactions `stealthBrowser.js`)
4. Apply `evaluateOnNewDocument` anti-detection patches (navigator.webdriver, plugins, WebGL)
5. Inject cookies: `auth_token` = `X_AUTH_TOKEN`, `ct0` = `X_CT0` for domain `.x.com`
6. Navigate to `https://x.com/home` and verify session (check URL doesn't redirect to login)
7. Export `getPage()` — checks `browser.isConnected()`, re-launches if needed

### Key utilities
```ts
// Randomized delay — used everywhere instead of fixed sleep
export function randSleep(min: number, max: number): Promise<void>

// Human-like scroll with random step sizes
export async function scrollPage(page, times: number): Promise<void>

// Navigate and wait
export async function goto(page, url: string): Promise<void>

// Safe click with bounding-box mouse movement (from xactions stealthClick)
export async function stealthClick(page, selector: string): Promise<void>
```

### Auto-recovery
`getPage()` detects `!browser.isConnected()` and re-runs the full startup sequence including cookie injection.

---

## Selectors

All selectors are taken directly from verified xactions implementations — no guessing:

```ts
// Tweet
'article[data-testid="tweet"]'
'[data-testid="tweetText"]'
'[data-testid="User-Name"]'
'[data-testid="like"]' / '[data-testid="unlike"]'
'[data-testid="retweet"]' / '[data-testid="unretweet"]'
'[data-testid="retweetConfirm"]'
'[data-testid="reply"]'
'[data-testid="bookmark"]' / '[data-testid="removeBookmark"]'
'a[href*="/analytics"]'   // view count

// Notification
'[data-testid="notification"]'

// Bookmark page
'a[href="/i/bookmarks"]'

// Search
'[data-testid="SearchBox_Search_Input"]'
'[data-testid="trend"]'

// Explore tabs
'a[href*="f=live"]'   // Latest
'a[href*="f=user"]'   // People
'a[href*="f=image"]'  // Media
```

---

## Data Flow

```
MCP Client (Claude agent)
  ↓ calls tool({ cursor?, limit?, ...params })
server.ts
  ↓ dispatches to tool module
tool module
  ↓ calls getPage() from browser.ts
  ↓ goto(url), scroll loop, page.evaluate() → raw items
  ↓ dedup by ID, apply cursor offset, slice to limit
  ↓ returns { items, nextCursor, hasMore }
MCP Client
```

**Scroll loop pattern (reads):**
```
navigate → randSleep(2000, 4000) → collect visible items
→ scroll → randSleep(1500, 3000) → collect new items → dedup
→ repeat until limit+cursor satisfied or no new items appear
```

**Action pattern:**
```
navigate to tweet URL → randSleep(1500, 3000)
→ waitForSelector → stealthClick → randSleep(500, 1500)
→ verify state changed → return { success, message }
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Missing env vars (`X_AUTH_TOKEN`, `X_CT0`) | `initBrowser()` throws at startup — server refuses to start |
| Session expired / redirected to login | Detected by URL check after navigation; tool returns `{ success: false, error: "Session expired. Update X_AUTH_TOKEN and X_CT0 in .env" }` |
| Selector not found / timeout | Read tools return `{ items: [], hasMore: false }`; action tools return `{ success: false, error: "Element not found" }` |
| Browser disconnected | `getPage()` auto re-launches and re-authenticates |
| Unhandled exception in tool | Caught, returns `{ success: false, error: message }` — never crashes MCP session |

---

## Environment Variables

```env
# Required
X_AUTH_TOKEN=         # auth_token cookie from x.com
X_CT0=                # ct0 cookie from x.com

# Optional (existing)
PORT=3000
MCP_API_KEY=          # Bearer token to protect HTTP endpoint
```

---

## Dependencies to Add

```
puppeteer
puppeteer-extra
puppeteer-extra-plugin-stealth
```

Types: `@types/puppeteer` (if needed by Bun's TS checker)

The existing `@modelcontextprotocol/sdk` and `zod` stay. `express` stays for HTTP transport.
