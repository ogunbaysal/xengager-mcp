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

## Critical Rules

- **Serialized only** — all 24 tools share one Puppeteer browser. Never call tools concurrently. Sequence all calls.
- **Errors inside JSON** — tools never throw MCP errors. Always check for an `error` field in the response.
- **Auth via cookies** — `X_AUTH_TOKEN` + `X_CT0` env vars. If tools return auth errors, credentials need refreshing.
- **Each call takes 3–15 seconds** — plan accordingly; paginated reads and threads take longer.

## Tool Domains (24 tools total)

| Domain | Tools | Reference |
|--------|-------|-----------|
| Timeline & Explore | `x_home_timeline`, `x_following_timeline`, `x_explore`, `x_trends` | [references/timeline-search.md](references/timeline-search.md) |
| Search | `x_search` | [references/timeline-search.md](references/timeline-search.md) |
| Notifications | `x_notifications` | [references/notifications-bookmarks.md](references/notifications-bookmarks.md) |
| Bookmarks | `x_bookmarks` | [references/notifications-bookmarks.md](references/notifications-bookmarks.md) |
| Profile | `x_user_profile`, `x_user_posts`, `x_user_replies`, `x_user_following`, `x_user_followers`, `x_user_likes`, `x_user_media`, `x_user_articles` | [references/profile-tools.md](references/profile-tools.md) |
| Tweet Interactions | `x_get_tweet`, `x_tweet_replies`, `x_like`, `x_unlike`, `x_repost`, `x_unrepost`, `x_bookmark`, `x_unbookmark`, `x_quote_tweet`, `x_reply`, `x_post_tweet` | [references/tweet-tools.md](references/tweet-tools.md) |

## Pagination (applies to all list tools)

1. First call: omit `cursor`
2. Save `nextCursor` from result
3. Next page: pass `nextCursor` as `cursor`
4. Stop when `hasMore: false` or `nextCursor: null`

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
  x_get_tweet(url_or_id)
  x_tweet_replies(url, limit?, cursor?)
  x_user_profile(username)
  x_user_posts(username, limit?, cursor?)
  x_user_replies(username, limit?, cursor?)
  x_user_following(username, limit?, cursor?)
  x_user_followers(username, limit?, cursor?)
  x_user_likes(username, limit?, cursor?)      ← authenticated user only
  x_user_media(username, limit?, cursor?)
  x_user_articles(username, limit?, cursor?)

ACTIONS (all return { success, message }):
  x_like(url)               x_unlike(url)
  x_repost(url)             x_unrepost(url)
  x_bookmark(url)           x_unbookmark(url)
  x_quote_tweet(url, text)
  x_reply(url, text)
  x_post_tweet(texts[])     ← thread: 2–25 tweets, each ≤280 chars
```

For detailed parameters, response shapes, operators, and workflow recipes — read the relevant file in `references/`.
