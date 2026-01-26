#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerEnvironmentTools } from "./tools/environments.js";
import { registerExperimentTools } from "./tools/experiments/experiments.js";
import { registerFeatureTools } from "./tools/features.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerSdkConnectionTools } from "./tools/sdk-connections.js";
import { getApiKey, getApiUrl, getAppOrigin } from "./utils.js";
import { registerSearchTools } from "./tools/search.js";
import { registerDefaultsTools } from "./tools/defaults.js";
import { registerMetricsTools } from "./tools/metrics.js";
import { registerExperimentPrompts } from "./prompts/experiment-prompts.js";
import packageDetails from "../package.json" with { type: "json" };

export const baseApiUrl = getApiUrl();
export const apiKey = getApiKey();
export const appOrigin = getAppOrigin();
export const user = process.env.GB_EMAIL;

if (!user) {
  throw new Error("GB_EMAIL is not set in the environment variables");
}

// Create an MCP server
const server = new McpServer(
  {
    name: "GrowthBook MCP",
    version: packageDetails.version,
    title: "GrowthBook MCP",
    websiteUrl: "https://growthbook.io",
  },
  {
    instructions: `You are a helpful assistant that interacts with GrowthBook, an open source feature flagging and experimentation platform.

Key workflows:
- Feature flags: Use create_feature_flag for simple flags, then create_force_rule to add targeting conditions
- Experiments: ALWAYS call get_defaults first, then create_experiment. Experiments are created as "draft" - users must launch in GrowthBook UI
- Analysis: Use get_experiments with mode="summary" for quick insights

All mutating tools require a fileExtension parameter for SDK integration guidance.`,
    capabilities: {
      tools: {},
      prompts: {},
    },
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
  user,
});

registerSearchTools({
  server,
});

registerDefaultsTools({
  server,
  baseApiUrl,
  apiKey,
});

registerMetricsTools({
  server,
  baseApiUrl,
  apiKey,
  appOrigin,
  user,
});

registerExperimentPrompts({
  server,
});

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();

try {
  await server.connect(transport);
} catch (error) {
  console.error(error);
  process.exit(1);
}
