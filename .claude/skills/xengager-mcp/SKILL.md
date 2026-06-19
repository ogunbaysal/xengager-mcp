---
name: xengager-mcp
description: >
  ALWAYS load this skill before using any xengager-mcp tool. Required reading
  whenever the task involves X (Twitter): reading timelines, searching tweets,
  fetching profiles, checking notifications/bookmarks, or performing tweet
  actions (like, repost, reply, bookmark, quote, post). The MCP exposes 24
  tools across 6 domains. Loading this skill first prevents incorrect tool
  usage, wrong pagination patterns, and auth mistakes.
allowed-tools: Read
---

# xengager-mcp — Agent Usage Guide

## What Is xengager-mcp?

`xengager-mcp` is an MCP server that gives you programmatic access to X (Twitter)
by controlling a headless Puppeteer browser under a real logged-in X session.
You interact with it by calling MCP tools — each tool navigates the browser,
scrapes or performs an action, and returns structured JSON.

**Example tool call:**
```json
{ "tool": "x_search", "arguments": { "query": "AI news", "tab": "latest", "limit": 10 } }
```

## Critical Rules — Read Before Any Tool Call

- **One tool at a time** — all 24 tools share one browser instance. Never call tools concurrently. Sequence every call.
- **Errors live inside JSON** — tools never throw MCP errors. Always check for an `error` field in the response before proceeding.
- **Auth via cookies** — the server needs `X_AUTH_TOKEN` and `X_CT0` environment variables set. If tools return auth errors, credentials have expired.
- **Each call takes 3–15 seconds** — page loads, scrolling, and UI actions all take time. Plan sequentially.

## Tool Domains

Before calling tools in any domain, **Read the corresponding reference file** for full parameter details, response shapes, and gotchas.

| Domain | Tools | Read before use |
|--------|-------|-----------------|
| Timeline & Explore | `x_home_timeline`, `x_following_timeline`, `x_explore`, `x_trends` | `references/timeline-search.md` |
| Search | `x_search` | `references/timeline-search.md` |
| Notifications | `x_notifications` | `references/notifications-bookmarks.md` |
| Bookmarks | `x_bookmarks` | `references/notifications-bookmarks.md` |
| Profile | `x_user_profile`, `x_user_posts`, `x_user_replies`, `x_user_following`, `x_user_followers`, `x_user_likes`, `x_user_media`, `x_user_articles`, `x_follow`, `x_unfollow` | `references/profile-tools.md` |
| Tweet Interactions | `x_get_tweet`, `x_tweet_replies`, `x_like`, `x_unlike`, `x_repost`, `x_unrepost`, `x_bookmark`, `x_unbookmark`, `x_quote_tweet`, `x_reply`, `x_post_tweet` | `references/tweet-tools.md` |

## Pagination — Applies to All List Tools

All list tools use cursor-based pagination with the same pattern:

```
1st call:  omit cursor → get first page
           result: { items: [...], nextCursor: "123...", hasMore: true }
2nd call:  pass nextCursor as cursor → get next page
           result: { items: [...], nextCursor: "456...", hasMore: true }
Stop when: hasMore is false  OR  nextCursor is null
```

## Error Handling Pattern

```json
// Success — no error field
{ "items": [...], "nextCursor": "...", "hasMore": true }

// Error — always check this
{ "items": [], "nextCursor": null, "hasMore": false, "error": "Session expired…" }

// Action error
{ "success": false, "message": "Like button not found" }
```

## Quick Reference (parameters — see reference files for full details)

```
READ TOOLS:
  x_search            query, tab?, limit?, cursor?
  x_home_timeline     limit?, cursor?
  x_following_timeline limit?, cursor?
  x_explore           limit?, cursor?
  x_trends            limit?, cursor?
  x_notifications     filter?, limit?, cursor?
  x_bookmarks         limit?, cursor?
  x_get_tweet         url  (accepts tweet URL or bare numeric ID)
  x_tweet_replies     url, limit?, cursor?
  x_user_profile      username
  x_user_posts        username, limit?, cursor?
  x_user_replies      username, limit?, cursor?
  x_user_following    username, limit?, cursor?
  x_user_followers    username, limit?, cursor?
  x_user_likes        username, limit?, cursor?   ← authenticated user only
  x_user_media        username, limit?, cursor?
  x_user_articles     username, limit?, cursor?

ACTION TOOLS (all return { success: boolean, message: string }):
  x_like              url
  x_unlike            url
  x_repost            url
  x_unrepost          url
  x_bookmark          url
  x_unbookmark        url
  x_quote_tweet       url, text
  x_reply             url, text
  x_post_tweet        texts  (array of strings, each ≤280 chars)
  x_follow            username
  x_unfollow          username
```

All usernames are passed **without** the `@` prefix. All tweet references accept either a full `https://x.com/…` URL or a bare numeric tweet ID.
