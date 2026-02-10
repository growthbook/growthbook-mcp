import { z } from "zod";
import {
  getDocsMetadata,
  handleResNotOk,
  generateLinkToGrowthBook,
  type ExtendedToolsInterface,
  paginationSchema,
  featureFlagSchema,
  fetchWithRateLimit,
  fetchWithPagination,
  fetchFeatureFlag,
  mergeRuleIntoFeatureFlag,
} from "../utils.js";
import { exec } from "child_process";
import { getDefaults } from "./defaults.js";

interface FeatureTools extends ExtendedToolsInterface {}

export function registerFeatureTools({
  server,
  baseApiUrl,
  apiKey,
  appOrigin,
  user,
}: FeatureTools) {
  /**
   * Tool: create_feature_flag
   */
  server.registerTool(
    "create_feature_flag",
    {
      title: "Create Feature Flag",
      description:
        "Creates a new feature flag in GrowthBook. Feature flags control access to features by returning different values based on rules. Use when adding a toggleable feature to your codebase, creating a flag for A/B testing (then use create_experiment), or setting up gradual rollouts. The flag is created DISABLED in all environments. After creation, use create_force_rule to add targeting conditions, or create_experiment for A/B testing. Returns flag details and SDK integration code snippets for the specified language.",
      inputSchema: featureFlagSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
      },
    },
    async ({
      id,
      valueType,
      defaultValue,
      description,
      project,
      fileExtension,
    }) => {
      // get environments
      let environments = [];
      const defaults = await getDefaults(apiKey, baseApiUrl);
      if (defaults.environments) {
        environments = defaults.environments;
      } else {
        const envRes = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/features/environments`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          }
        );
        await handleResNotOk(envRes);
        const envData = await envRes.json();
        environments = envData.environments.map((env: any) => env.id);
      }

      const payload = {
        id,
        description,
        owner: user,
        valueType,
        defaultValue,
        tags: ["mcp"],
        environments: environments.reduce(
          (acc: Record<string, any>, env: string) => {
            acc[env] = {
              enabled: false,
              rules: [],
            };
            return acc;
          },
          {}
        ),
        ...(project && { project }),
      };

      try {
        const res = await fetchWithRateLimit(`${baseApiUrl}/api/v1/features`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        await handleResNotOk(res);

        const data = await res.json();
        const { docs, language, stub } = getDocsMetadata(fileExtension);
        const linkToGrowthBook = generateLinkToGrowthBook(
          appOrigin,
          "features",
          id
        );
        const text = `This is the API response: ${JSON.stringify(data)}

        Additionally, here is a template of what to show to the user:

        **✅ Your feature flag \`my-flag-name\` is ready!**
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
        throw new Error(`Error creating feature flag: ${error}`);
      }
    }
  );

  /**
   * Tool: create_force_rule
   */
  server.registerTool(
    "create_force_rule",
    {
      title: "Create Force Rule",
      description:
        'Adds a targeting rule to an existing feature flag that forces a specific value when conditions are met. Use this for targeting specific users or segments without running an experiment. Example conditions (MongoDB-style syntax): Users in Canada: {"country": "CA"}, Beta testers: {"betaTester": true}, Specific IDs: {"id": {"$in": ["user1", "user2"]}}. Prerequisites: Feature flag must exist - create it first with create_feature_flag if needed. Common operators: $eq, $ne, $in, $nin, $gt, $lt, $regex. Do NOT use for A/B testing - use create_experiment instead for statistical analysis.',
      inputSchema: z.object({
        featureId: featureFlagSchema.id,
        description: featureFlagSchema.description.optional().default(""),
        fileExtension: featureFlagSchema.fileExtension,
        condition: z
          .string()
          .describe(
            'MongoDB-style targeting condition. Examples: {"country": "US"}, {"plan": {"$in": ["pro", "enterprise"]}}. Omit to apply to all users.'
          )
          .optional(),
        value: z
          .string()
          .describe(
            "The value to force when condition matches. Must match the flag's valueType (string, number, boolean, or JSON string)."
          ),
      }),
      annotations: {
        readOnlyHint: false,
      },
    },
    async ({ featureId, description, condition, value, fileExtension }) => {
      try {
        // Fetch the existing feature flag first to preserve existing rules
        const existingFeature = await fetchFeatureFlag(
          baseApiUrl,
          apiKey,
          featureId
        );

        // Fetch feature defaults first
        const defaults = await getDefaults(apiKey, baseApiUrl);
        const defaultEnvironments = defaults.environments;

        // Create new force rule
        const newRule = {
          type: "force",
          description,
          condition,
          value,
        };

        // Merge new rule into existing feature flag
        const payload = mergeRuleIntoFeatureFlag(
          existingFeature,
          newRule,
          defaultEnvironments
        );

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/features/${featureId}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );

        await handleResNotOk(res);

        const data = await res.json();

        const linkToGrowthBook = generateLinkToGrowthBook(
          appOrigin,
          "features",
          featureId
        );
        const { docs, language, stub } = getDocsMetadata(fileExtension);

        const text = `This is the API response: ${JSON.stringify(data)}
      
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
   * Tool: get_feature_flags
   */
  server.registerTool(
    "get_feature_flags",
    {
      title: "Get Feature Flags",
      description:
        "Lists feature flags in your GrowthBook organization, or fetches details for a specific flag by ID. Use to find existing flags before creating new ones, get a flag's current configuration and rules, or find flag IDs needed for create_force_rule or create_experiment. Single flag fetch (via featureFlagId) returns full config including environment rules. If flag is archived, suggest removing from codebase.",
      inputSchema: z.object({
        project: featureFlagSchema.project.optional(),
        featureFlagId: featureFlagSchema.id.optional(),
        ...paginationSchema,
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ limit, offset, mostRecent, project, featureFlagId }) => {
      // Fetch single feature flag
      if (featureFlagId) {
        try {
          const res = await fetchWithRateLimit(
            `${baseApiUrl}/api/v1/features/${featureFlagId}`,
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
            "features",
            featureFlagId
          );
          const text = `This is the API response: ${JSON.stringify(data)}
  
Share information about the feature flag with the user. In particular, give details about the enabled environments,
rules for each environment, and the default value. If the feature flag is archived or doesn't exist, inform the user and
ask if they want to remove references to the feature flag from the codebase.
  
[View it in GrowthBook](${linkToGrowthBook})`;

          return {
            content: [{ type: "text", text }],
          };
        } catch (error) {
          throw new Error(`Error fetching flags: ${error}`);
        }
      }

      // Fetch multiple feature flags
      try {
        const data = await fetchWithPagination(
          baseApiUrl,
          apiKey,
          "/api/v1/features",
          limit,
          offset,
          mostRecent,
          project ? { projectId: project } : undefined
        );

        // Reverse features array for mostRecent to show newest-first
        if (mostRecent && offset === 0 && Array.isArray(data.features)) {
          data.features = data.features.reverse();
        }

        return {
          content: [{ type: "text", text: JSON.stringify(data) }],
        };
      } catch (error) {
        throw new Error(`Error fetching flags: ${error}`);
      }
    }
  );

  /**
   * Tool: get_stale_safe_rollouts
   */
  server.registerTool(
    "get_stale_safe_rollouts",
    {
      title: "Get Stale Safe Rollouts",
      description:
        "Finds feature flags with completed safe rollout rules that can be cleaned up from your codebase. Safe rollouts gradually increase traffic while monitoring for regressions. Completed rollouts (released or rolled-back) indicate flag code can be simplified: released means the new value won, rolled-back means revert to control value. Use for technical debt cleanup.",
      inputSchema: z.object({
        limit: z.number().optional().default(100),
        offset: z.number().optional().default(0),
      }),
      annotations: {
        readOnlyHint: true,
      },
    },
    async ({ limit, offset }) => {
      try {
        const queryParams = new URLSearchParams({
          limit: limit?.toString(),
          offset: offset?.toString(),
        });

        const res = await fetchWithRateLimit(
          `${baseApiUrl}/api/v1/features?${queryParams.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        await handleResNotOk(res);

        const data = await res.json();

        const filteredSafeRollouts = data.features.filter((feature: any) => {
          const envs: Record<string, any> = feature.environments;
          if (!envs) return false;
          return Object.values(envs).some((env: any) => {
            const rules = env.rules;
            if (!rules) return false;
            return rules.some((rule: any) => {
              return (
                rule.type === "safe-rollout" &&
                (rule.status === "rolled-back" || rule.status === "released")
              );
            });
          });
        });

        const text = `
        ${JSON.stringify(filteredSafeRollouts)}

        Share information about the rolled-back or released safe rollout rules with the user. Safe Rollout rules are stored under
        environmentSettings, keyed by environment and are within the rules array with a type of "safe-rollout". Ask the user if they
        would like to remove references to the feature associated with the rolled-back or released safe rollout rules and if they do,
        remove the references and associated GrowthBook code and replace the values with controlValue if the safe rollout rule is rolled-back or with the
        variationValue if the safe rollout is released. In addition to the current file, you may need to update other files in the codebase.
        `;

        return {
          content: [{ type: "text", text }],
        };
      } catch (error) {
        throw new Error(`Error fetching stale safe rollouts: ${error}`);
      }
    }
  );

  /**
   * Tool: generate_flag_types
   */
  server.registerTool(
    "generate_flag_types",
    {
      title: "Generate Flag Types",
      description:
        "Generates TypeScript type definitions for all feature flags. Provides type safety and IDE autocomplete when accessing flags in code. Prerequisites: Target project must be TypeScript; GrowthBook CLI installed via npx (automatic). Run after creating new flags or when flag value types change. Returns the generated types file location.",
      inputSchema: z.object({
        currentWorkingDirectory: z
          .string()
          .describe("The current working directory of the user's project"),
      }),
      annotations: {
        readOnlyHint: false,
        idempotentHint: true,
      },
    },
    async ({ currentWorkingDirectory }) => {
      function runCommand(command: string, cwd: string): Promise<string> {
        return new Promise((resolve, reject) => {
          exec(command, { cwd }, (error, stdout, stderr) => {
            if (error) {
              reject(stderr || error.message);
            } else {
              resolve(stdout);
            }
          });
        });
      }
      try {
        // Login command
        await runCommand(
          `npx -y growthbook@latest auth login -k ${apiKey} -u ${baseApiUrl} -p default`,
          currentWorkingDirectory
        );
        // Generate types command
        const output = await runCommand(
          `npx -y growthbook@latest features generate-types -u ${baseApiUrl}`,
          currentWorkingDirectory
        );
        return {
          content: [
            {
              type: "text",
              text: `✅ Types generated successfully:\n${output}. Offer to add a script to the project's package.json file to regenerate types when needed. The command is: 
              "npx -y growthbook@latest features generate-types -u ${baseApiUrl}"`,
            },
          ],
        };
      } catch (error: any) {
        throw new Error(`Error generating types: ${error}`);
      }
    }
  );
}
