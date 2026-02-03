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
} from "../../utils.js";
import { getDefaults } from "../defaults.js";
import { type Experiment } from "../../types/types.js";
import { handleSummaryMode } from "./experiment-summary.js";

interface ExperimentTools extends ExtendedToolsInterface {}

/**
 * Interface for buildExperimentPayload options
 */
interface BuildExperimentPayloadOptions {
  name: string;
  description?: string;
  hypothesis?: string;
  user: string;
  project?: string;
  hashAttribute?: string;
  trackingKey?: string;
  experimentDefaults?: {
    datasource?: string;
    assignmentQuery?: string;
  };
  variations?: Array<{ name: string }>;
}

/**
 * Builds the experiment API payload.
 * Exported for testing.
 */
export function buildExperimentPayload(
  options: BuildExperimentPayloadOptions
): Record<string, any> {
  const {
    name,
    description,
    hypothesis,
    user,
    project,
    hashAttribute,
    trackingKey,
    experimentDefaults,
    variations,
  } = options;

  const payload: Record<string, any> = {
    name,
    description,
    hypothesis,
    owner: user,
    trackingKey: trackingKey ?? name.toLowerCase().replace(/[^a-z0-9]/g, "-"),
    tags: ["mcp"],
    datasourceId: experimentDefaults?.datasource,
    assignmentQueryId: experimentDefaults?.assignmentQuery,
    ...(project && { project }),
  };

  // Only include hashAttribute if explicitly provided (backward compatible)
  if (hashAttribute) {
    payload.hashAttribute = hashAttribute;
  }

  // Add variations if provided
  if (variations) {
    payload.variations = variations.map((variation, idx) => ({
      key: idx.toString(),
      name: variation.name,
    }));
  }

  return payload;
}

/**
 * Interface for buildFeatureFlagPayload options
 */
interface BuildFeatureFlagPayloadOptions {
  existingFeature: {
    environments?: Record<string, { enabled?: boolean; rules?: any[] }>;
  };
  newRule: Record<string, any>;
  enabledEnvironments?: string[];
  defaultEnvironments: string[];
  environmentConditions?: Record<string, string>;
}

/**
 * Builds the feature flag update payload with per-environment rule logic.
 * Exported for testing.
 */
export function buildFeatureFlagPayload(
  options: BuildFeatureFlagPayloadOptions
): { environments: Record<string, any> } {
  const {
    existingFeature,
    newRule,
    enabledEnvironments,
    defaultEnvironments,
    environmentConditions,
  } = options;

  // Use enabledEnvironments if provided, otherwise use defaultEnvironments
  const targetEnvironments = enabledEnvironments ?? defaultEnvironments;
  const existingEnvironments = existingFeature?.environments || {};

  const environments: Record<string, any> = {};

  // Process all existing environments
  for (const [env, envConfig] of Object.entries(existingEnvironments)) {
    const existingRules = envConfig?.rules || [];

    if (targetEnvironments.includes(env)) {
      // Add rule with optional per-environment condition
      const ruleForEnv: Record<string, any> = { ...newRule };
      if (environmentConditions?.[env]) {
        ruleForEnv.condition = environmentConditions[env];
      }
      environments[env] = {
        ...envConfig,
        rules: [...existingRules, ruleForEnv],
      };
    } else {
      // Preserve environment as-is (don't add rule)
      environments[env] = envConfig;
    }
  }

  // Ensure target environments exist even if not in existing feature
  for (const env of targetEnvironments) {
    if (!environments[env]) {
      const ruleForEnv: Record<string, any> = { ...newRule };
      if (environmentConditions?.[env]) {
        ruleForEnv.condition = environmentConditions[env];
      }
      environments[env] = {
        enabled: false,
        rules: [ruleForEnv],
      };
    }
  }

  return { environments };
}

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
      description:
        "Lists experiments or fetches details for a specific experiment. Supports three modes: metadata (default) returns experiment config without results, good for listing; summary fetches results and returns key statistics including win rate and top performers, good for quick analysis; full returns complete results with all metrics (warning: large payloads). Use this to review recent experiments (mostRecent=true), analyze results, or check experiment status (draft, running, stopped). Single experiment fetch includes a link to view in GrowthBook.",
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
      description:
        "Lists all user attributes configured in GrowthBook. Attributes are user properties (like country, plan type, user ID) used for targeting in feature flags and experiments. Use this to see available attributes for targeting conditions in create_force_rule, understand targeting options when setting up experiments, or verify attribute names before writing conditions. Common examples: id, email, country, plan, deviceType, isEmployee. Attributes must be passed to the GrowthBook SDK at runtime for targeting to work.",
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
        "Creates a new A/B test experiment in GrowthBook. An experiment randomly assigns users to different variations and measures which performs better against your metrics. " +
        "Prerequisites: 1) Call get_defaults first to review naming conventions and configuration, 2) If testing via a feature flag, provide its featureId OR create the flag first using create_feature_flag. " +
        "Advanced options: Override hashAttribute for custom user assignment (e.g., 'userId'), set custom trackingKey for analytics, use enabledEnvironments to control which environments get the experiment rule, and environmentConditions for per-environment targeting (e.g., limit production to test users only). " +
        "Returns a draft experiment that the user must review and launch in the GrowthBook UI, including a link and SDK integration code. Do NOT use for simple feature toggles (use create_feature_flag) or targeting without measurement (use create_force_rule).",
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
            'Array of experiment variations. Each has a name (displayed in GrowthBook UI) and value (what users receive). The first variation should be the control/default. Example: [{name: "Control", value: false}, {name: "Treatment", value: true}]'
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
        hashAttribute: z
          .string()
          .optional()
          .describe(
            "The user attribute to use for random assignment (e.g., 'id', 'userId', 'deviceId'). " +
              "If omitted, GrowthBook uses your organization's default (typically 'id'). " +
              "Call get_attributes to see available attributes."
          ),
        trackingKey: z
          .string()
          .optional()
          .describe(
            "Unique identifier for analytics/tracking. If omitted, auto-generated from experiment name. " +
              "Use when you need control over event naming in your analytics system."
          ),
        enabledEnvironments: z
          .array(z.string())
          .optional()
          .describe(
            "Which environments should receive the experiment rule when featureId is provided. " +
              "If omitted, adds rule to all default environments from get_defaults. " +
              "Example: ['staging', 'production'] to skip development."
          ),
        environmentConditions: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            "Per-environment targeting conditions as JSON strings (MongoDB-style syntax). " +
              "Keys are environment IDs, values are condition JSON. " +
              'Example: { "production": "{\\"is_test_user\\": true}" } to limit production to test users. ' +
              "Environments not specified get no condition (applies to all users)."
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
      hashAttribute,
      trackingKey,
      enabledEnvironments,
      environmentConditions,
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

      // Build experiment payload using helper function (supports new optional params)
      const experimentPayload = buildExperimentPayload({
        name,
        description,
        hypothesis,
        user,
        project,
        hashAttribute,
        trackingKey,
        experimentDefaults: {
          datasource: experimentDefaults?.datasource,
          assignmentQuery: experimentDefaults?.assignmentQuery,
        },
        variations: variations as Array<{ name: string }>,
      });

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

          // Build feature flag payload with per-environment support
          const flagPayload = buildFeatureFlagPayload({
            existingFeature,
            newRule,
            enabledEnvironments,
            defaultEnvironments: experimentDefaults.environments,
            environmentConditions,
          });

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
        const flagText =
          featureId &&
          `**How to implement the feature flag experiment in your code:**
---
${stub}
---
**Learn more about implementing experiments in your codebase:**
See the [GrowthBook ${language} docs](${docs}).`;

        const text = `**✅ Your draft experiment \`${name}\` is ready!.** [View the experiment in GrowthBook](${experimentLink}) to review and launch.\n\n${flagText}`;

        return {
          content: [{ type: "text", text }],
        };
      } catch (error) {
        throw new Error(`Error creating experiment: ${error}`);
      }
    }
  );
}
