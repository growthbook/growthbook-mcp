#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerEnvironmentTools } from "./tools/environments.js";
import { registerExperimentTools } from "./tools/experiments.js";
import { registerFeatureTools } from "./tools/features.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerSdkConnectionTools } from "./tools/sdk-connections.js";
import { getApiKey, getApiUrl, getAppOrigin } from "./utils.js";
import { registerSearchTools } from "./tools/search.js";
import { registerDefaultsTools } from "./tools/defaults.js";
import { registerMetricsTools } from "./tools/metrics.js";
import { registerExperimentAnalysisPrompt } from "./prompts/experiment-analysis.js";

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
    version: "1.0.2",
  },
  {
    instructions: `You are a helpful assistant that interacts with GrowthBook, an open source feature flagging and experimentation platform. You can create and manage feature flags, experiments (A/B tests), and other resources associated with GrowthBook.

**Key Workflows:**

1. **Creating Feature Flags:**
   - Use create_feature_flag for simple boolean/string/number/json flags
   - Use create_force_rule to add conditional rules to existing flags
   - Always specify the correct fileExtension for code integration

2. **Creating Experiments (A/B Tests):**
   - CRITICAL: Always call get_defaults FIRST to see naming conventions and examples
   - Use create_experiment to create experiments
   - Experiments automatically create linked feature flags

3. **Exploring Existing Resources:**
   - Use get_projects, get_environments, get_feature_flags, get_experiments, or get_attributes to understand current setup
   - Use get_single_feature_flag for detailed flag information
   - Use get_stale_safe_rollouts to find completed rollouts that can be cleaned up

4. **SDK Integration:**
   - Use get_sdk_connections to see existing integrations
   - Use create_sdk_connection for new app integrations
   - Use generate_flag_types to create TypeScript definitions

**Important Notes:**
- Feature flags and experiments require a fileExtension parameter for proper code integration
- Always review generated GrowthBook links with users so they can launch experiments
- When experiments are "draft", users must visit GrowthBook to review and launch them`,
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

registerExperimentAnalysisPrompt({
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
