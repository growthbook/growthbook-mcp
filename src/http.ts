/**
 * Streamable HTTP transport + OAuth resource-server surface for the thin MCP.
 *
 * Paths:
 * - POST /mcp      — full server (skills + call_api), unless GB_SKILLS_ENABLED=false
 * - POST /mcp/api  — capability-only (call_api only)
 *
 * - Serves /.well-known/oauth-protected-resource (RFC 9728) pointing at the GB AS
 * - Requires Bearer; validates it against GrowthBook REST so expired/revoked
 *   tokens get HTTP 401 + WWW-Authenticate (RFC 6750 invalid_token) and the
 *   MCP client can refresh — not a tool-level "API key has expired" string
 * - Threads the bearer into call_api via AsyncLocalStorage (transparent pass-through)
 */

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Request, Response, NextFunction, Express } from "express";
import {
  areSkillsEnabled,
  checkBearerWithGrowthBook,
  getApiUrl,
  getOauthIssuer,
  requestAuthStore,
} from "./api.js";

export type CreateServerOptions = {
  /** When false, only call_api is registered. */
  skills?: boolean;
};

export type McpHttpAppOptions = {
  createServer: (options?: CreateServerOptions) => McpServer;
  skillsEnabled?: boolean;
};

/**
 * The server's public base URL. Required in HTTP mode (validated at startup in
 * startHttpServer). Deliberately NOT derived from the request Host /
 * X-Forwarded-* headers: the base is stamped into the OAuth resource
 * (audience) and the protected-resource metadata, so trusting a
 * client-controlled header would let a caller influence what this server
 * claims to be.
 */
function getRequiredPublicBase(): string {
  const explicit = process.env.GB_MCP_URL?.trim().replace(/\/+$/, "");
  if (!explicit) {
    throw new Error(
      "GB_MCP_URL is required in HTTP mode. Set it to this server's public base URL (e.g. https://mcp.example.com)."
    );
  }
  return explicit;
}

function resourceMetadataUrlFor(resourcePath: string): string {
  const base = getRequiredPublicBase();
  if (resourcePath === "/mcp/api") {
    return `${base}/.well-known/oauth-protected-resource/mcp/api`;
  }
  if (resourcePath === "/mcp") {
    return `${base}/.well-known/oauth-protected-resource/mcp`;
  }
  return `${base}/.well-known/oauth-protected-resource`;
}

type UnauthorizedReason = "missing" | "invalid_token";

function maskBearer(token: string): string {
  if (!token) return "(empty)";
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

function createMcpHttpApp(options: McpHttpAppOptions): Express {
  const { createServer } = options;
  const envSkills = options.skillsEnabled ?? areSkillsEnabled();

  const app = createMcpExpressApp({ host: process.env.GB_MCP_HOST || "127.0.0.1" });

  function sendUnauthorized(
    res: Response,
    resourcePath: string,
    reason: UnauthorizedReason = "missing",
    token?: string
  ) {
    const metadataUrl = resourceMetadataUrlFor(resourcePath);
    const wwwAuth =
      reason === "invalid_token"
        ? `Bearer realm="GrowthBook MCP", error="invalid_token", error_description="The access token is invalid or expired", resource_metadata="${metadataUrl}"`
        : `Bearer realm="GrowthBook MCP", resource_metadata="${metadataUrl}"`;
    if (reason === "invalid_token") {
      console.error(
        `[oauth] rejecting bearer ${maskBearer(token || "")} on ${resourcePath} (invalid_token) — client should refresh`
      );
    } else {
      console.error(`[oauth] missing bearer on ${resourcePath}`);
    }
    res.setHeader("WWW-Authenticate", wwwAuth);
    res.status(401).json({
      error: reason === "invalid_token" ? "invalid_token" : "unauthorized",
      error_description:
        reason === "invalid_token"
          ? "The access token is invalid or expired. Refresh the token via the authorization server."
          : "Bearer token required. Discover the authorization server via the resource_metadata URL.",
    });
  }

  function sendUnavailable(res: Response, resourcePath: string) {
    console.error(
      `[oauth] cannot verify bearer on ${resourcePath} — GrowthBook unreachable, failing closed (503)`
    );
    // No WWW-Authenticate: this is not a token problem, so the client should
    // retry rather than throw the token away and re-authenticate.
    res.setHeader("Retry-After", "5");
    res.status(503).json({
      error: "temporarily_unavailable",
      error_description:
        "Could not verify the access token because GrowthBook was unreachable. Retry shortly.",
    });
  }

  function requireBearer(resourcePath: string) {
    return (req: Request, res: Response, next: NextFunction) => {
      void (async () => {
        const header = req.headers.authorization;
        if (!header || !header.toLowerCase().startsWith("bearer ")) {
          return sendUnauthorized(res, resourcePath, "missing");
        }
        const token = header.slice("bearer ".length).trim();
        if (!token) {
          return sendUnauthorized(res, resourcePath, "missing");
        }

        const result = await checkBearerWithGrowthBook(token);
        if (result === "invalid") {
          return sendUnauthorized(res, resourcePath, "invalid_token", token);
        }
        if (result === "unavailable") {
          return sendUnavailable(res, resourcePath);
        }

        (req as Request & { gbBearer?: string }).gbBearer = token;
        next();
      })().catch((err) => {
        console.error("Bearer validation error:", err);
        if (!res.headersSent) {
          // Unexpected failure — fail closed without forcing a token refresh.
          sendUnavailable(res, resourcePath);
        }
      });
    };
  }

  function sendProtectedResource(res: Response, resourcePath: string) {
    res.status(200).json({
      resource: `${getRequiredPublicBase()}${resourcePath}`,
      authorization_servers: [getOauthIssuer()],
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

  app.get("/.well-known/oauth-protected-resource", (_req, res) => {
    sendProtectedResource(res, "/mcp");
  });
  app.get("/.well-known/oauth-protected-resource/mcp", (_req, res) => {
    sendProtectedResource(res, "/mcp");
  });
  app.get("/.well-known/oauth-protected-resource/mcp/api", (_req, res) => {
    sendProtectedResource(res, "/mcp/api");
  });

  const handleMcp = async (
    req: Request,
    res: Response,
    serverOptions: CreateServerOptions
  ) => {
    const bearer = (req as Request & { gbBearer?: string }).gbBearer || "";
    // Thread the bearer into call_api via ALS for this request.
    await requestAuthStore.run({ bearer }, async () => {
      const server = createServer({ skills: serverOptions.skills });
      try {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
        });
        await server.connect(transport);
        // Register before handleRequest — the response may already be closed
        // by the time await returns, so a late listener would never fire.
        res.on("close", () => {
          void transport.close();
          void server.close();
        });
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error("Error handling MCP request:", error);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32603, message: "Internal server error" },
              id: null,
            })
          );
        }
      }
    });
  };

  app.post("/mcp", requireBearer("/mcp"), (req, res) => {
    void handleMcp(req, res, { skills: envSkills });
  });
  app.get("/mcp", requireBearer("/mcp"), methodNotAllowed);
  app.delete("/mcp", requireBearer("/mcp"), methodNotAllowed);

  app.post("/mcp/api", requireBearer("/mcp/api"), (req, res) => {
    void handleMcp(req, res, { skills: false });
  });
  app.get("/mcp/api", requireBearer("/mcp/api"), methodNotAllowed);
  app.delete("/mcp/api", requireBearer("/mcp/api"), methodNotAllowed);

  return app;
}

export async function startHttpServer(
  createServer: (options?: CreateServerOptions) => McpServer
): Promise<void> {
  const port = parseInt(process.env.GB_MCP_PORT || "3333", 10);
  const host = process.env.GB_MCP_HOST || "127.0.0.1";
  const envSkills = areSkillsEnabled();

  // Fail fast if the public base isn't configured — it's security-critical
  // (audience + metadata) and must never fall back to request headers.
  const publicBase = getRequiredPublicBase();

  const app = createMcpHttpApp({ createServer, skillsEnabled: envSkills });

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
    console.error(`Public base (GB_MCP_URL): ${publicBase}`);
    console.error(`OAuth AS issuer: ${getOauthIssuer()}`);
    console.error(`GrowthBook API: ${getApiUrl()}`);
  });
}
