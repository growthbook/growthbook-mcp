import { z } from "zod";
import {
  getDocsMetadata,
  handleResNotOk,
  generateLinkToGrowthBook,
  type ExtendedToolsInterface,
  paginationSchema,
  featureFlagSchema,
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
  server.tool(
    "create_feature_flag",
    "Creates a new feature flag in GrowthBook and modifies the codebase when relevant.",
    {
      id: featureFlagSchema.id,
      valueType: featureFlagSchema.valueType,
      defaultValue: featureFlagSchema.defaultValue,
      description: featureFlagSchema.description.optional().default(""),
      project: featureFlagSchema.project.optional(),
      fileExtension: featureFlagSchema.fileExtension,
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
        const envRes = await fetch(
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
        const res = await fetch(`${baseApiUrl}/api/v1/features`, {
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
        const text = `This is the API response: ${JSON.stringify(data, null, 2)}

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
  server.tool(
    "create_force_rule",
    "Create a new force rule on an existing feature. If the existing feature isn't apparent, create a new feature using create_feature_flag first. A force rule sets a feature to a specific value based on a condition. For A/B tests and experiments, use create_experiment instead.",
    {
      featureId: featureFlagSchema.id,
      description: featureFlagSchema.description.optional().default(""),
      fileExtension: featureFlagSchema.fileExtension,
      condition: z
        .string()
        .describe(
          "Applied to everyone by default. Write conditions in MongoDB-style query syntax."
        )
        .optional(),
      value: z
        .string()
        .describe("The type of the value should match the feature type"),
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
              enabled: false,
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
   * Tool: get_feature_flags
   */
  server.tool(
    "get_feature_flags",
    "Fetches all feature flags from the GrowthBook API, with optional limit, offset, and project filtering.",
    {
      project: featureFlagSchema.project.optional(),
      ...paginationSchema,
    },
    async ({ limit, offset, project }) => {
      try {
        const queryParams = new URLSearchParams({
          limit: limit?.toString(),
          offset: offset?.toString(),
        });

        if (project) {
          queryParams.append("projectId", project);
        }

        const res = await fetch(
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

        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      } catch (error) {
        throw new Error(`Error fetching flags: ${error}`);
      }
    }
  );

  /**
   * Tool: get_single_feature_flag
   */
  server.tool(
    "get_single_feature_flag",
    "Fetches a specific feature flag from the GrowthBook API",
    {
      id: featureFlagSchema.id,
    },
    async ({ id }) => {
      try {
        const res = await fetch(`${baseApiUrl}/api/v1/features/${id}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        });

        await handleResNotOk(res);

        const data = await res.json();
        const linkToGrowthBook = generateLinkToGrowthBook(
          appOrigin,
          "features",
          id
        );
        const text = `
        ${JSON.stringify(data.feature, null, 2)}

        Share information about the feature flag with the user. In particular, give details about the enabled environments,
        rules for each environment, and the default value. If the feature flag is archived or doesnt exist, inform the user and
        ask if they want to remove references to the feature flag from the codebase.

        [View it in GrowthBook](${linkToGrowthBook})
        `;

        return {
          content: [{ type: "text", text }],
        };
      } catch (error) {
        throw new Error(`Error fetching flags: ${error}`);
      }
    }
  );

  /**
   * Tool: get_stale_safe_rollouts
   */
  server.tool(
    "get_stale_safe_rollouts",
    "Fetches all complete safe rollouts (rolled-back or released) from the GrowthBook API",
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
        ${JSON.stringify(filteredSafeRollouts, null, 2)}

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
  server.tool(
    "generate_flag_types",
    "Generate types for feature flags",
    {
      currentWorkingDirectory: z
        .string()
        .describe("The current working directory of the user's project"),
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
              text: `✅ Types generated successfully:\n${output}`,
            },
          ],
        };
      } catch (error: any) {
        throw new Error(`Error generating types: ${error}`);
      }
    }
  );
}
