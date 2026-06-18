# Notifications & Bookmarks Tools

## Notifications (1 tool)

**Tool**: `x_notifications`

**Parameters**:
- `filter` — `"all"` (default) | `"mentions"`
- `limit` — 1–100 (default 20)
- `cursor` — notification ID for pagination

**Notification types returned**: `like`, `repost`, `reply`, `follow`, `mention`, `quote`

**Best practice**: Use `filter: "mentions"` when you only need @-mentions — it's faster and less noisy than `"all"`.

---

## Bookmarks (1 tool)

**Tool**: `x_bookmarks`

**Parameters**: `limit` (1–100, default 20), `cursor` (tweet ID for pagination)

**Note**: Only available for the authenticated account. Returns the standard Tweet object array.

---

## Workflow: "Monitor my engagement"

```
1. x_notifications()                   → all recent interactions
2. x_notifications(filter: "mentions") → only @-mentions
3. x_bookmarks()                        → saved tweets
```
