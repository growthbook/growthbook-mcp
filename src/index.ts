#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { areSkillsEnabled, getTransportMode } from "./api.js";
import { startHttpServer, type CreateServerOptions } from "./http.js";
import { registerApiTools, registerSkillTools } from "./tools.js";

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
- growthbook_api_read — authenticated GET against the GrowthBook REST API
- growthbook_api_write — authenticated POST/PUT/PATCH/DELETE against the GrowthBook REST API

Workflow:
1. growthbook_list_skills (or growthbook_read_skill if you already know the skill name) to load competence.
2. Follow the skill's steps. Skills show bash like \`gb-call <METHOD> <PATH> [body]\` —
   map GET to growthbook_api_read and POST/PUT/PATCH/DELETE to growthbook_api_write with the same path and optional JSON body string.
3. Do not invent endpoints; prefer the paths listed in the skill.

Skill content is the source of truth for GrowthBook task workflows and API footguns.
growthbook_api_read / growthbook_api_write are dumb authenticated passthroughs — they do not validate payloads.`
    : `You are a helpful assistant that interacts with GrowthBook via a thin MCP server.

Only the API tools are available (capability-only mode — bundled skills are not exposed):
- growthbook_api_read — GET requests (path, e.g. /api/v1/projects)
- growthbook_api_write — POST/PUT/PATCH/DELETE (method, path, optional JSON body)
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

  registerApiTools(server);

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
