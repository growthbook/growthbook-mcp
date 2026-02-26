# GrowthBook MCP Server

With the GrowthBook MCP server, you can interact with GrowthBook right from your LLM client. See experiment details, add a feature flag, and more.

<a href="https://glama.ai/mcp/servers/@growthbook/growthbook-mcp">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@growthbook/growthbook-mcp/badge" alt="GrowthBook Server MCP server" />
</a>

## Setup

**Environment Variables**
Use the following env variables to configure the MCP server.

| Variable Name | Status   | Description                                                       |
| ------------- | -------- | ----------------------------------------------------------------- |
| GB_API_KEY    | Required | A GrowthBook API key or PAT. When using a PAT, MCP server capabilities are limited by its permissions. E.g., if the user can't create an experiment in the app, they also won't be able to create one with the MCP server.                                             |
| GB_EMAIL      | Required | Your email address used with GrowthBook. Used when creating feature flags and experiments.|
| GB_API_URL    | Optional | Your GrowthBook API URL. Defaults to `https://api.growthbook.io`. |
| GB_APP_ORIGIN | Optional | Your GrowthBook app URL Defaults to `https://app.growthbook.io`.  |
| GB_HTTP_HEADER_* | Optional | Custom HTTP headers to include in all GrowthBook API requests. Use the pattern `GB_HTTP_HEADER_<NAME>` where `<NAME>` is converted to proper HTTP header format (underscores become hyphens). Examples: `GB_HTTP_HEADER_X_TENANT_ID=abc123` becomes `X-Tenant-ID: abc123`, `GB_HTTP_HEADER_CF_ACCESS_TOKEN=<token>` becomes `Cf-Access-Token: <token>`. Multiple custom headers can be configured. |

**Custom Headers Examples**

For multi-tenant deployments or proxy configurations, you can add custom headers:

```bash
# Multi-tenant identification
GB_HTTP_HEADER_X_TENANT_ID=tenant-123

# Cloudflare Access proxy authentication
GB_HTTP_HEADER_CF_ACCESS_TOKEN=eyJhbGciOiJSUzI1NiIs...
```

**Security Best Practices**
- Always use HTTPS for API communication (default for GrowthBook Cloud)
- Store API keys and sensitive headers in environment variables, never hardcode them
- Use the Authorization header (via GB_API_KEY) for authentication
- Custom headers are useful for multi-tenant scenarios, proxy routing, or additional context

Add the MCP server to your AI tool of choice. See the [official docs](https://docs.growthbook.io/integrations/mcp) for complete a complete guide.
