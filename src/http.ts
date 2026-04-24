#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  createGrowthBookMcpServer,
  getGrowthBookMcpConfig,
} from "./server.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;
const DEFAULT_PATH = "/mcp";

type GrowthBookMcpServer = ReturnType<typeof createGrowthBookMcpServer>;

interface SessionEntry {
  server: GrowthBookMcpServer;
  transport: StreamableHTTPServerTransport;
  markClosing: () => void;
}

function getHttpHost() {
  const host = process.env.MCP_HTTP_HOST?.trim() || DEFAULT_HOST;

  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error(
      `MCP_HTTP_HOST must be a loopback host for local HTTP transport. Received "${host}".`
    );
  }

  return host;
}

function getHttpPort() {
  const rawPort = process.env.MCP_HTTP_PORT?.trim();

  if (!rawPort) {
    return DEFAULT_PORT;
  }

  const port = Number(rawPort);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `MCP_HTTP_PORT must be an integer between 1 and 65535. Received "${rawPort}".`
    );
  }

  return port;
}

function getHttpPath() {
  const path = process.env.MCP_HTTP_PATH?.trim() || DEFAULT_PATH;
  return path.startsWith("/") ? path : `/${path}`;
}

function getHeader(req: any, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function getSessionId(req: any) {
  return getHeader(req, "mcp-session-id");
}

function sendJsonRpcError(res: any, status: number, code: number, message: string) {
  res.status(status).json({
    jsonrpc: "2.0",
    error: {
      code,
      message,
    },
    id: null,
  });
}

function verifyMcpServerToken(req: any, res: any) {
  const token = process.env.MCP_SERVER_TOKEN?.trim();

  if (!token) {
    return true;
  }

  const authorization = getHeader(req, "authorization");

  if (authorization === `Bearer ${token}`) {
    return true;
  }

  sendJsonRpcError(res, 401, -32001, "Unauthorized");
  return false;
}

async function closeSession(sessionId: string, entry: SessionEntry) {
  sessions.delete(sessionId);
  entry.markClosing();
  await entry.server.close();
}

async function closeAllSessions() {
  const entries = [...sessions.entries()];
  await Promise.all(entries.map(([sessionId, entry]) => closeSession(sessionId, entry)));
}

const config = getGrowthBookMcpConfig();
const host = getHttpHost();
const port = getHttpPort();
const path = getHttpPath();
const sessions = new Map<string, SessionEntry>();
const app = createMcpExpressApp({ host });

app.get("/health", (_req: any, res: any) => {
  res.json({
    status: "ok",
    transport: "streamable-http",
    sessions: sessions.size,
  });
});

app.post(path, async (req: any, res: any) => {
  if (!verifyMcpServerToken(req, res)) {
    return;
  }

  const sessionId = getSessionId(req);

  try {
    if (sessionId) {
      const entry = sessions.get(sessionId);

      if (!entry) {
        sendJsonRpcError(res, 404, -32000, "Unknown MCP session ID.");
        return;
      }

      await entry.transport.handleRequest(req, res, req.body);
      return;
    }

    if (!isInitializeRequest(req.body)) {
      sendJsonRpcError(
        res,
        400,
        -32000,
        "Missing MCP session ID. Start with an initialize request."
      );
      return;
    }

    const server = createGrowthBookMcpServer(config);
    let transport!: StreamableHTTPServerTransport;
    let closing = false;

    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        sessions.set(newSessionId, {
          server,
          transport,
          markClosing: () => {
            closing = true;
          },
        });
      },
    });

    transport.onclose = () => {
      const closedSessionId = transport.sessionId;

      if (closedSessionId) {
        sessions.delete(closedSessionId);
      }

      if (!closing) {
        closing = true;
        void server.close().catch((error) => {
          console.error("Error closing MCP server:", error);
        });
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP HTTP request:", error);

    if (!res.headersSent) {
      sendJsonRpcError(res, 500, -32603, "Internal server error");
    }
  }
});

app.get(path, async (req: any, res: any) => {
  if (!verifyMcpServerToken(req, res)) {
    return;
  }

  const sessionId = getSessionId(req);

  if (!sessionId) {
    sendJsonRpcError(res, 400, -32000, "Missing MCP session ID.");
    return;
  }

  const entry = sessions.get(sessionId);

  if (!entry) {
    sendJsonRpcError(res, 404, -32000, "Unknown MCP session ID.");
    return;
  }

  await entry.transport.handleRequest(req, res);
});

app.delete(path, async (req: any, res: any) => {
  if (!verifyMcpServerToken(req, res)) {
    return;
  }

  const sessionId = getSessionId(req);

  if (!sessionId) {
    sendJsonRpcError(res, 400, -32000, "Missing MCP session ID.");
    return;
  }

  const entry = sessions.get(sessionId);

  if (!entry) {
    sendJsonRpcError(res, 404, -32000, "Unknown MCP session ID.");
    return;
  }

  await entry.transport.handleRequest(req, res);
});

const httpServer = app.listen(port, host, () => {
  const displayHost = host.includes(":") ? `[${host}]` : host;
  const authMode = process.env.MCP_SERVER_TOKEN?.trim() ? "enabled" : "disabled";
  console.error(
    `GrowthBook MCP HTTP server listening at http://${displayHost}:${port}${path} (MCP auth: ${authMode})`
  );
});

httpServer.on("error", (error: Error) => {
  console.error("Failed to start MCP HTTP server:", error);
  process.exit(1);
});

async function shutdown(signal: NodeJS.Signals) {
  console.error(`Received ${signal}, shutting down MCP HTTP server...`);

  try {
    await closeAllSessions();
  } catch (error) {
    console.error("Error closing MCP HTTP sessions:", error);
  }

  httpServer.close((error?: Error) => {
    if (error) {
      console.error("Error closing MCP HTTP listener:", error);
      process.exit(1);
    }

    process.exit(0);
  });
}

process.on("SIGINT", (signal) => {
  void shutdown(signal);
});

process.on("SIGTERM", (signal) => {
  void shutdown(signal);
});
