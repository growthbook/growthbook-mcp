#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  createGrowthBookMcpServer,
  getGrowthBookMcpConfig,
} from "./server.js";

const config = getGrowthBookMcpConfig();

export const baseApiUrl = config.baseApiUrl;
export const apiKey = config.apiKey;
export const appOrigin = config.appOrigin;
export const user = config.user;

const server = createGrowthBookMcpServer(config);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();

try {
  await server.connect(transport);
} catch (error) {
  console.error(error);
  process.exit(1);
}
