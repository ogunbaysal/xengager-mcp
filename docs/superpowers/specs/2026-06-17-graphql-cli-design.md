# GraphQL CLI for xengager-mcp

**Date:** 2026-06-17  
**Status:** Approved  
**Reference implementation:** `/Users/ogun/Documents/twitter-cli` (Python)

## Goal

Add a TypeScript GraphQL client and CLI test script to `xengager-mcp` that calls Twitter/X's private GraphQL API directly, implementing all 28 operations from `twitter-cli`. The CLI (`bun graphql <command>`) lets the developer validate each operation interactively before integrating into the MCP server.

## Background

The existing `xengager-mcp` scrapes Twitter via Puppeteer DOM automation. That approach is slow (browser startup, DOM fragility, timing-dependent). Twitter's private GraphQL API returns structured JSON and is orders of magnitude faster. `twitter-cli` (Python) proves the API works reliably. This work ports that approach to TypeScript.

## Architecture

### File structure

```
src/graphql/
  constants.ts   — Bearer token, 28 hardcoded queryIds, default feature flags
  types.ts       — GqlTweet, GqlUserProfile, GqlBookmarkFolder, GqlPaginated<T>
  client.ts      — TwitterGraphQLClient: all 28 operations
  parser.ts      — parseTweetResult, parseUserResult, parseTimelineResponse, deepGet
  cli.ts         — CLI entry point: argv dispatch, human/JSON output
```

`package.json` gets a `"graphql"` script: `"bun src/graphql/cli.ts"` so `bun graphql search "Claude Code"` works.

### Request flow

1. `cli.ts` parses `process.argv`, resolves subcommand, calls `client` method.
2. `client.ts` builds request from `constants.ts` (queryId + variables + features).
3. `client.ts` calls `getPage()` from existing `src/browser.ts` — gets live authenticated Puppeteer page.
4. Makes the API request via `page.evaluate(async (url, init) => { const r = await fetch(url, init); return r.json(); }, url, init)`. The browser supplies its own Chrome TLS fingerprint, authenticated cookies, and all required headers automatically.
5. `parser.ts` maps raw JSON to typed results.
6. `cli.ts` renders output.

### Why `page.evaluate(fetch)`

- Zero new dependencies — Puppeteer is already the project's foundation.
- Chrome TLS fingerprint and cookies come for free — no bot-detection risk.
- No need to manage `X_AUTH_TOKEN`/`X_CT0` in the GraphQL layer (browser already has them set as cookies from `browser.ts`).
- Direct path to MCP integration: the MCP tools will call the same `client.ts` methods.

## Data Model

```typescript
interface GqlTweet {
  id: string;
  text: string;
  lang: string;
  author: {
    id: string;
    name: string;
    screenName: string;
    profileImageUrl: string;
    verified: boolean;
  };
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
    views: number;
    bookmarks: number;
  };
  media: { type: "photo" | "video" | "animated_gif"; url: string }[];
  urls: string[];
  createdAt: string;
  isRetweet: boolean;
  quotedTweet?: GqlTweet;
  articleTitle?: string;
  articleText?: string;
}

interface GqlUserProfile {
  id: string;
  name: string;
  screenName: string;
  bio: string;
  location: string;
  url: string;
  followersCount: number;
  followingCount: number;
  tweetsCount: number;
  likesCount: number;
  verified: boolean;
  profileImageUrl: string;
  createdAt: string;
}

interface GqlBookmarkFolder {
  id: string;
  name: string;
}

interface GqlPaginated<T> {
  items: T[];
  nextCursor: string | null;
}
```

## Operations (28 total)

### Read operations

| Client method | CLI subcommand | GraphQL operation |
|---|---|---|
| `fetchHomeTimeline(count, cursor?)` | `feed` | `HomeTimeline` |
| `fetchFollowingFeed(count, cursor?)` | `feed --type following` | `HomeLatestTimeline` |
| `fetchBookmarks(count)` | `bookmarks` | `Bookmarks` |
| `fetchBookmarkFolders()` | `bookmarks folders` | `BookmarkFoldersSlice` |
| `fetchBookmarkFolderTimeline(folderId, count)` | `bookmarks folder <id>` | `BookmarkFolderTimeline` |
| `fetchUser(screenName)` | `user <handle>` | `UserByScreenName` |
| `fetchUserTweets(userId, count)` | `user-posts <handle>` | `UserTweets` |
| `fetchUserLikes(userId, count)` | `likes <handle>` | `Likes` |
| `fetchSearch(query, count, product?)` | `search <query>` | `SearchTimeline` (POST) |
| `fetchTweetDetail(tweetId, count)` | `tweet <id>` | `TweetDetail` |
| `fetchArticle(tweetId)` | `article <id>` | `TweetResultByRestId` |
| `fetchListTimeline(listId, count, cursor?)` | `list <id>` | `ListLatestTweetsTimeline` |
| `fetchFollowers(userId, count)` | `followers <handle>` | `Followers` (POST) |
| `fetchFollowing(userId, count)` | `following <handle>` | `Following` (POST) |
| `fetchMe()` | `whoami` | via `1.1/account/multi/list.json` → `UserByScreenName` |
| `fetchTweetById(tweetId)` | `get <id>` | `TweetResultByRestId` |

### Write operations

| Client method | CLI subcommand | GraphQL operation |
|---|---|---|
| `createTweet(text, replyToId?, mediaIds?)` | `post <text>` | `CreateTweet` (POST) |
| `replyTweet(tweetId, text)` | `reply <id> <text>` | `CreateTweet` with reply field |
| `quoteTweet(tweetId, text)` | `quote <id> <text>` | `CreateTweet` with attachment_url |
| `deleteTweet(tweetId)` | `delete <id>` | `DeleteTweet` (POST) |
| `likeTweet(tweetId)` | `like <id>` | `FavoriteTweet` (POST) |
| `unlikeTweet(tweetId)` | `unlike <id>` | `UnfavoriteTweet` (POST) |
| `retweetTweet(tweetId)` | `retweet <id>` | `CreateRetweet` (POST) |
| `unretweetTweet(tweetId)` | `unretweet <id>` | `DeleteRetweet` (POST) |
| `bookmarkTweet(tweetId)` | `bookmark <id>` | `CreateBookmark` (POST) |
| `unbookmarkTweet(tweetId)` | `unbookmark <id>` | `DeleteBookmark` (POST) |
| `followUser(screenName)` | `follow <handle>` | `1.1/friendships/create.json` |
| `unfollowUser(screenName)` | `unfollow <handle>` | `1.1/friendships/destroy.json` |

Write operations return `{ success: boolean; id?: string; url?: string }`.

## Constants (`constants.ts`)

Bearer token (public, same across all X clients):
```
AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA
```

28 hardcoded queryIds (from twitter-cli's `FALLBACK_QUERY_IDS`) — these can go stale; if a request gets HTTP 404/422, the client re-fetches the live queryId from `https://raw.githubusercontent.com/fa0311/twitter-openapi/refs/heads/main/src/config/placeholder.json` and retries once.

Default feature flags: ~18 boolean flags controlling GraphQL response shape (e.g. `responsive_web_graphql_timeline_navigation_enabled`, `longform_notetweets_consumption_enabled`). Only `true` values are included in URLs to stay under server URL-length limits.

## Parser (`parser.ts`)

- `deepGet(obj, ...keys)` — safe nested access, returns `undefined` on any missing key.
- `parseTweetResult(result)` — maps a `tweet_results.result` node to `GqlTweet`. Handles both `legacy` and `core`/`avatar` field layouts (Twitter has migrated some users to a new schema). Recurses for `quotedTweet`.
- `parseUserResult(result)` — maps `user_results.result` to `GqlUserProfile`.
- `parseTimelineResponse(data, getInstructions)` — walks `TimelineAddEntries` instructions, skips cursor/promoted entries, collects tweet entries and bottom cursor. Returns `GqlPaginated<GqlTweet>`.
- `parseUserListResponse(data, getInstructions)` — same but collects `TimelineTimelineItem` user entries.

## Error Handling

Three error classes thrown by `client.ts`:

- **`TwitterAuthError`** — HTTP 401/403. Message: "Session expired — check X_AUTH_TOKEN and X_CT0 in .env".
- **`TwitterRateLimitError`** — HTTP 429 or JSON error code 88. Retries up to 3× with exponential backoff (base 5s). Write-specific codes 348/349 are surfaced as "try again in 15+ minutes".
- **`TwitterAPIError`** — all other failures. Includes HTTP status + first 300 chars of body.

## CLI Interface (`cli.ts`)

```
bun graphql <subcommand> [args] [--count N] [--cursor VALUE] [--json]
```

**Output modes:**
- Default: formatted console output (tweet text, author, metrics per row)
- `--json`: raw `JSON.stringify` to stdout for piping

**Pagination:** `--count N` (default 20, max 200), `--cursor VALUE` for page 2+. When a next cursor exists, it prints at the end: `Next cursor: <value>`.

**Search options:** `bun graphql search "query" [--type Top|Latest|Photos|Videos]`

**Feed options:** `bun graphql feed [--type for-you|following]`

**Tweet ID normalization:** both raw IDs (`1234567890`) and full URLs (`https://x.com/user/status/1234567890`) accepted everywhere a tweet ID is required.

## Testing approach

Manual testing via CLI before MCP integration:
1. `bun graphql whoami` — validates auth and basic user fetch
2. `bun graphql search "Claude Code"` — validates search + parsing
3. `bun graphql feed` — validates home timeline
4. `bun graphql tweet <id>` — validates thread parsing
5. Write operations tested last (like, bookmark, post) to avoid accidental side effects

No automated tests in this phase — the user validates manually, then decides on MCP integration scope.
