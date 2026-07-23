#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { areSkillsEnabled, getTransportMode } from "./api.js";
import { startHttpServer, type CreateServerOptions } from "./http.js";
import { registerCallApiTool, registerSkillTools } from "./tools.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function readPackageVersion(): string {
  try {
    const pkgPath = join(__dirname, "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      version?: string;
    };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const version = readPackageVersion();
/** Process-wide default (stdio + /mcp). /mcp/api always disables skills. */
const envSkillsEnabled = areSkillsEnabled();

function instructionsFor(skills: boolean): string {
  return skills
    ? `You are a helpful assistant that interacts with GrowthBook via a thin MCP server.

Tools:
- growthbook_list_skills — discover available GrowthBook skills (name + description)
- growthbook_read_skill — load a skill's full workflow and guardrails
- growthbook_call_api — make an authenticated GrowthBook REST API request on the user's behalf

Workflow:
1. growthbook_list_skills (or growthbook_read_skill if you already know the skill name) to load competence.
2. Follow the skill's steps. Skills show bash like \`gb-call <METHOD> <PATH> [body]\` —
   translate each of those into a growthbook_call_api invocation with the same method, path, and optional JSON body string.
3. Do not invent endpoints; prefer the paths listed in the skill.
4. Before growthbook_call_api with POST/PUT/PATCH/DELETE, confirm with the user (method, path, body summary)
   unless they already explicitly instructed that mutation. GET does not need confirmation.

Skill content is the source of truth for GrowthBook task workflows and API footguns.
growthbook_call_api is a dumb authenticated passthrough — it does not validate payloads.`
    : `You are a helpful assistant that interacts with GrowthBook via a thin MCP server.

Only the growthbook_call_api tool is available (capability-only mode — bundled skills are not exposed).
Use growthbook_call_api to make authenticated GrowthBook REST API requests: method, path (e.g. /api/v1/projects), and optional JSON body.
Before POST/PUT/PATCH/DELETE, confirm with the user unless they already explicitly instructed that mutation.
The client or user is expected to supply their own skill/workflow guidance.`;
}

export function createServer(options: CreateServerOptions = {}): McpServer {
  const skills = options.skills ?? envSkillsEnabled;

  const server = new McpServer(
    {
      name: skills ? "GrowthBook MCP Thin" : "GrowthBook MCP Thin (API only)",
      version,
      title: skills ? "GrowthBook MCP Thin" : "GrowthBook MCP Thin (API only)",
      websiteUrl: "https://growthbook.io",
    },
    {
      instructions: instructionsFor(skills),
      capabilities: {
        tools: {},
      },
    }
  );

  registerCallApiTool(server);

  if (skills) {
    registerSkillTools(server);
  }

  return server;
}

async function main(): Promise<void> {
  const mode = getTransportMode();

  if (mode === "http") {
    try {
      await startHttpServer(createServer);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
    return;
  }

  const server = createServer({ skills: envSkillsEnabled });
  const transport = new StdioServerTransport();
  try {
    await server.connect(transport);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

void main();
