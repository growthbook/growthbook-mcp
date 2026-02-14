import {
  handleResNotOk,
  type BaseToolsInterface,
  fetchWithRateLimit,
  buildHeaders,
} from "../utils.js";
import { z } from "zod";

interface EnvironmentTools extends BaseToolsInterface {}

/**
 * Tool: get_environments
 */
export function registerEnvironmentTools({
  server,
  baseApiUrl,
  apiKey,
}: EnvironmentTools) {
  server.registerTool(
    "get_environments",
    {
      title: "Get Environments",
      description:
        "Lists all environments configured in GrowthBook. GrowthBook comes with one environment by default (production), but you can add as many as you need. Feature flags can be enabled and disabled on a per-environment basis. Use this to see available environments before creating SDK connections or configuring feature flags. Environments can be scoped to specific projects for further control.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
      },
    },
    async () => {
      try {
        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/environments`,
          {
            headers: buildHeaders(apiKey),
          }
        );

        await handleResNotOk(res);

        const data = await res.json();
        return {
          content: [{ type: "text", text: JSON.stringify(data) }],
        };
      } catch (error) {
        throw new Error(`Error fetching environments: ${error}`);
      }
    }
  );
}
