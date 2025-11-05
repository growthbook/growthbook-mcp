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


Add the MCP server to your AI tool of choice. See the [official docs](https://docs.growthbook.io/integrations/mcp) for complete a complete guide.
