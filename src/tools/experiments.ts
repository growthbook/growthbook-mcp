import { z } from "zod";
import {
  generateLinkToGrowthBook,
  getDocsMetadata,
  handleResNotOk,
  type ExtendedToolsInterface,
  SUPPORTED_FILE_EXTENSIONS,
  paginationSchema,
} from "../utils.js";
import { getDefaults } from "./defaults.js";

interface ExperimentTools extends ExtendedToolsInterface {}

type Experiment = {
  id: string;
  trackingKey: string;
  dateCreated: string;
  dateUpdated: string;
  name: string;
  type: "standard";
  project: string;
  resultSummary: {
    status: string;
    winner: string;
    conclusions: string;
    releasedVariationId: string;
    excludeFromPayload: true;
  };
  result?: {
    [key: string]: any;
  };
};

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
    "Fetches experiments from the GrowthBook API",
    {
      project: z
        .string()
        .describe("The ID of the project to filter experiments by")
        .optional(),
      mode: z
        .enum(["default", "analyze"])
        .default("default")
        .describe(
          "The mode to use to fetch experiments. Default mode returns summary info about experiments. Analyze mode will also fetch experiment results, allowing for better analysis, interpretation, and reporting."
        ),
      ...paginationSchema,
      readOnlyHint: true,
    },
    async ({ limit, offset, mostRecent, project, mode }) => {
      try {
        // Default behavior
        if (!mostRecent || offset > 0) {
          const defaultQueryParams = new URLSearchParams({
            limit: limit.toString(),
            offset: offset.toString(),
          });

          if (project) {
            defaultQueryParams.append("projectId", project);
          }

          const defaultRes = await fetch(
            `${baseApiUrl}/api/v1/experiments?${defaultQueryParams.toString()}`,
            {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
            }
          );

          await handleResNotOk(defaultRes);
          const data = await defaultRes.json();
          const experiments = data.experiments as Experiment[];

          if (mode === "analyze") {
            for (const [index, experiment] of experiments.entries()) {
              try {
                const resultsRes = await fetch(
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

          return {
            content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
          };
        }

        // Most recent behavior
        const countRes = await fetch(
          `${baseApiUrl}/api/v1/experiments?limit=1`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          }
        );

        await handleResNotOk(countRes);
        const countData = await countRes.json();
        const total = countData.total;
        const calculatedOffset = Math.max(0, total - limit);

        const mostRecentQueryParams = new URLSearchParams({
          limit: limit.toString(),
          offset: calculatedOffset.toString(),
        });

        if (project) {
          mostRecentQueryParams.append("projectId", project);
        }

        const mostRecentRes = await fetch(
          `${baseApiUrl}/api/v1/experiments?${mostRecentQueryParams.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          }
        );

        await handleResNotOk(mostRecentRes);
        const mostRecentData = await mostRecentRes.json();

        if (
          mostRecentData.experiments &&
          Array.isArray(mostRecentData.experiments)
        ) {
          mostRecentData.experiments = mostRecentData.experiments.reverse();

          if (mode === "analyze") {
            for (const [
              index,
              experiment,
            ] of mostRecentData.experiments.entries()) {
              try {
                const resultsRes = await fetch(
                  `${baseApiUrl}/api/v1/experiments/${experiment.id}/results`,
                  {
                    headers: {
                      Authorization: `Bearer ${apiKey}`,
                    },
                  }
                );
                await handleResNotOk(resultsRes);
                const resultsData = await resultsRes.json();
                mostRecentData.experiments[index].result = resultsData.result;
              } catch (error) {
                console.error(
                  `Error fetching results for experiment ${experiment.id} (${experiment.name})`,
                  error
                );
              }
            }
          }
        }

        return {
          content: [
            { type: "text", text: JSON.stringify(mostRecentData, null, 2) },
          ],
        };
      } catch (error) {
        throw new Error(`Error fetching experiments: ${error}`);
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
      mode: z
        .enum(["default", "analyze"])
        .default("default")
        .describe(
          "The mode to use to fetch the experiment. Default mode returns summary info about the experiment. Analyze mode will also fetch experiment results, allowing for better analysis, interpretation, and reporting."
        ),
      readOnlyHint: true,
    },
    async ({ experimentId, mode }) => {
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

        // If analyze mode, fetch results
        if (mode === "analyze") {
          try {
            const resultsRes = await fetch(
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
  server.tool(
    "get_attributes",
    "Get all attributes",
    {
      readOnlyHint: true,
    },
    async () => {
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
    }
  );

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
                "The value of the control and each of the variations. The value should be a string, number, boolean, or object. If it's an object, it should be a valid JSON object."
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
      readOnlyHint: false,
      destructiveHint: false,
    },
    async ({
      description,
      hypothesis,
      name,
      variations,
      fileExtension,
      confirmedDefaultsReviewed,
      project,
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
                enabled: false,
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
