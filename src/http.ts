/**
 * Streamable HTTP transport + OAuth resource-server surface for the thin MCP.
 *
 * Paths:
 * - POST /mcp      — full server (skills + call_api), unless GB_SKILLS_ENABLED=false
 * - POST /mcp/api  — capability-only (call_api only)
 *
 * - Serves /.well-known/oauth-protected-resource (RFC 9728) pointing at the GB AS
 * - Requires Bearer; 401 includes WWW-Authenticate resource_metadata=
 * - Threads the bearer into call_api via AsyncLocalStorage (transparent pass-through)
 */

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Request, Response, NextFunction } from "express";
import {
  areSkillsEnabled,
  getApiUrl,
  getOauthIssuer,
  requestAuthStore,
} from "./api.js";

export type CreateServerOptions = {
  /** When false, only call_api is registered. */
  skills?: boolean;
};

function getPublicMcpBase(req: Request): string {
  const explicit = process.env.GB_MCP_URL?.trim().replace(/\/+$/, "");
  if (explicit) return explicit;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  const host = req.get("host") || "localhost";
  return `${proto}://${host}`;
}

function resourceMetadataUrlFor(req: Request, resourcePath: string): string {
  const base = getPublicMcpBase(req);
  // Path-specific well-known (clients often probe this) + shared fallback
  if (resourcePath === "/mcp/api") {
    return `${base}/.well-known/oauth-protected-resource/mcp/api`;
  }
  if (resourcePath === "/mcp") {
    return `${base}/.well-known/oauth-protected-resource/mcp`;
  }
  return `${base}/.well-known/oauth-protected-resource`;
}

function sendUnauthorized(
  req: Request,
  res: Response,
  resourcePath: string
) {
  const metadataUrl = resourceMetadataUrlFor(req, resourcePath);
  res.setHeader(
    "WWW-Authenticate",
    `Bearer realm="GrowthBook MCP", resource_metadata="${metadataUrl}"`
  );
  res.status(401).json({
    error: "unauthorized",
    error_description:
      "Bearer token required. Discover the authorization server via the resource_metadata URL.",
  });
}

function requireBearer(resourcePath: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header || !header.toLowerCase().startsWith("bearer ")) {
      return sendUnauthorized(req, res, resourcePath);
    }
    const token = header.slice("bearer ".length).trim();
    if (!token) {
      return sendUnauthorized(req, res, resourcePath);
    }
    (req as Request & { gbBearer?: string }).gbBearer = token;
    next();
  };
}

function sendProtectedResource(
  req: Request,
  res: Response,
  resourcePath: string
) {
  const resource = `${getPublicMcpBase(req)}${resourcePath}`;
  const issuer = getOauthIssuer();
  res.status(200).json({
    resource,
    authorization_servers: [issuer],
    bearer_methods_supported: ["header"],
    scopes_supported: ["openid", "profile", "email", "offline_access"],
    resource_documentation: "https://docs.growthbook.io/integrations/mcp",
  });
}

function methodNotAllowed(_req: Request, res: Response) {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    })
  );
}

export async function startHttpServer(
  createServer: (options?: CreateServerOptions) => McpServer
): Promise<void> {
  const port = parseInt(process.env.GB_MCP_PORT || "3333", 10);
  const host = process.env.GB_MCP_HOST || "127.0.0.1";
  const envSkills = areSkillsEnabled();

  const app = createMcpExpressApp({ host });

  // RFC 9728 — Protected Resource Metadata (unauthenticated)
  app.get("/.well-known/oauth-protected-resource", (req, res) => {
    // Default document points at the full /mcp resource
    sendProtectedResource(req, res, "/mcp");
  });
  app.get("/.well-known/oauth-protected-resource/mcp", (req, res) => {
    sendProtectedResource(req, res, "/mcp");
  });
  app.get("/.well-known/oauth-protected-resource/mcp/api", (req, res) => {
    sendProtectedResource(req, res, "/mcp/api");
  });

  const handleMcp = async (
    req: Request,
    res: Response,
    options: CreateServerOptions
  ) => {
    const bearer = (req as Request & { gbBearer?: string }).gbBearer;
    await requestAuthStore.run({ bearer }, async () => {
      const server = createServer(options);
      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        res.on("close", () => {
          void transport.close();
          void server.close();
        });
      } catch (error) {
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          });
        }
      }
    });
  };

  // Full server: skills + call_api (unless GB_SKILLS_ENABLED disables skills globally)
  app.post("/mcp", requireBearer("/mcp"), (req, res) => {
    void handleMcp(req, res, { skills: envSkills });
  });
  app.get("/mcp", requireBearer("/mcp"), methodNotAllowed);
  app.delete("/mcp", requireBearer("/mcp"), methodNotAllowed);

  // Capability-only: call_api only (for clients that bring their own skills)
  app.post("/mcp/api", requireBearer("/mcp/api"), (req, res) => {
    void handleMcp(req, res, { skills: false });
  });
  app.get("/mcp/api", requireBearer("/mcp/api"), methodNotAllowed);
  app.delete("/mcp/api", requireBearer("/mcp/api"), methodNotAllowed);

  app.listen(port, host, () => {
    console.error(
      `GrowthBook MCP Thin (HTTP) listening on http://${host}:${port}/mcp`
    );
    console.error(
      `Capability-only (no skills): http://${host}:${port}/mcp/api`
    );
    console.error(
      `Skills on /mcp: ${envSkills ? "enabled" : "disabled (GB_SKILLS_ENABLED)"}`
    );
    console.error(`OAuth AS issuer: ${getOauthIssuer()}`);
    console.error(`GrowthBook API: ${getApiUrl()}`);
  });
}
