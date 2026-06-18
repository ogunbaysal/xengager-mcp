# Profile Tools (8 tools)

All tools accept `username` without the `@` prefix.

| Tool | Endpoint | Returns |
|------|----------|---------|
| `x_user_profile` | `/:username` | `UserProfile` with latest 3 posts |
| `x_user_posts` | `/:username` | Paginated `Tweet[]` |
| `x_user_replies` | `/:username/with_replies` | Paginated tweets + replies |
| `x_user_following` | `/:username/following` | `{ usernames: string[], nextCursor, hasMore }` |
| `x_user_followers` | `/:username/followers` | `{ usernames: string[], nextCursor, hasMore }` |
| `x_user_likes` | `/:username/likes` | Paginated `Tweet[]` — **authenticated user only** |
| `x_user_media` | `/:username/media` | Paginated `MediaItem[]` |
| `x_user_articles` | `/:username/articles` | Paginated `Article[]` |

**Pagination parameters** (all paginated tools): `limit` (1–100, or 1–200 for following/followers), `cursor`

**⚠️ Likes are private**: `x_user_likes` only works for the authenticated account. X.com restricts likes to the owner. Requests for other users return an explicit error — not an empty list.

**Following/Followers cursor**: Uses the **last username** from the previous page's `usernames` array (not a tweet ID).

## UserProfile Shape

```json
{
  "id": "…",
  "username": "…",
  "displayName": "…",
  "avatarUrl": "…",
  "bio": "…",
  "location": "…",
  "website": "…",
  "joinedDate": "…",
  "followersCount": 123,
  "followingCount": 456,
  "verified": true,
  "latestPosts": [ /* up to 3 Tweet objects */ ]
}
```

## Workflow: "Research a user"

```
1. x_user_profile(username)    → bio, follower count, latest posts
2. x_user_posts(username)      → recent tweets
3. x_user_media(username)      → recent images/videos
4. x_user_following(username)  → who they follow (paginated by username cursor)
5. x_user_followers(username)  → who follows them (paginated by username cursor)
```
