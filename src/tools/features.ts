import { z } from "zod";
import {
  getDocsMetadata,
  handleResNotOk,
  generateLinkToGrowthBook,
  type ExtendedToolsInterface,
  SUPPORTED_FILE_EXTENSIONS,
} from "../utils.js";
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
      id: z
        .string()
        .regex(
          /^[a-zA-Z0-9_-]+$/,
          "Feature key can only include letters, numbers, hyphens, and underscores."
        )
        .describe("A unique key name for the feature"),
      description: z
        .string()
        .optional()
        .default("")
        .describe("A briefdescription of the feature flag"),
      valueType: z
        .enum(["string", "number", "boolean", "json"])
        .describe("The value type the feature flag will return"),
      defaultValue: z
        .string()
        .describe("The default value of the feature flag"),
      fileExtension: z
        .enum(SUPPORTED_FILE_EXTENSIONS)
        .describe(
          "The extension of the current file. If it's unclear, ask the user."
        ),
    },
    async ({ id, description, valueType, defaultValue, fileExtension }) => {
      const payload = {
        id,
        description,
        owner: user,
        valueType,
        defaultValue,
        tags: ["mcp"],
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
        throw new Error(`Error creating feature flag: ${error}`);
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
      id: z.string().describe("The ID of the feature flag"),
      project: z.string().optional(),
    },
    async ({ id, project }) => {
      try {
        const queryParams = new URLSearchParams();

        if (project) queryParams.append("project", project);

        const res = await fetch(
          `${baseApiUrl}/api/v1/features/${id}?${queryParams.toString()}`,
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
    {},
    async () => {
      const text = `Run the following commands for the user to generate types for their feature flags:

      The first command will log you in to GrowthBook:
      npx -y growthbook@latest auth login -k ${apiKey} -u ${baseApiUrl} -p default

      The second command will generate types for your feature flags:
      npx -y growthbook@latest features generate-types -u ${baseApiUrl}
      `;

      return {
        content: [{ type: "text", text }],
      };
    }
  );
}
