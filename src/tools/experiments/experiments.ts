import { z } from "zod";
import {
  generateLinkToGrowthBook,
  getDocsMetadata,
  handleResNotOk,
  type ExtendedToolsInterface,
  SUPPORTED_FILE_EXTENSIONS,
  paginationSchema,
  fetchWithRateLimit,
  fetchWithPagination,
  featureFlagSchema,
  fetchFeatureFlag,
  mergeRuleIntoFeatureFlag,
} from "../../utils.js";
import { getDefaults } from "../defaults.js";
import { type Experiment } from "../../types/types.js";
import { handleSummaryMode } from "./experiment-summary.js";

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
  server.registerTool(
    "get_experiments",
    {
      title: "Get Experiments",
      description: "Fetches experiments from the GrowthBook API",
      inputSchema: z.object({
        project: z
          .string()
          .describe("The ID of the project to filter experiments by")
          .optional(),
        mode: z
          .enum(["metadata", "summary", "full"])
          .default("metadata")
          .describe(
            "The mode to use to fetch experiments. Metadata mode returns experiment config without results. Summary mode fetches results and returns pruned key stats for quick analysis. Full mode fetches and returns complete results data. WARNING: Full mode may return large payloads."
          ),
        experimentId: z
          .string()
          .describe("The ID of the experiment to fetch")
          .optional(),
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async (
      { limit, offset, mostRecent, project, mode, experimentId },
      extra
    ) => {
      if (experimentId) {
        try {
          const res = await fetchWithRateLimit(
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

          // Fetch results
          if (mode === "full") {
            if (data.status === "draft") {
              data.result = null;
            }
            try {
              const resultsRes = await fetchWithRateLimit(
                `${baseApiUrl}/api/v1/experiments/${experimentId}/results`,
                {
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                  },
                }
              );
              await handleResNotOk(resultsRes);
              const resultsData = await resultsRes.json();
              data.result = resultsData.result;
            } catch (error) {
              console.error(
                `Error fetching results for experiment ${experimentId}`,
                error
              );
            }
          }

          const linkToGrowthBook = generateLinkToGrowthBook(
            appOrigin,
            "experiment",
            experimentId
          );
          const text = `
      ${JSON.stringify(data)}
      
      [View the experiment in GrowthBook](${linkToGrowthBook})
      `;

          return {
            content: [{ type: "text", text }],
          };
        } catch (error) {
          throw new Error(`Error getting experiment: ${error}`);
        }
      }

      const progressToken = extra._meta?.progressToken;

      const totalSteps = mode === "summary" ? 5 : mode === "full" ? 3 : 2;

      const reportProgress = async (
        progress: number,

        message?: string
      ) => {
        if (progressToken) {
          await server.server.notification({
            method: "notifications/progress",
            params: {
              progressToken,
              progress,
              total: totalSteps,
              ...(message && { message }),
            },
          });
        }
      };

      await reportProgress(1, "Fetching experiments...");

      try {
        const data = await fetchWithPagination(
          baseApiUrl,
          apiKey,
          "/api/v1/experiments",
          limit,
          offset,
          mostRecent,
          project ? { projectId: project } : undefined
        );

        let experiments = (data.experiments as Experiment[]) || [];

        // Reverse experiments array for mostRecent to show newest-first
        if (mostRecent && offset === 0 && Array.isArray(experiments)) {
          experiments = experiments.reverse();
          data.experiments = experiments;
        }

        if (mode === "full" || mode === "summary") {
          await reportProgress(2, "Fetching experiment results...");
          for (const [index, experiment] of experiments.entries()) {
            if (experiment.status === "draft") {
              experiments[index].result = undefined;
              continue;
            }
            try {
              const resultsRes = await fetchWithRateLimit(
                `${baseApiUrl}/api/v1/experiments/${experiment.id}/results`,
                {
                  headers: {
                    Authorization: `Bearer ${apiKey}`,
                  },
                }
              );
              await handleResNotOk(resultsRes);
              const resultsData = await resultsRes.json();
              experiments[index].result = resultsData.result;
            } catch (error) {
              console.error(
                `Error fetching results for experiment ${experiment.id} (${experiment.name})`,
                error
              );
            }
          }
        }

        if (mode === "summary") {
          const summaryExperiments = await handleSummaryMode(
            experiments,
            baseApiUrl,
            apiKey,
            reportProgress
          );
          const summaryExperimentsWithPagination = {
            summary: summaryExperiments,
            limit: data.limit,
            offset: data.offset,
            total: data.total,
            hasMore: data.hasMore,
            nextOffset: data.nextOffset,
          };
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(summaryExperimentsWithPagination),
              },
            ],
          };
        }

        await reportProgress(2, "Processing results...");

        return {
          content: [{ type: "text", text: JSON.stringify(data) }],
        };
      } catch (error) {
        throw new Error(`Error fetching experiments: ${error}`);
      }
    }
  );

  /**
   * Tool: get_attributes
   */
  server.registerTool(
    "get_attributes",
    {
      title: "Get Attributes",
      description: "Get all attributes",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
      },
    },
    async () => {
      try {
        const queryParams = new URLSearchParams();
        queryParams.append("limit", "100");

        const res = await fetchWithRateLimit(
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
          content: [{ type: "text", text: JSON.stringify(data) }],
        };
      } catch (error) {
        throw new Error(`Error fetching attributes: ${error}`);
      }
    }
  );

  /**
   * Tool: create_experiment
   */
  server.registerTool(
    "create_experiment",
    {
      title: "Create Experiment",
      description:
        "IMPORTANT: Call get_defaults before creating an experiment, and use its output to guide the arguments. Creates a new feature flag and experiment (A/B test).",
      inputSchema: z.object({
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
        valueType: z
          .enum(["string", "number", "boolean", "json"])
          .describe("The value type for all experiment variations"),
        variations: z
          .array(
            z.object({
              name: z
                .string()
                .describe(
                  "Variation name. Base name off the examples from get_defaults. If none are available, use a short, descriptive name that captures the essence of the variation."
                ),
              value: z
                .union([
                  z.string(),
                  z.number(),
                  z.boolean(),
                  z.record(z.string(), z.any()),
                ])
                .describe(
                  "The value of this variation. Must match the specified valueType: provide actual booleans (true/false) not strings, actual numbers, strings, or valid JSON objects."
                ),
            })
          )
          .describe(
            "Experiment variations. The key should be the variation name and the value should be the variation value. Look to variations included in preview experiments for guidance on generation. The default or control variation should always be first."
          ),
        project: z
          .string()
          .describe("The ID of the project to create the experiment in")
          .optional(),
        featureId: featureFlagSchema.id
          .optional()
          .describe("The ID of the feature flag to create the experiment on."),
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
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({
      description,
      hypothesis,
      name,
      valueType,
      variations,
      fileExtension,
      confirmedDefaultsReviewed,
      project,
      featureId,
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

      const stringifyValue = (value: unknown): string =>
        typeof value === "object" ? JSON.stringify(value) : String(value);

      const experimentPayload = {
        name,
        description,
        hypothesis,
        owner: user,
        trackingKey: name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
        tags: ["mcp"],
        assignmentQueryId: experimentDefaults?.assignmentQuery,
        datasourceId: experimentDefaults?.datasource,
        variations: (variations as Array<{ name: string }>).map(
          (variation: { name: string }, idx: number) => ({
            key: idx.toString(),
            name: variation.name,
          })
        ),
        ...(project && { project }),
      };

      try {
        const experimentRes = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/experiments`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(experimentPayload),
          }
        );

        await handleResNotOk(experimentRes);

        const experimentData = await experimentRes.json();

        let flagData = null;
        if (featureId) {
          // Fetch the existing feature flag first to preserve existing rules
          const existingFeature = await fetchFeatureFlag(
            baseApiUrl,
            apiKey,
            featureId
          );

          // Create new experiment-ref rule
          const newRule = {
            type: "experiment-ref",
            experimentId: experimentData.experiment.id,
            variations: experimentData.experiment.variations.map(
              (expVariation: { variationId: string }, idx: number) => ({
                value: stringifyValue(variations[idx].value),
                variationId: expVariation.variationId,
              })
            ),
          };

          // Merge new rule into existing feature flag
          const flagPayload = mergeRuleIntoFeatureFlag(
            existingFeature,
            newRule,
            experimentDefaults.environments
          );

          const flagRes = await fetchWithRateLimit(
            `${baseApiUrl}/api/v1/features/${featureId}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(flagPayload),
            }
          );

          await handleResNotOk(flagRes);

          flagData = await flagRes.json();
        }

        const experimentLink = generateLinkToGrowthBook(
          appOrigin,
          "experiment",
          experimentData.experiment.id
        );

        const { stub, docs, language } = getDocsMetadata(fileExtension);
        const flagText = featureId
          ? `A linked feature flag was also created: \`${featureId}\`. [View the feature flag in GrowthBook](${generateLinkToGrowthBook(
              appOrigin,
              "features",
              featureId
            )}) 
**How to use it in your code:**
(To the LLM agent. GrowthBook uses feature flags to implement experiments. Use the code snippets below to properly update the file to use the new feature flag)

${stub}

**Learn more about implementing experiments in your codebase:**
See the [GrowthBook ${language} docs](${docs}).`
          : "";

        const text = `
(To the LLM. It's essential to show the links below to the user. This is the only way they can review and launch the experiment.)
**✅ Your draft experiment \`${name}\` is ready!.** [View the experiment in GrowthBook](${experimentLink}) to review and launch.

${flagText}`;

        return {
          content: [{ type: "text", text }],
        };
      } catch (error) {
        throw new Error(`Error creating experiment: ${error}`);
      }
    }
  );
}
