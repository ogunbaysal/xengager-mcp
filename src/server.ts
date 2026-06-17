import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSearchTools } from "./tools/search.js";
import { registerTimelineTools } from "./tools/timeline.js";
import { registerNotificationsTools } from "./tools/notifications.js";
import { registerBookmarksTools } from "./tools/bookmarks.js";
import { registerProfileTools } from "./tools/profile.js";
import { registerTweetTools } from "./tools/tweet.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "xengager-mcp",
    version: "0.1.0",
  });

  registerSearchTools(server);
  registerTimelineTools(server);
  registerNotificationsTools(server);
  registerBookmarksTools(server);
  registerProfileTools(server);
  registerTweetTools(server);

  return server;
}
