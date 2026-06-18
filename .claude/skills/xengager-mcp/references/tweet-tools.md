# Tweet Interaction Tools (10 tools)

## Read-only

| Tool | Description | Accepts |
|------|-------------|---------|
| `x_get_tweet` | Fetch a single tweet | Tweet URL **or** bare numeric tweet ID |
| `x_tweet_replies` | Fetch replies to a tweet | Tweet URL + `limit?`, `cursor?` |

**Tweet ID shortcut**: Pass a bare numeric ID (e.g. `"1850458579500921331"`) instead of a full URL — the tool auto-converts it.

**`x_tweet_replies`** excludes the original tweet. Pair with `x_get_tweet` if you need both.

---

## Action Tools

All action tools return `{ success: boolean, message: string }`.

| Tool | Action | Notes |
|------|--------|-------|
| `x_like(url)` | Like a tweet | Skips if already liked |
| `x_unlike(url)` | Remove a like | Graceful if not liked |
| `x_repost(url)` | Repost (retweet) | Clicks confirmation dialog |
| `x_unrepost(url)` | Undo a repost | Clicks confirmation dialog |
| `x_bookmark(url)` | Bookmark a tweet | Skips if already bookmarked |
| `x_unbookmark(url)` | Remove a bookmark | Verifies removal |
| `x_quote_tweet(url, text)` | Quote tweet with commentary | Opens composer, types, submits |
| `x_reply(url, text)` | Reply to a tweet | Opens composer, types, submits |
| `x_post_tweet(texts[])` | Post a tweet or thread | Thread: 2–25 tweets, each ≤280 chars |

**Idempotency**: Like/bookmark tools check if already applied and skip. Unlike/unbookmark check the button exists and report gracefully if not.

## Posting a Thread

```json
{
  "texts": ["First tweet (≤280 chars)", "Second tweet", "Third tweet"]
}
```

Tweets are posted sequentially as chained replies. If any tweet in a thread fails, the response includes how many were posted before failure.

## Tweet Object Shape

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

## Workflow: "Engage with a tweet"

```
1. x_get_tweet(url)           → read the tweet first
2. x_like(url)                → like it
3. x_repost(url)              → repost it
4. x_bookmark(url)            → save for later
5. x_reply(url, text)         → reply to it
6. x_quote_tweet(url, text)   → quote with commentary
```

## Workflow: "Post content"

```
Single tweet:  x_post_tweet({ texts: ["Hello, world!"] })
Thread:        x_post_tweet({ texts: ["Part 1", "Part 2", "Part 3"] })
```
