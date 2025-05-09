import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerEnvironmentTools } from "./tools/environments.js";
import { registerExperimentTools } from "./tools/experiments.js";
import { registerFeatureTools } from "./tools/features.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerSdkConnectionTools } from "./tools/sdk-connections.js";
import { getApiKey, getApiUrl, getAppOrigin, getUser } from "./utils.js";

export const baseApiUrl = getApiUrl();
export const apiKey = getApiKey();
export const appOrigin = getAppOrigin();
export const user = getUser();

// Create an MCP server
const server = new McpServer(
  {
    name: "GrowthBook MCP",
    version: "1.0.0",
  },
  {
    instructions:
      "You are a helpful assistant that interacts with GrowthBook, an open source feature flagging and experimentation platform. You can use tools to create and manage feature flags, experiments, and environments. Note that experiments are also called a/b tests.",
  }
);

registerEnvironmentTools({
  server,
  baseApiUrl,
  apiKey,
});

registerProjectTools({
  server,
  baseApiUrl,
  apiKey,
});

registerSdkConnectionTools({
  server,
  baseApiUrl,
  apiKey,
});

registerFeatureTools({
  server,
  baseApiUrl,
  apiKey,
  appOrigin,
  user,
});

registerExperimentTools({
  server,
  baseApiUrl,
  apiKey,
  appOrigin,
});

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
