import { z } from "zod";
import {
  generateLinkToGrowthBook,
  getDocsMetadata,
  handleResNotOk,
  type ExtendedToolsInterface,
  SUPPORTED_FILE_EXTENSIONS,
} from "../utils.js";
import { getDefaults } from "./defaults.js";

interface ExperimentTools extends ExtendedToolsInterface {}

export function registerExperimentTools({
  server,
  baseApiUrl,
  apiKey,
  appOrigin,
  user,
}: ExperimentTools) {
  /**
   * Tool: get_experiments
   */
  server.tool(
    "get_experiments",
    "Fetches all experiments from the GrowthBook API",
    {
      limit: z.number().optional().default(100),
      offset: z.number().optional().default(0),
    },
    async ({ limit, offset }) => {
      try {
        const queryParams = new URLSearchParams({
          limit: limit?.toString(),
          offset: offset?.toString(),
        });

        const res = await fetch(
          `${baseApiUrl}/api/v1/experiments?${queryParams.toString()}`,
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
        throw new Error(`Error fetching experiments: ${error}`);
      }
    }
  );

  /**
   * Tool: create_force_rule
   */
  server.tool(
    "create_force_rule",
    "Create a new force rule on an existing feature. If the existing feature isn't apparent, create a new feature using create_feature_flag first. A force rule sets a feature to a specific value based on a condition. For A/B tests and experiments, use create_experiment instead.",
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

      fileExtension: z
        .enum(SUPPORTED_FILE_EXTENSIONS)
        .describe(
          "The extension of the current file. If it's unclear, ask the user."
        ),
    },
    async ({ featureId, description, condition, value, fileExtension }) => {
      try {
        // Fetch feature defaults first and surface to user
        const defaults = await getDefaults(apiKey, baseApiUrl);
        const defaultEnvironments = defaults.environments;

        const payload = {
          // Loop through the environments and create a rule for each one keyed by environment name
          environments: defaultEnvironments.reduce((acc, env) => {
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

        const res = await fetch(`${baseApiUrl}/api/v1/features/${featureId}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        await handleResNotOk(res);

        const data = await res.json();

        const linkToGrowthBook = generateLinkToGrowthBook(
          appOrigin,
          "features",
          featureId
        );
        const { docs, language, stub } = getDocsMetadata(fileExtension);

        const text = `This is the API response: ${JSON.stringify(data, null, 2)}
      
        Additionally, here is a template of what to show to the user:

        **✅ Your feature flag \`my-flag-name\` is ready!.**
        [View it in GrowthBook](${linkToGrowthBook})
    
        **How to use it in your code:**
        (To the LLM agent. Use the text below to properly add the feature flag to the codebase. Also, surface the relevant docs/implemenation to the user)

        ${stub}

        **Want to learn more?**
        See the [GrowthBook ${language} docs](${docs})
      `;

        return {
          content: [{ type: "text", text }],
        };
      } catch (error) {
        throw new Error(`Error creating force rule: ${error}`);
      }
    }
  );

  /**
   * Tool: get_experiment
   */
  server.tool(
    "get_experiment",
    "Gets a single experiment from GrowthBook",
    {
      experimentId: z.string().describe("The ID of the experiment to get"),
    },
    async ({ experimentId }) => {
      try {
        const res = await fetch(
          `${baseApiUrl}/api/v1/experiments/${experimentId}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        await handleResNotOk(res);
        const data = await res.json();

        const linkToGrowthBook = generateLinkToGrowthBook(
          appOrigin,
          "experiment",
          experimentId
        );
        const text = `
    ${JSON.stringify(data, null, 2)}
    
    [View the experiment in GrowthBook](${linkToGrowthBook})
    `;

        return {
          content: [{ type: "text", text }],
        };
      } catch (error) {
        throw new Error(`Error getting experiment: ${error}`);
      }
    }
  );

  /**
   * Tool: get_attributes
   */
  server.tool("get_attributes", "Get all attributes", {}, async () => {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append("limit", "100");

      const res = await fetch(
        `${baseApiUrl}/api/v1/attributes?${queryParams.toString()}`,
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
      throw new Error(`Error fetching attributes: ${error}`);
    }
  });

  /**
   * Tool: create_experiment
   */
  server.tool(
    "create_experiment",
    "IMPORTANT: Call get_defaults before creating an experiment, and use its output to guide the arguments. Creates a new feature flag and experiment (A/B test).",
    {
      name: z
        .string()
        .describe(
          "Experiment name. Base name off the examples from get_defaults. If none are available, use a short, descriptive name that captures the essence of the experiment."
        ),
      description: z.string().optional().describe("Experiment description."),
      hypothesis: z
        .string()
        .optional()
        .describe(
          "Experiment hypothesis. Base hypothesis off the examples from get_defaults. If none are available, use a falsifiable statement about what will happen if the experiment succeeds or fails."
        ),
      value: z.string().describe("The default value of the experiment."),
      variations: z
        .array(
          z.object({
            name: z
              .string()
              .describe(
                "Variation name. Base name off the examples from get_defaults. If none are available, use a short, descriptive name that captures the essence of the variation."
              ),
            value: z
              .union([z.string(), z.number(), z.boolean(), z.record(z.any())])
              .describe(
                "The value of the control and each of the variations. The value should be a string, number, boolean, or object. If it's an object, it should be a valid JSON object."
              ),
          })
        )
        .describe(
          "Experiment variations. The key should be the variation name and the value should be the variation value. Look to variations included in preview experiments for guidance on generation. The default or control variation should always be first."
        ),
      fileExtension: z
        .enum(SUPPORTED_FILE_EXTENSIONS)
        .describe(
          "The extension of the current file. If it's unclear, ask the user."
        ),
      confirmedDefaultsReviewed: z
        .boolean()
        .describe(
          "Set to true to confirm you have called get_defaults and reviewed the output to guide these parameters."
        ),
    },
    async ({
      description,
      hypothesis,
      name,
      variations,
      fileExtension,
      confirmedDefaultsReviewed,
    }) => {
      if (!confirmedDefaultsReviewed) {
        return {
          content: [
            {
              type: "text",
              text: "Error: Please call get_defaults and review the output to guide these parameters.",
            },
          ],
        };
      }

      // Fetch experiment defaults first and surface to user
      let experimentDefaults = await getDefaults(apiKey, baseApiUrl);

      const experimentPayload = {
        name,
        description,
        hypothesis,
        trackingKey: name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        tags: ["mcp"],
        assignmentQueryId: experimentDefaults?.assignmentQuery,
        datasourceId: experimentDefaults?.datasource,
        variations: variations.map((variation, idx) => ({
          key: idx.toString(),
          name: variation.name,
        })),
      };
      try {
        const experimentRes = await fetch(`${baseApiUrl}/api/v1/experiments`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(experimentPayload),
        });

        await handleResNotOk(experimentRes);

        const experimentData = await experimentRes.json();

        const flagId = `flag_${name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;

        const flagPayload = {
          id: flagId,
          owner: user,
          defaultValue: variations[0].value,
          valueType:
            typeof variations[0].value === "string"
              ? "string"
              : typeof variations[0].value === "number"
              ? "number"
              : "boolean",
          description,
          environments: {
            ...experimentDefaults.environments.reduce((acc, env) => {
              acc[env] = {
                enabled: true,
                rules: [
                  {
                    type: "experiment-ref",
                    experimentId: experimentData.experiment.id,
                    variations: experimentData.experiment.variations.map(
                      (expVariation: { variationId: string }, idx: number) => ({
                        value: variations[idx].value,
                        variationId: expVariation.variationId,
                      })
                    ),
                  },
                ],
              };
              return acc;
            }, {} as Record<string, { enabled: boolean; rules: Array<any> }>),
          },
        };

        const flagRes = await fetch(`${baseApiUrl}/api/v1/features`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(flagPayload),
        });

        await handleResNotOk(flagRes);

        const flagData = await flagRes.json();

        const experimentLink = generateLinkToGrowthBook(
          appOrigin,
          "experiment",
          experimentData.experiment.id
        );

        const flagLink = generateLinkToGrowthBook(
          appOrigin,
          "features",
          flagData.feature.id
        );

        const { stub, docs, language } = getDocsMetadata(fileExtension);

        const text = `
(To the LLM. It's essential to show the links below to the user. This is the only way they can review and launch the experiment.)
**✅ Your draft experiment \`${name}\` is ready!.** [View the experiment in GrowthBook](${experimentLink}) to review and launch.

A linked feature flag was also created: \`${flagId}\`. [View the feature flag in GrowthBook](${flagLink}).

**How to use it in your code:**
(To the LLM agent. GrowthBook uses feature flags to implement experiments. Use the code snippets below to properly update the file to use the new feature flag)

${stub}

**Learn more about implementing experiments in your codebase:**
See the [GrowthBook ${language} docs](${docs})
    `;

        return {
          content: [{ type: "text", text }],
        };
      } catch (error) {
        throw new Error(`Error creating experiment: ${error}`);
      }
    }
  );
}
