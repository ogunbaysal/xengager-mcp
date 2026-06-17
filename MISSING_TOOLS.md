# Missing GraphQL MCP Tools

These MCP tools existed in the DOM-scraping implementation but were removed during the GraphQL-only migration because no validated GraphQL equivalent is currently implemented in this codebase.

| Tool | Previous purpose | Reason removed | Future work |
|---|---|---|---|
| `x_explore` | Read Explore tab trending tweets | No validated GraphQL endpoint/client method | Discover and validate Explore timeline GraphQL operation |
| `x_trends` | Get current trends/topics | No validated GraphQL endpoint/client method | Discover and validate trends GraphQL operation |
| `x_user_media` | Fetch media posted by a user | No validated GraphQL endpoint/client method | Discover and validate user media timeline GraphQL operation |
| `x_user_articles` | Fetch a list of articles by a user | No validated GraphQL endpoint/client method | Discover and validate user article list GraphQL operation |
