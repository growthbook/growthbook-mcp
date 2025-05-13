import { z } from "zod";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { handleResNotOk } from "../utils.js";
import { getDocs } from "../docs.js";
interface ExperimentTools {
  server: McpServer;
  baseApiUrl: string;
  apiKey: string;
  appOrigin: string;
}

export function registerExperimentTools({
  server,
  baseApiUrl,
  apiKey,
  appOrigin,
}: ExperimentTools) {
  /**
   * Tool: get_experiments
   * Description: Fetches all experiments from the GrowthBook API.
   */
  server.tool(
    "get_experiments",
    "Fetches all experiments from the GrowthBook API",
    {},
    async () => {
      try {
        const queryParams = new URLSearchParams();
        queryParams.append("limit", "100");

        const res = await fetch(
          `${baseApiUrl}/experiments?${queryParams.toString()}`,
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
        console.error("Error fetching experiments:", error);
        throw error;
      }
    }
  );

  /**
   * Tool: create_force_rule
   * Description: Creates a new force rule on an existing feature. A force rule sets a feature to a specific value for a specific environment based on a condition. For A/B tests and experiments, use create_experiment instead.
   */
  server.tool(
    "create_force_rule",
    "Create a new force rule on an existing feature. If the existing feature isn't apparent, create a new feature using create_feature_flag first. A force rule sets a feature to a specific value for a specific environment based on a condition. For A/B tests and experiments, use create_experiment instead.",
    {
      featureId: z
        .string()
        .describe("The ID of the feature to create the rule on"),
      description: z.string().optional(),
      condition: z
        .string()
        .describe(
          "Applied to everyone by default. Write conditions in MongoDB-style query syntax."
        )
        .optional(),
      value: z
        .string()
        .describe("The type of the value should match the feature type"),
      environments: z.string().array(),
      language: z
        .enum([
          ".tsx",
          ".jsx",
          ".ts",
          ".js",
          ".vue",
          ".py",
          ".go",
          ".php",
          ".rb",
          ".java",
          ".cs",
        ])
        .describe(
          "The extension of the current file. If it's unclear, ask the user."
        ),
    },
    async ({
      featureId,
      description,
      condition,
      value,
      environments,
      language,
    }) => {
      const payload = {
        // Loop through the environments and create a rule for each one keyed by environment name
        environments: environments.reduce((acc, env) => {
          acc[env] = {
            enabled: true,
            rules: [
              {
                type: "force",
                description,
                condition,
                value,
              },
            ],
          };
          return acc;
        }, {} as Record<string, { enabled: boolean; rules: Array<any> }>),
      };

      const res = await fetch(`${baseApiUrl}/features/${featureId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      const docsText = getDocs(language);

      const text = `
      ${JSON.stringify(data, null, 2)}

      Here is the documentation for the feature flag, if it makes sense to add the flag to the codebase:
      
      ${docsText}
  
      Importantly, share the link to the feature flag with the user.
      > See the feature flag on GrowthBook: ${appOrigin}/features/${featureId}
      `;

      return {
        content: [{ type: "text", text }],
      };
    }
  );

  /**
   * Tool: get_experiment
   * Description: Gets a single experiment from GrowthBook by its ID.
   */
  server.tool(
    "get_experiment",
    "Gets a single experiment from GrowthBook",
    {
      experimentId: z.string().describe("The ID of the experiment to get"),
    },
    async ({ experimentId }) => {
      try {
        const res = await fetch(`${baseApiUrl}/experiments/${experimentId}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        });

        await handleResNotOk(res);
        const data = await res.json();

        const text = `
    ${JSON.stringify(data, null, 2)}
    
    Importantly, share the link to the experiment with the user.
    > See the experiment on GrowthBook: ${appOrigin}/experiment/${experimentId}
    `;

        return {
          content: [{ type: "text", text }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error}` }],
        };
      }
    }
  );

  /**
   * Tool: get_attributes
   * Description: Gets all attributes from the GrowthBook API.
   */
  server.tool("get_attributes", "Get all attributes", {}, async () => {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append("limit", "100");

      const res = await fetch(
        `${baseApiUrl}/attributes?${queryParams.toString()}`,
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
      console.error("Error fetching attributes:", error);
      throw error;
    }
  });
}
