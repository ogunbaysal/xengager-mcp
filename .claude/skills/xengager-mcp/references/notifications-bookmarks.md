# Notifications & Bookmarks Tools

## Notifications: `x_notifications`

Returns the authenticated user's notification feed.

**Parameters:**
- `filter` — `"all"` (default) | `"mentions"` — use `"mentions"` when you only need @-mentions; it's faster and less noisy
- `limit` — 1–100 (default 20)
- `cursor` — notification ID for pagination

**Example:**
```json
{ "tool": "x_notifications", "arguments": { "filter": "mentions", "limit": 20 } }
{ "tool": "x_notifications", "arguments": { "filter": "all", "limit": 20, "cursor": "..." } }
```

**Notification types you'll see:** `like`, `repost`, `reply`, `follow`, `mention`, `quote`

---

## Bookmarks: `x_bookmarks`

Returns the authenticated user's saved bookmarks. Only works for the logged-in account.

**Parameters:**
- `limit` — 1–100 (default 20)
- `cursor` — tweet ID for pagination

**Example:**
```json
{ "tool": "x_bookmarks", "arguments": { "limit": 20 } }
{ "tool": "x_bookmarks", "arguments": { "limit": 20, "cursor": "1850458579500921331" } }
```

Returns an array of Tweet objects (same shape as all other tweet results).

---

## Workflow: Monitor engagement

```
1. x_notifications(filter: "all")       → all recent interactions (likes, reposts, follows, mentions)
2. x_notifications(filter: "mentions")  → only @-mentions, faster
3. x_bookmarks()                        → saved tweets for later reference
```
