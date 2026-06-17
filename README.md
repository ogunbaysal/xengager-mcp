# xengager-mcp

> X (Twitter) engagement via Model Context Protocol — programmatic access through a headless browser.

**24 tools across 6 domains:** search, timelines, notifications, bookmarks, profiles, and tweet interactions. Designed for Claude Code, Cursor, and any MCP-compatible client.

---

## Features

| Domain | Tools | Description |
|--------|-------|-------------|
| **Timeline** | `x_home_timeline`, `x_following_timeline`, `x_explore`, `x_trends` | Home feed, following feed, explore tab, trending topics |
| **Search** | `x_search` | Full-text search with operators (`from:`, `since:`, `lang:`, `min_likes:`, etc.) |
| **Notifications** | `x_notifications` | All notifications or filtered to mentions, with pagination |
| **Bookmarks** | `x_bookmarks` | Authenticated user's saved tweets |
| **Profile** | `x_user_profile`, `x_user_posts`, `x_user_replies`, `x_user_following`, `x_user_followers`, `x_user_likes`, `x_user_media`, `x_user_articles` | Full profile access including media, articles, and social graph |
| **Tweet Actions** | `x_get_tweet`, `x_tweet_replies`, `x_like`, `x_unlike`, `x_repost`, `x_unrepost`, `x_bookmark`, `x_unbookmark`, `x_quote_tweet`, `x_reply`, `x_post_tweet` | Read, engage, compose, and post threads |

All tools are **idempotent** and return errors **inside** the JSON payload — never as MCP protocol errors.

---

## Architecture

```
┌──────────────────────────────────────────┐
│  MCP Client (Claude Code, Cursor, etc.)  │
└──────────────────┬───────────────────────┘
                   │ Streamable HTTP / stdio
┌──────────────────▼───────────────────────┐
│           xengager-mcp Server             │
│  ┌──────────┐  ┌──────────────────────┐  │
│  │ GraphQL   │  │  DOM Scraping        │  │
│  │ (primary) │  │  (Puppeteer fallback) │  │
│  └──────────┘  └──────────────────────┘  │
│  ┌──────────────────────────────────────┐│
│  │  Puppeteer + stealth plugin          ││
│  │  (anti-bot detection evasion)        ││
│  └──────────────────────────────────────┘│
└──────────────────────────────────────────┘
```

- **GraphQL-first**: Most read operations use X's internal GraphQL API for speed and reliability
- **DOM fallback**: Actions (like, repost, reply) use Puppeteer with randomized delays and human-like mouse movement
- **Single browser instance**: All tools share one page — calls are serialized naturally via MCP transport

---

## Prerequisites

- **Bun** ≥ 1.1
- **Chrome/Chromium** (auto-installed by Puppeteer, or use system Chrome in Docker)
- **X (Twitter) account** with valid auth cookies

### Obtaining X Credentials

1. Log into [x.com](https://x.com) in Chrome
2. Open DevTools → Application → Cookies → x.com
3. Copy the values for `auth_token` and `ct0`

---

## Quick Start

```bash
# Clone and install
git clone https://github.com/YOUR_USERNAME/xengager-mcp.git
cd xengager-mcp
bun install

# Configure credentials
cp .env.example .env
# Edit .env — paste your X_AUTH_TOKEN and X_CT0 values

# Run (stdio transport — for local MCP integration)
bun run stdio

# Or run as HTTP server (for remote/ngrok setups)
bun run start
```

---

## Docker

```bash
# With ngrok tunneling (public MCP endpoint)
docker compose up

# Without ngrok
docker compose up mcp
```

The ngrok tunnel's public URL is printed on startup. Point your MCP client at it.

---

## MCP Client Configuration

### Claude Code

```json
{
  "mcpServers": {
    "xengager": {
      "command": "bun",
      "args": ["run", "stdio"],
      "cwd": "/path/to/xengager-mcp"
    }
  }
}
```

### Remote (ngrok)

```json
{
  "mcpServers": {
    "xengager": {
      "type": "http",
      "url": "https://your-tunnel.ngrok.io/mcp",
      "headers": {
        "Authorization": "Bearer your-mcp-api-key"
      }
    }
  }
}
```

Set `MCP_API_KEY` in `.env` to enable Bearer token authentication on the HTTP server.

---

## Quick Usage Examples

```
"What's trending?"         → x_trends
"Search for AI news"       → x_search("AI news", tab: "top")
"Show me @OpenAI's tweets" → x_user_posts("OpenAI")
"Get my notifications"     → x_notifications
"Like and bookmark this"   → x_like(url) → x_bookmark(url)
"Post a thread"            → x_post_tweet(["Part 1", "Part 2", "Part 3"])
```

See **[SKILL.md](SKILL.md)** for the complete agent usage guide with response shapes, pagination patterns, and workflow recipes.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `X_AUTH_TOKEN` | Yes | X.com `auth_token` cookie |
| `X_CT0` | Yes | X.com `ct0` cookie (CSRF token) |
| `PORT` | No | HTTP server port (default: 3000) |
| `MCP_API_KEY` | No | Bearer token for HTTP auth |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins (default: *) |
| `NGROK_AUTHTOKEN` | No | Required for ngrok tunneling in docker compose |

---

## Testing

```bash
bun test
```

Tests cover browser lifecycle, pagination logic, GraphQL client/parser/cache, and individual tools.

---

## License

MIT © [Your Name]
