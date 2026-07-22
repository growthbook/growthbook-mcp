import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callApi } from "./api.js";
import {
  GB_CALL_BRIDGE_NOTE,
  getSkill,
  listSkillSummaries,
  loadSkills,
} from "./skills.js";

export function registerCallApiTool(server: McpServer) {
  server.registerTool(
    "call_api",
    {
      title: "Call GrowthBook API",
      description:
        "Make an authenticated HTTP request to the GrowthBook REST API on the user's behalf. " +
        "Use method + path (+ optional JSON body) exactly as shown in skill workflows that mention gb-call. " +
        "Paths typically start with /api/v1/ or /api/v2/. Returns the raw response body on success. " +
        "IMPORTANT: Before POST, PUT, PATCH, or DELETE, confirm with the user (summarize method, path, and body) " +
        "unless they have already explicitly instructed you to perform that mutation. GET requests do not need confirmation.",
      inputSchema: z.object({
        method: z
          .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
          .describe("HTTP method"),
        path: z
          .string()
          .describe(
            "API path including query string if needed, e.g. /api/v1/projects or /api/v2/features/my-flag"
          ),
        body: z
          .string()
          .optional()
          .describe(
            "Optional JSON request body as a string (for POST/PUT/PATCH)"
          ),
      }),
      annotations: {
        // Can mutate org state depending on method/path
        readOnlyHint: false,
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
    "list_skills",
    {
      title: "List GrowthBook Skills",
      description:
        "List available GrowthBook agent skills (name + description). " +
        "Use read_skill to load the full workflow for a skill before acting. " +
        "Skills encode how to accomplish GrowthBook tasks well; use call_api to execute the REST calls they describe.",
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
    "read_skill",
    {
      title: "Read GrowthBook Skill",
      description:
        "Return the full markdown content of a GrowthBook skill by name " +
        "(from list_skills). Follow the skill's workflow; when it shows " +
        "`gb-call <METHOD> <PATH> [body]`, use the call_api tool with those arguments instead.",
      inputSchema: z.object({
        name: z
          .string()
          .describe("Skill name, e.g. flag-create or experiment-launch"),
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
                `Unknown skill: ${name}.` +
                (available
                  ? ` Available skills: ${available}`
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
            text: GB_CALL_BRIDGE_NOTE + skill.content,
          },
        ],
      };
    }
  );
}
