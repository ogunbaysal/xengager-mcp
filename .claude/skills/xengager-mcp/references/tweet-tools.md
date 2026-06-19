# Tweet Interaction Tools (10 tools)

## Read-only Tools

### `x_get_tweet`
Fetch a single tweet by URL or ID.

```json
{ "tool": "x_get_tweet", "arguments": { "url": "https://x.com/user/status/1850458579500921331" } }
{ "tool": "x_get_tweet", "arguments": { "url": "1850458579500921331" } }
```

Both forms work — bare numeric IDs are auto-converted to the canonical URL.

### `x_tweet_replies`
Fetch replies to a tweet.

```json
{ "tool": "x_tweet_replies", "arguments": { "url": "https://x.com/user/status/123", "limit": 20, "cursor": "..." } }
```

**Note**: The original tweet is NOT included in results. Use `x_get_tweet` first if you need it.

---

## Action Tools

All action tools accept a `url` parameter (tweet URL or bare numeric ID) and return:
```json
{ "success": true, "message": "Liked successfully" }
{ "success": false, "message": "Like button not found" }
```

| Tool | Action | Idempotency behavior |
|------|--------|----------------------|
| `x_like` | Like a tweet | Skips silently if already liked |
| `x_unlike` | Remove a like | Reports gracefully if not liked |
| `x_repost` | Repost (retweet) | Clicks confirmation dialog |
| `x_unrepost` | Undo a repost | Clicks confirmation dialog |
| `x_bookmark` | Bookmark a tweet | Skips silently if already bookmarked |
| `x_unbookmark` | Remove a bookmark | Verifies removal after click |

**Example:**
```json
{ "tool": "x_like", "arguments": { "url": "https://x.com/user/status/1850458579500921331" } }
```

### `x_reply`
Reply to a tweet with text.

```json
{ "tool": "x_reply", "arguments": { "url": "https://x.com/user/status/123", "text": "Great point!" } }
```

### `x_quote_tweet`
Quote a tweet with your own commentary.

```json
{ "tool": "x_quote_tweet", "arguments": { "url": "https://x.com/user/status/123", "text": "This is important because…" } }
```

### `x_post_tweet`
Post a single tweet or a thread. Always pass `texts` as an array.

```json
// Single tweet
{ "tool": "x_post_tweet", "arguments": { "texts": ["Hello, world!"] } }

// Thread (2–25 tweets, each ≤280 characters)
{ "tool": "x_post_tweet", "arguments": { "texts": ["Part 1 of my thread", "Part 2 continues here", "Part 3 conclusion"] } }
```

Returns: `{ "success": true, "message": "...", "tweetCount": 3 }`

If a thread fails mid-way, `message` tells you how many tweets were posted before failure.

---

## Tweet Object Shape

Every read tool returns tweets in this shape:

```json
{
  "id": "1850458579500921331",
  "url": "https://x.com/user/status/1850458579500921331",
  "text": "Tweet content here",
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

---

## Workflow: Engage with a tweet

```
1. x_get_tweet(url)          → read it first
2. x_like(url)               → like it
3. x_repost(url)             → repost it
4. x_reply(url, text)        → reply to it
5. x_quote_tweet(url, text)  → quote with commentary
6. x_bookmark(url)           → save for later
```
