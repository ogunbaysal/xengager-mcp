---
name: xengager-mcp
description: >
  Programmatic access to X (Twitter) via headless browser. Use this skill
  whenever the task involves reading timelines, searching tweets, fetching
  profiles, checking notifications/bookmarks, or performing tweet actions
  (like, repost, reply, bookmark, quote, post). The MCP exposes 24 tools
  across 6 domains: search, timeline, notifications, bookmarks, profile,
  and tweet interactions. It is imposible to read this skill before interacting xengager-mcp!
---

# X (Twitter) MCP — Agent Usage Guide

## Overview

`xengager-mcp` runs a headless Puppeteer browser behind a single X (Twitter)
session. All tools share that browser instance, so **only one tool call runs at
a time**. Calls are serialized naturally by the MCP transport — you don't need
to coordinate, but don't expect concurrency.

The server authenticates via cookies (`X_AUTH_TOKEN` + `X_CT0`) from the
environment. If the session expires or credentials are invalid, all tools
return an error in the JSON payload (never throw at the MCP protocol level).

---

## Tool Categories

### 1. Timeline & Explore (4 tools)

| Tool | Description | X.com URL |
|------|-------------|-----------|
| `x_home_timeline` | "For You" feed | `/home` |
| `x_following_timeline` | "Following" feed | `/home` → clicks "Following" tab |
| `x_explore` | Explore trending tweets | `/explore` |
| `x_trends` | Trending topics list | `/i/trends` |

**Pagination**: Use `cursor` (tweet ID or trend ID from previous page's
`nextCursor`). Set `limit` (1–100, default 20).

**Response shape** (tweets): `{ items: Tweet[], nextCursor: string | null, hasMore: boolean }`

**Response shape** (trends): `{ items: Trend[], nextCursor: string | null, hasMore: boolean }`

### 2. Search (1 tool)

| Tool | Description |
|------|-------------|
| `x_search` | Full-text search with advanced operators |

**Parameters**:
- `query` — text query with optional X operators
- `tab` — `"top"` | `"latest"` | `"people"` | `"media"` (default `"top"`)
- `limit` — 1–100 (default 20)
- `cursor` — tweet ID pagination

**Advanced operator cheat sheet**:
```
from:username      — tweets by a specific user
to:username        — tweets replying to a user
since:YYYY-MM-DD   — tweets after date
until:YYYY-MM-DD   — tweets before date
lang:en            — language filter
min_likes:100      — minimum likes threshold
min_retweets:50    — minimum reposts threshold
has:media          — tweets with images/video
filter:links       — tweets containing URLs
```

**Note**: `tab: "people"` returns an error — use `x_user_following` for user
search. Use `tab: "media"` for image/video-only results.

**Best practice**: Combine operators for precision. Example:
`from:OpenAI lang:en min_likes:500` finds popular English tweets from OpenAI.

### 3. Notifications (1 tool)

| Tool | Description |
|------|-------------|
| `x_notifications` | Get notifications with filtering |

**Parameters**:
- `filter` — `"all"` (default) or `"mentions"`
- `limit` — 1–100 (default 20)
- `cursor` — notification ID pagination

**Notification types**: `like`, `repost`, `reply`, `follow`, `mention`, `quote`

**Best practice**: Use `filter: "mentions"` when you only need @-mentions,
not likes/reposts. This is faster and produces less noise.

### 4. Bookmarks (1 tool)

| Tool | Description |
|------|-------------|
| `x_bookmarks` | Get authenticated user's bookmarks |

**Parameters**: `limit` (1–100, default 20), `cursor` (tweet ID pagination)

**Note**: Only available for the authenticated account. Returns tweets.

### 5. Profile (8 tools)

| Tool | Endpoint | Returns |
|------|----------|---------|
| `x_user_profile` | `/:username` | `UserProfile` with latest 3 posts |
| `x_user_posts` | `/:username` | Paginated tweets |
| `x_user_replies` | `/:username/with_replies` | Paginated tweets+replies |
| `x_user_following` | `/:username/following` | `{ usernames: string[], … }` |
| `x_user_followers` | `/:username/followers` | `{ usernames: string[], … }` |
| `x_user_likes` | `/:username/likes` | Paginated tweets (owner-only) |
| `x_user_media` | `/:username/media` | Paginated `MediaItem[]` |
| `x_user_articles` | `/:username/articles` | Paginated `Article[]` |

**All tools accept**: `username` (string, without `@`)

**Pagination tools also accept**: `limit` (1–100 or 1–200 for
following/followers) and `cursor` (tweet/item ID).

**⚠️ likes are private**: `x_user_likes` only works for the **authenticated
user**. X.com restricts likes visibility to the account owner. Requests for
other users return an explicit error message — not an empty list.

**Following/Followers cursor**: Uses **username** as the cursor (not tweet ID).
Pass the last username from the previous page's `usernames` array.

**UserProfile shape**:
```json
{
  "id": "…", "username": "…", "displayName": "…",
  "avatarUrl": "…", "bio": "…", "location": "…",
  "website": "…", "joinedDate": "…",
  "followersCount": 123, "followingCount": 456,
  "verified": true,
  "latestPosts": [ /* up to 3 Tweet objects */ ]
}
```

### 6. Tweet Interactions (10 tools)

#### Read-only

| Tool | Description | Accepts |
|------|-------------|---------|
| `x_get_tweet` | Fetch a single tweet | Tweet URL **or** numeric tweet ID |
| `x_tweet_replies` | Fetch replies to a tweet | Tweet URL + pagination |

**Tweet ID shortcut**: Pass a bare numeric ID (e.g. `"1850458579500921331"`)
instead of a URL. The tool auto-converts it to the canonical X.com URL.

**x_tweet_replies** excludes the original tweet from results. Use with
`x_get_tweet` if you need both the original and replies.

#### Actions (all return `{ success: boolean, message: string }`)

| Tool | Action | Idempotency |
|------|--------|-------------|
| `x_like` | Like a tweet | Skips if already liked |
| `x_unlike` | Remove a like | Graceful if not liked |
| `x_repost` | Repost (retweet) | Clicks confirmation dialog |
| `x_unrepost` | Undo a repost | Clicks confirmation dialog |
| `x_bookmark` | Bookmark a tweet | Skips if already bookmarked |
| `x_unbookmark` | Remove a bookmark | Verifies removal |
| `x_quote_tweet` | Quote tweet with commentary | Opens composer, types, submits |
| `x_reply` | Reply to a tweet | Opens composer, types, submits |
| `x_post_tweet` | Post a tweet or thread | Thread: 2–25 tweets, each ≤280 chars |

**Action tools are idempotent**: Before liking/bookmarking, the tool checks
if the action is already applied and skips. Before unliking/unbookmarking,
it checks the button exists and gracefully reports if not.

**Posting a thread**:
```json
{
  "texts": ["First tweet (≤280 chars)", "Second tweet", "Third tweet"]
}
```
The tool posts tweets sequentially as chained replies, forming a thread.
If any tweet in a thread fails, it returns how many were posted before failure.

---

## Common Patterns

### The Tweet Object

Every read tool returns tweets in this shape:

```json
{
  "id": "1850458579500921331",
  "url": "https://x.com/user/status/1850458579500921331",
  "text": "Tweet content",
  "author": {
    "username": "handle",
    "displayName": "Display Name",
    "avatarUrl": "https://pbs.twimg.com/…",
    "verified": true
  },
  "date": "2025-01-15T12:00:00.000Z",
  "likeCount": 42,
  "repostCount": 7,
  "replyCount": 3,
  "bookmarkCount": 5,
  "viewCount": 1200,
  "isThread": false,
  "hasMedia": false,
  "mediaUrls": []
}
```

### Pagination Pattern

All list tools use cursor-based pagination:

1. **First call**: Omit `cursor` (or pass `undefined`).
2. **Read result**: Check `hasMore` and save `nextCursor`.
3. **Next page**: Pass `nextCursor` as `cursor` in the next call.
4. **Stop**: When `hasMore` is `false` or `nextCursor` is `null`.

```json
// Page 1
{ "items": […20 items…], "nextCursor": "1850458579500921331", "hasMore": true }

// Page 2 — pass cursor from page 1
{ "items": […20 items…], "nextCursor": "1850458579000000000", "hasMore": true }

// Page 3 — pass cursor from page 2
{ "items": […8 items…],  "nextCursor": null, "hasMore": false }
```

**Note on limits**: The tool always collects 3× `limit` tweets (minimum 60)
via scrolling, then paginates from the in-memory buffer. This means a
`limit: 100` call collects ~300 tweets. Repeated cursor pagination within
the same buffer is fast; a `cursor` beyond the buffer triggers a fresh
collect cycle.

### Error Handling

All tools return errors **inside** the JSON payload — they never throw MCP
errors. Always check for an `error` field in responses:

```json
// Success — no error field
{ "items": […], "nextCursor": "…", "hasMore": true }

// Error — check error field
{ "items": [], "nextCursor": null, "hasMore": false, "error": "Likes for @user are not accessible…" }

// Action error
{ "success": false, "message": "Like button not found" }
```

---

## Workflow Recipes

### "What's happening on X right now?"

```
1. x_trends → get trending topics
2. For a specific trend, x_search with that topic as query + tab: "top"
3. Or x_explore → see trending tweets directly
```

### "Research a user"

```
1. x_user_profile(username) → bio, follower count, latest posts
2. x_user_posts(username) → recent tweets
3. x_user_media(username) → recent images/videos
4. x_user_following(username) → who they follow (paginated)
5. x_user_followers(username) → who follows them (paginated)
```

### "Monitor my engagement"

```
1. x_notifications → recent interactions
2. x_notifications(filter: "mentions") → only @-mentions
3. x_bookmarks → saved tweets
```

### "Engage with a tweet"

```
1. x_get_tweet(url) → read the tweet
2. x_like(url) → like it
3. x_repost(url) → repost it
4. x_bookmark(url) → save for later
5. x_reply(url, text) → reply to it
6. x_quote_tweet(url, text) → quote with commentary
```

### "Post content"

```
Single tweet:
  x_post_tweet({ texts: ["Hello, world!"] })

Thread:
  x_post_tweet({ texts: ["Part 1", "Part 2", "Part 3"] })
  // Each string must be ≤280 characters
```

---

## Limitations & Cautions

### Rate Limiting & Stealth

The browser uses:
- Randomized user agents per launch
- Stealth plugin (evades `navigator.webdriver` detection)
- Human-like mouse movement (stealthClick)
- Randomized delays between actions (timings in `src/timings.ts`)

Despite these measures, aggressive scraping can trigger X rate limits or
temporary restrictions. **Space out calls** and use reasonable limits.

### Session Requirements

The authenticated session requires valid `X_AUTH_TOKEN` and `X_CT0`
environment variables. To obtain them:
1. Log into x.com in Chrome
2. Open DevTools → Application → Cookies → x.com
3. Copy `auth_token` and `ct0` values

These expire periodically. If tools start returning auth errors, the
credentials need refreshing.

### No Concurrency

All tools share one Puppeteer browser instance. Each tool navigates the
page and extracts data — **do not call multiple tools simultaneously**.
Sequence all calls.

### X.com Access Restrictions

- **Likes**: Only visible for the authenticated account owner. Other users'
  likes return an explicit error.
- **Protected accounts**: Cannot be accessed without following approval.
- **NSFW/age-restricted content**: May require additional authentication
  that the headless browser doesn't handle.

### Timing

Each tool call takes 3–15 seconds depending on:
- Page load + SPA hydration (~2–4s)
- Scrolling to collect tweets (~1.5–3s per scroll step)
- UI actions (compose, type, submit — ~0.5–4s each)

Plan accordingly. A full paginated read of 5 pages takes 15–30 seconds.
Posting a thread of 5 tweets takes 10–20 seconds.

---

## Quick Reference

```
READ:
  x_search(query, tab?, limit?, cursor?)
  x_home_timeline(limit?, cursor?)
  x_following_timeline(limit?, cursor?)
  x_explore(limit?, cursor?)
  x_trends(limit?, cursor?)
  x_notifications(filter?, limit?, cursor?)
  x_bookmarks(limit?, cursor?)
  x_get_tweet(url)
  x_tweet_replies(url, limit?, cursor?)
  x_user_profile(username)
  x_user_posts(username, limit?, cursor?)
  x_user_replies(username, limit?, cursor?)
  x_user_following(username, limit?, cursor?)
  x_user_followers(username, limit?, cursor?)
  x_user_likes(username, limit?, cursor?)
  x_user_media(username, limit?, cursor?)
  x_user_articles(username, limit?, cursor?)

ACTIONS:
  x_like(url)           → { success, message }
  x_unlike(url)          → { success, message }
  x_repost(url)          → { success, message }
  x_unrepost(url)        → { success, message }
  x_bookmark(url)        → { success, message }
  x_unbookmark(url)      → { success, message }
  x_quote_tweet(url, text) → { success, message }
  x_reply(url, text)     → { success, message }
  x_post_tweet(texts[])  → { success, message, tweetCount }
```

## Facing Errors or Issues?
- Please report about the request and response payloads, and any error messages you receive. This will help us diagnose and fix issues faster.