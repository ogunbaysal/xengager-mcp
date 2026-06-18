# Timeline, Explore & Search Tools

## Timeline & Explore (4 tools)

| Tool | Description | X.com URL |
|------|-------------|-----------|
| `x_home_timeline` | "For You" algorithmic feed | `/home` |
| `x_following_timeline` | "Following" chronological feed | `/home` → clicks "Following" tab |
| `x_explore` | Trending tweets | `/explore` |
| `x_trends` | Trending topics list | `/i/trends` |

**Parameters**: `limit` (1–100, default 20), `cursor` (tweet ID or trend ID from previous `nextCursor`)

**Response shape** (tweets):
```json
{ "items": [/* Tweet[] */], "nextCursor": "185045…", "hasMore": true }
```

**Response shape** (trends — `x_trends`):
```json
{ "items": [/* Trend[] */], "nextCursor": "trend-id", "hasMore": false }
```

---

## Search (1 tool)

**Tool**: `x_search`

**Parameters**:
- `query` — text query with optional X operators
- `tab` — `"top"` | `"latest"` | `"people"` | `"media"` (default `"top"`)
- `limit` — 1–100 (default 20)
- `cursor` — tweet ID for pagination

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

**Notes**:
- `tab: "people"` returns an error — use `x_user_following` for user search instead
- `tab: "media"` for image/video-only results
- Combine operators for precision: `from:OpenAI lang:en min_likes:500`

---

## Workflow: "What's happening on X right now?"

```
1. x_trends                          → get trending topics
2. x_search(topic, tab: "top")       → top tweets for a trend
   OR x_explore()                    → trending tweets directly
```
