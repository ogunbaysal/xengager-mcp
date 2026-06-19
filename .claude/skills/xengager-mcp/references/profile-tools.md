# Profile Tools (10 tools)

All tools accept `username` as a string **without** the `@` prefix.

## Tool Reference

### `x_user_profile`
Returns a full profile plus the user's latest 3 tweets.

```json
{ "tool": "x_user_profile", "arguments": { "username": "elonmusk" } }
```

**Response shape:**
```json
{
  "id": "44196397",
  "username": "elonmusk",
  "displayName": "Elon Musk",
  "avatarUrl": "https://pbs.twimg.com/…",
  "bio": "…",
  "location": "…",
  "website": "https://…",
  "joinedDate": "2009-06",
  "followersCount": 200000000,
  "followingCount": 500,
  "verified": true,
  "latestPosts": [ /* up to 3 Tweet objects */ ]
}
```

### `x_user_posts`
Paginated list of a user's tweets (no replies).

```json
{ "tool": "x_user_posts", "arguments": { "username": "elonmusk", "limit": 20, "cursor": "..." } }
```

### `x_user_replies`
Paginated list of a user's tweets **and** their replies to others.

```json
{ "tool": "x_user_replies", "arguments": { "username": "elonmusk", "limit": 20, "cursor": "..." } }
```

### `x_user_following` / `x_user_followers`
Paginated list of usernames the account follows / is followed by.

```json
{ "tool": "x_user_following", "arguments": { "username": "elonmusk", "limit": 100 } }
```

**Response shape:**
```json
{ "usernames": ["user1", "user2", "…"], "nextCursor": "lastusername", "hasMore": true }
```

**⚠️ Cursor is a username, not a tweet ID.** Pass the last username from `usernames` as the next `cursor`. Max `limit` is 200.

### `x_user_likes`
**⚠️ Authenticated user only.** X restricts likes visibility to the account owner. Requesting another user's likes returns an explicit error, not an empty list.

```json
{ "tool": "x_user_likes", "arguments": { "username": "your_own_handle", "limit": 20 } }
```

### `x_user_media`
Paginated list of tweets containing images or videos posted by the user.

```json
{ "tool": "x_user_media", "arguments": { "username": "elonmusk", "limit": 20, "cursor": "..." } }
```

### `x_user_articles`
Paginated list of long-form articles published by the user on X.

```json
{ "tool": "x_user_articles", "arguments": { "username": "elonmusk", "limit": 20, "cursor": "..." } }
```

### `x_follow` / `x_unfollow`
Follow or unfollow an X user by username via the REST API.

```json
{ "tool": "x_follow", "arguments": { "username": "jack" } }
{ "tool": "x_unfollow", "arguments": { "username": "jack" } }
```

**Response shape:**
```json
{ "success": true, "message": "Followed @jack" }
```

---

## Pagination for Profile Tools

All paginated profile tools use tweet ID cursors **except** `x_user_following` and `x_user_followers`, which use a username as the cursor (the last username in the returned `usernames` array).

---

## Workflow: Research a user

```
1. x_user_profile(username)    → overview: bio, follower count, latest posts
2. x_user_posts(username)      → their recent tweets
3. x_user_media(username)      → their recent images/videos
4. x_user_following(username)  → who they follow
5. x_user_followers(username)  → who follows them
```
