import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callApi } from "./api.js";
import {
  formatSkillForMcp,
  getSkill,
  listSkillSummaries,
  loadSkills,
} from "./skills.js";

const API_DOCS =
  "https://docs.growthbook.io/api (OpenAPI: https://api.growthbook.io/api/v1/openapi.yaml)";

export function registerApiTools(server: McpServer) {
  server.registerTool(
    "growthbook_api_read",
    {
      title: "Read GrowthBook API",
      description:
        `Make an authenticated GET request to the GrowthBook REST API. ` +
        `Use path (+ optional query string) exactly as shown in skill workflows that mention gb-call GET. ` +
        `Paths typically start with /api/v1/ or /api/v2/. Returns the raw response body on success. ` +
        `Queries the GrowthBook REST API — see ${API_DOCS}.`,
      inputSchema: z.object({
        path: z
          .string()
          .describe(
            "API path including query string if needed, e.g. /api/v1/projects or /api/v2/features/my-flag"
          ),
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
      },
    },
    async ({ path }) => {
      const result = await callApi({ method: "GET", path });
      return {
        content: [{ type: "text" as const, text: result.text }],
        isError: !result.ok,
      };
    }
  );

  server.registerTool(
    "growthbook_api_write",
    {
      title: "Write GrowthBook API",
      description:
        `Make an authenticated mutating request (POST, PUT, PATCH, or DELETE) to the GrowthBook REST API. ` +
        `Use method + path (+ optional JSON body) exactly as shown in skill workflows that mention gb-call with those methods. ` +
        `Paths typically start with /api/v1/ or /api/v2/. Returns the raw response body on success. ` +
        `Mutates the GrowthBook REST API — see ${API_DOCS}.`,
      inputSchema: z.object({
        method: z
          .enum(["POST", "PUT", "PATCH", "DELETE"])
          .describe("HTTP method"),
        path: z
          .string()
          .describe(
            "API path including query string if needed, e.g. /api/v2/features or /api/v1/experiments/exp_123"
          ),
        body: z
          .string()
          .optional()
          .describe(
            "Optional JSON request body as a string (for POST/PUT/PATCH)"
          ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        openWorldHint: true,
      },
    },
    async ({ method, path, body }) => {
      const result = await callApi({ method, path, body });
      return {
        content: [{ type: "text" as const, text: result.text }],
        isError: !result.ok,
      };
    }
  );
}

export function registerSkillTools(server: McpServer) {
  // Eager-load so missing bundle surfaces at startup rather than first call
  const skills = loadSkills();
  if (skills.length === 0) {
    console.error(
      "Warning: GB_SKILLS_ENABLED is true but no bundled skills were found under server/skills/. " +
        "Run `npm run build` (which runs bundle-skills) or set GB_SKILLS_ENABLED=false."
    );
  }

  server.registerTool(
    "growthbook_list_skills",
    {
      title: "List GrowthBook Skills",
      description:
        "List available top-level GrowthBook skill entry points (name + description). " +
        "Call growthbook_read_skill with the relevant name. If the returned skill " +
        "routes to a qualified child path (e.g. feature-flags/references/flag-create), " +
        "call growthbook_read_skill again with that path. " +
        "Skills encode how to accomplish GrowthBook tasks well; use growthbook_api_read / growthbook_api_write to execute the REST calls they describe.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
      },
    },
    async () => {
      const summaries = listSkillSummaries();
      const text = JSON.stringify(summaries, null, 2);
      return {
        content: [{ type: "text" as const, text }],
      };
    }
  );

  server.registerTool(
    "growthbook_read_skill",
    {
      title: "Read GrowthBook Skill",
      description:
        "Return the full markdown content of a GrowthBook skill by path. " +
        "Pass a top-level name from growthbook_list_skills (e.g. feature-flags or " +
        "flag-create), or a qualified child path named by a skill " +
        "(e.g. feature-flags/references/flag-create). " +
        "Follow the skill's workflow; when it shows `gb-call <METHOD> <PATH> [body]`, " +
        "use growthbook_api_read for GET and growthbook_api_write for POST/PUT/PATCH/DELETE.",
      inputSchema: z.object({
        name: z
          .string()
          .describe(
            "Top-level skill name (e.g. feature-flags or flag-create), or a " +
              "qualified child path named by a skill"
          ),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ name }) => {
      const skill = getSkill(name);
      if (!skill) {
        const available = listSkillSummaries()
          .map((s) => s.name)
          .join(", ");
        return {
          content: [
            {
              type: "text" as const,
              text:
                `Unknown skill: ${name}. ` +
                `Use a name from growthbook_list_skills or a qualified child path named by a loaded skill.` +
                (available
                  ? ` Available top-level skills: ${available}`
                  : " No skills are bundled."),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: formatSkillForMcp(skill),
          },
        ],
      };
    }
  );
}
