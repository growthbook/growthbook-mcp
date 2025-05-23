import { z } from "zod";

import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  getDocsMetadata,
  findImplementationDocs,
  handleResNotOk,
  generateLinkToGrowthBook,
} from "../utils.js";
import { exec } from "child_process";
import { promisify } from "util";

interface FeatureTools {
  server: McpServer;
  baseApiUrl: string;
  apiKey: string;
  appOrigin: string;
  user: string;
}

export function registerFeatureTools({
  server,
  baseApiUrl,
  apiKey,
  appOrigin,
  user,
}: FeatureTools) {
  /**
   * Tool: create_feature_flag
   * Description: Creates, adds, or wraps an element with a feature flag in GrowthBook. Allows specifying key, type, default value, and other metadata.
   */
  server.tool(
    "create_feature_flag",
    "Create, add, or wrap an element with a feature flag.",
    {
      id: z
        .string()
        .regex(
          /^[a-zA-Z0-9_-]+$/,
          "Feature key can only include letters, numbers, hyphens, and underscores."
        )
        .describe("A unique key name for the feature"),
      archived: z
        .boolean()
        .optional()
        .default(false)
        .describe("Whether the feature flag is archived"),
      description: z
        .string()
        .optional()
        .default("")
        .describe("A description of the feature flag"),
      project: z
        .string()
        .optional()
        .default("")
        .describe("The project the feature flag belongs to"),
      valueType: z
        .enum(["string", "number", "boolean", "json"])
        .describe("The value type the feature flag will return"),
      defaultValue: z
        .string()
        .describe("The default value of the feature flag"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags for the feature flag"),
      fileExtension: z
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
      id,
      archived,
      description,
      project,
      valueType,
      defaultValue,
      tags,
      fileExtension,
    }) => {
      const payload = {
        id,
        archived,
        description,
        owner: user,
        project,
        valueType,
        defaultValue,
        tags,
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

        if (!res.ok) {
          let errorMessage = `HTTP ${res.status} ${res.statusText}`;
          try {
            const errorBody = await res.json();
            errorMessage += `: ${JSON.stringify(errorBody)}`;
          } catch {
            // fallback to text if not JSON
            const errorText = await res.text();
            if (errorText) errorMessage += `: ${errorText}`;
          }
          throw new Error(errorMessage);
        }

        const data = await res.json();
        const docsText = await findImplementationDocs(fileExtension);
        const { docs, language } = getDocsMetadata(fileExtension);
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

        ${docsText}

        **Want to learn more?**
        See the [GrowthBook ${language} docs](${docs})
      `;

        return {
          content: [{ type: "text", text }],
        };
      } catch (error) {
        console.error("Error creating feature flag:", error);
        throw error;
      }
    }
  );

  /**
   * Tool: get_feature_flags
   * Description: Fetches all feature flags from the GrowthBook API, with optional limit, offset, and project filtering.
   */
  server.tool(
    "get_feature_flags",
    "Fetches all feature flags from the GrowthBook API. Flags are returned in the order they were created, from oldest to newest.",
    {
      limit: z.number().optional().default(100),
      offset: z.number().optional().default(0),
      project: z.string().optional(),
    },
    async ({ limit, offset, project }) => {
      try {
        const queryParams = new URLSearchParams({
          limit: limit?.toString(),
          offset: offset?.toString(),
        });

        if (project) queryParams.append("project", project);

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
        console.error("Error fetching flags:", error);
        throw error;
      }
    }
  );

  /**
   * Tool: get_single_feature_flag
   * Description: Fetches a specific feature flag from the GrowthBook API by its ID, with optional project filtering.
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
        console.error("Error fetching flags:", error);
        throw error;
      }
    }
  );

  /**
   * Tool: get_stale_safe_rollouts
   * Description: Fetches all complete safe rollouts (rolled-back or released) from the GrowthBook API, with optional limit, offset, and project filtering.
   */
  server.tool(
    "get_stale_safe_rollouts",
    "Fetches all complete safe rollouts (rolled-back or released) from the GrowthBook API",
    {
      limit: z.number().optional().default(100),
      offset: z.number().optional().default(0),
      project: z.string().optional(),
    },
    async ({ limit, offset, project }) => {
      try {
        const queryParams = new URLSearchParams({
          limit: limit?.toString(),
          offset: offset?.toString(),
        });

        if (project) queryParams.append("project", project);

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
        console.error("Error fetching stale safe rollouts:", error);
        throw error;
      }
    }
  );

  /**
   * Tool: generate_flag_types
   * Description: Generates types for feature flags using the GrowthBook CLI.
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
