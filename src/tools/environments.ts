import { handleResNotOk, type BaseToolsInterface } from "../utils.js";

interface EnvironmentTools extends BaseToolsInterface {}

/**
 * Tool: get_environments
 */
export function registerEnvironmentTools({
  server,
  baseApiUrl,
  apiKey,
}: EnvironmentTools) {
  server.tool(
    "get_environments",
    "Fetches all environments from the GrowthBook API. GrowthBook comes with one environment by default (production), but you can add as many as you need. Feature flags can be enabled and disabled on a per-environment basis. You can also set the default feature state for any new environment. Additionally, you can scope environments to only be available in specific projects, allowing for further control and segmentation over feature delivery.",
    {},
    async () => {
      try {
        const res = await fetch(`${baseApiUrl}/api/v1/environments`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
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
