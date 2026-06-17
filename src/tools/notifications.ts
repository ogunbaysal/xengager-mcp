import { z } from "zod";
import type { ZodRawShape } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { client, safeJson } from "./graphql-adapter.js";

const notificationsSchema: ZodRawShape = {
  filter: z
    .enum(["all", "mentions", "verified"] as const)
    .default("all")
    .describe("Which notifications to return"),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of notifications to return"),
  cursor: z.string().optional().describe("GraphQL cursor from the previous page"),
};

function notificationType(filter: "all" | "mentions" | "verified"): "All" | "Mentions" | "Verified" {
  if (filter === "mentions") return "Mentions";
  if (filter === "verified") return "Verified";
  return "All";
}

export function registerNotificationsTools(server: McpServer): void {
  server.registerTool(
    "x_notifications",
    {
      title: "X Notifications",
      description:
        "Get X notifications via GraphQL. Use filter='mentions' for @mentions or filter='verified' for verified notifications.",
      inputSchema: notificationsSchema as any,
    },
    async ({ filter, limit, cursor }: { filter: "all" | "mentions" | "verified"; limit: number; cursor?: string }) =>
      safeJson(() => client().fetchNotifications(limit, cursor, notificationType(filter)))
  );
}
