import { z } from "zod";
import { handleResNotOk, type BaseToolsInterface } from "../utils.js";

interface ProjectTools extends BaseToolsInterface {}

/**
 * Tool: get_projects
 */
export function registerProjectTools({
  server,
  baseApiUrl,
  apiKey,
}: ProjectTools) {
  server.tool(
    "get_projects",
    "Fetches all projects from the GrowthBook API",
    {
      limit: z.number().optional().default(100),
      offset: z.number().optional().default(0),
    },
    async ({ limit, offset }) => {
      const queryParams = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });

      try {
        const res = await fetch(
          `${baseApiUrl}/api/v1/projects?${queryParams.toString()}`,
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
}
