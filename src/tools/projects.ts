import { z } from "zod";
import {
  handleResNotOk,
  type BaseToolsInterface,
  paginationSchema,
  fetchWithRateLimit,
  fetchWithPagination,
} from "../utils.js";

interface ProjectTools extends BaseToolsInterface {}

/**
 * Tool: get_projects
 */
export function registerProjectTools({
  server,
  baseApiUrl,
  apiKey,
}: ProjectTools) {
  server.registerTool(
    "get_projects",
    {
      title: "Get Projects",
      description: "Fetches all projects from the GrowthBook API",
      inputSchema: z.object({
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ limit, offset, mostRecent }) => {
      try {
        const data = await fetchWithPagination(
          baseApiUrl,
          apiKey,
          "/api/v1/projects",
          limit,
          offset,
          mostRecent
        );

        // Reverse projects array for mostRecent to show newest-first
        if (mostRecent && offset === 0 && Array.isArray(data.projects)) {
          data.projects = data.projects.reverse();
        }

        return {
          content: [{ type: "text", text: JSON.stringify(data) }],
        };
      } catch (error) {
        throw new Error(`Error fetching projects: ${error}`);
      }
    }
  );
}
