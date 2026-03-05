import { z } from "zod";
import {
  type BaseToolsInterface,
  paginationSchema,
  fetchWithPagination,
} from "../utils.js";
import type { ListProjectsResponse } from "../api-type-helpers.js";
import { formatProjects, formatApiError } from "../format-responses.js";

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
      description:
        "Lists all projects in your GrowthBook organization. Projects organize feature flags, experiments, and metrics into logical groups (e.g., by team, product, or app). Use this to find project IDs needed when creating flags or experiments scoped to a project, understand how the organization structures experimentation, or map project IDs to human-readable names. Returns project names, IDs, and metadata.",
      inputSchema: z.object({
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ limit, offset, mostRecent }) => {
      try {
        const data = (await fetchWithPagination(
          baseApiUrl,
          apiKey,
          "/api/v1/projects",
          limit,
          offset,
          mostRecent
        )) as ListProjectsResponse;

        if (mostRecent && offset === 0 && Array.isArray(data.projects)) {
          data.projects = data.projects.reverse();
        }

        return {
          content: [{ type: "text", text: formatProjects(data) }],
        };
      } catch (error) {
        throw new Error(
          formatApiError(error, "fetching projects", [
            "Check that your GB_API_KEY has permission to read projects.",
          ])
        );
      }
    }
  );
}
