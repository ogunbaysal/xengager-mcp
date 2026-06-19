# Timeline, Explore & Search Tools

## Timeline & Explore (4 tools)

These tools return the browser-rendered feed — the same content you'd see on X.com.

| Tool | What it returns |
|------|----------------|
| `x_home_timeline` | "For You" algorithmic feed |
| `x_following_timeline` | "Following" chronological feed |
| `x_explore` | Trending tweets from the Explore tab |
| `x_trends` | Trending topic list (hashtags/keywords, not tweets) |

**Parameters** (all four tools):
- `limit` — number of items to return, 1–100 (default 20)
- `cursor` — pagination cursor from previous result's `nextCursor`

**Example:**
```json
{ "tool": "x_home_timeline", "arguments": { "limit": 20 } }
{ "tool": "x_home_timeline", "arguments": { "limit": 20, "cursor": "1850458579500921331" } }
```

**Response shape** (timeline tools):
```json
{ "items": [ /* Tweet[] */ ], "nextCursor": "1850458579500921331", "hasMore": true }
```

**Response shape** (`x_trends`):
```json
{ "items": [ /* Trend[] */ ], "nextCursor": "trend-id", "hasMore": false }
```

---

## Search (1 tool): `x_search`

Full-text search with X's advanced operators.

**Parameters:**
- `query` — search text, supports operators below
- `tab` — `"top"` (default) | `"latest"` | `"media"` — **do not use `"people"`**, it returns an error; use `x_user_following` for user search
- `limit` — 1–100 (default 20)
- `cursor` — tweet ID for pagination

**Example:**
```json
{ "tool": "x_search", "arguments": { "query": "AI agents from:OpenAI lang:en min_likes:500", "tab": "latest", "limit": 20 } }
```

**Advanced operator cheat sheet:**
```
from:username       tweets by a specific user
to:username         tweets replying to a user
since:YYYY-MM-DD    tweets after this date
until:YYYY-MM-DD    tweets before this date
lang:en             filter by language
min_likes:100       minimum likes threshold
min_retweets:50     minimum reposts threshold
has:media           tweets with images/video only
filter:links        tweets containing URLs only
```

Combine operators freely: `from:OpenAI since:2026-01-01 min_likes:1000`

---

## Workflow: "What's happening on X right now?"

```
1. x_trends                              → get list of trending topics
2. x_search(topic, tab: "top")           → top tweets for a specific trend
   OR x_explore()                        → trending tweets directly without a query
```
