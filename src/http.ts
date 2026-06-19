import express, { type Request, type Response, type NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "./server.js";
import { closeBrowser } from "./browser.js";

const PORT = Number(process.env.PORT ?? 3000);
const MCP_API_KEY = process.env.MCP_API_KEY?.trim();

// Comma-separated list of allowed origins, or "*" to allow all (default for dev convenience).
// Example: ALLOWED_ORIGINS=https://app.example.com,https://mcp.example.com
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "*")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Per MCP spec §Security: servers MUST validate Origin to prevent DNS rebinding attacks.
// Requests without an Origin header come from non-browser clients and are always allowed.
function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes("*")) return true;
  return ALLOWED_ORIGINS.includes(origin);
}

type TransportMap = Record<string, StreamableHTTPServerTransport>;
const transports: TransportMap = {};

function requireMcpApiKey(req: Request, res: Response, next: NextFunction) {
  if (!MCP_API_KEY) return next();

  const authHeader = req.header("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

  if (token !== MCP_API_KEY) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized" },
      id: null,
    });
    return;
  }

  next();
}

const app = express();

app.use(express.json({ limit: "2mb" }));

// CORS + Origin validation. Must run before all routes including OPTIONS preflight.
app.use((req, res, next) => {
  const origin = req.header("origin");

  if (!isOriginAllowed(origin)) {
    res.status(403).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Forbidden: origin not allowed" },
      id: null,
    });
    return;
  }

  // Echo back the specific origin when we have an allowlist; use "*" otherwise.
  // Vary: Origin tells caches the response differs by origin.
  const allowOrigin = ALLOWED_ORIGINS.includes("*") ? "*" : (origin ?? "*");
  res.header("Access-Control-Allow-Origin", allowOrigin);
  if (!ALLOWED_ORIGINS.includes("*")) {
    res.header("Vary", "Origin");
  }
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, MCP-Session-Id, Last-Event-ID, MCP-Protocol-Version"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.header("Access-Control-Expose-Headers", "MCP-Session-Id");
  res.header("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, name: "xengager-mcp" });
});

app.post("/mcp", requireMcpApiKey, async (req: Request, res: Response) => {
  const sessionId = req.header("mcp-session-id") ?? undefined;

  try {
    let transport: StreamableHTTPServerTransport;

    if (isInitializeRequest(req.body)) {
      // Always create a new session for initialize, even if a (stale) session ID is present.
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (initializedSessionId) => {
          transports[initializedSessionId] = transport;
          console.log(`MCP session initialized: ${initializedSessionId}`);
        },
      });

      transport.onclose = () => {
        const closedSessionId = transport.sessionId;
        if (closedSessionId) {
          delete transports[closedSessionId];
          console.log(`MCP session closed: ${closedSessionId}`);
        }
      };

      const server = createMcpServer();
      await server.connect(transport);
    } else if (sessionId) {
      const existing = transports[sessionId];
      if (!existing) {
        // Per MCP spec: respond with 404 when the session ID is not found.
        // Clients MUST start a new session by sending a new InitializeRequest on 404.
        res.status(404).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: "Session not found" },
          id: null,
        });
        return;
      }
      transport = existing;
    } else {
      // No session ID and not an initialize request.
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Bad Request: missing MCP-Session-Id. Send an initialize request first.",
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP POST request", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", requireMcpApiKey, async (req: Request, res: Response) => {
  const sessionId = req.header("mcp-session-id") ?? undefined;

  if (!sessionId) {
    res.status(400).send("Missing MCP-Session-Id header");
    return;
  }

  const transport = transports[sessionId];
  if (!transport) {
    res.status(404).send("Session not found");
    return;
  }

  await transport.handleRequest(req, res);
});

app.delete("/mcp", requireMcpApiKey, async (req: Request, res: Response) => {
  const sessionId = req.header("mcp-session-id") ?? undefined;

  if (!sessionId) {
    res.status(400).send("Missing MCP-Session-Id header");
    return;
  }

  const transport = transports[sessionId];
  if (!transport) {
    res.status(404).send("Session not found");
    return;
  }

  await transport.handleRequest(req, res);
});

const server = app.listen(PORT, () => {
  console.log(`MCP Streamable HTTP server running on http://localhost:${PORT}/mcp`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
  printTunnelUrl();
});

function printTunnelUrl() {
  const hostname = process.env.TUNNEL_HOSTNAME?.trim();
  if (hostname) {
    console.log(`\nCloudflare Tunnel URL: https://${hostname}/mcp\n`);
  }
}

async function shutdown() {
  console.log("Shutting down MCP server...");

  for (const [sessionId, transport] of Object.entries(transports)) {
    try {
      await transport.close();
      delete transports[sessionId];
    } catch (error) {
      console.error(`Error closing MCP transport ${sessionId}`, error);
    }
  }

  await closeBrowser();

  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
