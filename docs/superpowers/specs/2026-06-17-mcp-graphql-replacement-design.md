# MCP GraphQL Replacement Design

## Goal

Replace the existing MCP tool implementations that scrape the X/Twitter web UI with implementations backed by the existing GraphQL client. The MCP surface should become GraphQL-only for now. Tools without validated GraphQL equivalents will be removed from registration and documented in a root-level `MISSING_TOOLS.md` file.

## Architecture

The current project structure remains mostly intact:

- `src/server.ts` continues to create the MCP server and register tool groups.
- `src/tools/*.ts` remain the MCP-facing modules.
- `src/graphql/client.ts`, `src/graphql/parser.ts`, `src/graphql/types.ts`, and `src/graphql/constants.ts` remain the GraphQL source of truth.

Each supported MCP handler becomes a thin adapter that:

1. validates MCP input with the existing schema,
2. calls the appropriate `TwitterGraphQLClient` method,
3. returns GraphQL-native structured data,
4. handles known GraphQL/auth/rate-limit errors with clear MCP-facing responses.

No DOM scraping fallback will remain for the migrated MCP tools.

## Kept GraphQL-backed MCP tools

The following tools will stay registered and be backed by GraphQL:

| MCP tool | GraphQL method |
|---|---|
| `x_home_timeline` | `fetchHomeTimeline(limit, cursor)` |
| `x_following_timeline` | `fetchFollowingFeed(limit, cursor)` |
| `x_search` | `fetchSearch(query, count, cursor, product)` |
| `x_notifications` | `fetchNotifications(limit, cursor, type)` |
| `x_bookmarks` | `fetchBookmarks(limit, cursor)` |
| `x_get_tweet` | `fetchTweetById(id)` or `fetchTweetDetail(id)` |
| `x_post_tweet` | `createTweet(text, replyToId?, mediaIds?)` |
| `x_reply` | `createTweet(text, tweetId, mediaIds?)` |
| `x_quote_tweet` | `quoteTweet(text, quotedTweetId, mediaIds?)` |
| `x_like` | `likeTweet(id)` |
| `x_unlike` | `unlikeTweet(id)` |
| `x_repost` | `retweetTweet(id)` |
| `x_unrepost` | `unretweetTweet(id)` |
| `x_bookmark` | `bookmarkTweet(id)` |
| `x_unbookmark` | `unbookmarkTweet(id)` |
| `x_user_profile` | `fetchUser(username)` |
| `x_user_posts` | `fetchUser(username)` + `fetchUserTweets(userId, limit, cursor)` |
| `x_user_likes` | `fetchUser(username)` + `fetchUserLikes(userId, limit, cursor)` |
| `x_user_followers` | `fetchUser(username)` + `fetchFollowers(userId, limit, cursor)` |
| `x_user_following` | `fetchUser(username)` + `fetchFollowing(userId, limit, cursor)` |

## Removed MCP tools

The following tools will be removed from MCP registration because no validated GraphQL equivalent currently exists in this codebase:

- `x_explore`
- `x_trends`
- `x_tweet_replies`
- `x_user_replies`
- `x_user_media`
- `x_user_articles`

A root-level `MISSING_TOOLS.md` file will document these tools, their previous purpose, and that future work requires finding and validating GraphQL endpoints.

## Data flow

1. MCP client calls a tool.
2. The tool validates input.
3. The tool creates or uses `TwitterGraphQLClient`.
4. The GraphQL client obtains the existing Puppeteer page/session via `getPage()`.
5. The request runs through `page.evaluate(fetch)` so it uses the authenticated browser session.
6. The GraphQL parser returns typed domain data.
7. The tool returns JSON text content to the MCP client.

Pagination will use the GraphQL cursor directly:

```ts
{
  items: [...],
  nextCursor: string | null
}
```

## Response shapes

MCP responses may use GraphQL-native shapes from `src/graphql/types.ts` instead of preserving the old DOM-scraped shape.

Tweet-like responses may include:

- `id`
- `text`
- `lang`
- `author`
- `metrics`
- `media`
- `urls`
- `createdAt`
- `isRetweet`
- `retweetedBy`
- `quotedTweet`
- `articleTitle`
- `articleText`
- `isSubscriberOnly`
- `isPromoted`

User-like responses may include:

- `id`
- `name`
- `screenName`
- `bio`
- `location`
- `url`
- `followersCount`
- `followingCount`
- `tweetsCount`
- `likesCount`
- `verified`
- `profileImageUrl`
- `createdAt`

Notification responses may include:

- `id`
- `type`
- `text`
- `url`
- `timestamp`
- `actors`
- optional `tweet`

Action responses should remain simple and explicit:

```ts
{
  success: true,
  message: string,
  tweetId?: string,
  tweetUrl?: string
}
```

## Error handling

Tool handlers should catch known GraphQL client errors and return clear MCP-facing errors:

- Auth/session failures explain that the X session is expired or missing cookies/env values.
- Rate-limit failures explain that X rate-limited the request.
- API failures include status/code/message when available.
- Timeline/list tools may return `{ items: [], nextCursor: null }` when GraphQL returns no entries.
- Single-object tools such as `x_get_tweet` and `x_user_profile` should return a clear not-found message when the GraphQL result is missing.

## Testing and validation

Implementation should be test-driven around the MCP tool layer.

Planned tests:

1. Tool registration tests confirm GraphQL-backed tools remain registered and removed tools are absent.
2. MCP handler tests use mocked GraphQL client responses.
3. Timeline/search/bookmark/notification tools return `{ items, nextCursor }`.
4. Action tools return explicit success JSON.
5. User timeline/list tools resolve username to user ID where required.
6. Error handling tests cover auth, rate-limit, API, and not-found cases.
7. Existing GraphQL tests continue passing.

Validation commands:

```bash
bun test
bun run typecheck
```

Manual validation can include CLI checks such as:

```bash
bun graphql notifications --count 3 --json
```

MCP-level manual validation should use the existing local MCP runner or client path after implementation.
