import { z } from "zod";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { handleResNotOk } from "../utils.js";

interface ProjectTools {
  server: McpServer;
  baseApiUrl: string;
  apiKey: string;
}
export function registerProjectTools({
  server,
  baseApiUrl,
  apiKey,
}: ProjectTools) {
  // Get all projects
  server.tool(
    "get_projects",
    "Fetches all projects from the GrowthBook API",
    {
      limit: z.number().optional().default(10),
      offset: z.number().optional().default(0),
    },
    async ({ limit, offset }) => {
      const queryParams = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      try {
        const res = await fetch(
          `${baseApiUrl}/projects?${queryParams.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        await handleResNotOk(res);

        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
        };
      }
    }
  );

  server.tool(
    "edit_project",
    "Change the name, description, or settings.",
    {
      projectId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
    },
    async ({ projectId, name, description }) => {
      const payload: { name?: string; description?: string } = {};

      if (name) {
        payload.name = name;
      }

      if (description) {
        payload.description = description;
      }

      if (!name && !description) {
        throw new Error("At least one of name or description is required");
      }

      try {
        const res = await fetch(`${baseApiUrl}/projects/${projectId}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        await handleResNotOk(res);

        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
        };
      }
    }
  );
}
