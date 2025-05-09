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

const VariationSchema = z.object({
  name: z.string().describe("The value to use for the variation"),
  key: z
    .string()
    .describe(
      "The key to use for the variation. Use a slugified version of name, if not supplied"
    ),
  value: z.string().describe("The value to use for the variation"),
});

export function registerExperimentTools({
  server,
  baseApiUrl,
  apiKey,
  appOrigin,
}: ExperimentTools) {
  server.tool(
    "create_experiment",
    `Create a new experiment (also called an a/b test) rule on a feature flag. 
    If the feature is not already created (you can use get_flags to see if it exists), use create_flag to create it first. 
    This tool also requires an assignment query ID, which you can get by calling get_assignment_query_ids tool first. Ask the user which assignment query ID they want to use.
    Access environments by using the get_environments tool. Ask the user which environments they want to run the experiment in.`,
    {
      featureId: z.string(),
      description: z.string().optional(),
      condition: z
        .string()
        .describe(
          "Applied to everyone by default. Write conditions in MongoDB-style query syntax."
        )
        .optional(),
      variations: z
        .array(VariationSchema)
        .describe(
          "The variations to run the experiment in. Fetch variations with the get_variations tool"
        ),
      assignmentQueryId: z
        .string()
        .describe(
          "The ID of the assignment query to use. If not present, you'll need to fetch the datasource and show the result to the user for confirmation."
        ),
      name: z.string().describe("The name of the experiment"),
      trackingKey: z
        .string()
        .describe(
          "The key to use for tracking the experiment. Use a slugified version of name, if not supplied"
        ),
      environments: z
        .string()
        .array()
        .describe(
          "The environments to run the experiment in. Fetch environments with the get_environments tool"
        ),
      hypothesis: z.string().describe("The hypothesis for the experiment"),
      status: z
        .enum(["draft", "running", "stopped"])
        .default("running")
        .describe("The status of the experiment"),
    },
    async ({
      featureId,
      description,
      condition,
      variations,
      environments,
      assignmentQueryId,
      name,
      trackingKey,
      hypothesis,
      status,
    }) => {
      // Create experiment
      const experimentPayload = {
        name,
        trackingKey,
        description,
        variations,
        hypothesis,
        assignmentQueryId,
        status,
      };

      try {
        const experimentRes = await fetch(`${baseApiUrl}/experiments`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(experimentPayload),
        });

        await handleResNotOk(experimentRes);

        const experimentData = await experimentRes.json();

        const featurePayload = {
          // Loop through the environments and create a rule for each one keyed by environment name
          environments: environments.reduce((acc, env) => {
            acc[env] = {
              enabled: true,
              rules: [
                {
                  type: "experiment-ref",
                  experimentId: experimentData?.experiment.id,
                  description,
                  ...(condition ? { condition } : {}),
                  variations: experimentData?.experiment.variations.map(
                    (variation: { variationId: string }, idx: number) => ({
                      value: variations[idx].value,
                      variationId: variation.variationId,
                    })
                  ),
                },
              ],
            };
            return acc;
          }, {} as Record<string, { enabled: boolean; rules: Array<any> }>),
        };

        // return {
        //   content: [
        //     {
        //       type: "text",
        //       text: JSON.stringify({ featurePayload, experimentData }, null, 2),
        //     },
        //   ],
        // };

        const res = await fetch(`${baseApiUrl}/features/${featureId}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(featurePayload),
        });

        await handleResNotOk(res);

        const data = await res.json();

        const text = `
      ${JSON.stringify(data, null, 2)}
      
      Show the following link to the user in the response, as it gives quick access to the feature flag experiment on GrowthBook: ${appOrigin}/features/${featureId}
      `;

        return {
          content: [{ type: "text", text }],
        };
      } catch (error) {
        console.error("Error creating feature:", error);
        throw error;
      }
    }
  );

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
      docs: z.enum(["nextjs", "react", "javascript", "typescript"]),
    },
    async ({
      featureId,
      description,
      condition,
      value,
      environments,
      docs,
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

      const docsText = getDocs(docs);

      const text = `
      ${JSON.stringify(data, null, 2)}
      
      Here is the documentation for the feature flag, if it makes sense to add the flag to the codebase:
      
      ${docsText}
  
      Additionally, see the feature flag on GrowthBook: ${appOrigin}/features/${featureId}
      `;

      return {
        content: [{ type: "text", text }],
      };
    }
  );

  server.tool(
    "create_safe_rollout_rule",
    "Create a new safe rollout feature rule on an existing feature.",
    {
      featureId: z.string(),
      description: z.string().optional(),
      condition: z
        .string()
        .describe(
          "Applied to everyone by default. Write conditions in MongoDB-style query syntax."
        ),
      controlValue: z
        .string()
        .describe(
          "The type of the value should match the feature type. Ask the user for this value."
        ),
      variationValue: z
        .string()
        .describe(
          "The type of the value should match the feature type. Ask the user for this value."
        ),
      hashAttribute: z.string().describe("Ask the user for this value."),
      environments: z.string().array(),
      exposureQueryId: z
        .string()
        .describe(
          "Also known as the assignment query. Ask the user for this value."
        ),
      datasourceId: z.string().describe("Ask the user for this value."),
      maxDuration: z
        .number()
        .describe(
          "The max duration of the rollout in days. Max duration is how long you would like to monitor for regressions and receive recommendations based on guardrail metric results. Ask the user for this value."
        ),
      guardrailMetricIds: z
        .string()
        .array()
        .describe(
          "The metrics you want to use to track to see whether or not the rollout is causing any regressions. Must be a part of the datasource specified for the safe rollout. Ask the user for these values."
        ),
    },
    async ({
      featureId,
      description,
      condition,
      controlValue,
      variationValue,
      hashAttribute,
      environments,
      exposureQueryId,
      datasourceId,
      maxDuration,
      guardrailMetricIds,
    }) => {
      const payload = {
        // Loop through the environments and create a rule for each one keyed by environment name
        environments: environments.reduce((acc, env) => {
          acc[env] = {
            enabled: true,
            rules: [
              {
                type: "safe-rollout",
                description,
                condition,
                controlValue,
                variationValue,
                hashAttribute,
                exposureQueryId,
                datasourceId,
                maxDuration,
                guardrailMetricIds,
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
      const text = `
    ${JSON.stringify(data, null, 2)}
    
    Show the following link to the user in the response, as it gives quick access to the feature flag experiment on GrowthBook: ${appOrigin}/features/${featureId}
    `;

      return {
        content: [{ type: "text", text }],
      };
    }
  );

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
    
    See the experiment on GrowthBook: @${appOrigin}/experiment/${experimentId}
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

  server.tool(
    "get_assignment_query_ids",
    "Get all assignment query IDs for the current project. This is a list of all the datasources that are available to use for experiments and safe rollouts.",
    {},
    async () => {
      try {
        const res = await fetch(`${baseApiUrl}/data-sources/`, {
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
